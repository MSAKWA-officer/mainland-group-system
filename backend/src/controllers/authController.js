const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const env = require('../config/env');
const { User, Role, Session } = require('../models');
const { AppError } = require('../utils/errors');
const { sha256 } = require('../utils/crypto');
const pw = require('../utils/password');
const audit = require('../services/audit');

const sign = (uid, sid) => jwt.sign({ sub: uid, sid }, env.JWT_SECRET, { expiresIn: env.ACCESS_TTL, algorithm: 'HS256', issuer: 'mainland' });
const cookie = (res, sid, secret) => res.cookie('rt', `${sid}.${secret}`, {
  httpOnly: true, secure: env.isProd, sameSite: 'strict', path: '/api/auth', maxAge: env.REFRESH_TTL_MS });
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const parseCookie = (req) => { const [sid, secret] = (req.cookies?.rt || '').split('.'); return /^[0-9a-f-]{36}$/.test(sid || '') && secret ? { sid, secret } : {}; };

exports.login = async (req, res) => {
  const username = req.body.username.toLowerCase();
  const user = await User.findOne({ where: { username }, include: [{ model: Role, as: 'role' }] });
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    await audit.log(req, { action: 'LOGIN_BLOCKED', entityType: 'User', entityId: user.id, user, outcome: 'DENIED', newValues: { reason: 'locked' } });
    throw new AppError(423, 'ACCOUNT_LOCKED', 'This account is temporarily locked. Try again in a few minutes.');
  }
  const ok = await pw.compare(req.body.password, user ? user.passwordHash : pw.DUMMY); // constant-ish time for unknown users
  if (!user || !ok || user.status !== 'ACTIVE') {
    if (user && !ok) {
      const n = user.failedAttempts + 1, lock = n >= env.MAX_FAILED_LOGINS;
      await user.update({ failedAttempts: lock ? 0 : n, lockedUntil: lock ? new Date(Date.now() + env.LOCK_MINUTES * 60000) : null });
    }
    await audit.log(req, { action: 'LOGIN_FAILED', entityType: 'User', entityId: user?.id, user: user || { username }, outcome: 'FAILED',
      newValues: { reason: !user ? 'unknown_user' : !ok ? 'bad_password' : 'inactive' } });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect username or password');
  }
  const secret = crypto.randomBytes(32).toString('hex');
  const s = await Session.create({ userId: user.id, refreshHash: sha256(secret), ip: req.ip,
    userAgent: (req.headers['user-agent'] || '').slice(0, 255), expiresAt: new Date(Date.now() + env.REFRESH_TTL_MS) });
  await user.update({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() });
  await audit.log(req, { action: 'LOGIN_SUCCESS', entityType: 'User', entityId: user.id, user });
  cookie(res, s.id, secret);
  res.json({ accessToken: sign(user.id, s.id) });
};

exports.refresh = async (req, res) => {
  const { sid, secret } = parseCookie(req);
  const s = sid && await Session.findByPk(sid);
  const live = s && !s.revokedAt && s.expiresAt > new Date();
  if (live && !safeEq(s.refreshHash, sha256(secret))) { // old token replayed => assume theft, kill the session
    await s.update({ revokedAt: new Date() });
    await audit.log(req, { action: 'REFRESH_TOKEN_REUSE', entityType: 'Session', entityId: s.id, user: { id: s.userId }, outcome: 'DENIED' });
  }
  const user = live && await User.findByPk(s.userId);
  if (!live || !user || user.status !== 'ACTIVE' || s.revokedAt) throw new AppError(401, 'NO_SESSION', 'Sign in to continue');
  const next = crypto.randomBytes(32).toString('hex');                     // rotate on every refresh
  await s.update({ refreshHash: sha256(next), expiresAt: new Date(Date.now() + env.REFRESH_TTL_MS) });
  cookie(res, s.id, next);
  res.json({ accessToken: sign(user.id, s.id) });
};

exports.logout = async (req, res) => {
  const { sid } = parseCookie(req);
  const s = sid && await Session.findByPk(sid);
  if (s && !s.revokedAt) { await s.update({ revokedAt: new Date() }); await audit.log(req, { action: 'LOGOUT', entityType: 'Session', entityId: s.id, user: { id: s.userId } }); }
  res.clearCookie('rt', { path: '/api/auth' });
  res.json({ ok: true });
};

exports.me = (req, res) => {
  const u = req.user;
  res.json({ id: u.id, username: u.username, fullName: u.fullName, role: u.role, roleName: u.roleName, level: u.level,
    permissions: [...u.permissions], mustChangePassword: u.mustChangePassword });
};

exports.changePassword = async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!(await pw.compare(req.body.currentPassword, user.passwordHash))) throw new AppError(400, 'WRONG_PASSWORD', 'Current password is incorrect');
  if (req.body.currentPassword === req.body.newPassword) throw new AppError(400, 'SAME_PASSWORD', 'Choose a password you have not used just now');
  await user.update({ passwordHash: await pw.hash(req.body.newPassword), mustChangePassword: false, passwordChangedAt: new Date() });
  await Session.update({ revokedAt: new Date() }, { where: { userId: user.id, id: { [Op.ne]: req.user.sessionId }, revokedAt: null } });
  await audit.log(req, { action: 'PASSWORD_CHANGED', entityType: 'User', entityId: user.id });
  res.json({ ok: true });
};
