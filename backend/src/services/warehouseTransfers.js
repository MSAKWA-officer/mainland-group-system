const { QueryTypes } = require('sequelize');
const { sequelize, WarehouseTransfer, WarehouseTransferLine, Item, StockBatch } = require('../models');
const approvals = require('./approvals');
const audit = require('./audit');
const ledger = require('./stockLedger');
const wh = require('./warehouses');
const { AppError } = require('../utils/errors');

/* Moving stock from one warehouse to another.
     storekeeper of the SOURCE warehouse requests  -> SUBMITTED (a Manager is notified)
     Manager approves                             -> stock leaves the source and enters the destination, in ONE transaction -> COMPLETED
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
  const tr = await WarehouseTransfer.create({ transferNo, fromWarehouseId: from.id, toWarehouseId: to.id, status: 'SUBMITTED',
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
    await ledger.warehouseMove(t, { ...common, warehouseId: tr.toWarehouseId, direction: 'IN', movementType: 'TRANSFER_IN' });
  }
  const old = snap(tr);
  await tr.update({ status: 'COMPLETED', completedAt: new Date() }, { transaction: t });
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

module.exports = { create, cancel };
