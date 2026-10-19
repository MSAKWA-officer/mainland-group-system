const { sequelize, ApprovalRequest, User, Role, Permission } = require('../models');
const audit = require('./audit');
const notify = require('./notify');
const { AppError } = require('../utils/errors');

/* Generic workflow: Create -> Submit -> Approval -> Approve/Reject -> Execute -> (stock + transaction) -> Notify -> Audit.
   Business modules (stock orders, expenses, ...) register a type with an `execute` handler in later phases.
   `execute` is ONLY ever called from approve(), inside the same DB transaction, so stock/money can never
   change before approval, and any failure rolls back everything (including the approval itself). */
const registry = new Map();
const register = (type, def) => registry.set(type, def);
register('TEST_NOOP', { label: 'Test approval (no business effect)', approvePermission: 'approvals.approve', execute: async () => ({ ok: true }) });

const typeDef = (type) => {
  const d = registry.get(type);
  if (!d) throw new AppError(400, 'UNKNOWN_TYPE', `Unknown approval type: ${type}`);
  return d;
};
const approversOf = async (perm, exceptId, t) => (await User.findAll({
  attributes: ['id'], where: { status: 'ACTIVE' }, transaction: t,
  include: [{ model: Role, as: 'role', required: true, attributes: [], include: [{ model: Permission, as: 'permissions', required: true, attributes: [], where: { code: perm }, through: { attributes: [] } }] }],
})).map((u) => u.id).filter((i) => i !== exceptId);

const load = async (id, t) => {
  const r = await ApprovalRequest.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Approval request not found');
  return r;
};
const snap = (r) => ({ status: r.status, type: r.type, payload: r.payload });
const link = '/approvals';
// Run inside the caller's transaction when one is passed (Phase 2 documents), otherwise open our own.
const within = (ext, fn) => (ext ? fn(ext) : sequelize.transaction(fn));

const create = (req, { type, entityType, entityId, payload }, ext) => { typeDef(type); return within(ext, async (t) => {
  const r = await ApprovalRequest.create({ type, entityType, entityId, payload, requestedBy: req.user.id }, { transaction: t });
  await audit.log(req, { action: 'APPROVAL_CREATED', entityType: 'ApprovalRequest', entityId: r.id, newValues: snap(r) }, t);
  return r;
}); };

const submit = (req, id, ext) => within(ext, async (t) => {
  const r = await load(id, t);
  if (r.requestedBy !== req.user.id) throw new AppError(403, 'FORBIDDEN', 'Only the requester can submit this');
  if (r.status !== 'DRAFT') throw new AppError(409, 'BAD_STATE', `Cannot submit a request that is ${r.status}`);
  const old = snap(r);
  await r.update({ status: 'SUBMITTED', submittedAt: new Date() }, { transaction: t });
  const d = typeDef(r.type);                                                 // a module that notifies its own people (Phase 4 workflow) sets notifyOnSubmit: false
  if (d.notifyOnSubmit !== false) await notify(await approversOf(d.approvePermission, req.user.id, t), { title: 'Approval needed', body: `${req.user.fullName} submitted a ${r.type} request`, link }, t);
  await audit.log(req, { action: 'APPROVAL_SUBMITTED', entityType: 'ApprovalRequest', entityId: r.id, oldValues: old, newValues: snap(r) }, t);
  return r;
});

const decide = (kind) => async (req, id, note) => {
  try {
    return await sequelize.transaction(async (t) => {
      const r = await load(id, t); const d = typeDef(r.type);
      if (r.status !== 'SUBMITTED') throw new AppError(409, 'BAD_STATE', `Cannot ${kind} a request that is ${r.status}`);
      if (!req.user.permissions.has(d.approvePermission)) throw new AppError(403, 'FORBIDDEN', 'You cannot decide this type of request');
      if (r.requestedBy === req.user.id) throw new AppError(403, 'SELF_APPROVAL', 'You cannot approve or reject your own request');
      if (kind === 'reject' && !note) throw new AppError(400, 'NOTE_REQUIRED', 'Give a reason for rejecting');
      const old = snap(r); const base = { decidedBy: req.user.id, decidedAt: new Date(), decisionNote: note || null };
      if (kind === 'reject') {
        await r.update({ ...base, status: 'REJECTED' }, { transaction: t });
        await audit.log(req, { action: 'APPROVAL_REJECTED', entityType: 'ApprovalRequest', entityId: r.id, oldValues: old, newValues: snap(r), reason: note }, t);
        if (d.onReject) await d.onReject(r, { transaction: t, user: req.user, req }); // module hook (Phase 2)
      } else {
        await r.update({ ...base, status: 'APPROVED' }, { transaction: t });
        await audit.log(req, { action: 'APPROVAL_APPROVED', entityType: 'ApprovalRequest', entityId: r.id, oldValues: old, newValues: snap(r), reason: note }, t);
        await d.execute(r, { transaction: t, user: req.user, req });          // Execute: stock + transaction records
        await r.update({ status: 'EXECUTED', executedAt: new Date() }, { transaction: t });
        await audit.log(req, { action: 'APPROVAL_EXECUTED', entityType: 'ApprovalRequest', entityId: r.id, newValues: snap(r) }, t);
      }
      await notify([r.requestedBy], { title: `Request ${kind === 'reject' ? 'rejected' : 'approved'}`, body: note || r.type, link }, t);
      return r;
    });
  } catch (e) {
    if (!(e instanceof AppError)) // unexpected execution failure: log outside the rolled-back tx
      await audit.log(req, { action: 'APPROVAL_FAILED', entityType: 'ApprovalRequest', entityId: id, outcome: 'FAILED', newValues: { error: e.message } }).catch(() => {});
    throw e;
  }
};

const cancel = (req, id) => sequelize.transaction(async (t) => {
  const r = await load(id, t);
  if (r.requestedBy !== req.user.id) throw new AppError(403, 'FORBIDDEN', 'Only the requester can cancel this');
  if (!['DRAFT', 'SUBMITTED'].includes(r.status)) throw new AppError(409, 'BAD_STATE', `Cannot cancel a request that is ${r.status}`);
  const old = snap(r); await r.update({ status: 'CANCELLED' }, { transaction: t });
  await audit.log(req, { action: 'APPROVAL_CANCELLED', entityType: 'ApprovalRequest', entityId: r.id, oldValues: old, newValues: snap(r) }, t);
  const d = registry.get(r.type); if (d && d.onCancel) await d.onCancel(r, { transaction: t, user: req.user, req }); // module hook (Phase 2)
  return r;
});

// Only the requester may edit a DRAFT. Type and payload can change; status never changes here.
const update = (req, id, { type, payload }) => sequelize.transaction(async (t) => {
  const r = await load(id, t);
  if (r.requestedBy !== req.user.id) throw new AppError(403, 'FORBIDDEN', 'Only the requester can edit this');
  if (r.status !== 'DRAFT') throw new AppError(409, 'BAD_STATE', `Cannot edit a request that is ${r.status}`);
  if (type) typeDef(type);
  const old = snap(r);
  await r.update({ ...(type && { type }), ...(payload && { payload }) }, { transaction: t });
  await audit.log(req, { action: 'APPROVAL_UPDATED', entityType: 'ApprovalRequest', entityId: r.id, oldValues: old, newValues: snap(r) }, t);
  return r;
});

// Only the Owner may delete, and may delete a request in any status. The full record is kept in the audit log.
const remove = (req, id) => sequelize.transaction(async (t) => {
  if (req.user.role !== 'OWNER') throw new AppError(403, 'OWNER_ONLY', 'Only the Owner can delete approval requests');
  const r = await load(id, t);
  const old = { ...snap(r), requestedBy: r.requestedBy, decidedBy: r.decidedBy };
  await r.destroy({ transaction: t });
  await audit.log(req, { action: 'APPROVAL_DELETED', entityType: 'ApprovalRequest', entityId: id, oldValues: old }, t);
});

module.exports = { approversOf, register, registry, create, update, remove, submit, approve: decide('approve'), reject: decide('reject'), cancel };
