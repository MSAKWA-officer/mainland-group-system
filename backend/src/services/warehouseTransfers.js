const { QueryTypes } = require('sequelize');
const { sequelize, WarehouseTransfer, WarehouseTransferLine, Item, StockBatch, Salesperson } = require('../models');
const notify = require('./notify');
const approvals = require('./approvals');
const audit = require('./audit');
const ledger = require('./stockLedger');
const wh = require('./warehouses');
const { AppError } = require('../utils/errors');

/* Moving stock from one warehouse to another.
     storekeeper of the SOURCE warehouse requests  -> SUBMITTED (a Manager is notified)
     Manager approves                             -> stock leaves the source. If the destination is a salesperson's warehouse it is IN_TRANSIT until that
                                                     salesperson confirms receipt (then it enters the destination -> COMPLETED); otherwise it enters at once -> COMPLETED
     Manager rejects / requester cancels          -> REJECTED / CANCELLED (stock never moved)
   Company-wide stock (stock_levels) does not change: the same goods are only in a different place.
   Reuses the generic approval engine, so a requester can never approve their own transfer. */
const TYPE = 'WAREHOUSE_TRANSFER';
const bad = (field, message) => new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field, message }]);
const snap = (x) => ({ transferNo: x.transferNo, status: x.status, from: x.fromWarehouseId, to: x.toWarehouseId, transferDate: x.transferDate, reason: x.reason });
const label = (i) => `${i.sku} - ${i.name}`;

async function normalizeLines(fromId, lines, t) {
  const items = new Map((await Item.findAll({ where: { id: [...new Set(lines.map((l) => l.itemId))] }, transaction: t })).map((i) => [i.id, i]));
  const bids = [...new Set(lines.map((l) => l.batchId).filter(Boolean))];
  const batches = new Map((bids.length ? await StockBatch.findAll({ where: { id: bids }, transaction: t }) : []).map((b) => [b.id, b]));
  const seen = new Set(); const need = new Map();
  const rows = lines.map((l, n) => {
    const f = (k) => `lines.${n}.${k}`;
    const item = items.get(l.itemId);
    if (!item) throw bad(f('itemId'), 'Item not found');
    let batchId = null;
    if (item.trackExpiry) {
      const b = l.batchId && batches.get(l.batchId);
      if (!b || b.itemId !== item.id) throw bad(f('batchId'), 'Choose a batch of this item');
      batchId = b.id;
    } else if (l.batchId) throw bad(f('batchId'), 'This item has no batches');
    const key = `${item.id}:${batchId || ''}`;
    if (seen.has(key)) throw bad(f('itemId'), 'This item (and batch) is already on another line');
    seen.add(key);
    need.set(item.id, (need.get(item.id) || 0) + Math.round(Number(l.quantity) * 1000));
    return { itemId: item.id, batchId, quantity: l.quantity, remarks: l.remarks ?? null };
  });
  // Early, friendly check against what the source warehouse holds now. The real guard runs again when the Manager approves.
  const have = await sequelize.query('SELECT item_id AS "itemId", quantity FROM warehouse_stock WHERE warehouse_id = :w AND item_id IN (:ids)',
    { replacements: { w: fromId, ids: [...items.keys()] }, type: QueryTypes.SELECT, transaction: t });
  const haveBy = new Map(have.map((h) => [h.itemId, Math.round(Number(h.quantity) * 1000)]));
  rows.forEach((r, n) => {
    if ((need.get(r.itemId) || 0) > (haveBy.get(r.itemId) || 0))
      throw new AppError(409, 'INSUFFICIENT_STOCK', `Insufficient stock for ${label(items.get(r.itemId))} in the source warehouse: ${(haveBy.get(r.itemId) || 0) / 1000} available`,
        [{ field: `lines.${n}.quantity`, message: 'More than the warehouse holds' }]);
  });
  return rows;
}

const create = (req, body) => sequelize.transaction(async (t) => {
  if (body.fromWarehouseId === body.toWarehouseId) throw bad('toWarehouseId', 'Choose two different warehouses');
  const from = await wh.access(req, body.fromWarehouseId, t, { active: true });          // you can only send stock out of a warehouse you are in charge of
  const to = await wh.activeOne(body.toWarehouseId, t, 'toWarehouseId');
  const rows = await normalizeLines(from.id, body.lines, t);
  const [seq] = await sequelize.query("SELECT nextval('warehouse_transfer_seq') AS n", { transaction: t });
  const transferNo = `WTR-${new Date().getFullYear()}-${String(seq[0].n).padStart(6, '0')}`;
  const sellers = await Salesperson.findAll({ where: { warehouseId: to.id, isActive: true }, attributes: ['userId'], transaction: t });
  const tr = await WarehouseTransfer.create({ transferNo, fromWarehouseId: from.id, toWarehouseId: to.id, status: 'SUBMITTED', requiresReceipt: sellers.length > 0,
    ...(body.transferDate && { transferDate: body.transferDate }), reason: body.reason ?? null, createdBy: req.user.id, submittedAt: new Date() }, { transaction: t });
  await WarehouseTransferLine.bulkCreate(rows.map((r) => ({ ...r, transferId: tr.id })), { transaction: t });
  const ar = await approvals.create(req, { type: TYPE, entityType: 'WarehouseTransfer', entityId: tr.id,
    payload: { transferNo, from: from.name, to: to.name, lines: rows.length, reason: body.reason ?? null } }, t);
  await approvals.submit(req, ar.id, t);                                                   // notifies every active user who holds warehouse_transfers.approve
  await tr.update({ approvalId: ar.id }, { transaction: t });
  await audit.log(req, { action: 'WAREHOUSE_TRANSFER_REQUESTED', entityType: 'WarehouseTransfer', entityId: tr.id, newValues: { ...snap(tr), lines: rows.length } }, t);
  return tr;
});

// Requester withdraws a transfer that is still waiting. The approval service calls onCancel below, which closes the transfer.
const cancel = async (req, id) => {
  const tr = await WarehouseTransfer.findByPk(id);
  if (!tr) throw new AppError(404, 'NOT_FOUND', 'Transfer not found');
  if (tr.createdBy !== req.user.id) throw new AppError(403, 'FORBIDDEN', 'Only the requester can cancel this transfer');
  if (tr.status !== 'SUBMITTED') throw new AppError(409, 'BAD_STATE', `Cannot cancel a transfer that is ${tr.status}`);
  await approvals.cancel(req, tr.approvalId);
};

/* The salesperson of the destination warehouse answers for the goods that were sent (status IN_TRANSIT):
     FULL (default) - everything arrived: all of it enters the destination                           -> COMPLETED
     SHORT          - less arrived: only lines[].receivedQty enters the destination, the rest goes back to the SOURCE warehouse -> RECEIVED_SHORT
     NONE           - nothing arrived: everything goes back to the SOURCE warehouse                    -> NOT_RECEIVED
   Sending the shortfall back keeps company-wide stock equal to the sum of the warehouses. The Manager (and the requester) are notified and sort the
   problem out outside the system; the note is required whenever something is missing. */
const mil = (n) => Math.round(Number(n) * 1000);
const receive = (req, id, body = {}) => sequelize.transaction(async (t) => {
  const outcome = body.outcome || 'FULL'; const note = (body.note || '').trim();
  const tr = await WarehouseTransfer.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!tr) throw new AppError(404, 'NOT_FOUND', 'Transfer not found');
  if (tr.status !== 'IN_TRANSIT') throw new AppError(409, 'BAD_STATE', `This transfer is ${tr.status}, not waiting to be received`);
  const mine = await Salesperson.findOne({ where: { userId: req.user.id, warehouseId: tr.toWarehouseId, isActive: true }, transaction: t });
  if (!mine) throw new AppError(403, 'NOT_YOUR_WAREHOUSE', 'Only a salesperson assigned to the receiving warehouse can confirm this transfer');
  if (outcome !== 'FULL' && note.length < 3) throw bad('note', 'Say what is missing or what went wrong');
  const lines = await WarehouseTransferLine.findAll({ where: { transferId: tr.id }, order: [['itemId', 'ASC'], ['createdAt', 'ASC']], transaction: t });
  // How much of each line really arrived.
  const got = new Map(lines.map((l) => [l.id, outcome === 'FULL' ? mil(l.quantity) : 0]));
  if (outcome === 'SHORT') {
    const sent = new Map((body.lines || []).map((x) => [x.lineId, x.receivedQty]));
    lines.forEach((l, n) => {
      if (!sent.has(l.id)) throw bad(`lines.${n}.receivedQty`, 'Enter the quantity received for every line');
      const q = mil(sent.get(l.id));
      if (q < 0 || q > mil(l.quantity)) throw bad(`lines.${n}.receivedQty`, 'Cannot be more than was sent');
      got.set(l.id, q);
    });
    if (lines.every((l) => got.get(l.id) === mil(l.quantity))) throw bad('lines', 'Everything was received: confirm the transfer as received instead');
    if (lines.every((l) => got.get(l.id) === 0)) throw bad('lines', 'Nothing was received: use "Not received" instead');
  }
  const items = new Map((await Item.findAll({ where: { id: lines.map((l) => l.itemId) }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE })).map((i) => [i.id, i]));
  for (const l of lines) {
    const common = { itemId: l.itemId, batchId: l.batchId, label: label(items.get(l.itemId)), direction: 'IN', refType: 'WarehouseTransfer', refId: tr.id, userId: req.user.id };
    const ok = got.get(l.id) / 1000; const missing = (mil(l.quantity) - got.get(l.id)) / 1000;
    if (ok > 0) await ledger.warehouseMove(t, { ...common, warehouseId: tr.toWarehouseId, quantity: ok, movementType: 'TRANSFER_IN', note: `Transfer ${tr.transferNo}` });
    if (missing > 0) await ledger.warehouseMove(t, { ...common, warehouseId: tr.fromWarehouseId, quantity: missing, movementType: 'TRANSFER_RETURN', note: `Transfer ${tr.transferNo}: not received` });
    await l.update({ receivedQty: ok }, { transaction: t });
  }
  const status = outcome === 'FULL' ? 'COMPLETED' : outcome === 'SHORT' ? 'RECEIVED_SHORT' : 'NOT_RECEIVED';
  const old = snap(tr);
  await tr.update({ status, completedAt: new Date(), receivedBy: req.user.id, receivedAt: new Date(), receiveNote: note || null }, { transaction: t });
  const action = { COMPLETED: 'WAREHOUSE_TRANSFER_RECEIVED', RECEIVED_SHORT: 'WAREHOUSE_TRANSFER_RECEIVED_SHORT', NOT_RECEIVED: 'WAREHOUSE_TRANSFER_NOT_RECEIVED' }[status];
  await audit.log(req, { action, entityType: 'WarehouseTransfer', entityId: tr.id, oldValues: old, newValues: { ...snap(tr), lines: lines.length }, reason: note || undefined }, t);
  const link = `/warehouse-transfers/${tr.id}`;
  if (status === 'COMPLETED') await notify([tr.createdBy], { title: 'Transfer received', body: `${tr.transferNo} was confirmed by ${req.user.fullName}`, link }, t);
  else {                                                                                  // a problem: tell the requester and every Manager who can approve transfers
    const managers = await approvals.approversOf('warehouse_transfers.approve', req.user.id, t);
    await notify([...new Set([tr.createdBy, ...managers])].filter((u) => u !== req.user.id),
      { title: status === 'NOT_RECEIVED' ? 'Transfer NOT received' : 'Transfer received short', body: `${tr.transferNo}: ${req.user.fullName} reported a problem - ${note}`, link }, t);
  }
  return tr;
});

/* ---- approval hooks: run inside services/approvals.js's transaction ---- */
const execute = async (r, ctx) => {
  const t = ctx.transaction;
  const tr = await WarehouseTransfer.findByPk(r.entityId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!tr || tr.status !== 'SUBMITTED') throw new AppError(409, 'BAD_STATE', 'This transfer is not waiting for approval');
  const to = await sequelize.query('SELECT is_active AS "isActive", name FROM warehouses WHERE id = :id', { replacements: { id: tr.toWarehouseId }, type: QueryTypes.SELECT, transaction: t });
  if (!to[0] || !to[0].isActive) throw new AppError(409, 'WAREHOUSE_INACTIVE', 'The destination warehouse is inactive');
  const lines = await WarehouseTransferLine.findAll({ where: { transferId: tr.id }, order: [['itemId', 'ASC'], ['createdAt', 'ASC']], transaction: t });
  const items = new Map((await Item.findAll({ where: { id: lines.map((l) => l.itemId) }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE })).map((i) => [i.id, i])); // same lock order as the ledger
  for (const l of lines) {
    const common = { itemId: l.itemId, batchId: l.batchId, quantity: l.quantity, label: label(items.get(l.itemId)), refType: 'WarehouseTransfer', refId: tr.id,
      userId: ctx.user.id, note: `Transfer ${tr.transferNo}` };
    await ledger.warehouseMove(t, { ...common, warehouseId: tr.fromWarehouseId, direction: 'OUT', movementType: 'TRANSFER_OUT' });   // fails (and rolls back everything) if the source no longer holds it
    if (!tr.requiresReceipt) await ledger.warehouseMove(t, { ...common, warehouseId: tr.toWarehouseId, direction: 'IN', movementType: 'TRANSFER_IN' });
  }
  const old = snap(tr);
  if (tr.requiresReceipt) {                                                                // goods are on the way: the salesperson must confirm
    await tr.update({ status: 'IN_TRANSIT', approvedAt: new Date() }, { transaction: t });
    await audit.log(ctx.req, { action: 'WAREHOUSE_TRANSFER_APPROVED', entityType: 'WarehouseTransfer', entityId: tr.id, oldValues: old, newValues: { ...snap(tr), lines: lines.length } }, t);
    const sellers = await Salesperson.findAll({ where: { warehouseId: tr.toWarehouseId, isActive: true }, attributes: ['userId'], transaction: t });
    await notify(sellers.map((s) => s.userId), { title: 'Stock on the way', body: `${tr.transferNo}: confirm when you receive it`, link: `/warehouse-transfers/${tr.id}` }, t);
    return;
  }
  await tr.update({ status: 'COMPLETED', approvedAt: new Date(), completedAt: new Date() }, { transaction: t });
  await audit.log(ctx.req, { action: 'WAREHOUSE_TRANSFER_COMPLETED', entityType: 'WarehouseTransfer', entityId: tr.id, oldValues: old, newValues: { ...snap(tr), lines: lines.length } }, t);
};
const close = (status, action) => async (r, ctx) => {
  const t = ctx.transaction;
  const tr = await WarehouseTransfer.findByPk(r.entityId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!tr || tr.status !== 'SUBMITTED') return;
  await tr.update({ status }, { transaction: t });
  await audit.log(ctx.req, { action, entityType: 'WarehouseTransfer', entityId: tr.id, oldValues: { status: 'SUBMITTED' }, newValues: { status, transferNo: tr.transferNo }, reason: r.decisionNote || undefined }, t);
};
approvals.register(TYPE, { label: 'Warehouse transfer', approvePermission: 'warehouse_transfers.approve', execute,
  onReject: close('REJECTED', 'WAREHOUSE_TRANSFER_REJECTED'), onCancel: close('CANCELLED', 'WAREHOUSE_TRANSFER_CANCELLED') });

/* DELETE of a transfer that already moved stock (IN_TRANSIT / COMPLETED / RECEIVED_SHORT / NOT_RECEIVED) = REVERSE.
   Every warehouse movement of the transfer is undone with the opposite movement (new ledger rows), so the goods go back to where they were and the transfer
   stays as VOIDED with who / when / why. Stock that already left the destination warehouse (sold, moved on) stops the reversal. Only a Manager who can approve
   transfers may do it. A transfer still waiting for approval is cancelled / rejected instead. */
const reverse = (req, id, reason) => sequelize.transaction(async (t) => {
  const tr = await WarehouseTransfer.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!tr) throw new AppError(404, 'NOT_FOUND', 'Transfer not found');
  if (!reason || reason.trim().length < 3) throw bad('reason', 'A reason is required');
  if (!['IN_TRANSIT', 'COMPLETED', 'RECEIVED_SHORT', 'NOT_RECEIVED'].includes(tr.status))
    throw new AppError(409, 'BAD_STATE', tr.status === 'SUBMITTED' ? 'This transfer is still waiting for approval: cancel or reject it instead' : `A ${tr.status} transfer cannot be reversed`);
  const moves = await sequelize.query(`SELECT warehouse_id AS "warehouseId", item_id AS "itemId", batch_id AS "batchId", direction, quantity
    FROM warehouse_movements WHERE ref_type = 'WarehouseTransfer' AND ref_id = :id AND COALESCE(note, '') NOT LIKE 'Reversal %' ORDER BY item_id, occurred_at, id`, { replacements: { id: tr.id }, type: QueryTypes.SELECT, transaction: t });
  if (!moves.length) throw new AppError(409, 'NOTHING_TO_REVERSE', 'This transfer has no stock movements to reverse');
  const items = new Map((await Item.findAll({ where: { id: [...new Set(moves.map((m) => m.itemId))] }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE })).map((i) => [i.id, i]));
  const old = snap(tr);
  for (const m of moves) {
    const dir = m.direction === 'IN' ? 'OUT' : 'IN';
    await ledger.warehouseMove(t, { warehouseId: m.warehouseId, itemId: m.itemId, batchId: m.batchId, quantity: m.quantity, direction: dir, label: label(items.get(m.itemId)),
      movementType: dir === 'IN' ? 'TRANSFER_RETURN' : 'TRANSFER_OUT', refType: 'WarehouseTransfer', refId: tr.id, userId: req.user.id,
      note: `Reversal ${tr.transferNo}: ${reason.trim()}`.slice(0, 255) });          // an OUT is guarded: fails if the goods are no longer in that warehouse
  }
  await tr.update({ status: 'VOIDED', voidedAt: new Date(), voidedBy: req.user.id, voidReason: reason.trim().slice(0, 500) }, { transaction: t });
  await audit.log(req, { action: 'WAREHOUSE_TRANSFER_REVERSED', entityType: 'WarehouseTransfer', entityId: tr.id, oldValues: old, newValues: { ...snap(tr), movementsReversed: moves.length }, reason: reason.trim() }, t);
  await notify([tr.createdBy], { title: 'Transfer reversed', body: `${tr.transferNo} was reversed by ${req.user.fullName}: ${reason.trim()}`, link: `/warehouse-transfers/${tr.id}` }, t);
  return tr;
});

module.exports = { create, cancel, receive, reverse };
