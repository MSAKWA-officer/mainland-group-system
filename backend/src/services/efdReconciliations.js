const { Op, QueryTypes } = require('sequelize');
const { sequelize, EfdReconciliation, EfdZReport, EfdDevice, User } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('./audit');
const core = require('./saleCore');
const zr = require('./efdZReports');

/* EFD daily reconciliation = for ONE device and ONE trading day, compare
     (a) the Z report recorded from the device printout, with
     (b) the EFD receipts the system recorded on that device that day.
   Difference = Z report minus system (gross, VAT, receipt count). Also shown: receipts voided that day, and completed sales of that day that still have no EFD receipt (all devices). (The columns keep the old name unreceipted_orders_*.)
   - Flow: OPEN -> RECONCILED. OPEN / RECONCILED -> VOIDED. Figures are always calculated by the server; the client only chooses the device and the day.
   - efd_reconciliations.create starts one (needs a PENDING or VERIFIED Z report for that device and day) and may refresh an OPEN one.
   - efd_reconciliations.reconcile signs it off: the Z report must be VERIFIED, the figures are re-read and must still match what was reviewed, and any difference
     (or unreceipted order) needs a written explanation. You cannot sign off a reconciliation you started yourself (the Owner is exempt).
   - efd_reconciliations.void cancels it, with a reason. A reconciled day is frozen by a DB trigger; receipts for that day cannot be recorded or voided (see isDayReconciled).
   - Without efd_reconciliations.read_all a user only sees the reconciliations they started.
   - Every change locks the row first and writes its audit row in the same transaction. Reconciliations are never deleted. */
const { cents, str, bad } = core;
const { sgn, today, TZ } = zr;
const PERM_ALL = 'efd_reconciliations.read_all';
const OWNER_ROLE = 'OWNER';
const LIVE = ['OPEN', 'RECONCILED'];

const audited = (r) => ({ reconNo: r.reconNo, deviceId: r.deviceId, reconDate: r.reconDate, zReportId: r.zReportId, zGross: r.zGross, zVat: r.zVat, zCount: r.zCount,
  receiptsGross: r.receiptsGross, receiptsVat: r.receiptsVat, receiptsCount: r.receiptsCount, voidedReceiptsCount: r.voidedReceiptsCount,
  unreceiptedOrdersCount: r.unreceiptedOrdersCount, unreceiptedOrdersAmount: r.unreceiptedOrdersAmount,
  grossVariance: r.grossVariance, vatVariance: r.vatVariance, countVariance: r.countVariance, status: r.status, explanation: r.explanation });
const includes = [
  { model: EfdDevice, as: 'device', attributes: ['id', 'serialNo', 'name', 'tin'] },
  { model: EfdZReport, as: 'zReport', attributes: ['id', 'reportNo', 'zNumber', 'status'] },
  { model: User, as: 'creator', attributes: ['id', 'fullName'] }, { model: User, as: 'reconciler', attributes: ['id', 'fullName'] },
];
const canAll = (req) => req.user.permissions.has(PERM_ALL);
const scope = (req) => (canAll(req) ? {} : { createdBy: req.user.id });
const notFound = () => new AppError(404, 'NOT_FOUND', 'Reconciliation not found');

async function lock(req, id, t) {
  const r = await EfdReconciliation.findOne({ where: { id, ...scope(req) }, transaction: t, lock: t.LOCK.UPDATE });
  if (!r) throw notFound();
  return r;
}

// Reads the live Z report (PENDING or VERIFIED) and the system figures, and works out the differences. Nothing is written.
async function figures(deviceId, date, t) {
  const z = await EfdZReport.findOne({ where: { deviceId, reportDate: date, status: { [Op.in]: ['PENDING', 'VERIFIED'] } }, transaction: t });
  if (!z) return { z: null };
  const s = await zr.systemTotals(deviceId, date, t);
  const f = {
    zGross: z.grossAmount, zVat: z.vatAmount, zCount: z.receiptsCount,
    receiptsGross: s.gross, receiptsVat: s.vat, receiptsCount: s.count,
    voidedReceiptsCount: s.voidedCount, voidedReceiptsAmount: s.voidedAmount,
    unreceiptedOrdersCount: s.unreceiptedCount, unreceiptedOrdersAmount: s.unreceiptedAmount,
    grossVariance: sgn(cents(z.grossAmount) - cents(s.gross)), vatVariance: sgn(cents(z.vatAmount) - cents(s.vat)), countVariance: z.receiptsCount - s.count,
  };
  return { z, f };
}
const hasDifference = (f) => cents(f.grossVariance) !== 0n || cents(f.vatVariance) !== 0n || Number(f.countVariance) !== 0 || Number(f.unreceiptedOrdersCount) > 0;
const sameFigures = (a, b) => ['zGross', 'zVat', 'receiptsGross', 'receiptsVat', 'grossVariance', 'vatVariance', 'unreceiptedOrdersAmount'].every((k) => cents(a[k]) === cents(b[k]))
  && ['zCount', 'receiptsCount', 'countVariance', 'voidedReceiptsCount', 'unreceiptedOrdersCount'].every((k) => Number(a[k]) === Number(b[k]));

async function checkDate(date, t) {
  if (date > await today(t)) throw bad('reconDate', 'You cannot reconcile a day that has not happened yet');
}

// Shows the figures for a device and day without saving anything (used by the "start reconciliation" screen).
async function preview(req, { deviceId, date }) {
  const dev = await EfdDevice.findByPk(deviceId);
  if (!dev) throw bad('deviceId', 'EFD device not found');
  const { z, f } = await figures(deviceId, date);
  const existing = await EfdReconciliation.findOne({ where: { deviceId: dev.id, reconDate: date, status: { [Op.in]: LIVE }, ...scope(req) }, attributes: ['id', 'reconNo', 'status'] });
  return { device: { id: dev.id, serialNo: dev.serialNo, name: dev.name }, date, timezone: TZ,
    zReport: z ? { id: z.id, reportNo: z.reportNo, zNumber: z.zNumber, status: z.status } : null,
    figures: f ?? null, hasDifference: f ? hasDifference(f) : null, existing,
    canStart: !!z && !existing && date <= await today() };
}

const create = (req, { deviceId, reconDate }) => sequelize.transaction(async (t) => {
  const dev = await EfdDevice.findByPk(deviceId, { transaction: t, lock: t.LOCK.UPDATE });    // serialises two people starting the same day
  if (!dev) throw bad('deviceId', 'EFD device not found');
  await checkDate(reconDate, t);
  const live = await EfdReconciliation.findOne({ where: { deviceId: dev.id, reconDate, status: { [Op.in]: LIVE } }, transaction: t });
  if (live) throw new AppError(409, 'DUPLICATE', `This device already has reconciliation ${live.reconNo} for ${reconDate}. Void it first to start again.`, [{ field: 'reconDate', message: 'Already reconciled or in progress' }]);
  const { z, f } = await figures(dev.id, reconDate, t);
  if (!z) throw new AppError(409, 'NO_Z_REPORT', `Record the Z report of ${dev.serialNo} for ${reconDate} first`, [{ field: 'reconDate', message: 'No Z report for this day' }]);
  const r = await EfdReconciliation.create({
    reconNo: `RC-${core.year()}-${core.pad(await core.nextNo('efd_reconciliation_seq', t))}`, deviceId: dev.id, reconDate, zReportId: z.id, ...f,
    status: 'OPEN', createdBy: req.user.id, refreshedAt: new Date(),
  }, { transaction: t });
  await audit.log(req, { action: 'EFD_RECONCILIATION_CREATED', entityType: 'EfdReconciliation', entityId: r.id, newValues: { ...audited(r), device: dev.serialNo } }, t);
  return r.id;
});

// Re-reads the Z report and the receipts (they may have changed since it was started). Only while OPEN.
const refresh = (req, id) => sequelize.transaction(async (t) => {
  const r = await lock(req, id, t);
  if (r.status !== 'OPEN') throw new AppError(409, 'BAD_STATE', `A ${r.status.toLowerCase()} reconciliation cannot be refreshed`);
  const { z, f } = await figures(r.deviceId, r.reconDate, t);
  if (!z) throw new AppError(409, 'NO_Z_REPORT', 'The Z report for this day is no longer available. Record it again first.');
  const old = audited(r);
  await r.update({ ...f, zReportId: z.id, refreshedAt: new Date() }, { transaction: t });
  await audit.log(req, { action: 'EFD_RECONCILIATION_REFRESHED', entityType: 'EfdReconciliation', entityId: r.id, oldValues: old, newValues: audited(r) }, t);
  return r.id;
});

const reconcile = (req, id, explanation) => sequelize.transaction(async (t) => {
  const r = await lock(req, id, t);
  if (r.status !== 'OPEN') throw new AppError(409, 'BAD_STATE', `This reconciliation is already ${r.status.toLowerCase()}`);
  if (r.createdBy === req.user.id && req.user.role !== OWNER_ROLE)
    throw new AppError(403, 'SELF_APPROVAL', 'You cannot sign off a reconciliation you started yourself. Ask another approver.');
  await EfdDevice.findByPk(r.deviceId, { transaction: t, lock: t.LOCK.UPDATE });
  const { z, f } = await figures(r.deviceId, r.reconDate, t);
  if (!z || z.id !== r.zReportId) throw new AppError(409, 'STALE', 'The Z report changed. Refresh the reconciliation and review it again.');
  if (z.status !== 'VERIFIED') throw new AppError(409, 'Z_NOT_VERIFIED', `Z report ${z.reportNo} must be verified before the day can be reconciled`);
  if (!sameFigures(f, r)) throw new AppError(409, 'STALE', 'The figures changed since this reconciliation was last refreshed. Refresh it and review it again.');
  const note = explanation?.trim() || null;
  if (hasDifference(f) && (!note || note.length < 10)) throw bad('explanation', 'There is a difference (or an order without an EFD receipt). Explain it in at least 10 characters.');
  const old = audited(r);
  await r.update({ status: 'RECONCILED', explanation: note, reconciledBy: req.user.id, reconciledAt: new Date() }, { transaction: t });
  await audit.log(req, { action: 'EFD_RECONCILIATION_RECONCILED', entityType: 'EfdReconciliation', entityId: r.id, oldValues: old, newValues: audited(r), reason: note }, t);
  return r.id;
});

const voidRecon = (req, id, reason) => sequelize.transaction(async (t) => {
  if (!reason || reason.trim().length < 3) throw bad('reason', 'A reason is required to void a reconciliation');
  const r = await lock(req, id, t);
  if (!LIVE.includes(r.status)) throw new AppError(409, 'BAD_STATE', 'This reconciliation is already voided');
  const old = audited(r);
  await r.update({ status: 'VOIDED', voidedAt: new Date(), voidedBy: req.user.id, voidReason: reason.trim() }, { transaction: t });
  await audit.log(req, { action: 'EFD_RECONCILIATION_VOIDED', entityType: 'EfdReconciliation', entityId: r.id, oldValues: old, newValues: audited(r), reason: reason.trim() }, t);
  return r.id;
});

/* A day that is RECONCILED is closed: EFD receipts of that device for that day must not be recorded or voided any more.
   efdReceiptController calls this (see the integration notes). `when` is the receipt's issuedAt. */
async function isDayReconciled(deviceId, when, t) {
  const [row] = await sequelize.query(`SELECT recon_no AS "reconNo" FROM efd_reconciliations WHERE device_id = :d AND status = 'RECONCILED'
    AND recon_date = CAST(CAST(:when AS timestamptz) AT TIME ZONE :tz AS date) LIMIT 1`, { replacements: { d: deviceId, when: new Date(when).toISOString(), tz: TZ }, transaction: t, type: QueryTypes.SELECT });
  return row ? row.reconNo : null;
}
async function assertDayOpen(deviceId, when, t) {
  const no = await isDayReconciled(deviceId, when, t);
  if (no) throw new AppError(409, 'DAY_RECONCILED', `This day is already reconciled (${no}). Void the reconciliation first to change its receipts.`);
}

/* ---------- reads ---------- */
const SORT = { reconDate: 'reconDate', reconNo: 'reconNo', grossVariance: 'grossVariance' };

async function list(req, q) {
  const where = { ...scope(req) };
  for (const k of ['deviceId', 'createdBy']) if (q[k] !== undefined) where[k] = q[k];
  if (q.status && q.status !== 'ALL') where.status = q.status;
  if (!canAll(req)) where.createdBy = req.user.id;                                    // a filter can never widen the scope
  if (q.from || q.to) where.reconDate = { ...(q.from && { [Op.gte]: q.from }), ...(q.to && { [Op.lte]: q.to }) };
  if (q.hasDifference === true) where[Op.or] = [{ grossVariance: { [Op.ne]: 0 } }, { vatVariance: { [Op.ne]: 0 } }, { countVariance: { [Op.ne]: 0 } }, { unreceiptedOrdersCount: { [Op.gt]: 0 } }];
  if (q.hasDifference === false) Object.assign(where, { grossVariance: 0, vatVariance: 0, countVariance: 0, unreceiptedOrdersCount: 0 });
  if (q.search) where.reconNo = { [Op.iLike]: like(q.search) };
  const { rows, count } = await EfdReconciliation.findAndCountAll({ where, include: includes, order: [[SORT[q.sortBy], q.sortDir.toUpperCase()], ['createdAt', 'DESC']],
    limit: q.limit, offset: (q.page - 1) * q.limit, distinct: true });
  const byStatus = await EfdReconciliation.findAll({ where, attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['status'], raw: true });
  return { data: rows, total: count, page: q.page, limit: q.limit, statusCounts: Object.fromEntries(byStatus.map((s) => [s.status, Number(s.n)])) };
}

async function getOne(req, id) {
  const r = await EfdReconciliation.findOne({ where: { id, ...scope(req) }, include: [...includes, { model: User, as: 'voider', attributes: ['id', 'fullName'] }] });
  if (!r) throw notFound();
  const out = r.toJSON();
  out.hasDifference = hasDifference(out);
  // The receipts behind the snapshot, so a difference can be traced to individual receipt numbers.
  out.receipts = await sequelize.query(`SELECT id, receipt_no AS "receiptNo", issued_at AS "issuedAt", amount, vat_amount AS "vatAmount", status, sale_id AS "saleId"
    FROM efd_receipts WHERE device_id = :d AND CAST(issued_at AT TIME ZONE :tz AS date) = CAST(:date AS date) ORDER BY issued_at LIMIT 500`,
  { replacements: { d: r.deviceId, date: r.reconDate, tz: TZ }, type: QueryTypes.SELECT });
  return out;
}

module.exports = { preview, create, refresh, reconcile, void: voidRecon, list, getOne, isDayReconciled, assertDayOpen };
