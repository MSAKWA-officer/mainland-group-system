const crypto = require('crypto');
const env = require('../config/env');
const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');

// AES-256-GCM for secrets at rest (e.g. bank account numbers in later phases)
const encrypt = (text) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
};
const decrypt = (b64) => {
  const b = Buffer.from(b64, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
};
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
// Deterministic JSON (sorted keys) so hashes survive jsonb key reordering
const canon = (v) => v === null || v === undefined ? 'null'
  : Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
  : JSON.stringify(v);
module.exports = { encrypt, decrypt, sha256, canon, key };
