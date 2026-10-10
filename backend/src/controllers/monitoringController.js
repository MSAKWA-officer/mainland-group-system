const { Op } = require('sequelize');
const { Session, AuditLog, User } = require('../models');

exports.summary = async (req, res) => {
  const since = new Date(Date.now() - 24 * 3600e3), now = new Date();
  const [activeSessions, failedLogins24h, denied24h, activeUsers, lockedUsers, recent] = await Promise.all([
    Session.count({ where: { revokedAt: null, expiresAt: { [Op.gt]: now } } }),
    AuditLog.count({ where: { action: 'LOGIN_FAILED', occurredAt: { [Op.gt]: since } } }),
    AuditLog.count({ where: { outcome: 'DENIED', occurredAt: { [Op.gt]: since } } }),
    User.count({ where: { status: 'ACTIVE' } }), User.count({ where: { lockedUntil: { [Op.gt]: now } } }),
    AuditLog.findAll({ where: { action: { [Op.in]: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'ACCESS_DENIED'] } }, order: [['id', 'DESC']], limit: 8,
      attributes: ['id', 'occurredAt', 'username', 'action', 'ip', 'outcome'] }),
  ]);
  res.json({ activeSessions, failedLogins24h, denied24h, activeUsers, lockedUsers, recent });
};
