const { Op, QueryTypes } = require('sequelize');
const { sequelize, EfdZReport, EfdDevice, EfdReconciliation, User } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('./audit');
const core = require('./saleCore');

/* EFD Z reports = the end-of-day fiscal report printed by an EFD device. We RECORD the figures from the printout; nothing is read from TRA.
   - Flow: PENDING -> VERIFIED | REJECTED. PENDING / VERIFIED -> VOIDED (refused while a live reconciliation uses the report).
   - efd_z_reports.create records one (one live report per device per day, and a device's Z number is never used twice).
     efd_z_reports.update edits your OWN report while it is PENDING. efd_z_reports.verify decides (never your own, the Owner is exempt).
   - Without efd_z_reports.read_all a user only sees the reports they recorded. Someone else's report looks like "not found".
   - Net = gross - VAT is calculated by the server. getOne also returns what the system itself recorded for that device and day, so the difference is visible.
   - Every change locks the row first and writes its audit row in the same database transaction. Z reports are never deleted. */
const { cents, str, bad } = core;
const sgn = (c) => (c < 0n ? `-${str(-c)}` : str(c));            // saleCore.str only handles values >= 0; differences can be negative
const PERM_ALL = 'efd_z_reports.read_all';
const OWNER_ROLE = 'OWNER';
const TZ = process.env.BUSINESS_TZ || 'Africa/Dar_es_Salaam';          // the trading day is judged in this time zone
const LIVE = ['PENDING', 'VERIFIED'];
// Today's date in the business time zone (the DB server's own CURRENT_DATE may be in another zone).
const today = async (t) => (await sequelize.query("SELECT to_char(NOW() AT TIME ZONE :tz, 'YYYY-MM-DD') AS d", { replacements: { tz: TZ }, transaction: t, type: QueryTypes.SELECT }))[0].d;

const audited = (z) => ({ reportNo: z.reportNo, deviceId: z.deviceId, reportDate: z.reportDate, zNumber: z.zNumber, receiptsCount: z.receiptsCount,
  grossAmount: z.grossAmount, vatAmount: z.vatAmount, netAmount: z.netAmount, voidedCount: z.voidedCount, voidedAmount: z.voidedAmount,
  firstReceiptNo: z.firstReceiptNo, lastReceiptNo: z.lastReceiptNo, status: z.status });
const includes = [
  { model: EfdDevice, as: 'device', attributes: ['id', 'serialNo', 'name', 'tin'] },
  { model: User, as: 'creator', attributes: ['id', 'fullName'] }, { model: User, as: 'decider', attributes: ['id', 'fullName'] },
];
const canAll = (req) => req.user.permissions.has(PERM_ALL);
const scope = (req) => (canAll(req) ? {} : { createdBy: req.user.id });
const notFound = () => new AppError(404, 'NOT_FOUND', 'Z report not found');

async function lock(req, id, t) {
  const z = await EfdZReport.findOne({ where: { id, ...scope(req) }, transaction: t, lock: t.LOCK.UPDATE });
  if (!z) throw notFound();
  return z;
}

/* What the system recorded for one device on one trading day (EFD receipts), plus completed sales (cash and credit) of that day that still have no live receipt.
   Shared with the reconciliation service. Money is returned as text. */
async function systemTotals(deviceId, date, t) {
  const rep = { d: deviceId, date, tz: TZ };
  const [r] = await sequelize.query(`SELECT
      COUNT(*) FILTER (WHERE status = 'ISSUED')::int AS "count", COALESCE(SUM(amount) FILTER (WHERE status = 'ISSUED'), 0)::text AS gross,
      COALESCE(SUM(vat_amount) FILTER (WHERE status = 'ISSUED'), 0)::text AS vat,
      COUNT(*) FILTER (WHERE status = 'VOIDED')::int AS "voidedCount", COALESCE(SUM(amount) FILTER (WHERE status = 'VOIDED'), 0)::text AS "voidedAmount"
    FROM efd_receipts WHERE device_id = :d AND CAST(issued_at AT TIME ZONE :tz AS date) = CAST(:date AS date)`, { replacements: rep, transaction: t, type: QueryTypes.SELECT });
  const [u] = await sequelize.query(`SELECT COUNT(*)::int AS "count", COALESCE(SUM(s.total), 0)::text AS amount FROM sales s
    WHERE s.status = 'COMPLETED' AND s.sale_date = CAST(:date AS date)
      AND NOT EXISTS (SELECT 1 FROM efd_receipts r WHERE r.sale_id = s.id AND r.status = 'ISSUED')`, { replacements: rep, transaction: t, type: QueryTypes.SELECT });
  return { ...r, unreceiptedCount: u.count, unreceiptedAmount: u.amount };
}

async function checkDay(deviceId, date, selfId, zNumber, t) {
  if (date > await today(t)) throw bad('reportDate', 'The report date cannot be in the future');
  const notSelf = selfId ? { id: { [Op.ne]: selfId } } : {};
  const day = await EfdZReport.findOne({ where: { deviceId, reportDate: date, status: { [Op.in]: LIVE }, ...notSelf }, transaction: t });
  if (day) throw new AppError(409, 'DUPLICATE', `This device already has Z report ${day.reportNo} for ${date}. Void it first if it must be replaced.`,
    [{ field: 'reportDate', message: 'A Z report already exists for this day' }]);
  if (zNumber !== undefined) {
    const [dup] = await sequelize.query(`SELECT report_no AS "reportNo" FROM efd_z_reports WHERE device_id = :d AND CAST(z_number AS numeric) = CAST(:z AS numeric)
      AND status IN ('PENDING','VERIFIED') ${selfId ? 'AND id <> :self' : ''} LIMIT 1`, { replacements: { d: deviceId, z: zNumber, self: selfId ?? null }, transaction: t, type: QueryTypes.SELECT });
    if (dup) throw new AppError(409, 'DUPLICATE', `Z number ${zNumber} was already recorded on this device (${dup.reportNo})`, [{ field: 'zNumber', message: 'Already recorded on this device' }]);
  }
}
function checkAmounts(gross, vat) {
  if (cents(vat) > cents(gross)) throw bad('vatAmount', 'VAT cannot be more than the gross amount');
}

const create = (req, body) => sequelize.transaction(async (t) => {
  const dev = await EfdDevice.findByPk(body.deviceId, { transaction: t, lock: t.LOCK.UPDATE });   // serialises two people recording the same device and day
  if (!dev) throw bad('deviceId', 'EFD device not found');
  if (!dev.isActive) throw bad('deviceId', 'This device is inactive');
  checkAmounts(body.grossAmount, body.vatAmount);
  await checkDay(dev.id, body.reportDate, null, body.zNumber, t);
  const gross = cents(body.grossAmount); const vat = cents(body.vatAmount);
  const z = await EfdZReport.create({
    reportNo: `ZR-${core.year()}-${core.pad(await core.nextNo('efd_z_report_seq', t))}`, deviceId: dev.id, reportDate: body.reportDate, zNumber: body.zNumber,
    receiptsCount: body.receiptsCount, grossAmount: str(gross), vatAmount: str(vat), netAmount: str(gross - vat),
    voidedCount: body.voidedCount ?? 0, voidedAmount: str(cents(body.voidedAmount ?? 0)),
    firstReceiptNo: body.firstReceiptNo ?? null, lastReceiptNo: body.lastReceiptNo ?? null, notes: body.notes ?? null, status: 'PENDING', createdBy: req.user.id,
  }, { transaction: t });
  await audit.log(req, { action: 'EFD_Z_REPORT_CREATED', entityType: 'EfdZReport', entityId: z.id, newValues: { ...audited(z), device: dev.serialNo } }, t);
  return z.id;
});

// Only the person who recorded it can change it, and only while it is still waiting for verification.
const update = (req, id, body) => sequelize.transaction(async (t) => {
  const z = await lock(req, id, t);
  if (z.createdBy !== req.user.id) throw new AppError(403, 'FORBIDDEN', 'Only the person who recorded this Z report can edit it');
  if (z.status !== 'PENDING') throw new AppError(409, 'BAD_STATE', `A ${z.status.toLowerCase()} Z report cannot be edited`);
  await EfdDevice.findByPk(z.deviceId, { transaction: t, lock: t.LOCK.UPDATE });
  const gross = body.grossAmount ?? z.grossAmount; const vat = body.vatAmount ?? z.vatAmount;
  checkAmounts(gross, vat);
  if (body.reportDate !== undefined || body.zNumber !== undefined) await checkDay(z.deviceId, body.reportDate ?? z.reportDate, z.id, body.zNumber ?? z.zNumber, t);
  const old = audited(z);
  const patch = { ...body };
  if (body.grossAmount !== undefined || body.vatAmount !== undefined) {
    patch.grossAmount = str(cents(gross)); patch.vatAmount = str(cents(vat)); patch.netAmount = str(cents(gross) - cents(vat));
  }
  if (body.voidedAmount !== undefined) patch.voidedAmount = str(cents(body.voidedAmount));
  await z.update(patch, { transaction: t });
  await audit.log(req, { action: 'EFD_Z_REPORT_UPDATED', entityType: 'EfdZReport', entityId: z.id, oldValues: old, newValues: audited(z) }, t);
  return z.id;
});

const decide = (req, id, verify, note) => sequelize.transaction(async (t) => {
  const z = await lock(req, id, t);
  if (z.status !== 'PENDING') throw new AppError(409, 'BAD_STATE', `This Z report is already ${z.status.toLowerCase()}`);
  if (z.createdBy === req.user.id && req.user.role !== OWNER_ROLE)
    throw new AppError(403, 'SELF_APPROVAL', 'You cannot verify or reject a Z report you recorded yourself. Ask another approver.');
  if (!verify && (!note || note.trim().length < 3)) throw bad('note', 'Give a reason for rejecting this Z report');
  const old = audited(z);
  await z.update({ status: verify ? 'VERIFIED' : 'REJECTED', decidedBy: req.user.id, decidedAt: new Date(), decisionNote: note ?? null }, { transaction: t });
  await audit.log(req, { action: verify ? 'EFD_Z_REPORT_VERIFIED' : 'EFD_Z_REPORT_REJECTED', entityType: 'EfdZReport', entityId: z.id, oldValues: old, newValues: audited(z), reason: note ?? null }, t);
  return z.id;
});

const voidReport = (req, id, reason) => sequelize.transaction(async (t) => {
  if (!reason || reason.trim().length < 3) throw bad('reason', 'A reason is required to void a Z report');
  const z = await lock(req, id, t);
  if (!LIVE.includes(z.status)) throw new AppError(409, 'BAD_STATE', `A ${z.status.toLowerCase()} Z report cannot be voided`);
  const recon = await EfdReconciliation.findOne({ where: { zReportId: z.id, status: { [Op.in]: ['OPEN', 'RECONCILED'] } }, transaction: t });
  if (recon) throw new AppError(409, 'HAS_RECONCILIATION', `Reconciliation ${recon.reconNo} uses this Z report. Void the reconciliation first.`);
  const old = audited(z);
  await z.update({ status: 'VOIDED', voidedAt: new Date(), voidedBy: req.user.id, voidReason: reason.trim() }, { transaction: t });
  await audit.log(req, { action: 'EFD_Z_REPORT_VOIDED', entityType: 'EfdZReport', entityId: z.id, oldValues: old, newValues: audited(z), reason: reason.trim() }, t);
  return z.id;
});

/* ---------- reads ---------- */
const SORT = { reportDate: 'reportDate', reportNo: 'reportNo', grossAmount: 'grossAmount', zNumber: 'zNumber' };

async function list(req, q) {
  const where = { ...scope(req) };
  for (const k of ['deviceId', 'createdBy']) if (q[k] !== undefined) where[k] = q[k];
  if (q.status && q.status !== 'ALL') where.status = q.status;
  if (!canAll(req)) where.createdBy = req.user.id;                                    // a filter can never widen the scope
  if (q.from || q.to) where.reportDate = { ...(q.from && { [Op.gte]: q.from }), ...(q.to && { [Op.lte]: q.to }) };
  if (q.search) where[Op.or] = [{ reportNo: { [Op.iLike]: like(q.search) } }, { zNumber: { [Op.iLike]: like(q.search) } }];
  const { rows, count } = await EfdZReport.findAndCountAll({ where, include: includes, order: [[SORT[q.sortBy], q.sortDir.toUpperCase()], ['createdAt', 'DESC']],
    limit: q.limit, offset: (q.page - 1) * q.limit, distinct: true });
  const sum = await EfdZReport.findAll({ where: { ...where, status: 'VERIFIED' }, raw: true,
    attributes: [[sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('gross_amount')), 0), 'g'], [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('vat_amount')), 0), 'v']] });
  return { data: rows, total: count, page: q.page, limit: q.limit, verifiedGross: String(sum[0].g), verifiedVat: String(sum[0].v) };
}

async function getOne(req, id) {
  const z = await EfdZReport.findOne({ where: { id, ...scope(req) }, include: [...includes, { model: User, as: 'voider', attributes: ['id', 'fullName'] }] });
  if (!z) throw notFound();
  const s = await systemTotals(z.deviceId, z.reportDate);
  const system = { receiptsCount: s.count, grossAmount: s.gross, vatAmount: s.vat, voidedCount: s.voidedCount, voidedAmount: s.voidedAmount };
  const difference = { receiptsCount: z.receiptsCount - s.count, grossAmount: sgn(cents(z.grossAmount) - cents(s.gross)), vatAmount: sgn(cents(z.vatAmount) - cents(s.vat)) };
  return { ...z.toJSON(), system, difference };
}

module.exports = { create, update, verify: (req, id, note) => decide(req, id, true, note), reject: (req, id, note) => decide(req, id, false, note),
  void: voidReport, list, getOne, systemTotals, sgn, today, TZ };
