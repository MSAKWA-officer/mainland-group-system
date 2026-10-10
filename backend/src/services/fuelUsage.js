const { Op, QueryTypes } = require('sequelize');
const { sequelize, FuelUsage, FuelFunding, Vehicle, Driver, User } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('./audit');
const core = require('./saleCore');

/* Fuel usage = fuel the driver actually bought with the money of an APPROVED fuel funding.
   - Flow: ACTIVE -> VOIDED. Records are never deleted.
   - Anyone with fuel_usage.create can record usage; only the person who recorded it can edit it (while ACTIVE); fuel_usage.void voids it with a reason.
   - Without fuel_usage.read_all a user only sees (and can only record against) the fundings / usage they raised. Someone else's record looks like "not found".
   - Server rules: the funding must be APPROVED; usage date not in the future and not before the money was given out; litres cannot exceed the vehicle's tank;
     total usage cannot exceed the money in the funding; the odometer can never go backwards for a vehicle; the same receipt cannot be claimed twice.
   - price per litre is calculated here (amount / litres) - the client never sends it.
   - Lock order is always: funding -> vehicle odometer lock -> usage row, so concurrent requests cannot overspend a funding or deadlock. */
const { cents, str, bad } = core;
const PERM_ALL = 'fuel_usage.read_all';
const canAll = (req) => req.user.permissions.has(PERM_ALL);
const scope = (req) => (canAll(req) ? {} : { createdBy: req.user.id });
const notFound = () => new AppError(404, 'NOT_FOUND', 'Fuel usage record not found');

const half = (n, d) => (n * 2n + d) / (2n * d);                                   // divide, rounding half up
const pricePerLitre = (amountCents, litres) => str(half(amountCents * 1000n, BigInt(Math.round(Number(litres) * 1000))));
const audited = (u) => ({ usageNo: u.usageNo, fuelFundingId: u.fuelFundingId, vehicleId: u.vehicleId, driverId: u.driverId, usageDate: u.usageDate, litres: u.litres,
  amount: u.amount, pricePerLitre: u.pricePerLitre, odometerKm: u.odometerKm, isFullTank: u.isFullTank, station: u.station, receiptNo: u.receiptNo, status: u.status });

// Normalises client input into exactly what is stored.
const norm = (s) => ({ usageDate: s.usageDate, litres: Number(s.litres).toFixed(3), amount: str(cents(s.amount)),
  odometerKm: s.odometerKm != null ? Number(s.odometerKm).toFixed(1) : null, isFullTank: s.isFullTank, station: s.station ?? null, receiptNo: s.receiptNo ?? null, notes: s.notes ?? null });

async function lockFunding(req, id, t) {
  const f = await FuelFunding.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!f || (!canAll(req) && f.createdBy !== req.user.id)) throw bad('fuelFundingId', 'Fuel funding request not found');   // someone else's funding looks like "not found"
  return f;
}

// All business rules, checked inside the transaction while the funding row is locked. `s` is the effective (merged) state.
async function check(f, s, today, excludeId, t) {
  const ex = excludeId ? 'AND id <> :ex' : '';
  const rep = { ex: excludeId ?? null };
  if (f.status !== 'APPROVED') throw new AppError(409, 'BAD_STATE', `Fuel can only be recorded against an approved funding (this one is ${f.status.toLowerCase()})`);
  if (s.usageDate > today) throw bad('usageDate', 'Usage date cannot be in the future');
  if (f.disbursedOn && s.usageDate < f.disbursedOn) throw bad('usageDate', `Cannot be before the money was given out (${f.disbursedOn})`);

  const vehicle = await Vehicle.findByPk(f.vehicleId, { transaction: t });
  if (vehicle && vehicle.tankCapacityLitres != null && Number(s.litres) > Number(vehicle.tankCapacityLitres))
    throw bad('litres', `More than the tank capacity of this vehicle (${Number(vehicle.tankCapacityLitres)} litres)`);

  const [{ used }] = await sequelize.query(`SELECT COALESCE(SUM(amount), 0)::text AS used FROM fuel_usages WHERE fuel_funding_id = :fid AND status = 'ACTIVE' ${ex}`,
    { replacements: { ...rep, fid: f.id }, type: QueryTypes.SELECT, transaction: t });
  const left = cents(f.amount) - cents(used);
  if (cents(s.amount) > left) throw bad('amount', `More than the money left on this funding (${str(left < 0n ? 0n : left)} left)`);

  if (s.odometerKm != null) {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:k))', { replacements: { k: `fuel-odo:${f.vehicleId}` }, transaction: t });   // one writer per vehicle
    const [n] = await sequelize.query(`SELECT (MAX(odometer_km) FILTER (WHERE usage_date <= :d))::text AS prev, (MIN(odometer_km) FILTER (WHERE usage_date > :d))::text AS next
      FROM fuel_usages WHERE vehicle_id = :v AND status = 'ACTIVE' AND odometer_km IS NOT NULL ${ex}`,
    { replacements: { ...rep, d: s.usageDate, v: f.vehicleId }, type: QueryTypes.SELECT, transaction: t });
    if (n.prev != null && Number(s.odometerKm) < Number(n.prev)) throw bad('odometerKm', `Lower than the last reading for this vehicle (${Number(n.prev)} km)`);
    if (n.next != null && Number(s.odometerKm) > Number(n.next)) throw bad('odometerKm', `Higher than a later reading for this vehicle (${Number(n.next)} km)`);
  }

  if (s.receiptNo) {
    const hit = await sequelize.query(`SELECT usage_no FROM fuel_usages WHERE status = 'ACTIVE' AND UPPER(receipt_no) = UPPER(:r) AND COALESCE(UPPER(station), '') = COALESCE(UPPER(:s), '') ${ex} LIMIT 1`,
      { replacements: { ...rep, r: s.receiptNo, s: s.station ?? null }, type: QueryTypes.SELECT, transaction: t });
    if (hit.length) throw new AppError(409, 'DUPLICATE', `This receipt is already recorded on ${hit[0].usage_no}`, [{ field: 'receiptNo', message: 'Already recorded' }]);
  }
}

const create = (req, body) => sequelize.transaction(async (t) => {
  const f = await lockFunding(req, body.fuelFundingId, t);
  const today = await core.dbToday(t);
  const s = norm({ ...body, usageDate: body.usageDate ?? today });
  await check(f, s, today, null, t);
  const u = await FuelUsage.create({
    usageNo: `FUS-${core.year()}-${core.pad(await core.nextNo('fuel_usage_seq', t))}`, fuelFundingId: f.id, vehicleId: f.vehicleId, driverId: f.driverId,
    ...s, pricePerLitre: pricePerLitre(cents(s.amount), s.litres), status: 'ACTIVE', createdBy: req.user.id,
  }, { transaction: t });
  await audit.log(req, { action: 'FUEL_USAGE_CREATED', entityType: 'FuelUsage', entityId: u.id, newValues: audited(u) }, t);
  return u.id;
});

// Only the person who recorded it can change it, and only while it is ACTIVE and its funding is still APPROVED.
const update = (req, id, body) => sequelize.transaction(async (t) => {
  const peek = await FuelUsage.findOne({ where: { id, ...scope(req) }, attributes: ['id', 'fuelFundingId'], transaction: t });
  if (!peek) throw notFound();
  const f = await lockFunding(req, peek.fuelFundingId, t);                          // funding first, then the usage row
  const u = await FuelUsage.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (u.createdBy !== req.user.id) throw new AppError(403, 'FORBIDDEN', 'Only the person who recorded this usage can edit it');
  if (u.status !== 'ACTIVE') throw new AppError(409, 'BAD_STATE', `A ${u.status.toLowerCase()} usage record cannot be edited`);
  const eff = { usageDate: u.usageDate, litres: u.litres, amount: u.amount, odometerKm: u.odometerKm, isFullTank: u.isFullTank, station: u.station, receiptNo: u.receiptNo, notes: u.notes };
  for (const k of Object.keys(eff)) if (body[k] !== undefined) eff[k] = body[k];     // checked against the merged state, not just the patch
  const s = norm(eff);
  await check(f, s, await core.dbToday(t), u.id, t);
  const old = audited(u);
  await u.update({ ...s, pricePerLitre: pricePerLitre(cents(s.amount), s.litres) }, { transaction: t });
  await audit.log(req, { action: 'FUEL_USAGE_UPDATED', entityType: 'FuelUsage', entityId: u.id, oldValues: old, newValues: audited(u) }, t);
  return u.id;
});

const voidUsage = (req, id, reason) => sequelize.transaction(async (t) => {
  if (!reason || reason.trim().length < 3) throw bad('reason', 'A reason is required to void a fuel usage record');
  const peek = await FuelUsage.findOne({ where: { id, ...scope(req) }, attributes: ['id', 'fuelFundingId'], transaction: t });
  if (!peek) throw notFound();
  await lockFunding(req, peek.fuelFundingId, t);
  const u = await FuelUsage.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (u.status !== 'ACTIVE') throw new AppError(409, 'BAD_STATE', `A ${u.status.toLowerCase()} usage record cannot be voided`);
  const old = audited(u);
  await u.update({ status: 'VOIDED', voidedAt: new Date(), voidedBy: req.user.id, voidReason: reason }, { transaction: t });
  await audit.log(req, { action: 'FUEL_USAGE_VOIDED', entityType: 'FuelUsage', entityId: u.id, oldValues: old, newValues: audited(u), reason }, t);
  return u.id;
});

/* ---------- reads ---------- */
const listInc = [
  { model: Vehicle, as: 'vehicle', attributes: ['id', 'code', 'plateNo', 'fuelType'] },
  { model: Driver, as: 'driver', attributes: ['id', 'code', 'fullName'] },
  { model: FuelFunding, as: 'funding', attributes: ['id', 'fundingNo', 'amount', 'status'] },
  { model: User, as: 'creator', attributes: ['id', 'fullName'] },
];
const SORT = { usageDate: 'usageDate', amount: 'amount', litres: 'litres', usageNo: 'usageNo' };

async function list(req, q) {
  const where = { ...scope(req) };
  for (const k of ['fuelFundingId', 'vehicleId', 'driverId', 'createdBy']) if (q[k] !== undefined) where[k] = q[k];
  if (q.status !== 'ALL') where.status = q.status;
  if (!canAll(req)) where.createdBy = req.user.id;                                   // a filter can never widen the scope
  if (q.from || q.to) where.usageDate = { ...(q.from && { [Op.gte]: q.from }), ...(q.to && { [Op.lte]: q.to }) };
  if (q.search) where[Op.or] = [...['usageNo', 'station', 'receiptNo'].map((f) => ({ [f]: { [Op.iLike]: like(q.search) } })),
    { '$vehicle.plate_no$': { [Op.iLike]: like(q.search) } }, { '$driver.full_name$': { [Op.iLike]: like(q.search) } }];
  const { rows, count } = await FuelUsage.findAndCountAll({ where, include: listInc,
    order: [[SORT[q.sortBy], q.sortDir.toUpperCase()], ['createdAt', 'DESC']], limit: q.limit, offset: (q.page - 1) * q.limit, distinct: true });
  const [sum] = await FuelUsage.findAll({ where: { ...where, status: 'ACTIVE' }, include: q.search ? listInc.slice(0, 2).map((i) => ({ ...i, attributes: [] })) : [],
    attributes: [[sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('FuelUsage.amount')), 0), 'activeTotal'],
      [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('FuelUsage.litres')), 0), 'activeLitres']], raw: true });
  return { data: rows, total: count, page: q.page, limit: q.limit, activeTotal: String(sum.activeTotal), activeLitres: String(sum.activeLitres) };
}

async function getOne(req, id) {
  const u = await FuelUsage.findOne({ where: { id, ...scope(req) }, include: [...listInc, { model: User, as: 'voider', attributes: ['id', 'fullName'] }] });
  if (!u) throw notFound();
  return u;
}

module.exports = { create, update, void: voidUsage, list, getOne };
