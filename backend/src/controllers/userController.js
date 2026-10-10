const { Op } = require('sequelize');
const { sequelize, User, Role, Session, Staff, Salesperson } = require('../models');
const { AppError } = require('../utils/errors');
const pw = require('../utils/password');
const audit = require('../services/audit');

const pub = (u) => ({ id: u.id, username: u.username, fullName: u.fullName, email: u.email, phone: u.phone, status: u.status,
  lastLoginAt: u.lastLoginAt, mustChangePassword: u.mustChangePassword, createdAt: u.createdAt,
  role: u.role && { id: u.role.id, code: u.role.code, name: u.role.name, level: u.role.level } });
// Hierarchy rule: only the Owner may manage peers/higher roles; everyone else only strictly lower levels.
const manageable = (actor, role) => actor.role === 'OWNER' || actor.level > role.level;
const mustManage = (actor, role) => { if (!manageable(actor, role)) throw new AppError(403, 'HIERARCHY', 'You cannot manage users with this role'); };
const findUser = async (id, t) => { const u = await User.findByPk(id, { include: [{ model: Role, as: 'role' }], transaction: t }); if (!u) throw new AppError(404, 'NOT_FOUND', 'User not found'); return u; };
const revokeSessions = (userId, t) => Session.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null }, transaction: t });
const audited = (u) => ({ username: u.username, fullName: u.fullName, email: u.email, phone: u.phone, roleId: u.roleId, status: u.status });

exports.list = async (req, res) => {
  const { search, role, status, page, limit } = req.query; const where = {};
  if (status) where.status = status;
  if (search) where[Op.or] = ['username', 'fullName', 'email'].map((f) => ({ [f]: { [Op.iLike]: `%${search.replace(/[%_]/g, '')}%` } }));
  const { rows, count } = await User.findAndCountAll({ where, attributes: { exclude: ['passwordHash'] }, distinct: true,
    include: [{ model: Role, as: 'role', where: role ? { code: role } : undefined }], order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit });
  res.json({ data: rows.map(pub), total: count, page, limit });
};

// An account is always created for a person already registered on the Staff page.
// The name, phone and email come from that staff record; the Owner only chooses the username, role and temporary password.
// For the Sales Person role a salesperson profile is created too (that is what links the login to its own customers and orders).
exports.create = async (req, res) => {
  const b = req.body;
  const role = await Role.findByPk(b.roleId); if (!role) throw new AppError(400, 'BAD_ROLE', 'Choose a valid role');
  mustManage(req.user, role);
  const isSales = role.code === 'SALESPERSON';
  if (isSales && !req.user.permissions.has('salespersons.create')) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to register salespersons');
  if (isSales && (b.commissionRate !== undefined || b.monthlyTarget !== undefined) && !req.user.permissions.has('salespersons.view_commission'))
    throw new AppError(403, 'FORBIDDEN', 'You are not allowed to set commission or targets');
  const u = await sequelize.transaction(async (t) => {
    const s = await Staff.findByPk(b.staffId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!s) throw new AppError(404, 'NOT_FOUND', 'Staff member not found. Register them on the Staff page first.');
    if (!s.isActive) throw new AppError(409, 'STAFF_INACTIVE', 'This staff member is inactive');
    if (s.userId) throw new AppError(409, 'HAS_ACCOUNT', 'This staff member already has an account');
    if (await User.findOne({ where: { username: b.username }, transaction: t }))
      throw new AppError(409, 'DUPLICATE', 'That username is already taken', [{ field: 'username', message: 'Already in use' }]);
    const u = await User.create({ username: b.username, fullName: s.fullName, email: s.email, phone: s.phone, roleId: role.id,
      passwordHash: await pw.hash(b.password), mustChangePassword: true, createdBy: req.user.id }, { transaction: t });
    await s.update({ userId: u.id }, { transaction: t });
    await audit.log(req, { action: 'USER_CREATED', entityType: 'User', entityId: u.id, newValues: { ...audited(u), staffId: s.id, staffCode: s.code } }, t);
    if (isSales) {
      const [r] = await sequelize.query("SELECT nextval('salesperson_code_seq') AS n", { transaction: t });
      const sp = await Salesperson.create({ code: `SP-${String(r[0].n).padStart(6, '0')}`, userId: u.id, fullName: s.fullName, phone: s.phone, email: s.email,
        region: b.region || null, commissionRate: b.commissionRate ?? 0, monthlyTarget: b.monthlyTarget ?? 0, createdBy: req.user.id }, { transaction: t });
      await audit.log(req, { action: 'SALESPERSON_CREATED', entityType: 'Salesperson', entityId: sp.id, newValues: { code: sp.code, userId: u.id, fullName: sp.fullName, region: sp.region } }, t);
    }
    return u;
  });
  res.status(201).json(pub(await findUser(u.id)));
};

exports.getOne = async (req, res) => res.json(pub(await findUser(req.params.id)));

exports.update = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const u = await findUser(req.params.id, t); mustManage(req.user, u.role);
    if (req.body.roleId && req.body.roleId !== u.roleId) {
      const nr = await Role.findByPk(req.body.roleId, { transaction: t }); if (!nr) throw new AppError(400, 'BAD_ROLE', 'Choose a valid role');
      mustManage(req.user, nr);
      if (u.id === req.user.id) throw new AppError(403, 'SELF_ROLE', 'You cannot change your own role');
    }
    const old = audited(u); await u.update(req.body, { transaction: t });
    await audit.log(req, { action: 'USER_UPDATED', entityType: 'User', entityId: u.id, oldValues: old, newValues: audited(u) }, t);
  });
  res.json(pub(await findUser(req.params.id)));
};

exports.setStatus = async (req, res) => {
  const { status, reason } = req.body;
  if (status === 'INACTIVE' && !reason) throw new AppError(400, 'REASON_REQUIRED', 'Give a reason for deactivating this user');
  await sequelize.transaction(async (t) => {
    const u = await findUser(req.params.id, t); mustManage(req.user, u.role);
    if (u.id === req.user.id) throw new AppError(403, 'SELF', 'You cannot change your own status');
    if (status === 'INACTIVE' && u.role.code === 'OWNER' && await User.count({ where: { status: 'ACTIVE', roleId: u.roleId }, transaction: t }) <= 1)
      throw new AppError(409, 'LAST_OWNER', 'The last active Owner cannot be deactivated');
    const old = { status: u.status }; await u.update({ status, failedAttempts: 0, lockedUntil: null }, { transaction: t });
    if (status === 'INACTIVE') await revokeSessions(u.id, t);
    await audit.log(req, { action: status === 'INACTIVE' ? 'USER_DEACTIVATED' : 'USER_ACTIVATED', entityType: 'User', entityId: u.id, oldValues: old, newValues: { status }, reason }, t);
  });
  res.json(pub(await findUser(req.params.id)));
};

exports.resetPassword = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const u = await findUser(req.params.id, t); mustManage(req.user, u.role);
    await u.update({ passwordHash: await pw.hash(req.body.newPassword), mustChangePassword: true, passwordChangedAt: new Date(), failedAttempts: 0, lockedUntil: null }, { transaction: t });
    await revokeSessions(u.id, t);
    await audit.log(req, { action: 'PASSWORD_RESET', entityType: 'User', entityId: u.id }, t);
  });
  res.json({ ok: true });
};
