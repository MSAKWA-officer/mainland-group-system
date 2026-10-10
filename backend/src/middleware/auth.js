const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { User, Role, Permission, Session } = require('../models');
const { AppError } = require('../utils/errors');
const audit = require('../services/audit');
const { ALL } = require('../config/rbac');

// Verifies the JWT, then re-checks session + user + permissions in the DB on EVERY request,
// so deactivating a user or changing a role takes effect immediately.
const authenticate = async (req, res, next) => {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue');
    let p;
    try { p = jwt.verify(h.slice(7), env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'mainland' }); }
    catch { throw new AppError(401, 'TOKEN_INVALID', 'Your session has expired'); }
    const [session, user] = await Promise.all([
      Session.findByPk(p.sid),
      User.findByPk(p.sub, { include: [{ model: Role, as: 'role', include: [{ model: Permission, as: 'permissions', through: { attributes: [] } }] }] }),
    ]);
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== p.sub || !user || user.status !== 'ACTIVE')
      throw new AppError(401, 'SESSION_INVALID', 'Your session is no longer valid');
    req.user = {
      id: user.id, username: user.username, fullName: user.fullName, role: user.role.code, roleName: user.role.name,
      level: user.role.level, // The Owner always holds every permission (their role cannot be edited), so new modules work without re-seeding.
      permissions: new Set([...user.role.permissions.map((x) => x.code), ...(user.role.code === 'OWNER' ? ALL : [])]),
      mustChangePassword: user.mustChangePassword, sessionId: session.id,
    };
    if (user.mustChangePassword && !req.originalUrl.startsWith('/api/auth/'))
      throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change your password to continue');
    next();
  } catch (e) { next(e); }
};

// Backend permission gate. Denied attempts are written to the audit log.
const authorize = (...perms) => async (req, res, next) => {
  const missing = perms.filter((x) => !req.user.permissions.has(x));
  if (!missing.length) return next();
  await audit.log(req, { action: 'ACCESS_DENIED', entityType: 'Route', entityId: `${req.method} ${req.baseUrl}${req.path}`,
    newValues: { missing }, outcome: 'DENIED' }).catch(() => {});
  next(new AppError(403, 'FORBIDDEN', 'You do not have permission to do this'));
};
module.exports = { authenticate, authorize };
