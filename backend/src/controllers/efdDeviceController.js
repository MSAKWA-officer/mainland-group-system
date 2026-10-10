const { Op, literal } = require('sequelize');
const { sequelize, EfdDevice, EfdReceipt } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('../services/audit');

const receiptCount = [literal('(SELECT CAST(COUNT(*) AS int) FROM efd_receipts r WHERE r.device_id = "EfdDevice"."id")'), 'receiptCount'];
const audited = (d) => ({ serialNo: d.serialNo, name: d.name, tin: d.tin, vrn: d.vrn, location: d.location, notes: d.notes, isActive: d.isActive });
const show = (id) => EfdDevice.findByPk(id, { attributes: { include: [receiptCount] } });
const find = async (id, t) => {
  const d = await EfdDevice.findByPk(id, { transaction: t, ...(t && { lock: t.LOCK.UPDATE }) });
  if (!d) throw new AppError(404, 'NOT_FOUND', 'EFD device not found');
  return d;
};
const dupSerial = async (serialNo, selfId, t) => {
  if (await EfdDevice.findOne({ where: { serialNo, ...(selfId && { id: { [Op.ne]: selfId } }) }, transaction: t }))
    throw new AppError(409, 'DUPLICATE', 'A device with this serial number is already registered', [{ field: 'serialNo', message: 'Already registered' }]);
};

exports.list = async (req, res) => {
  const { search, isActive, page, limit } = req.query; const where = {};
  if (isActive !== undefined) where.isActive = isActive;
  if (search) where[Op.or] = ['serialNo', 'name', 'tin', 'location'].map((f) => ({ [f]: { [Op.iLike]: like(search) } }));
  const { rows, count } = await EfdDevice.findAndCountAll({ where, attributes: { include: [receiptCount] }, order: [['name', 'ASC']], limit, offset: (page - 1) * limit });
  res.json({ data: rows, total: count, page, limit });
};

exports.getOne = async (req, res) => {
  const d = await show(req.params.id); if (!d) throw new AppError(404, 'NOT_FOUND', 'EFD device not found');
  res.json(d);
};

exports.create = async (req, res) => {
  const id = await sequelize.transaction(async (t) => {
    await dupSerial(req.body.serialNo, null, t);
    const d = await EfdDevice.create({ ...req.body, createdBy: req.user.id }, { transaction: t });
    await audit.log(req, { action: 'EFD_DEVICE_CREATED', entityType: 'EfdDevice', entityId: d.id, newValues: audited(d) }, t);
    return d.id;
  });
  res.status(201).json(await show(id));
};

exports.update = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const d = await find(req.params.id, t);
    if (req.body.serialNo && req.body.serialNo !== d.serialNo) {
      if (await EfdReceipt.count({ where: { deviceId: d.id }, transaction: t })) throw new AppError(409, 'LOCKED_FIELD', 'The serial number cannot be changed once receipts were recorded on this device');
      await dupSerial(req.body.serialNo, d.id, t);
    }
    const old = audited(d); await d.update(req.body, { transaction: t });
    await audit.log(req, { action: 'EFD_DEVICE_UPDATED', entityType: 'EfdDevice', entityId: d.id, oldValues: old, newValues: audited(d) }, t);
  });
  res.json(await show(req.params.id));
};

exports.setStatus = async (req, res) => {
  const { isActive, reason } = req.body;
  if (!isActive && !reason) throw new AppError(400, 'REASON_REQUIRED', 'Give a reason for deactivating this device');
  await sequelize.transaction(async (t) => {
    const d = await find(req.params.id, t);
    const old = { isActive: d.isActive }; await d.update({ isActive }, { transaction: t });
    await audit.log(req, { action: isActive ? 'EFD_DEVICE_ACTIVATED' : 'EFD_DEVICE_DEACTIVATED', entityType: 'EfdDevice', entityId: d.id, oldValues: old, newValues: { isActive }, reason }, t);
  });
  res.json(await show(req.params.id));
};

// Hard delete only for a device that never issued a receipt; otherwise deactivate.
exports.remove = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const d = await find(req.params.id, t);
    if (await EfdReceipt.count({ where: { deviceId: d.id }, transaction: t })) throw new AppError(409, 'IN_USE', 'Receipts were recorded on this device. Deactivate it instead of deleting it.');
    const old = audited(d); await d.destroy({ transaction: t });
    await audit.log(req, { action: 'EFD_DEVICE_DELETED', entityType: 'EfdDevice', entityId: d.id, oldValues: old }, t);
  });
  res.json({ ok: true });
};
