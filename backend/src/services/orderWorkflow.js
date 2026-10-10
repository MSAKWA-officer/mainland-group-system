const { Op } = require('sequelize');
const { sequelize, OrderWorkflow, OrderWorkflowEvent, SalesOrder, SalesOrderLine, Salesperson, StockLevel, ApprovalRequest, User, Role, Permission } = require('../models');
const approvals = require('./approvals');
const audit = require('./audit');
const notify = require('./notify');
const { mine } = require('./salesScope');
const { AppError } = require('../utils/errors');

/* Phase 4 - Approval workflow for sales orders:  Salesperson -> Storekeeper -> Manager -> Salesperson.

   Status of the workflow (order_workflows.status), and who must act next:
     AWAITING_STOREKEEPER  salesperson submitted  -> Storekeeper checks the stock: VERIFY (to manager) or RETURN (back to salesperson)
     AWAITING_MANAGER      storekeeper verified   -> Manager decides: APPROVE (stock is issued, order CONFIRMED) | REJECT (final) | RETURN
     AWAITING_SALESPERSON  manager approved       -> Salesperson confirms the order was handed over: ACKNOWLEDGE
     RETURNED              sent back              -> Salesperson edits the draft and submits again (a new "cycle")
     COMPLETED | REJECTED | CANCELLED             -> closed

   The manager's decision still runs through the existing approvals engine (services/approvals.js), so stock issuing, FEFO, ledger and
   audit behave exactly as before. install() wraps the SALES_ORDER approval type so the storekeeper step can never be skipped, whichever
   endpoint the manager uses (/order-workflow, /sales-orders/:id/approve or /approvals/:id/approve).
   Orders submitted before Phase 4 have no workflow row and keep the old one-step behaviour.
   Lock order everywhere: approval -> sales order -> workflow (prevents deadlocks between the different entry points). */

const STAGE_OF = { AWAITING_STOREKEEPER: 'STOREKEEPER', AWAITING_MANAGER: 'MANAGER', AWAITING_SALESPERSON: 'SALESPERSON', RETURNED: 'SALESPERSON',
  COMPLETED: 'CLOSED', REJECTED: 'CLOSED', CANCELLED: 'CLOSED' };
const STATUSES = Object.keys(STAGE_OF);
const STAGES = ['STOREKEEPER', 'MANAGER', 'SALESPERSON', 'CLOSED'];
const statusesOf = (stage) => STATUSES.filter((s) => STAGE_OF[s] === stage);
const WAITING = { AWAITING_STOREKEEPER: 'waiting for the storekeeper to verify the stock', AWAITING_MANAGER: 'waiting for the manager to decide',
  AWAITING_SALESPERSON: 'waiting for the salesperson to confirm', RETURNED: 'returned to the salesperson for correction',
  COMPLETED: 'already completed', REJECTED: 'rejected', CANCELLED: 'cancelled' };

const can = (req, p) => req.user.permissions.has(p);
const bad = (field, message) => new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field, message }]);
const link = (id) => `/order-workflow/${id}`;
const snap = (w) => ({ status: w.status, cycle: w.cycle, approvalId: w.approvalId, orderId: w.orderId });
const clean = (s) => (s && s.trim() ? s.trim() : null);

/* ---------- small helpers ---------- */
// Active users whose role holds a permission (same lookup the approvals engine uses to find approvers).
const usersWith = async (perm, exceptId, t) => (await User.findAll({
  attributes: ['id'], where: { status: 'ACTIVE' }, transaction: t,
  include: [{ model: Role, as: 'role', required: true, attributes: [], include: [{ model: Permission, as: 'permissions', required: true, attributes: [], where: { code: perm }, through: { attributes: [] } }] }],
})).map((u) => u.id).filter((i) => i !== exceptId);

// The people on the salesperson side of an order: whoever created it and the user linked to its salesperson profile.
const salesSide = async (order, exceptId, t) => {
  const sp = await Salesperson.findByPk(order.salespersonId, { transaction: t });
  return [...new Set([order.createdBy, sp?.userId].filter(Boolean))].filter((i) => i !== exceptId);
};
const tell = (ids, title, body, wf, t) => notify([...new Set(ids)], { title, body, link: link(wf.id) }, t);

const event = (t, wf, user, action, from, note) => OrderWorkflowEvent.create({ workflowId: wf.id, orderId: wf.orderId, cycle: wf.cycle, action, fromStatus: from,
  toStatus: wf.status, actorId: user.id, actorRole: user.role, note: clean(note) }, { transaction: t });

// approval -> order -> workflow, always in this order. Returns all three (approval only when asked for).
async function lockChain(id, t, withApproval) {
  const peek = await OrderWorkflow.findByPk(id, { transaction: t });
  if (!peek) throw new AppError(404, 'NOT_FOUND', 'Workflow not found');
  const approval = withApproval && peek.approvalId ? await ApprovalRequest.findByPk(peek.approvalId, { transaction: t, lock: t.LOCK.UPDATE }) : null;
  const order = await SalesOrder.findByPk(peek.orderId, { transaction: t, lock: t.LOCK.UPDATE });
  const wf = await OrderWorkflow.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  return { wf, order, approval };
}
// The workflow must be in the status this step needs, and the order must agree with it.
function expectState(wf, order, status) {
  if (wf.status !== status) throw new AppError(409, 'BAD_STATE', `This order is ${WAITING[wf.status]}, so this step is not available`);
  const need = status === 'AWAITING_SALESPERSON' ? 'CONFIRMED' : 'SUBMITTED';
  if (!order || order.status !== need) throw new AppError(409, 'BAD_STATE', `The sales order is ${order?.status}, not ${need}`);
}
const notOwnOrder = (req, order, what) => {
  if (order.createdBy === req.user.id) throw new AppError(403, 'SELF_REVIEW', `You cannot ${what} an order you created yourself`);
};
// Segregation of duties: the person who verified the stock may not also approve it (the Owner is exempt so a one-person business still works).
const notSamePerson = (user, wf) => {
  if (wf.storekeeperId && wf.storekeeperId === user.id && user.role !== 'OWNER')
    throw new AppError(403, 'SAME_PERSON', 'The person who verified the stock cannot also take the manager decision');
};

/* ---------- who can see / do what (also used by the controller) ---------- */
// Sales people see their own orders; storekeepers and managers see their queue plus what they handled; read_all sees everything.
async function visibility(req) {
  if (can(req, 'order_workflow.read_all')) return {};
  const or = [{ '$order.created_by$': req.user.id }];
  const sp = await mine(req); if (sp) or.push({ '$order.salesperson_id$': sp.id });
  if (can(req, 'order_workflow.storekeeper_review')) or.push({ status: 'AWAITING_STOREKEEPER' }, { storekeeperId: req.user.id });
  if (can(req, 'order_workflow.manager_review')) or.push({ status: 'AWAITING_MANAGER' }, { managerId: req.user.id });
  return { [Op.or]: or };
}
// The buttons this user may press on this workflow right now.
function actionsFor(req, wf, order, salesperson) {
  const me = req.user.id; const owner = req.user.role === 'OWNER';
  const notCreator = order.createdBy !== me;
  const store = wf.status === 'AWAITING_STOREKEEPER' && can(req, 'order_workflow.storekeeper_review') && notCreator;
  const mgr = wf.status === 'AWAITING_MANAGER' && can(req, 'order_workflow.manager_review') && can(req, 'sales_orders.approve') && notCreator && (owner || wf.storekeeperId !== me);
  const ack = wf.status === 'AWAITING_SALESPERSON' && can(req, 'order_workflow.acknowledge') && (order.createdBy === me || salesperson?.userId === me || owner);
  return { storekeeperVerify: store, storekeeperReturn: store, managerApprove: mgr, managerReject: mgr, managerReturn: mgr, acknowledge: ack,
    editAndResubmit: wf.status === 'RETURNED' && order.createdBy === me };
}

/* ---------- 1. Salesperson submits (called from salesOrders.submit, inside its transaction) ---------- */
async function start(req, order, approvalId, t) {
  let wf = await OrderWorkflow.findOne({ where: { orderId: order.id }, transaction: t, lock: t.LOCK.UPDATE });
  let action = 'SUBMITTED'; let from = null;
  if (!wf) {
    wf = await OrderWorkflow.create({ orderId: order.id, approvalId, status: 'AWAITING_STOREKEEPER', cycle: 1, submittedBy: req.user.id, submittedAt: new Date() }, { transaction: t });
  } else {
    if (wf.status !== 'RETURNED') throw new AppError(409, 'BAD_STATE', `This order is ${WAITING[wf.status]} and cannot be submitted again`);
    from = wf.status; action = 'RESUBMITTED';
    await wf.update({ approvalId, status: 'AWAITING_STOREKEEPER', cycle: wf.cycle + 1, submittedBy: req.user.id, submittedAt: new Date(),
      storekeeperId: null, storekeeperAt: null, storekeeperNote: null, managerId: null, managerAt: null, managerNote: null,
      returnedFrom: null, returnedBy: null, returnedAt: null, returnNote: null }, { transaction: t });
  }
  await event(t, wf, req.user, action, from, null);
  await audit.log(req, { action: `ORDER_WORKFLOW_${action}`, entityType: 'OrderWorkflow', entityId: wf.id, oldValues: from ? { status: from } : null, newValues: { ...snap(wf), orderNo: order.orderNo } }, t);
  await tell(await usersWith('order_workflow.storekeeper_review', req.user.id, t), 'Order to verify', `${order.orderNo} is waiting for stock verification`, wf, t);
  return wf;
}

/* ---------- 2. Storekeeper: verify the stock, or send the order back ---------- */
async function assertStock(order, t) {
  const lines = await SalesOrderLine.findAll({ where: { orderId: order.id }, order: [['itemName', 'ASC']], transaction: t });
  const levels = new Map((await StockLevel.findAll({ where: { itemId: lines.map((l) => l.itemId) }, transaction: t })).map((s) => [s.itemId, Number(s.quantity)]));
  const short = lines.filter((l) => Math.round((levels.get(l.itemId) ?? 0) * 1000) < Math.round(Number(l.quantity) * 1000));
  if (short.length) throw new AppError(409, 'INSUFFICIENT_STOCK', 'There is not enough stock for some items. Return the order to the salesperson instead.',
    short.map((l) => ({ field: `item.${l.sku}`, message: `${l.sku} - ${l.itemName}: ${levels.get(l.itemId) ?? 0} available, ${Number(l.quantity)} requested` })));
}

const storekeeperVerify = (req, id, note) => sequelize.transaction(async (t) => {
  const { wf, order } = await lockChain(id, t, false);
  expectState(wf, order, 'AWAITING_STOREKEEPER');
  notOwnOrder(req, order, 'verify');
  await assertStock(order, t);
  const old = snap(wf);
  await wf.update({ status: 'AWAITING_MANAGER', storekeeperId: req.user.id, storekeeperAt: new Date(), storekeeperNote: clean(note) }, { transaction: t });
  await event(t, wf, req.user, 'STOREKEEPER_VERIFIED', old.status, note);
  await audit.log(req, { action: 'ORDER_WORKFLOW_STOREKEEPER_VERIFIED', entityType: 'OrderWorkflow', entityId: wf.id, oldValues: old, newValues: { ...snap(wf), orderNo: order.orderNo }, reason: clean(note) }, t);
  await tell(await usersWith('order_workflow.manager_review', req.user.id, t), 'Order to approve', `${order.orderNo} was verified by the storekeeper`, wf, t);
  await tell(await salesSide(order, req.user.id, t), 'Stock verified', `${order.orderNo} passed the storekeeper and is waiting for the manager`, wf, t);
  return wf;
});

// Sends the order back to the salesperson as an editable DRAFT. Used by the storekeeper and (optionally) by the manager.
const sendBack = (stage) => (req, id, note) => sequelize.transaction(async (t) => {
  if (!clean(note) || clean(note).length < 3) throw bad('note', 'A reason is required');
  const { wf, order, approval } = await lockChain(id, t, true);
  expectState(wf, order, stage === 'STOREKEEPER' ? 'AWAITING_STOREKEEPER' : 'AWAITING_MANAGER');
  notOwnOrder(req, order, 'return');
  if (stage === 'MANAGER') notSamePerson(req.user, wf);
  if (!approval || approval.status !== 'SUBMITTED') throw new AppError(409, 'BAD_STATE', 'The approval request of this order is no longer open');
  const old = snap(wf); const reason = clean(note);
  await approval.update({ status: 'REJECTED', decidedBy: req.user.id, decidedAt: new Date(), decisionNote: `Returned for correction: ${reason}` }, { transaction: t });
  await order.update({ status: 'DRAFT', submittedAt: null }, { transaction: t });          // unlocks the lines so the salesperson can fix the order
  await wf.update({ status: 'RETURNED', returnedFrom: stage, returnedBy: req.user.id, returnedAt: new Date(), returnNote: reason }, { transaction: t });
  await event(t, wf, req.user, `${stage}_RETURNED`, old.status, reason);
  await audit.log(req, { action: `ORDER_WORKFLOW_${stage}_RETURNED`, entityType: 'OrderWorkflow', entityId: wf.id, oldValues: old,
    newValues: { ...snap(wf), orderNo: order.orderNo, orderStatus: 'DRAFT' }, reason }, t);
  await tell(await salesSide(order, req.user.id, t), 'Order returned', `${order.orderNo} was returned by the ${stage.toLowerCase()}: ${reason}`, wf, t);
  return wf;
});

/* ---------- 3. Manager: approve / reject (through the approvals engine) or return ---------- */
const stageError = (wf) => new AppError(409, 'BAD_STATE', `This order is ${WAITING[wf.status]}, so the manager step is not available`);
const managerDecide = (kind) => async (req, id, note) => {
  const wf = await OrderWorkflow.findByPk(id);
  if (!wf) throw new AppError(404, 'NOT_FOUND', 'Workflow not found');
  if (wf.status !== 'AWAITING_MANAGER') throw stageError(wf);                           // quick, friendly check; the guard inside the transaction is the real gate
  if (kind === 'reject' && (!clean(note) || clean(note).length < 3)) throw bad('note', 'A reason is required');
  await approvals[kind](req, wf.approvalId, clean(note) || undefined);                  // approve = issues the stock in the same transaction
  return OrderWorkflow.findByPk(id);
};

// Runs INSIDE the approvals transaction for every manager decision, whichever endpoint started it.
async function guard(r, ctx) {
  const t = ctx.transaction;
  await SalesOrder.findByPk(r.entityId, { transaction: t, lock: t.LOCK.UPDATE });          // lock order: approval -> order -> workflow
  const wf = await OrderWorkflow.findOne({ where: { orderId: r.entityId }, transaction: t, lock: t.LOCK.UPDATE });
  if (!wf || wf.approvalId !== r.id) return null;                                       // submitted before Phase 4: old one-step behaviour
  if (wf.status !== 'AWAITING_MANAGER') throw stageError(wf);
  if (!ctx.user.permissions.has('order_workflow.manager_review')) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to take the manager decision');
  notSamePerson(ctx.user, wf);
  return wf;
}
async function decided(wf, r, ctx, status, action) {
  const t = ctx.transaction; const from = wf.status;
  const order = await SalesOrder.findByPk(wf.orderId, { transaction: t });
  await wf.update({ status, managerId: ctx.user.id, managerAt: new Date(), managerNote: clean(r.decisionNote) }, { transaction: t });
  await event(t, wf, ctx.user, action, from, r.decisionNote);
  await audit.log(ctx.req, { action: `ORDER_WORKFLOW_${action}`, entityType: 'OrderWorkflow', entityId: wf.id, oldValues: { status: from },
    newValues: { ...snap(wf), orderNo: order.orderNo }, reason: clean(r.decisionNote) }, t);
  const ok = status === 'AWAITING_SALESPERSON';
  await tell(await salesSide(order, ctx.user.id, t), ok ? 'Order approved - please confirm' : 'Order rejected',
    ok ? `${order.orderNo} was approved and the stock was issued. Confirm when it is handed over.` : `${order.orderNo} was rejected${r.decisionNote ? `: ${r.decisionNote}` : ''}`, wf, t);
}
// Order cancelled (by the salesperson, or an approver cancelling a confirmed order): close the workflow too.
async function closeCancelled(orderId, user, req, t, note) {
  const wf = await OrderWorkflow.findOne({ where: { orderId }, transaction: t, lock: t.LOCK.UPDATE });
  if (!wf || wf.status === 'CANCELLED') return null;
  const from = wf.status; await wf.update({ status: 'CANCELLED' }, { transaction: t });
  await event(t, wf, user, 'CANCELLED', from, note);
  await audit.log(req, { action: 'ORDER_WORKFLOW_CANCELLED', entityType: 'OrderWorkflow', entityId: wf.id, oldValues: { status: from }, newValues: snap(wf), reason: clean(note) }, t);
  return wf;
}
const onOrderCancelled = (req, order, t, reason) => closeCancelled(order.id, req.user, req, t, reason);   // hook for salesOrders.cancel

let installed = false;
function install() {
  if (installed) return; installed = true;
  require('./salesOrders');                                                             // makes sure the SALES_ORDER approval type is registered
  const def = approvals.registry.get('SALES_ORDER');
  if (!def) throw new Error('SALES_ORDER approval type is not registered');
  approvals.registry.set('SALES_ORDER', { ...def,
    notifyOnSubmit: false,                                                              // the storekeeper is told first; the manager is told after the storekeeper verifies
    execute: async (r, ctx) => { const wf = await guard(r, ctx); await def.execute(r, ctx); if (wf) await decided(wf, r, ctx, 'AWAITING_SALESPERSON', 'MANAGER_APPROVED'); },
    onReject: async (r, ctx) => { const wf = await guard(r, ctx); await def.onReject(r, ctx); if (wf) await decided(wf, r, ctx, 'REJECTED', 'MANAGER_REJECTED'); },
    onCancel: async (r, ctx) => { await def.onCancel(r, ctx); await closeCancelled(r.entityId, ctx.user, ctx.req, ctx.transaction, 'Cancelled before approval'); },
  });
}

/* ---------- 4. Salesperson confirms the approved order ---------- */
const acknowledge = (req, id, note) => sequelize.transaction(async (t) => {
  const { wf, order } = await lockChain(id, t, false);
  expectState(wf, order, 'AWAITING_SALESPERSON');
  const sp = await Salesperson.findByPk(order.salespersonId, { transaction: t });
  if (!(order.createdBy === req.user.id || sp?.userId === req.user.id || req.user.role === 'OWNER'))
    throw new AppError(403, 'FORBIDDEN', 'Only the salesperson of this order can confirm it');
  const old = snap(wf);
  await wf.update({ status: 'COMPLETED', completedBy: req.user.id, completedAt: new Date(), completedNote: clean(note) }, { transaction: t });
  await event(t, wf, req.user, 'ACKNOWLEDGED', old.status, note);
  await audit.log(req, { action: 'ORDER_WORKFLOW_ACKNOWLEDGED', entityType: 'OrderWorkflow', entityId: wf.id, oldValues: old, newValues: { ...snap(wf), orderNo: order.orderNo }, reason: clean(note) }, t);
  await tell([wf.storekeeperId, wf.managerId].filter((i) => i && i !== req.user.id), 'Order completed', `${order.orderNo} was confirmed by the salesperson`, wf, t);
  return wf;
});

// Storekeepers, managers and read_all users see the stock on hand beside each line.
const canSeeStock = (req) => can(req, 'order_workflow.storekeeper_review') || can(req, 'order_workflow.manager_review') || can(req, 'order_workflow.read_all');

module.exports = { STAGE_OF, STATUSES, STAGES, statusesOf, visibility, actionsFor, canSeeStock, start, install, onOrderCancelled,
  storekeeperVerify, storekeeperReturn: sendBack('STOREKEEPER'), managerReturn: sendBack('MANAGER'),
  managerApprove: managerDecide('approve'), managerReject: managerDecide('reject'), acknowledge };
