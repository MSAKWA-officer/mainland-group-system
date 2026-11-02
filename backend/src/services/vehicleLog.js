const { Op, QueryTypes } = require('sequelize');
const { sequelize, VehicleTrip, FuelUsage, Vehicle, User } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('./audit');
const core = require('./saleCore');

/* Vehicle log = the "Official Vehicle USE and FUELING Registration Form".
   - USE half   : vehicle_trips (this file). Flow: ACTIVE -> VOIDED, never deleted. A trip is OPEN (no final mileage / end time) until it is closed by editing it.
   - FUELING half: fuel_usages (already recorded in Fuel usage: odometer = mileage when fueling, litres, payment method, receipt no).
   - logSheet() lays both halves side by side for one vehicle and one month, exactly like the paper form.
   - Server rules: vehicle must be active; date not in the future; final mileage >= initial mileage; end time >= start time; mileage and end time come together;
     a vehicle has only one open trip; the odometer can never go backwards between trips of the same vehicle; total mileage is calculated here.
   - Only the person who recorded a trip can edit it (while ACTIVE); vehicle_log.void voids it with a reason. */
const { bad } = core;
const canVoid = (req) => req.user.permissions.has('vehicle_log.void');
const notFound = () => new AppError(404, 'NOT_FOUND', 'Vehicle trip not found');
const hm = (t) => (t ? String(t).slice(0, 5) : null);
const audited = (x) => ({ tripNo: x.tripNo, vehicleId: x.vehicleId, tripDate: x.tripDate, userName: x.userName, purpose: x.purpose,
  timeStart: hm(x.timeStart), startKm: x.startKm, timeEnd: hm(x.timeEnd), endKm: x.endKm, totalKm: x.totalKm, status: x.status });

const norm = (s) => {
  const startKm = Number(s.startKm); const endKm = s.endKm != null ? Number(s.endKm) : null;
  return { tripDate: s.tripDate, userName: s.userName.trim(), purpose: s.purpose.trim(), timeStart: s.timeStart, startKm: startKm.toFixed(1),
    timeEnd: s.timeEnd ?? null, endKm: endKm != null ? endKm.toFixed(1) : null, totalKm: endKm != null ? (Math.round((endKm - startKm) * 10) / 10).toFixed(1) : null, notes: s.notes ?? null };
};

async function check(vehicleId, s, today, excludeId, t) {
  const vehicle = await Vehicle.findByPk(vehicleId, { transaction: t });
  if (!vehicle) throw bad('vehicleId', 'Vehicle not found');
  if (!vehicle.isActive) throw bad('vehicleId', 'This vehicle is inactive');
  if (s.tripDate > today) throw bad('tripDate', 'Trip date cannot be in the future');
  if ((s.endKm == null) !== (s.timeEnd == null)) throw bad(s.endKm == null ? 'endKm' : 'timeEnd', 'Final mileage and ending time go together');
  if (s.endKm != null && Number(s.endKm) < Number(s.startKm)) throw bad('endKm', 'Final mileage cannot be less than the initial mileage');
  if (s.timeEnd != null && s.timeEnd < s.timeStart) throw bad('timeEnd', 'Ending time cannot be before the starting time');

  const ex = excludeId ? 'AND id <> :ex' : '';
  const rep = { ex: excludeId ?? null, v: vehicleId, d: s.tripDate };
  await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:k))', { replacements: { k: `vehicle-trip:${vehicleId}` }, transaction: t });   // one writer per vehicle
  if (s.endKm == null) {
    const open = await sequelize.query(`SELECT trip_no FROM vehicle_trips WHERE vehicle_id = :v AND status = 'ACTIVE' AND end_km IS NULL ${ex} LIMIT 1`, { replacements: rep, type: QueryTypes.SELECT, transaction: t });
    if (open.length) throw new AppError(409, 'OPEN_TRIP', `This vehicle still has an open trip (${open[0].trip_no}). Close it first.`);
  }
  const [n] = await sequelize.query(`SELECT (MAX(end_km) FILTER (WHERE trip_date < :d))::text AS prev, (MIN(start_km) FILTER (WHERE trip_date > :d))::text AS next
    FROM vehicle_trips WHERE vehicle_id = :v AND status = 'ACTIVE' ${ex}`, { replacements: rep, type: QueryTypes.SELECT, transaction: t });
  if (n.prev != null && Number(s.startKm) < Number(n.prev)) throw bad('startKm', `Lower than the last final mileage of this vehicle (${Number(n.prev)} km)`);
  const top = s.endKm ?? s.startKm;
  if (n.next != null && Number(top) > Number(n.next)) throw bad(s.endKm != null ? 'endKm' : 'startKm', `Higher than the initial mileage of a later trip (${Number(n.next)} km)`);
}

const create = (req, body) => sequelize.transaction(async (t) => {
  const today = await core.dbToday(t);
  const s = norm({ ...body, tripDate: body.tripDate ?? today });
  await check(body.vehicleId, s, today, null, t);
  const x = await VehicleTrip.create({ tripNo: `TRP-${core.year()}-${core.pad(await core.nextNo('vehicle_trip_seq', t))}`, vehicleId: body.vehicleId, ...s, status: 'ACTIVE', createdBy: req.user.id }, { transaction: t });
  await audit.log(req, { action: 'VEHICLE_TRIP_CREATED', entityType: 'VehicleTrip', entityId: x.id, newValues: audited(x) }, t);
  return x.id;
});

const update = (req, id, body) => sequelize.transaction(async (t) => {
  const x = await VehicleTrip.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!x) throw notFound();
  if (x.createdBy !== req.user.id) throw new AppError(403, 'FORBIDDEN', 'Only the person who recorded this trip can edit it');
  if (x.status !== 'ACTIVE') throw new AppError(409, 'BAD_STATE', `A ${x.status.toLowerCase()} trip cannot be edited`);
  const eff = { tripDate: x.tripDate, userName: x.userName, purpose: x.purpose, timeStart: hm(x.timeStart), startKm: x.startKm, timeEnd: hm(x.timeEnd), endKm: x.endKm, notes: x.notes };
  for (const k of Object.keys(eff)) if (body[k] !== undefined) eff[k] = body[k];     // checked against the merged state, not just the patch
  const s = norm(eff);
  await check(x.vehicleId, s, await core.dbToday(t), x.id, t);
  const old = audited(x);
  await x.update(s, { transaction: t });
  await audit.log(req, { action: 'VEHICLE_TRIP_UPDATED', entityType: 'VehicleTrip', entityId: x.id, oldValues: old, newValues: audited(x) }, t);
  return x.id;
});

const voidTrip = (req, id, reason) => sequelize.transaction(async (t) => {
  if (!reason || reason.trim().length < 3) throw bad('reason', 'A reason is required to void a trip');
  const x = await VehicleTrip.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!x) throw notFound();
  if (x.status !== 'ACTIVE') throw new AppError(409, 'BAD_STATE', `A ${x.status.toLowerCase()} trip cannot be voided`);
  const old = audited(x);
  await x.update({ status: 'VOIDED', voidedAt: new Date(), voidedBy: req.user.id, voidReason: reason }, { transaction: t });
  await audit.log(req, { action: 'VEHICLE_TRIP_VOIDED', entityType: 'VehicleTrip', entityId: x.id, oldValues: old, newValues: audited(x), reason }, t);
  return x.id;
});

/* ---------- reads ---------- */
const inc = [{ model: Vehicle, as: 'vehicle', attributes: ['id', 'code', 'plateNo', 'make', 'model'] }, { model: User, as: 'creator', attributes: ['id', 'fullName'] }];
const SORT = { tripDate: 'tripDate', tripNo: 'tripNo', totalKm: 'totalKm' };

async function list(q) {
  const where = {};
  if (q.vehicleId) where.vehicleId = q.vehicleId;
  if (q.status !== 'ALL') where.status = q.status;
  if (q.open) where.endKm = null;
  if (q.from || q.to) where.tripDate = { ...(q.from && { [Op.gte]: q.from }), ...(q.to && { [Op.lte]: q.to }) };
  if (q.search) where[Op.or] = [...['tripNo', 'userName', 'purpose'].map((f) => ({ [f]: { [Op.iLike]: like(q.search) } })), { '$vehicle.plate_no$': { [Op.iLike]: like(q.search) } }];
  const { rows, count } = await VehicleTrip.findAndCountAll({ where, include: inc, order: [[SORT[q.sortBy], q.sortDir.toUpperCase()], ['timeStart', q.sortDir.toUpperCase()], ['createdAt', 'DESC']],
    limit: q.limit, offset: (q.page - 1) * q.limit, distinct: true });
  const [sum] = await VehicleTrip.findAll({ where: { ...where, status: 'ACTIVE' }, include: q.search ? [{ ...inc[0], attributes: [] }] : [],
    attributes: [[sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('VehicleTrip.total_km')), 0), 'activeKm']], raw: true });
  return { data: rows, total: count, page: q.page, limit: q.limit, activeKm: String(sum.activeKm) };
}

async function getOne(id) {
  const x = await VehicleTrip.findByPk(id, { include: [...inc, { model: User, as: 'voider', attributes: ['id', 'fullName'] }] });
  if (!x) throw notFound();
  return x;
}

// The paper form for one vehicle and one month: trips on the left, fuelings on the right. On a day with several trips and fuelings, the first trip
// is paired with the first fuelling, the second with the second, and so on; the extras get a row of their own.
async function logSheet({ vehicleId, month }) {
  const vehicle = await Vehicle.findByPk(vehicleId, { attributes: ['id', 'code', 'plateNo', 'make', 'model'] });
  if (!vehicle) throw bad('vehicleId', 'Vehicle not found');
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`; const to = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const trips = await VehicleTrip.findAll({ where: { vehicleId, status: 'ACTIVE', tripDate: { [Op.between]: [from, to] } }, order: [['tripDate', 'ASC'], ['timeStart', 'ASC'], ['createdAt', 'ASC']], raw: true });
  const fuel = await FuelUsage.findAll({ where: { vehicleId, status: 'ACTIVE', usageDate: { [Op.between]: [from, to] } }, order: [['usageDate', 'ASC'], ['createdAt', 'ASC']], raw: true });
  const days = [...new Set([...trips.map((x) => x.tripDate), ...fuel.map((x) => x.usageDate)])].sort();
  const rows = [];
  for (const d of days) {
    const a = trips.filter((x) => x.tripDate === d); const b = fuel.filter((x) => x.usageDate === d);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const tr = a[i]; const fu = b[i];
      rows.push({ date: d, userName: tr?.userName ?? null, purpose: tr?.purpose ?? null, timeStart: hm(tr?.timeStart), startKm: tr?.startKm ?? null, timeEnd: hm(tr?.timeEnd),
        endKm: tr?.endKm ?? null, totalKm: tr?.totalKm ?? null, fuelOdometerKm: fu?.odometerKm ?? null, litres: fu?.litres ?? null, paymentMethod: fu?.paymentMethod ?? null, receiptNo: fu?.receiptNo ?? null });
    }
  }
  const sum = (k) => rows.reduce((s, r) => s + (r[k] != null ? Number(r[k]) : 0), 0);
  return { vehicle, month, year: y, monthNo: m, from, to, rows, totals: { totalKm: sum('totalKm').toFixed(1), litres: sum('litres').toFixed(3) } };
}

module.exports = { create, update, void: voidTrip, list, getOne, logSheet };
