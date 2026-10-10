const { Op } = require('sequelize');
const { sequelize, AuditLog } = require('../models');
const { sha256, canon } = require('../utils/crypto');

// Tamper-evident chain: each row's hash covers the previous row's hash.
const fields = (r) => [r.occurredAt.toISOString(), r.userId, r.username, r.action, r.entityType, r.entityId,
  r.oldValues, r.newValues, r.reason, r.outcome, r.ip, r.userAgent];
const hashOf = (prev, r) => sha256(prev + canon(fields(r)));

// Pass `t` to write the audit row inside the business transaction (both commit or both roll back).
async function log(req, d, t) {
  const u = d.user || req?.user;
  const run = async (tx) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(727001)', { transaction: tx }); // serialise the chain
    const last = await AuditLog.findOne({ attributes: ['hash'], order: [['id', 'DESC']], transaction: tx });
    const prevHash = last ? last.hash : 'GENESIS';
    const rec = {
      occurredAt: new Date(), userId: u?.id ?? null, username: u?.username ?? null, action: d.action,
      entityType: d.entityType ?? null, entityId: d.entityId == null ? null : String(d.entityId),
      oldValues: d.oldValues ?? null, newValues: d.newValues ?? null, reason: d.reason ?? null,
      outcome: d.outcome || 'SUCCESS', ip: req?.ip ?? null, userAgent: (req?.headers?.['user-agent'] || '').slice(0, 255) || null,
    };
    return AuditLog.create({ ...rec, prevHash, hash: hashOf(prevHash, rec) }, { transaction: tx });
  };
  return t ? run(t) : sequelize.transaction(run);
}

async function verify() {
  let prev = 'GENESIS', checked = 0, lastId = 0;
  for (;;) {
    const rows = await AuditLog.findAll({ where: { id: { [Op.gt]: lastId } }, order: [['id', 'ASC']], limit: 1000, raw: true });
    if (!rows.length) return { ok: true, checked };
    for (const r of rows) {
      if (r.prevHash !== prev || hashOf(prev, r) !== r.hash) return { ok: false, checked, brokenAtId: r.id };
      prev = r.hash; checked++; lastId = r.id;
    }
  }
}
module.exports = { log, verify };
