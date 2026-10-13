const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const env = require('../config/env');
const { User, Role, Session } = require('../models');
const { AppError } = require('../utils/errors');
const { sha256 } = require('../utils/crypto');
const pw = require('../utils/password');
const audit = require('../services/audit');

const sign = (uid, sid) =>
  jwt.sign({ sub: uid, sid }, env.JWT_SECRET, {
    expiresIn: env.ACCESS_TTL,
    algorithm: 'HS256',
    issuer: 'mainland',
  });

// ---------------------------------------------------------------
// Refresh-token cookie helpers
// Frontend (Vercel) and backend (Render) are on different sites, so in
// production the cookie MUST be SameSite=None + Secure.
// ---------------------------------------------------------------
const baseCookieOptions = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? 'none' : 'lax',
  path: '/api/auth',
});

const setRefreshCookie = (res, sid, secret) => {
  res.cookie('rt', `${sid}.${secret}`, {
    ...baseCookieOptions(),
    maxAge: env.REFRESH_TTL_MS,
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie('rt', baseCookieOptions());
};

// Never cache token responses
const noStore = (res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
};

const safeEq = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

const parseCookie = (req) => {
  const value = req.cookies?.rt || '';
  const separator = value.indexOf('.');

  if (separator === -1) return {};

  const sid = value.slice(0, separator);
  const secret = value.slice(separator + 1);

  if (!/^[0-9a-f-]{36}$/i.test(sid) || !secret) return {};

  return { sid, secret };
};

// ---------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------
exports.login = async (req, res) => {
  const username = String(req.body.username || '')
    .trim()
    .toLowerCase();
  const password = String(req.body.password || '');

  const user = await User.findOne({
    where: { username },
    include: [{ model: Role, as: 'role' }],
  });

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    await audit.log(req, {
      action: 'LOGIN_BLOCKED',
      entityType: 'User',
      entityId: user.id,
      user,
      outcome: 'DENIED',
      newValues: { reason: 'locked' },
    });

    throw new AppError(
      423,
      'ACCOUNT_LOCKED',
      'This account is temporarily locked. Try again in a few minutes.'
    );
  }

  // Always run a hash compare (even for unknown users) to avoid timing leaks
  const ok = await pw.compare(password, user ? user.passwordHash : pw.DUMMY);

  if (!user || !ok || user.status !== 'ACTIVE') {
    if (user && !ok) {
      const attempts = user.failedAttempts + 1;
      const shouldLock = attempts >= env.MAX_FAILED_LOGINS;

      await user.update({
        failedAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + env.LOCK_MINUTES * 60000)
          : null,
      });
    }

    await audit.log(req, {
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user?.id,
      user: user || { username },
      outcome: 'FAILED',
      newValues: {
        reason: !user ? 'unknown_user' : !ok ? 'bad_password' : 'inactive',
      },
    });

    throw new AppError(
      401,
      'INVALID_CREDENTIALS',
      'Incorrect username or password'
    );
  }

  const secret = crypto.randomBytes(32).toString('hex');

  const session = await Session.create({
    userId: user.id,
    refreshHash: sha256(secret),
    ip: req.ip,
    userAgent: (req.headers['user-agent'] || '').slice(0, 255),
    expiresAt: new Date(Date.now() + env.REFRESH_TTL_MS),
  });

  await user.update({
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: new Date(),
  });

  await audit.log(req, {
    action: 'LOGIN_SUCCESS',
    entityType: 'User',
    entityId: user.id,
    user,
  });

  setRefreshCookie(res, session.id, secret);
  noStore(res);

  res.json({ accessToken: sign(user.id, session.id) });
};

// ---------------------------------------------------------------
// REFRESH ACCESS TOKEN
// ---------------------------------------------------------------
exports.refresh = async (req, res) => {
  noStore(res);

  const { sid, secret } = parseCookie(req);

  if (!sid || !secret) {
    throw new AppError(
      401,
      'NO_SESSION',
      'Refresh cookie is missing. Please sign in again.'
    );
  }

  const session = await Session.findByPk(sid);

  if (
    !session ||
    session.revokedAt ||
    !session.expiresAt ||
    session.expiresAt <= new Date()
  ) {
    clearRefreshCookie(res);

    throw new AppError(
      401,
      'NO_SESSION',
      'Your session has expired. Please sign in again.'
    );
  }

  if (!safeEq(session.refreshHash, sha256(secret))) {
    await session.update({ revokedAt: new Date() });

    await audit.log(req, {
      action: 'REFRESH_TOKEN_REUSE',
      entityType: 'Session',
      entityId: session.id,
      user: { id: session.userId },
      outcome: 'DENIED',
    });

    clearRefreshCookie(res);

    throw new AppError(
      401,
      'NO_SESSION',
      'Refresh token is invalid. Please sign in again.'
    );
  }

  const user = await User.findByPk(session.userId);

  if (!user || user.status !== 'ACTIVE') {
    await session.update({ revokedAt: new Date() });
    clearRefreshCookie(res);

    throw new AppError(
      401,
      'NO_SESSION',
      'User session is no longer valid.'
    );
  }

  // Rotate refresh token
  const nextSecret = crypto.randomBytes(32).toString('hex');

  await session.update({
    refreshHash: sha256(nextSecret),
    expiresAt: new Date(Date.now() + env.REFRESH_TTL_MS),
  });

  setRefreshCookie(res, session.id, nextSecret);

  res.json({ accessToken: sign(user.id, session.id) });
};

// ---------------------------------------------------------------
// LOGOUT
// ---------------------------------------------------------------
exports.logout = async (req, res) => {
  const { sid } = parseCookie(req);

  const session = sid ? await Session.findByPk(sid) : null;

  if (session && !session.revokedAt) {
    await session.update({ revokedAt: new Date() });

    await audit.log(req, {
      action: 'LOGOUT',
      entityType: 'Session',
      entityId: session.id,
      user: { id: session.userId },
    });
  }

  clearRefreshCookie(res);

  res.json({ ok: true });
};

// ---------------------------------------------------------------
// CURRENT USER
// ---------------------------------------------------------------
exports.me = (req, res) => {
  const user = req.user;

  res.json({
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    roleName: user.roleName,
    level: user.level,
    permissions: [...user.permissions],
    mustChangePassword: user.mustChangePassword,
  });
};

// ---------------------------------------------------------------
// CHANGE PASSWORD
// ---------------------------------------------------------------
exports.changePassword = async (req, res) => {
  const user = await User.findByPk(req.user.id);

  if (!(await pw.compare(req.body.currentPassword, user.passwordHash))) {
    throw new AppError(
      400,
      'WRONG_PASSWORD',
      'Current password is incorrect'
    );
  }

  if (req.body.currentPassword === req.body.newPassword) {
    throw new AppError(
      400,
      'SAME_PASSWORD',
      'New password must be different from the current password'
    );
  }

  await user.update({
    passwordHash: await pw.hash(req.body.newPassword),
    mustChangePassword: false,
    passwordChangedAt: new Date(),
  });

  // Sign out all other sessions
  await Session.update(
    { revokedAt: new Date() },
    {
      where: {
        userId: user.id,
        id: { [Op.ne]: req.user.sessionId },
        revokedAt: null,
      },
    }
  );

  await audit.log(req, {
    action: 'PASSWORD_CHANGED',
    entityType: 'User',
    entityId: user.id,
  });

  res.json({ ok: true });
};