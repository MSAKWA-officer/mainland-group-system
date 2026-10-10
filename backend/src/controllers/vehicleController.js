const { Op, literal } = require('sequelize');
const { sequelize, Vehicle, Driver, FuelFunding } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('../services/audit');
const core = require('../services/saleCore');

/* Vehicles: the company fleet.
   - The plate number is stored upper-case; spaces and hyphens are ignored when comparing, so "T 123 ABC", "T123ABC" and "T-123-ABC" are the same vehicle (unique index + friendly check).
   - Setting or clearing the default driver needs vehicles.assign, even though the field travels in create / update.
   - A vehicle with pending fuel funding requests cannot be deactivated; one with funding history cannot be deleted (deactivate instead). */
const { bad } = core;
const extra = [[literal('(SELECT CAST(COUNT(*) AS int) FROM fuel_fundings f WHERE f.vehicle_id = "Vehicle"."id")'), 'fundingCount']];
const driverInc = { model: Driver, as: 'driver', attributes: ['id', 'code', 'fullName', 'phone', 'isActive'] };
const audited = (v) => ({ code: v.code, plateNo: v.plateNo, make: v.make, model: v.model, year: v.year, vehicleType: v.vehicleType, fuelType: v.fuelType,
  tankCapacityLitres: v.tankCapacityLitres, driverId: v.driverId, notes: v.notes, isActive: v.isActive });
const show = (id) => Vehicle.findByPk(id, { attributes: { include: extra }, include: [driverInc] });
const find = async (id, t) => {
  const v = await Vehicle.findByPk(id, { transaction: t, ...(t && { lock: t.LOCK.UPDATE }) });
  if (!v) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  return v;
};
const SORT = { plateNo: 'plateNo', code: 'code', make: 'make' };
const squash = (col) => sequelize.fn('UPPER', sequelize.fn('TRANSLATE', col, ' -', ''));        // must match the vehicles_plate_uq index

const dupPlate = async (plateNo, selfId, t) => {
  const key = plateNo.toUpperCase().replace(/[\s-]/g, '');
  const hit = await Vehicle.findOne({ where: { [Op.and]: [sequelize.where(squash(sequelize.col('plate_no')), key), ...(selfId ? [{ id: { [Op.ne]: selfId } }] : [])] }, transaction: t });
  if (hit) throw new AppError(409, 'DUPLICATE', 'A vehicle with this plate number is already registered', [{ field: 'plateNo', message: 'Already registered' }]);
};
const mustAssign = (req) => {
  if (!req.user.permissions.has('vehicles.assign')) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to assign a driver to a vehicle');
};
const checkDriver = async (driverId, t) => {
  if (!driverId) return;
  const d = await Driver.findByPk(driverId, { transaction: t });
  if (!d) throw bad('driverId', 'Driver not found');
  if (!d.isActive) throw bad('driverId', 'This driver is inactive');
};

exports.list = async (req, res) => {
  const { search, isActive, vehicleType, fuelType, driverId, sortBy, sortDir, page, limit } = req.query; const where = {};
  if (isActive !== undefined) where.isActive = isActive;
  if (vehicleType) where.vehicleType = vehicleType;
  if (fuelType) where.fuelType = fuelType;
  if (driverId) where.driverId = driverId;
  if (search) where[Op.or] = ['plateNo', 'code', 'make', 'model'].map((f) => ({ [f]: { [Op.iLike]: like(search) } }));
  const { rows, count } = await Vehicle.findAndCountAll({ where, attributes: { include: extra }, include: [driverInc],
    order: [[SORT[sortBy], sortDir.toUpperCase()], ['createdAt', 'DESC']], limit, offset: (page - 1) * limit, distinct: true });
  res.json({ data: rows, total: count, page, limit });
};

exports.getOne = async (req, res) => {
  const v = await show(req.params.id); if (!v) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
  res.json(v);
};

exports.create = async (req, res) => {
  const b = req.body;
  if (b.driverId) mustAssign(req);
  const id = await sequelize.transaction(async (t) => {
    await dupPlate(b.plateNo, null, t); await checkDriver(b.driverId, t);
    const v = await Vehicle.create({ ...b, code: `VEH-${core.pad(await core.nextNo('vehicle_code_seq', t))}`, createdBy: req.user.id }, { transaction: t });
    await audit.log(req, { action: 'VEHICLE_CREATED', entityType: 'Vehicle', entityId: v.id, newValues: audited(v) }, t);
    return v.id;
  });
  res.status(201).json(await show(id));
};

exports.update = async (req, res) => {
  const b = req.body;
  if (b.driverId !== undefined) mustAssign(req);
  await sequelize.transaction(async (t) => {
    const v = await find(req.params.id, t);
    if (b.plateNo !== undefined && b.plateNo !== v.plateNo) await dupPlate(b.plateNo, v.id, t);
    if (b.driverId !== undefined && b.driverId !== v.driverId) await checkDriver(b.driverId, t);
    const old = audited(v); await v.update(b, { transaction: t });
    await audit.log(req, { action: 'VEHICLE_UPDATED', entityType: 'Vehicle', entityId: v.id, oldValues: old, newValues: audited(v) }, t);
  });
  res.json(await show(req.params.id));
};

exports.setStatus = async (req, res) => {
  const { isActive, reason } = req.body;
  if (!isActive && !reason) throw new AppError(400, 'REASON_REQUIRED', 'Give a reason for deactivating this vehicle');
  await sequelize.transaction(async (t) => {
    const v = await find(req.params.id, t);
    if (!isActive && await FuelFunding.count({ where: { vehicleId: v.id, status: 'PENDING' }, transaction: t }))
      throw new AppError(409, 'HAS_PENDING', 'This vehicle has pending fuel funding requests. Approve or reject them first.');
    const old = { isActive: v.isActive }; await v.update({ isActive }, { transaction: t });
    await audit.log(req, { action: isActive ? 'VEHICLE_ACTIVATED' : 'VEHICLE_DEACTIVATED', entityType: 'Vehicle', entityId: v.id, oldValues: old, newValues: { isActive }, reason }, t);
  });
  res.json(await show(req.params.id));
};

exports.remove = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const v = await find(req.params.id, t);
    if (await FuelFunding.count({ where: { vehicleId: v.id }, transaction: t }))
      throw new AppError(409, 'IN_USE', 'Fuel funding was recorded for this vehicle. Deactivate it instead of deleting it.');
    const old = audited(v); await v.destroy({ transaction: t });
    await audit.log(req, { action: 'VEHICLE_DELETED', entityType: 'Vehicle', entityId: v.id, oldValues: old }, t);
  });
  res.json({ ok: true });
};
