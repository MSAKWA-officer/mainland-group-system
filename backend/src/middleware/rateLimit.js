const rateLimit = require('express-rate-limit');
const handler = (req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Wait a few minutes and try again.' } });
module.exports = {
  apiLimiter: rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false, handler }),
  loginLimiter: rateLimit({ windowMs: 15 * 60 * 1000, max: 10, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false, handler }),
};
