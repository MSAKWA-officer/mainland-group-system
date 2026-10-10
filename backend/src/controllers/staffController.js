const { Op } = require('sequelize');
const { sequelize, Staff, User, Role, Salesperson } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('../services/audit');

const inc = [{ model: User, as: 'user', attributes: ['id', 'username', 'status'], include: [{ model: Role, as: 'role', attributes: ['id', 'code', 'name'] }] }];
const pub = (s) => { const o = s.toJSON(); o.hasAccount = !!o.userId; return o; };
const audited = (s) => ({ code: s.code, fullName: s.fullName, phone: s.phone, email: s.email, position: s.position, address: s.address, userId: s.userId, isActive: s.isActive });
const show = (id) => Staff.findByPk(id, { include: inc });
const find = async (id, t) => {
  const s = await Staff.findByPk(id, { transaction: t, ...(t && { lock: t.LOCK.UPDATE }) });
  if (!s) throw new AppError(404, 'NOT_FOUND', 'Staff member not found');
  return s;
};
// Phone and email must be unique among staff, so the same person is not registered twice.
const checkDup = async (b, selfId, t) => {
  const other = selfId ? { id: { [Op.ne]: selfId } } : {}; const details = [];
  if (b.phone && await Staff.findOne({ where: { phone: b.phone, ...other }, transaction: t })) details.push({ field: 'phone', message: 'Already registered' });
  if (b.email && await Staff.findOne({ where: { email: b.email, ...other }, transaction: t })) details.push({ field: 'email', message: 'Already registered' });
  if (details.length) throw new AppError(409, 'DUPLICATE', 'This person looks already registered', details);
};

exports.list = async (req, res) => {
  const { search, isActive, account, page, limit } = req.query; const where = {};
  if (isActive !== undefined) where.isActive = isActive;
  if (account === 'with') where.userId = { [Op.ne]: null };
  if (account === 'without') where.userId = null;
  if (search) where[Op.or] = ['fullName', 'code', 'phone', 'email', 'position'].map((f) => ({ [f]: { [Op.iLike]: like(search) } }));
  const { rows, count } = await Staff.findAndCountAll({ where, include: inc, order: [['fullName', 'ASC']], limit, offset: (page - 1) * limit, distinct: true });
  res.json({ data: rows.map(pub), total: count, page, limit });
};

exports.getOne = async (req, res) => {
  const s = await show(req.params.id); if (!s) throw new AppError(404, 'NOT_FOUND', 'Staff member not found');
  res.json(pub(s));
};

exports.create = async (req, res) => {
  const id = await sequelize.transaction(async (t) => {
    await checkDup(req.body, null, t);
    const [r] = await sequelize.query("SELECT nextval('staff_code_seq') AS n", { transaction: t });
    const s = await Staff.create({ ...req.body, code: `ST-${String(r[0].n).padStart(6, '0')}`, createdBy: req.user.id }, { transaction: t });
    await audit.log(req, { action: 'STAFF_CREATED', entityType: 'Staff', entityId: s.id, newValues: audited(s) }, t);
    return s.id;
  });
  res.status(201).json(pub(await show(id)));
};

exports.update = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const s = await find(req.params.id, t); const b = req.body;
    await checkDup({ phone: b.phone, email: b.email }, s.id, t);
    const old = audited(s); await s.update(b, { transaction: t });
    // Keep the login account and the salesperson profile (if any) in step with the staff record.
    if (s.userId) {
      const sync = {}; ['fullName', 'email', 'phone'].forEach((k) => { if (b[k] !== undefined) sync[k] = b[k]; });
      if (Object.keys(sync).length) {
        await User.update(sync, { where: { id: s.userId }, transaction: t });
        await Salesperson.update(sync, { where: { userId: s.userId }, transaction: t });
      }
    }
    await audit.log(req, { action: 'STAFF_UPDATED', entityType: 'Staff', entityId: s.id, oldValues: old, newValues: audited(s) }, t);
  });
  res.json(pub(await show(req.params.id)));
};

exports.setStatus = async (req, res) => {
  const { isActive, reason } = req.body;
  if (!isActive && !reason) throw new AppError(400, 'REASON_REQUIRED', 'Give a reason for deactivating this staff member');
  await sequelize.transaction(async (t) => {
    const s = await find(req.params.id, t);
    if (!isActive && s.userId) throw new AppError(409, 'HAS_ACCOUNT', 'This person has a login account. Deactivate the account in User management first.');
    const old = { isActive: s.isActive }; await s.update({ isActive }, { transaction: t });
    await audit.log(req, { action: isActive ? 'STAFF_ACTIVATED' : 'STAFF_DEACTIVATED', entityType: 'Staff', entityId: s.id, oldValues: old, newValues: { isActive }, reason }, t);
  });
  res.json(pub(await show(req.params.id)));
};

// Only a staff member who never got an account can be deleted; otherwise deactivate the account instead.
exports.remove = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const s = await find(req.params.id, t);
    if (s.userId) throw new AppError(409, 'HAS_ACCOUNT', 'This person has a login account and cannot be deleted. Deactivate the account instead.');
    const old = audited(s); await s.destroy({ transaction: t });
    await audit.log(req, { action: 'STAFF_DELETED', entityType: 'Staff', entityId: s.id, oldValues: old }, t);
  });
  res.json({ ok: true });
};
