const { Op } = require('sequelize');
const { sequelize, VehicleRequest, Vehicle, Driver, User } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('./audit');
const core = require('./saleCore');

/* Vehicle requests = the "Official Vehicle Use REQUEST Form".
   - Flow: PENDING -> APPROVED | REJECTED;  APPROVED -> KEY_OUT (key given out) -> RETURNED (key back);  PENDING / APPROVED -> VOIDED. Never deleted.
   - Anyone with vehicle_requests.create raises a request and can edit their own while it is PENDING. vehicle_requests.approve decides (not your own request; the Owner is exempt).
   - vehicle_requests.issue_key (the key custodian) records the vehicle, driver and key taken time on an APPROVED request, and the key return time later.
   - A vehicle's key can only be out once at a time. Only an inactive-free vehicle and driver can be assigned.
   - Without vehicle_requests.read_all a user only sees the requests they raised (someone else's looks like "not found").
   - Lock order is always: request row -> (vehicle key rule is enforced by a unique index as well). */
const { bad } = core;
const OWNER_ROLE = 'OWNER';
const PERM_ALL = 'vehicle_requests.read_all';
const canAll = (req) => req.user.permissions.has(PERM_ALL);
const scope = (req) => (canAll(req) ? {} : { createdBy: req.user.id });
const notFound = () => new AppError(404, 'NOT_FOUND', 'Vehicle request not found');
const state = (r, ...ok) => { if (!ok.includes(r.status)) throw new AppError(409, 'BAD_STATE', `A ${r.status.toLowerCase().replace('_', ' ')} request cannot do this`); };
const audited = (r) => ({ requestNo: r.requestNo, requestDate: r.requestDate, userName: r.userName, department: r.department, purpose: r.purpose, status: r.status,
  vehicleId: r.vehicleId, driverId: r.driverId, keyTakenAt: r.keyTakenAt, keyReturnedAt: r.keyReturnedAt });

async function lock(req, id, t) {
  const r = await VehicleRequest.findOne({ where: { id, ...scope(req) }, transaction: t, lock: t.LOCK.UPDATE });
  if (!r) throw notFound();
  return r;
}
async function checkDate(date, t) {
  const today = await core.dbToday(t);
  if (date < today) throw bad('requestDate', 'The date of use cannot be in the past');
}

const create = (req, body) => sequelize.transaction(async (t) => {
  const date = body.requestDate ?? await core.dbToday(t);
  await checkDate(date, t);
  const r = await VehicleRequest.create({ requestNo: `VRQ-${core.year()}-${core.pad(await core.nextNo('vehicle_request_seq', t))}`, requestDate: date,
    userName: body.userName.trim(), department: body.department.trim(), purpose: body.purpose.trim(), notes: body.notes ?? null, status: 'PENDING', createdBy: req.user.id }, { transaction: t });
  await audit.log(req, { action: 'VEHICLE_REQUEST_CREATED', entityType: 'VehicleRequest', entityId: r.id, newValues: audited(r) }, t);
  return r.id;
});

const update = (req, id, body) => sequelize.transaction(async (t) => {
  const r = await lock(req, id, t);
  if (r.createdBy !== req.user.id) throw new AppError(403, 'FORBIDDEN', 'Only the person who raised this request can edit it');
  state(r, 'PENDING');
  const eff = { requestDate: r.requestDate, userName: r.userName, department: r.department, purpose: r.purpose, notes: r.notes };
  for (const k of Object.keys(eff)) if (body[k] !== undefined) eff[k] = body[k];
  if (eff.requestDate !== r.requestDate) await checkDate(eff.requestDate, t);
  const old = audited(r);
  await r.update({ ...eff, userName: eff.userName.trim(), department: eff.department.trim(), purpose: eff.purpose.trim(), notes: eff.notes ?? null }, { transaction: t });
  await audit.log(req, { action: 'VEHICLE_REQUEST_UPDATED', entityType: 'VehicleRequest', entityId: r.id, oldValues: old, newValues: audited(r) }, t);
  return r.id;
});

const decide = (req, id, approve, note) => sequelize.transaction(async (t) => {
  const r = await lock(req, id, t);
  state(r, 'PENDING');
  if (r.createdBy === req.user.id && req.user.role !== OWNER_ROLE) throw new AppError(403, 'SELF_APPROVAL', 'You cannot approve or reject your own request. Ask another approver.');
  if (!approve && (!note || note.trim().length < 3)) throw bad('note', 'Give a reason for rejecting this request');
  const old = audited(r);
  await r.update({ status: approve ? 'APPROVED' : 'REJECTED', decidedBy: req.user.id, decidedAt: new Date(), decisionNote: note ?? null }, { transaction: t });
  await audit.log(req, { action: approve ? 'VEHICLE_REQUEST_APPROVED' : 'VEHICLE_REQUEST_REJECTED', entityType: 'VehicleRequest', entityId: r.id, oldValues: old, newValues: audited(r), reason: note ?? null }, t);
  return r.id;
});

// Key custodian: plate number + driver + key taken time on an APPROVED request.
const issueKey = (req, id, body) => sequelize.transaction(async (t) => {
  const r = await lock(req, id, t);
  state(r, 'APPROVED');
  const vehicle = await Vehicle.findByPk(body.vehicleId, { transaction: t, lock: t.LOCK.UPDATE });   // locks the vehicle so two custodians cannot give out the same key
  if (!vehicle) throw bad('vehicleId', 'Vehicle not found');
  if (!vehicle.isActive) throw bad('vehicleId', 'This vehicle is inactive');
  const driverId = body.driverId ?? vehicle.driverId;
  if (!driverId) throw bad('driverId', 'Choose a driver. This vehicle has no default driver.');
  const driver = await Driver.findByPk(driverId, { transaction: t });
  if (!driver) throw bad('driverId', 'Driver not found');
  if (!driver.isActive) throw bad('driverId', 'This driver is inactive');
  const out = await VehicleRequest.findOne({ where: { vehicleId: vehicle.id, status: 'KEY_OUT' }, attributes: ['requestNo'], transaction: t });
  if (out) throw new AppError(409, 'KEY_OUT', `The key of this vehicle is still out on ${out.requestNo}`, [{ field: 'vehicleId', message: 'Key is still out' }]);
  const takenAt = body.keyTakenAt ? new Date(body.keyTakenAt) : new Date();
  if (takenAt.getTime() > Date.now() + 5 * 60000) throw bad('keyTakenAt', 'Key taken time cannot be in the future');
  const old = audited(r);
  await r.update({ status: 'KEY_OUT', vehicleId: vehicle.id, driverId: driver.id, keyTakenAt: takenAt, keyIssuedBy: req.user.id }, { transaction: t });
  await audit.log(req, { action: 'VEHICLE_KEY_ISSUED', entityType: 'VehicleRequest', entityId: r.id, oldValues: old, newValues: audited(r) }, t);
  return r.id;
});

const returnKey = (req, id, body) => sequelize.transaction(async (t) => {
  const r = await lock(req, id, t);
  state(r, 'KEY_OUT');
  const at = body.keyReturnedAt ? new Date(body.keyReturnedAt) : new Date();
  if (at.getTime() > Date.now() + 5 * 60000) throw bad('keyReturnedAt', 'Key return time cannot be in the future');
  if (at < r.keyTakenAt) throw bad('keyReturnedAt', 'Key return time cannot be before the key taken time');
  const old = audited(r);
  await r.update({ status: 'RETURNED', keyReturnedAt: at, keyReturnedBy: req.user.id }, { transaction: t });
  await audit.log(req, { action: 'VEHICLE_KEY_RETURNED', entityType: 'VehicleRequest', entityId: r.id, oldValues: old, newValues: audited(r) }, t);
  return r.id;
});

const voidRequest = (req, id, reason) => sequelize.transaction(async (t) => {
  if (!reason || reason.trim().length < 3) throw bad('reason', 'A reason is required to void a request');
  const r = await lock(req, id, t);
  state(r, 'PENDING', 'APPROVED');
  const old = audited(r);
  await r.update({ status: 'VOIDED', voidedAt: new Date(), voidedBy: req.user.id, voidReason: reason }, { transaction: t });
  await audit.log(req, { action: 'VEHICLE_REQUEST_VOIDED', entityType: 'VehicleRequest', entityId: r.id, oldValues: old, newValues: audited(r), reason }, t);
  return r.id;
});

/* ---------- reads ---------- */
const inc = [
  { model: Vehicle, as: 'vehicle', attributes: ['id', 'code', 'plateNo', 'make', 'model'], required: false },
  { model: Driver, as: 'driver', attributes: ['id', 'code', 'fullName'], required: false },
  { model: User, as: 'creator', attributes: ['id', 'fullName'] },
];
const SORT = { requestDate: 'requestDate', requestNo: 'requestNo', createdAt: 'createdAt' };

async function list(req, q) {
  const where = { ...scope(req) };
  if (q.status !== 'ALL') where.status = q.status;
  if (q.vehicleId) where.vehicleId = q.vehicleId;
  if (q.from || q.to) where.requestDate = { ...(q.from && { [Op.gte]: q.from }), ...(q.to && { [Op.lte]: q.to }) };
  if (q.search) where[Op.or] = [...['requestNo', 'userName', 'department', 'purpose'].map((f) => ({ [f]: { [Op.iLike]: like(q.search) } })), { '$vehicle.plate_no$': { [Op.iLike]: like(q.search) } }, { '$driver.full_name$': { [Op.iLike]: like(q.search) } }];
  const { rows, count } = await VehicleRequest.findAndCountAll({ where, include: inc, order: [[SORT[q.sortBy], q.sortDir.toUpperCase()], ['createdAt', 'DESC']], limit: q.limit, offset: (q.page - 1) * q.limit, distinct: true });
  return { data: rows, total: count, page: q.page, limit: q.limit };
}

async function getOne(req, id) {
  const r = await VehicleRequest.findOne({ where: { id, ...scope(req) }, include: [...inc, { model: User, as: 'decider', attributes: ['id', 'fullName'] }, { model: User, as: 'keyIssuer', attributes: ['id', 'fullName'] },
    { model: User, as: 'keyReceiver', attributes: ['id', 'fullName'] }, { model: User, as: 'voider', attributes: ['id', 'fullName'] }] });
  if (!r) throw notFound();
  return r;
}

// The paper register for one month (the REQUEST form): every request that was not rejected or voided, in date order.
const TZ = process.env.APP_TZ || 'Africa/Dar_es_Salaam';
const clock = (d, day) => (d ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false, ...(day !== d.toISOString().slice(0, 10) && { day: '2-digit', month: '2-digit' }) }).format(d).replace(',', '') : null);
async function register(req, { month }) {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`; const to = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const rows = await VehicleRequest.findAll({ where: { ...scope(req), status: { [Op.in]: ['PENDING', 'APPROVED', 'KEY_OUT', 'RETURNED'] }, requestDate: { [Op.between]: [from, to] } }, include: inc,
    order: [['requestDate', 'ASC'], ['createdAt', 'ASC']] });
  return { month, year: y, monthNo: m, from, to, rows: rows.map((r) => ({ date: r.requestDate, requestNo: r.requestNo, userName: r.userName, department: r.department, purpose: r.purpose, status: r.status,
    plateNo: r.vehicle?.plateNo ?? null, driverName: r.driver?.fullName ?? null, keyTaken: clock(r.keyTakenAt, r.requestDate), keyReturned: clock(r.keyReturnedAt, r.requestDate) })) };
}

module.exports = { create, update, approve: (req, id, note) => decide(req, id, true, note), reject: (req, id, note) => decide(req, id, false, note), issueKey, returnKey, void: voidRequest, list, getOne, register };
