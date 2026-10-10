const { sequelize, Role, Permission } = require('../models');
const { AppError } = require('../utils/errors');
const audit = require('../services/audit');

exports.listRoles = async (req, res) => {
  const roles = await Role.findAll({ order: [['level', 'DESC']], include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }] });
  res.json(roles.map((r) => ({ id: r.id, code: r.code, name: r.name, level: r.level, description: r.description, permissionIds: r.permissions.map((p) => p.id) })));
};

exports.listPermissions = async (req, res) =>
  res.json(await Permission.findAll({ order: [['module', 'ASC'], ['code', 'ASC']], attributes: ['id', 'code', 'module'] }));

exports.setRolePermissions = async (req, res) => {
  const ids = [...new Set(req.body.permissionIds)];
  await sequelize.transaction(async (t) => {
    const role = await Role.findByPk(req.params.id, { transaction: t, include: [{ model: Permission, as: 'permissions' }] });
    if (!role) throw new AppError(404, 'NOT_FOUND', 'Role not found');
    if (role.code === 'OWNER') throw new AppError(403, 'OWNER_FIXED', 'Owner permissions cannot be changed');
    if (req.user.role !== 'OWNER' && req.user.level <= role.level) throw new AppError(403, 'HIERARCHY', 'You cannot edit this role');
    const perms = await Permission.findAll({ where: { id: ids }, transaction: t });
    if (perms.length !== ids.length) throw new AppError(400, 'BAD_PERMISSION', 'Unknown permission in list');
    const escalation = perms.filter((p) => !req.user.permissions.has(p.code));   // cannot grant what you do not hold
    if (req.user.role !== 'OWNER' && escalation.length) throw new AppError(403, 'ESCALATION', 'You cannot grant permissions you do not have');
    const before = role.permissions.map((p) => p.code).sort();
    await role.setPermissions(perms, { transaction: t });
    await audit.log(req, { action: 'ROLE_PERMISSIONS_CHANGED', entityType: 'Role', entityId: role.id,
      oldValues: { permissions: before }, newValues: { permissions: perms.map((p) => p.code).sort() } }, t);
  });
  res.json({ ok: true });
};
