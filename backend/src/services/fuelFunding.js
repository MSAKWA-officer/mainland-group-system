const { Op, QueryTypes } = require('sequelize');
const { sequelize, FuelFunding, FuelUsage, Vehicle, Driver, BankAccount, Bank, BankTransaction, User } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('./audit');
const core = require('./saleCore');
const banking = require('./banking');

/* Fuel funding = money given to a driver to buy fuel for a vehicle.
   - Flow: PENDING -> APPROVED | REJECTED. PENDING / APPROVED -> VOIDED. Records are never deleted.
   - Anyone with fuel_funding.create can raise a request; only fuel_funding.approve can decide. You cannot approve your own request (the Owner is exempt, as nobody sits above them).
   - Without fuel_funding.read_all a user only sees the requests they raised. Someone else's request looks like "not found".
   - The money leaves at APPROVAL. If a bank account was chosen, a WITHDRAWAL is posted to the bank ledger in the SAME database transaction, so the balance,
     insufficient-funds rule, opening-date rule and audit trail all apply (and a failed posting leaves the request PENDING). Cash / mobile money may be paid without a bank account.
   - An approved request that has ACTIVE fuel usage cannot be voided until that usage is voided.
   - Voiding an approved request voids its bank row together with it (or nothing at all). A reconciled bank row blocks the void until un-reconciled.
   - Lock order is always: funding -> bank account -> ledger rows, so concurrent requests cannot deadlock. */
const { cents, str, bad } = core;
const PERM_ALL = 'fuel_funding.read_all';
const OWNER_ROLE = 'OWNER';
const BANK_METHODS = ['BANK', 'CARD', 'CHEQUE'];

const audited = (f) => ({ fundingNo: f.fundingNo, vehicleId: f.vehicleId, driverId: f.driverId, amount: f.amount, litres: f.litres, purpose: f.purpose,
  method: f.method, bankAccountId: f.bankAccountId, reference: f.reference, fundingDate: f.fundingDate, status: f.status, disbursedOn: f.disbursedOn });
const canAll = (req) => req.user.permissions.has(PERM_ALL);
const scope = (req) => (canAll(req) ? {} : { createdBy: req.user.id });
const notFound = () => new AppError(404, 'NOT_FOUND', 'Fuel funding request not found');

async function lock(req, id, t) {
  const f = await FuelFunding.findOne({ where: { id, ...scope(req) }, transaction: t, lock: t.LOCK.UPDATE });
  if (!f) throw notFound();
  return f;
}

// Validates the vehicle / driver / bank account a request points at (used on create, update and again at approval).
// `f` is the effective state of the request. Returns the loaded rows.
async function check(f, t) {
  const vehicle = await Vehicle.findByPk(f.vehicleId, { transaction: t });
  if (!vehicle) throw bad('vehicleId', 'Vehicle not found');
  if (!vehicle.isActive) throw bad('vehicleId', 'This vehicle is inactive');
  const driverId = f.driverId ?? vehicle.driverId;
  if (!driverId) throw bad('driverId', 'Choose a driver. This vehicle has no default driver.');
  const driver = await Driver.findByPk(driverId, { transaction: t });
  if (!driver) throw bad('driverId', 'Driver not found');
  if (!driver.isActive) throw bad('driverId', 'This driver is inactive');
  if (f.litres != null && vehicle.tankCapacityLitres != null && Number(f.litres) > Number(vehicle.tankCapacityLitres))
    throw bad('litres', `More than the tank capacity of this vehicle (${Number(vehicle.tankCapacityLitres)} litres)`);
  if (BANK_METHODS.includes(f.method) && !f.bankAccountId) throw bad('bankAccountId', 'Choose the bank account this is paid from');
  let account = null;
  if (f.bankAccountId) {
    account = await BankAccount.findByPk(f.bankAccountId, { transaction: t });
    if (!account) throw bad('bankAccountId', 'Bank account not found');
    if (!account.isActive) throw bad('bankAccountId', 'This bank account is inactive');
    if (account.currency !== banking.BASE_CURRENCY) throw bad('bankAccountId', `Fuel funding can only be paid from ${banking.BASE_CURRENCY} accounts`);
  }
  return { vehicle, driver, account, driverId };
}
async function checkDate(date, t) {
  if (date && date > await core.dbToday(t)) throw bad('fundingDate', 'Funding date cannot be in the future');
}

const create = (req, body) => sequelize.transaction(async (t) => {
  await checkDate(body.fundingDate, t);
  const { driverId } = await check({ ...body, bankAccountId: body.bankAccountId ?? null }, t);
  const f = await FuelFunding.create({
    fundingNo: `FUE-${core.year()}-${core.pad(await core.nextNo('fuel_funding_seq', t))}`, vehicleId: body.vehicleId, driverId,
    amount: str(cents(body.amount)), litres: body.litres != null ? Number(body.litres).toFixed(3) : null, purpose: body.purpose, method: body.method,
    bankAccountId: body.bankAccountId ?? null, reference: body.reference ?? null, fundingDate: body.fundingDate ?? await core.dbToday(t),
    notes: body.notes ?? null, status: 'PENDING', createdBy: req.user.id,
  }, { transaction: t });
  await audit.log(req, { action: 'FUEL_FUNDING_CREATED', entityType: 'FuelFunding', entityId: f.id, newValues: audited(f) }, t);
  return f.id;
});

// Only the person who raised it can change it, and only while it is still waiting for a decision.
const update = (req, id, body) => sequelize.transaction(async (t) => {
  const f = await lock(req, id, t);
  if (f.createdBy !== req.user.id) throw new AppError(403, 'FORBIDDEN', 'Only the person who raised this request can edit it');
  if (f.status !== 'PENDING') throw new AppError(409, 'BAD_STATE', `A ${f.status.toLowerCase()} request cannot be edited`);
  await checkDate(body.fundingDate, t);
  const eff = { vehicleId: f.vehicleId, driverId: f.driverId, litres: f.litres, method: f.method, bankAccountId: f.bankAccountId };
  for (const k of Object.keys(eff)) if (body[k] !== undefined) eff[k] = body[k];        // checked against the merged state, not just the patch
  if (body.driverId === null) eff.driverId = null;
  const { driverId } = await check(eff, t);
  const old = audited(f);
  const patch = { ...body, driverId, ...(body.amount !== undefined && { amount: str(cents(body.amount)) }),
    ...(body.litres !== undefined && { litres: body.litres != null ? Number(body.litres).toFixed(3) : null }) };
  await f.update(patch, { transaction: t });
  await audit.log(req, { action: 'FUEL_FUNDING_UPDATED', entityType: 'FuelFunding', entityId: f.id, oldValues: old, newValues: audited(f) }, t);
  return f.id;
});

const decide = (req, id, approve, note) => sequelize.transaction(async (t) => {
  const f = await lock(req, id, t);
  if (f.status !== 'PENDING') throw new AppError(409, 'BAD_STATE', `This request is already ${f.status.toLowerCase()}`);
  if (f.createdBy === req.user.id && req.user.role !== OWNER_ROLE)
    throw new AppError(403, 'SELF_APPROVAL', 'You cannot approve or reject your own request. Ask another approver.');
  if (!approve && (!note || note.trim().length < 3)) throw bad('note', 'Give a reason for rejecting this request');
  const old = audited(f);
  const patch = { status: approve ? 'APPROVED' : 'REJECTED', decidedBy: req.user.id, decidedAt: new Date(), decisionNote: note ?? null };
  if (approve) {
    const { vehicle, driver } = await check(f, t);                                       // vehicle / driver / account may have changed since it was raised
    patch.disbursedOn = await core.dbToday(t);
    if (f.bankAccountId) {
      const account = await banking.lockAccount(f.bankAccountId, t);
      await banking.post(req, { account, type: 'WITHDRAWAL', amount: f.amount, txnDate: patch.disbursedOn, reference: f.reference ?? f.fundingNo,
        description: `Fuel funding ${f.fundingNo} for ${vehicle.plateNo}`, counterparty: driver.fullName, fuelFundingId: f.id }, t);
    }
  }
  await f.update(patch, { transaction: t });
  await audit.log(req, { action: approve ? 'FUEL_FUNDING_APPROVED' : 'FUEL_FUNDING_REJECTED', entityType: 'FuelFunding', entityId: f.id, oldValues: old, newValues: audited(f), reason: note ?? null }, t);
  return f.id;
});

const voidFunding = (req, id, reason) => sequelize.transaction(async (t) => {
  if (!reason || reason.trim().length < 3) throw bad('reason', 'A reason is required to void a fuel funding request');
  const f = await lock(req, id, t);
  if (!['PENDING', 'APPROVED'].includes(f.status)) throw new AppError(409, 'BAD_STATE', `A ${f.status.toLowerCase()} request cannot be voided`);
  const old = audited(f);
  if (f.status === 'APPROVED') {
    // Fuel usage was recorded against this money: those records must be voided first, otherwise the balances would no longer add up.
    const used = await FuelUsage.count({ where: { fuelFundingId: f.id, status: 'ACTIVE' }, transaction: t });
    if (used) throw new AppError(409, 'HAS_USAGE', `This funding has ${used} active fuel usage record${used === 1 ? '' : 's'}. Void ${used === 1 ? 'it' : 'them'} first.`);
    const peek = await BankTransaction.findAll({ where: { fuelFundingId: f.id, status: 'POSTED' }, attributes: ['id', 'bankAccountId'], transaction: t });
    const accs = await banking.lockAccounts(peek.map((x) => x.bankAccountId), t);
    const rows = await BankTransaction.findAll({ where: { id: peek.map((x) => x.id) }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE });
    for (const x of rows) await banking.voidLeg(req, x, accs.get(x.bankAccountId), `Fuel funding ${f.fundingNo} voided: ${reason}`, t);
  }
  await f.update({ status: 'VOIDED', voidedAt: new Date(), voidedBy: req.user.id, voidReason: reason }, { transaction: t });
  await audit.log(req, { action: 'FUEL_FUNDING_VOIDED', entityType: 'FuelFunding', entityId: f.id, oldValues: old, newValues: audited(f), reason }, t);
  return f.id;
});

/* ---------- reads ---------- */
const accountInc = { model: BankAccount, as: 'bankAccount', attributes: ['id', 'accountNo', 'accountName', 'currency'],
  include: [{ model: Bank, as: 'bank', attributes: ['id', 'code', 'name'] }] };
const listInc = [
  { model: Vehicle, as: 'vehicle', attributes: ['id', 'code', 'plateNo', 'fuelType'] },
  { model: Driver, as: 'driver', attributes: ['id', 'code', 'fullName'] },
  accountInc,
  { model: User, as: 'creator', attributes: ['id', 'fullName'] },
  { model: User, as: 'decider', attributes: ['id', 'fullName'] },
];
const SORT = { fundingDate: 'fundingDate', amount: 'amount', fundingNo: 'fundingNo' };

async function list(req, q) {
  const where = { ...scope(req) };
  for (const k of ['vehicleId', 'driverId', 'method', 'bankAccountId', 'createdBy']) if (q[k] !== undefined) where[k] = q[k];
  if (q.status !== 'ALL') where.status = q.status;
  if (!canAll(req)) where.createdBy = req.user.id;                                       // a filter can never widen the scope
  if (q.from || q.to) where.fundingDate = { ...(q.from && { [Op.gte]: q.from }), ...(q.to && { [Op.lte]: q.to }) };
  if (q.search) where[Op.or] = [...['fundingNo', 'purpose', 'reference'].map((f) => ({ [f]: { [Op.iLike]: like(q.search) } })),
    { '$vehicle.plate_no$': { [Op.iLike]: like(q.search) } }, { '$driver.full_name$': { [Op.iLike]: like(q.search) } }];
  const { rows, count } = await FuelFunding.findAndCountAll({ where, include: listInc,
    order: [[SORT[q.sortBy], q.sortDir.toUpperCase()], ['createdAt', 'DESC']], limit: q.limit, offset: (q.page - 1) * q.limit, distinct: true });
  const [sum] = await FuelFunding.findAll({ where: { ...where, status: 'APPROVED' }, include: q.search ? listInc.slice(0, 2).map((i) => ({ ...i, attributes: [] })) : [],
    attributes: [[sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('FuelFunding.amount')), 0), 'approvedTotal']], raw: true });
  return { data: rows, total: count, page: q.page, limit: q.limit, approvedTotal: String(sum.approvedTotal) };
}

async function getOne(req, id) {
  const f = await FuelFunding.findOne({ where: { id, ...scope(req) },
    include: [...listInc, { model: User, as: 'voider', attributes: ['id', 'fullName'] },
      { model: BankTransaction, as: 'bankTransactions', attributes: ['id', 'txnNo', 'type', 'amount', 'txnDate', 'status', 'isReconciled'], required: false }] });
  if (!f) throw notFound();
  return f;
}

// Approved fuel funding per vehicle (default) or per driver over a date range. Respects the same own / all scope.
async function summary(req, { from, to, groupBy }) {
  const byVehicle = groupBy === 'vehicle';
  const rows = await sequelize.query(`SELECT ${byVehicle ? 'v.id, v.plate_no' : 'd.id, d.full_name'} AS label, COUNT(*)::int AS count,
      SUM(f.amount)::text AS total, COALESCE(SUM(f.litres), 0)::text AS litres
    FROM fuel_fundings f JOIN vehicles v ON v.id = f.vehicle_id JOIN drivers d ON d.id = f.driver_id
    WHERE f.status = 'APPROVED' AND (CAST(:from AS date) IS NULL OR f.funding_date >= CAST(:from AS date)) AND (CAST(:to AS date) IS NULL OR f.funding_date <= CAST(:to AS date))
    ${canAll(req) ? '' : 'AND f.created_by = :uid'} GROUP BY ${byVehicle ? 'v.id, v.plate_no' : 'd.id, d.full_name'} ORDER BY SUM(f.amount) DESC`,
    { replacements: { from: from ?? null, to: to ?? null, uid: req.user.id }, type: QueryTypes.SELECT });
  const total = rows.reduce((s, r) => s + cents(r.total), 0n);
  return { groupBy, from: from ?? null, to: to ?? null, total: str(total), rows };
}

module.exports = { create, update, approve: (req, id, note) => decide(req, id, true, note), reject: (req, id, note) => decide(req, id, false, note),
  void: voidFunding, list, getOne, summary };
