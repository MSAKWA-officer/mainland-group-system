const { Op, literal } = require('sequelize');
const { sequelize, Driver, Vehicle, FuelFunding, Staff } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('../services/audit');
const core = require('../services/saleCore');

/* Drivers: the people who drive company vehicles.
   - licence_status is worked out by the database from licence_expiry (VALID / EXPIRING_SOON within 30 days / EXPIRED), so it is never stale.
   - A driver who is the default driver of an active vehicle, or who has pending fuel funding requests, cannot be deactivated.
   - A driver with vehicles or fuel funding history cannot be deleted (deactivate instead). */
const { bad } = core;
const LICENSE_STATUS = `CASE WHEN "Driver"."license_expiry" < CURRENT_DATE THEN 'EXPIRED' WHEN "Driver"."license_expiry" <= CURRENT_DATE + 30 THEN 'EXPIRING_SOON' ELSE 'VALID' END`;
const extra = [
  [literal(`(${LICENSE_STATUS})`), 'licenseStatus'],
  [literal('(SELECT CAST(COUNT(*) AS int) FROM vehicles v WHERE v.driver_id = "Driver"."id")'), 'vehicleCount'],
  [literal('(SELECT CAST(COUNT(*) AS int) FROM fuel_fundings f WHERE f.driver_id = "Driver"."id")'), 'fundingCount'],
];
const staffInc = { model: Staff, as: 'staff', attributes: ['id', 'code', 'fullName', 'isActive'] };
const audited = (d) => ({ code: d.code, fullName: d.fullName, phone: d.phone, licenseNo: d.licenseNo, licenseClass: d.licenseClass,
  licenseExpiry: d.licenseExpiry, address: d.address, notes: d.notes, staffId: d.staffId, isActive: d.isActive });
const show = (id) => Driver.findByPk(id, { attributes: { include: extra },
  include: [staffInc, { model: Vehicle, as: 'vehicles', attributes: ['id', 'code', 'plateNo', 'isActive'], required: false }] });
const find = async (id, t) => {
  const d = await Driver.findByPk(id, { transaction: t, ...(t && { lock: t.LOCK.UPDATE }) });
  if (!d) throw new AppError(404, 'NOT_FOUND', 'Driver not found');
  return d;
};
const SORT = { fullName: 'fullName', code: 'code', licenseExpiry: 'licenseExpiry' };

const dupLicense = async (licenseNo, selfId, t) => {
  if (await Driver.findOne({ where: { licenseNo, ...(selfId && { id: { [Op.ne]: selfId } }) }, transaction: t }))
    throw new AppError(409, 'DUPLICATE', 'A driver with this licence number is already registered', [{ field: 'licenseNo', message: 'Already registered' }]);
};
// A licence that has already expired cannot be registered or saved as the new expiry date.
const checkExpiry = async (licenseExpiry, t) => {
  if (licenseExpiry < await core.dbToday(t)) throw bad('licenseExpiry', 'This licence has already expired');
};
const checkStaff = async (staffId, selfId, t) => {
  if (!staffId) return;
  const s = await Staff.findByPk(staffId, { transaction: t });
  if (!s) throw bad('staffId', 'Staff member not found');
  if (!s.isActive) throw bad('staffId', 'This staff member is inactive');
  if (await Driver.findOne({ where: { staffId, ...(selfId && { id: { [Op.ne]: selfId } }) }, transaction: t }))
    throw new AppError(409, 'DUPLICATE', 'This staff member is already registered as a driver', [{ field: 'staffId', message: 'Already a driver' }]);
};

exports.list = async (req, res) => {
  const { search, isActive, licenseStatus, sortBy, sortDir, page, limit } = req.query; const where = {}; const and = [];
  if (isActive !== undefined) where.isActive = isActive;
  if (search) where[Op.or] = ['fullName', 'code', 'phone', 'licenseNo'].map((f) => ({ [f]: { [Op.iLike]: like(search) } }));
  if (licenseStatus) and.push(literal(`(${LICENSE_STATUS}) = '${licenseStatus}'`));            // value is a zod enum, never raw input
  const { rows, count } = await Driver.findAndCountAll({ where: and.length ? { [Op.and]: [where, ...and] } : where, attributes: { include: extra }, include: [staffInc],
    order: [[SORT[sortBy], sortDir.toUpperCase()], ['createdAt', 'DESC']], limit, offset: (page - 1) * limit, distinct: true });
  res.json({ data: rows, total: count, page, limit });
};

exports.getOne = async (req, res) => {
  const d = await show(req.params.id); if (!d) throw new AppError(404, 'NOT_FOUND', 'Driver not found');
  res.json(d);
};

exports.create = async (req, res) => {
  const id = await sequelize.transaction(async (t) => {
    const b = req.body;
    await dupLicense(b.licenseNo, null, t); await checkExpiry(b.licenseExpiry, t); await checkStaff(b.staffId, null, t);
    const d = await Driver.create({ ...b, code: `DRV-${core.pad(await core.nextNo('driver_code_seq', t))}`, createdBy: req.user.id }, { transaction: t });
    await audit.log(req, { action: 'DRIVER_CREATED', entityType: 'Driver', entityId: d.id, newValues: audited(d) }, t);
    return d.id;
  });
  res.status(201).json(await show(id));
};

exports.update = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const d = await find(req.params.id, t); const b = req.body;
    if (b.licenseNo !== undefined && b.licenseNo !== d.licenseNo) await dupLicense(b.licenseNo, d.id, t);
    if (b.licenseExpiry !== undefined && b.licenseExpiry !== d.licenseExpiry) await checkExpiry(b.licenseExpiry, t);
    if (b.staffId !== undefined && b.staffId !== d.staffId) await checkStaff(b.staffId, d.id, t);
    const old = audited(d); await d.update(b, { transaction: t });
    await audit.log(req, { action: 'DRIVER_UPDATED', entityType: 'Driver', entityId: d.id, oldValues: old, newValues: audited(d) }, t);
  });
  res.json(await show(req.params.id));
};

exports.setStatus = async (req, res) => {
  const { isActive, reason } = req.body;
  if (!isActive && !reason) throw new AppError(400, 'REASON_REQUIRED', 'Give a reason for deactivating this driver');
  await sequelize.transaction(async (t) => {
    const d = await find(req.params.id, t);
    if (!isActive) {
      if (await Vehicle.count({ where: { driverId: d.id, isActive: true }, transaction: t }))
        throw new AppError(409, 'HAS_VEHICLE', 'This driver is the default driver of an active vehicle. Assign another driver to that vehicle first.');
      if (await FuelFunding.count({ where: { driverId: d.id, status: 'PENDING' }, transaction: t }))
        throw new AppError(409, 'HAS_PENDING', 'This driver has pending fuel funding requests. Approve or reject them first.');
    }
    const old = { isActive: d.isActive }; await d.update({ isActive }, { transaction: t });
    await audit.log(req, { action: isActive ? 'DRIVER_ACTIVATED' : 'DRIVER_DEACTIVATED', entityType: 'Driver', entityId: d.id, oldValues: old, newValues: { isActive }, reason }, t);
  });
  res.json(await show(req.params.id));
};

// Hard delete only for a driver with no vehicles and no fuel funding history; otherwise deactivate.
exports.remove = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const d = await find(req.params.id, t);
    if (await Vehicle.count({ where: { driverId: d.id }, transaction: t }) || await FuelFunding.count({ where: { driverId: d.id }, transaction: t }))
      throw new AppError(409, 'IN_USE', 'This driver is used by vehicles or fuel funding records. Deactivate the driver instead of deleting.');
    const old = audited(d); await d.destroy({ transaction: t });
    await audit.log(req, { action: 'DRIVER_DELETED', entityType: 'Driver', entityId: d.id, oldValues: old }, t);
  });
  res.json({ ok: true });
};
