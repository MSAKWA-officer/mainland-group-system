const { Op } = require('sequelize');
const { sequelize, SalesOrder, SalesOrderLine, Customer, Salesperson, Item, StockBatch, StockDocument, StockDocumentLine, StockMovement, Discount, EfdReceipt } = require('../models');
const approvals = require('./approvals');
const audit = require('./audit');
const ledger = require('./stockLedger');
const discountSvc = require('./discounts');
const workflow = require('./orderWorkflow');
const { mine, canAll } = require('./salesScope');
const { AppError } = require('../utils/errors');

/* Sales order lifecycle:
   DRAFT -> (submit) SUBMITTED -> (approve) CONFIRMED  | (reject) REJECTED | (cancel) CANCELLED
   Stock is issued when the order is CONFIRMED (approved): inside the approval transaction, through the Phase 2 stock ledger,
   using FEFO (first-expiry-first-out) for items that track expiry. Cancelling a CONFIRMED order puts the stock back with a reversing
   ledger entry. All money is calculated here on the server; amounts sent by the client are never trusted. */
const bad = (field, message) => new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field, message }]);
const can = (req, p) => req.user.permissions.has(p);

/* ---------- money (BigInt cents, so there are no floating point errors) ---------- */
const half = (num, den) => (num * 2n + den) / (2n * den);                       // divide, rounding half up (values are never negative)
const lineCents = (qty, price, disc) => half(BigInt(Math.round(qty * 1000)) * BigInt(Math.round(price * 100)) * (10000n - BigInt(Math.round(disc * 100))), 10000000n);
const grossCents = (qty, price) => half(BigInt(Math.round(qty * 1000)) * BigInt(Math.round(price * 100)), 1000n);
const str = (c) => `${c / 100n}.${String(c % 100n).padStart(2, '0')}`;
function totals(rows, taxRate) {
  let gross = 0n; let net = 0n;
  for (const r of rows) { gross += grossCents(r.quantity, r.unitPrice); net += lineCents(r.quantity, r.unitPrice, r.discountPercent); }
  const tax = half(net * BigInt(Math.round(taxRate * 100)), 10000n);
  return { subtotal: str(gross), discountTotal: str(gross - net), taxTotal: str(tax), total: str(net + tax) };
}
const snap = (o) => ({ orderNo: o.orderNo, status: o.status, customerId: o.customerId, salespersonId: o.salespersonId, orderDate: o.orderDate,
  deliveryDate: o.deliveryDate, taxRate: o.taxRate, total: o.total, notes: o.notes });

/* ---------- helpers ---------- */
const load = async (id, t) => {
  const o = await SalesOrder.findByPk(id, { transaction: t, ...(t && { lock: t.LOCK.UPDATE }) });
  if (!o) throw new AppError(404, 'NOT_FOUND', 'Sales order not found');
  return o;
};
const mustOwn = (req, o, what) => {
  if (o.createdBy !== req.user.id) throw new AppError(403, 'FORBIDDEN', `Only the creator can ${what} this order`);
};
const nextNo = async (seq, t) => (await sequelize.query(`SELECT nextval('${seq}') AS n`, { transaction: t }))[0][0].n;

// Works out the customer and salesperson of an order and applies the ownership rules.
async function resolveParties(req, { customerId, salespersonId }, t) {
  const customer = await Customer.findByPk(customerId, { transaction: t });
  const all = canAll(req, 'sales_orders.read_all');
  const me = all ? null : await mine(req);
  if (!all && !me) throw new AppError(403, 'NO_SALESPERSON_PROFILE', 'Your account is not linked to a salesperson profile. Ask an administrator to link it.');
  if (!customer || (!all && customer.salespersonId !== me.id)) throw bad('customerId', 'Customer not found');   // someone else's customer looks like "not found"
  if (!customer.isActive) throw bad('customerId', 'This customer is inactive');
  let spId;
  if (!all) {
    if (salespersonId && salespersonId !== me.id) throw new AppError(403, 'FORBIDDEN', 'You can only create orders for yourself');
    spId = me.id;
  } else {
    spId = salespersonId || customer.salespersonId || (await mine(req))?.id;
    if (!spId) throw bad('salespersonId', 'Choose a salesperson for this order');
  }
  const sp = await Salesperson.findByPk(spId, { transaction: t });
  if (!sp) throw bad('salespersonId', 'Salesperson not found');
  if (!sp.isActive) throw bad('salespersonId', 'This salesperson is inactive');
  return { customer, salesperson: sp };
}

// Validates lines against live item data and prices them.
// Prices and free-form discounts need `sales_orders.set_price`. A ready-made discount (discountId) needs `discounts.apply` and must be valid for the item, customer and quantity.
async function normalizeLines(req, lines, customerId, t) {
  const seen = new Set();
  lines.forEach((l, i) => { if (seen.has(l.itemId)) throw bad(`lines.${i}.itemId`, 'This item is already on the order. Change its quantity instead.'); seen.add(l.itemId); });
  const items = await Item.findAll({ where: { id: [...seen] }, transaction: t });
  const byId = new Map(items.map((i) => [i.id, i]));
  const setPrice = can(req, 'sales_orders.set_price');
  const mayUseDiscount = setPrice || can(req, 'discounts.apply');
  const dIds = [...new Set(lines.map((l) => l.discountId).filter(Boolean))];
  const discounts = new Map((dIds.length ? await Discount.findAll({ where: { id: dIds }, transaction: t }) : []).map((d) => [d.id, d]));
  const day = dIds.length ? await discountSvc.today(t) : null;
  return lines.map((l, i) => {
    const f = (k) => `lines.${i}.${k}`;
    const item = byId.get(l.itemId);
    if (!item) throw bad(f('itemId'), 'Item not found');
    if (!item.isActive) throw bad(f('itemId'), 'This item is inactive and cannot be sold');
    const catalog = Number(item.sellingPrice);
    if (l.unitPrice != null && !setPrice && Number(l.unitPrice) !== catalog) throw new AppError(403, 'FORBIDDEN', 'You are not allowed to change prices');
    const unitPrice = l.unitPrice ?? catalog;
    if (unitPrice <= 0 && !setPrice) throw bad(f('unitPrice'), 'This item has no selling price yet');
    let discountPercent = l.discountPercent ?? 0; let discountId = null; let discountName = null;
    if (l.discountId) {
      if (!mayUseDiscount) throw new AppError(403, 'FORBIDDEN', 'You are not allowed to apply discounts');
      const d = discounts.get(l.discountId);
      const msg = discountSvc.check(d, item, customerId, l.quantity, day);
      if (msg) throw bad(f('discountId'), msg);
      if (discountPercent > 0 && Number(discountPercent) !== Number(d.percent)) throw bad(f('discountPercent'), 'Use either a discount or a custom percent, not both');
      discountPercent = Number(d.percent); discountId = d.id; discountName = d.name;
    } else if (discountPercent > 0 && !setPrice) throw new AppError(403, 'FORBIDDEN', 'You are not allowed to give custom discounts. Choose a ready-made discount instead.');
    return { itemId: item.id, sku: item.sku, itemName: item.name, unit: item.unit, quantity: l.quantity, unitPrice, discountPercent, discountId, discountName,
      lineTotal: str(lineCents(l.quantity, unitPrice, discountPercent)) };
  });
}
const checkDates = (orderDate, deliveryDate) => {
  if (orderDate && deliveryDate && deliveryDate < orderDate) throw bad('deliveryDate', 'Delivery date cannot be before the order date');
};

/* ---------- create / update / submit / cancel / delete ---------- */
const create = (req, body) => sequelize.transaction(async (t) => {
  const { customer, salesperson } = await resolveParties(req, body, t);
  checkDates(body.orderDate, body.deliveryDate);
  const rows = await normalizeLines(req, body.lines, customer.id, t);
  const taxRate = body.taxRate ?? 0;
  const orderNo = `SO-${new Date().getFullYear()}-${String(await nextNo('sales_order_seq', t)).padStart(6, '0')}`;
  const o = await SalesOrder.create({ orderNo, customerId: customer.id, salespersonId: salesperson.id, status: 'DRAFT',
    ...(body.orderDate && { orderDate: body.orderDate }), deliveryDate: body.deliveryDate ?? null, notes: body.notes ?? null,
    taxRate, ...totals(rows, taxRate), createdBy: req.user.id }, { transaction: t });
  await SalesOrderLine.bulkCreate(rows.map((r) => ({ ...r, orderId: o.id })), { transaction: t });
  await audit.log(req, { action: 'SALES_ORDER_CREATED', entityType: 'SalesOrder', entityId: o.id, newValues: { ...snap(o), lines: rows.length } }, t);
  return o;
});

const update = (req, id, body) => sequelize.transaction(async (t) => {
  const o = await load(id, t);
  mustOwn(req, o, 'edit');
  if (o.status !== 'DRAFT') throw new AppError(409, 'BAD_STATE', `Cannot edit an order that is ${o.status}`);
  const old = snap(o);
  const head = {};
  if (body.customerId !== undefined || body.salespersonId !== undefined) {
    const { customer, salesperson } = await resolveParties(req, { customerId: body.customerId ?? o.customerId, salespersonId: body.salespersonId ?? o.salespersonId }, t);
    head.customerId = customer.id; head.salespersonId = salesperson.id;
  }
  for (const k of ['orderDate', 'deliveryDate', 'notes', 'taxRate']) if (body[k] !== undefined) head[k] = body[k];
  checkDates(head.orderDate ?? o.orderDate, head.deliveryDate !== undefined ? head.deliveryDate : o.deliveryDate);
  let rows;
  if (body.lines) {
    rows = await normalizeLines(req, body.lines, head.customerId ?? o.customerId, t);
    await SalesOrderLine.destroy({ where: { orderId: o.id }, transaction: t });
    await SalesOrderLine.bulkCreate(rows.map((r) => ({ ...r, orderId: o.id })), { transaction: t });
  } else if (head.taxRate !== undefined) {
    rows = (await SalesOrderLine.findAll({ where: { orderId: o.id }, transaction: t }))
      .map((l) => ({ quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent) }));
  }
  if (rows) Object.assign(head, totals(rows, head.taxRate ?? Number(o.taxRate)));
  await o.update(head, { transaction: t });
  await audit.log(req, { action: 'SALES_ORDER_UPDATED', entityType: 'SalesOrder', entityId: o.id, oldValues: old, newValues: { ...snap(o), ...(rows && { lines: rows.length }) } }, t);
  return o;
});

// Submit = create the approval request + submit it + lock the order, all in ONE transaction.
const submit = (req, id) => sequelize.transaction(async (t) => {
  const o = await load(id, t);
  mustOwn(req, o, 'submit');
  if (o.status !== 'DRAFT') throw new AppError(409, 'BAD_STATE', `Cannot submit an order that is ${o.status}`);
  const lines = await SalesOrderLine.findAll({ where: { orderId: o.id }, transaction: t });
  if (!lines.length) throw bad('lines', 'Add at least one item');
  const { customer } = await resolveParties(req, { customerId: o.customerId, salespersonId: o.salespersonId }, t);   // still active / still yours?
  const items = await Item.findAll({ where: { id: lines.map((l) => l.itemId) }, transaction: t });
  const inactive = items.find((i) => !i.isActive);
  if (inactive) throw bad('lines', `${inactive.sku} - ${inactive.name} is inactive. Remove it from the order.`);
  const withDiscount = lines.filter((l) => l.discountId);                       // a discount may have expired or been switched off since the draft was saved
  if (withDiscount.length) {
    const ds = new Map((await Discount.findAll({ where: { id: withDiscount.map((l) => l.discountId) }, transaction: t })).map((d) => [d.id, d]));
    const itemById = new Map(items.map((i) => [i.id, i])); const day = await discountSvc.today(t);
    for (const l of withDiscount) {
      const msg = discountSvc.check(ds.get(l.discountId), itemById.get(l.itemId), o.customerId, Number(l.quantity), day);
      if (msg) throw bad('lines', `${l.sku}: ${msg}. Edit the order and remove or replace the discount.`);
    }
  }
  const ar = await approvals.create(req, { type: 'SALES_ORDER', entityType: 'SalesOrder', entityId: o.id,
    payload: { orderNo: o.orderNo, customer: customer.name, lines: lines.length, total: o.total } }, t);
  await approvals.submit(req, ar.id, t);
  const old = snap(o);
  await o.update({ status: 'SUBMITTED', submittedAt: new Date(), approvalId: ar.id }, { transaction: t });
  await audit.log(req, { action: 'SALES_ORDER_SUBMITTED', entityType: 'SalesOrder', entityId: o.id, oldValues: old, newValues: snap(o) }, t);
  await workflow.start(req, o, ar.id, t);                              // Phase 4: opens (or re-opens after a return) the Salesperson -> Storekeeper -> Manager -> Salesperson workflow
  return o;
});

// Puts the stock of a CONFIRMED order back (reversing ledger entry).
async function restock(t, req, order) {
  const origLines = await StockDocumentLine.findAll({ where: { documentId: order.stockDocumentId }, order: [['itemId', 'ASC'], ['createdAt', 'ASC']], transaction: t });
  if (!origLines.length) throw new AppError(409, 'NO_STOCK_DOC', 'This order has no stock entries to reverse');
  const mv = await StockMovement.findAll({ where: { documentId: order.stockDocumentId }, attributes: ['lineId', 'unitCost'], transaction: t });
  const costOf = new Map(mv.map((m) => [m.lineId, m.unitCost]));
  const batchIds = origLines.map((l) => l.batchId).filter(Boolean);
  const batches = new Map((batchIds.length ? await StockBatch.findAll({ where: { id: batchIds }, transaction: t }) : []).map((b) => [b.id, b]));
  const doc = await StockDocument.create({ docNo: `SRT-${new Date().getFullYear()}-${String(await nextNo('stock_doc_seq', t)).padStart(6, '0')}`,
    type: 'SALE_CANCEL', status: 'DRAFT', partyName: null, reference: order.orderNo, reason: `Cancelled ${order.orderNo}`,
    approvalId: order.approvalId, createdBy: req.user.id }, { transaction: t });
  const lines = await StockDocumentLine.bulkCreate(origLines.map((l) => {
    const b = l.batchId ? batches.get(l.batchId) : null;
    return { documentId: doc.id, itemId: l.itemId, direction: 'IN', quantity: l.quantity, unitCost: costOf.get(l.id) ?? null,
      batchNo: b ? b.batchNo : null, expiryDate: b ? b.expiryDate : null, remarks: `Cancel ${order.orderNo}` };
  }), { transaction: t });
  await ledger.post(t, doc, lines, req.user.id);
  await doc.update({ status: 'POSTED', postedAt: new Date() }, { transaction: t });
  return doc;
}

const cancel = async (req, id, reason) => {
  const peek = await load(id);
  if (peek.status === 'SUBMITTED') {                                  // the approval service closes the order through the onCancel hook
    mustOwn(req, peek, 'cancel');
    await approvals.cancel(req, peek.approvalId);
    return load(id);
  }
  return sequelize.transaction(async (t) => {
    const o = await load(id, t);
    const old = snap(o);
    if (o.status === 'DRAFT') {
      mustOwn(req, o, 'cancel');
      await o.update({ status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason ?? null }, { transaction: t });
      await audit.log(req, { action: 'SALES_ORDER_CANCELLED', entityType: 'SalesOrder', entityId: o.id, oldValues: old, newValues: snap(o), reason }, t);
      await workflow.onOrderCancelled(req, o, t, reason);                 // closes a RETURNED workflow too
    } else if (o.status === 'CONFIRMED') {
      if (!can(req, 'sales_orders.approve')) throw new AppError(403, 'FORBIDDEN', 'Only an approver can cancel a confirmed order');
      if (!reason || reason.trim().length < 3) throw bad('reason', 'A reason is required to cancel a confirmed order');
      const efd = await EfdReceipt.findOne({ where: { salesOrderId: o.id, status: 'ISSUED' }, transaction: t });
      if (efd) throw new AppError(409, 'EFD_ISSUED', `This order has EFD receipt ${efd.receiptNo}. Void the EFD receipt first, then cancel the order.`);
      const doc = await restock(t, req, o);
      await o.update({ status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason, cancelDocumentId: doc.id }, { transaction: t });
      await audit.log(req, { action: 'SALES_ORDER_CANCELLED', entityType: 'SalesOrder', entityId: o.id, oldValues: old,
        newValues: { ...snap(o), restockDocument: doc.docNo }, reason }, t);
      await workflow.onOrderCancelled(req, o, t, reason);
    } else throw new AppError(409, 'BAD_STATE', `Cannot cancel an order that is ${o.status}`);
    return o;
  });
};

// Draft / rejected orders, and cancelled orders that never moved stock, can be deleted by the creator or the Owner.
const remove = (req, id) => sequelize.transaction(async (t) => {
  const o = await load(id, t);
  if (o.createdBy !== req.user.id && req.user.role !== 'OWNER') throw new AppError(403, 'FORBIDDEN', 'Only the creator or the Owner can delete this order');
  if (!['DRAFT', 'CANCELLED', 'REJECTED'].includes(o.status) || o.stockDocumentId)
    throw new AppError(409, 'BAD_STATE', 'Only draft, rejected or cancelled orders without stock history can be deleted. Confirmed orders are kept as a permanent record.');
  const old = { ...snap(o), lines: await SalesOrderLine.count({ where: { orderId: o.id }, transaction: t }) };
  await o.destroy({ transaction: t });
  await audit.log(req, { action: 'SALES_ORDER_DELETED', entityType: 'SalesOrder', entityId: id, oldValues: old }, t);
});

/* ---------- approval hooks: run inside services/approvals.js's transaction ---------- */
// FEFO: for items that track expiry, take stock from the batches that expire first, and never from expired batches.
async function allocate(t, lines, items, today) {
  const out = [];
  for (const l of lines) {
    const item = items.get(l.itemId);
    const label = `${item.sku} - ${item.name}`;
    if (!item.isActive) throw new AppError(409, 'ITEM_INACTIVE', `${label} is inactive and cannot be sold`);
    if (!item.trackExpiry) { out.push({ itemId: item.id, direction: 'OUT', quantity: l.quantity }); continue; }
    const batches = await StockBatch.findAll({ where: { itemId: item.id, quantity: { [Op.gt]: 0 }, expiryDate: { [Op.gte]: today } },
      order: [['expiryDate', 'ASC'], ['batchNo', 'ASC']], transaction: t, lock: t.LOCK.UPDATE });
    let need = Math.round(Number(l.quantity) * 1000); const wanted = need;
    for (const b of batches) {
      if (need <= 0) break;
      const take = Math.min(need, Math.round(Number(b.quantity) * 1000));
      out.push({ itemId: item.id, direction: 'OUT', quantity: (take / 1000).toFixed(3), batchId: b.id }); need -= take;
    }
    if (need > 0) {
      const avail = (wanted - need) / 1000;
      throw new AppError(409, 'INSUFFICIENT_STOCK', `Insufficient non-expired stock for ${label}: ${avail} available, ${Number(l.quantity)} requested`);
    }
  }
  return out;
}

const confirmOrder = async (r, ctx) => {
  const t = ctx.transaction;
  const o = await SalesOrder.findByPk(r.entityId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!o || o.status !== 'SUBMITTED') throw new AppError(409, 'BAD_STATE', 'This sales order is not waiting for approval');
  const [customer, sp] = await Promise.all([Customer.findByPk(o.customerId, { transaction: t }), Salesperson.findByPk(o.salespersonId, { transaction: t })]);
  if (!customer.isActive) throw new AppError(409, 'CUSTOMER_INACTIVE', 'The customer of this order is inactive');
  if (!sp.isActive) throw new AppError(409, 'SALESPERSON_INACTIVE', 'The salesperson of this order is inactive');
  const lines = await SalesOrderLine.findAll({ where: { orderId: o.id }, order: [['itemId', 'ASC']], transaction: t });
  const itemRows = await Item.findAll({ where: { id: lines.map((l) => l.itemId) }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE }); // same lock order as the ledger
  const items = new Map(itemRows.map((i) => [i.id, i]));
  const [{ d: today }] = (await sequelize.query("SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS d", { transaction: t }))[0];
  const alloc = await allocate(t, lines, items, today);
  const doc = await StockDocument.create({ docNo: `SAL-${new Date().getFullYear()}-${String(await nextNo('stock_doc_seq', t)).padStart(6, '0')}`,
    type: 'SALE', status: 'DRAFT', partyName: customer.name, reference: o.orderNo, approvalId: r.id, createdBy: ctx.user.id }, { transaction: t });
  const docLines = await StockDocumentLine.bulkCreate(alloc.map((a) => ({ ...a, documentId: doc.id, remarks: o.orderNo })), { transaction: t });
  await ledger.post(t, doc, docLines, ctx.user.id);
  await doc.update({ status: 'POSTED', postedAt: new Date() }, { transaction: t });
  const old = snap(o);
  await o.update({ status: 'CONFIRMED', confirmedAt: new Date(), stockDocumentId: doc.id }, { transaction: t });
  await audit.log(ctx.req, { action: 'SALES_ORDER_CONFIRMED', entityType: 'SalesOrder', entityId: o.id, oldValues: old,
    newValues: { ...snap(o), stockDocument: doc.docNo, stockLines: docLines.length } }, t);
};
const closeOrder = (status, action) => async (r, ctx) => {
  const t = ctx.transaction;
  const o = await SalesOrder.findByPk(r.entityId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!o || o.status !== 'SUBMITTED') return;
  await o.update({ status, ...(status === 'CANCELLED' && { cancelledAt: new Date() }) }, { transaction: t });
  await audit.log(ctx.req, { action, entityType: 'SalesOrder', entityId: o.id, oldValues: { status: 'SUBMITTED' },
    newValues: { status, orderNo: o.orderNo }, reason: r.decisionNote || undefined }, t);
};
approvals.register('SALES_ORDER', { label: 'Sales order', approvePermission: 'sales_orders.approve',
  execute: confirmOrder, onReject: closeOrder('REJECTED', 'SALES_ORDER_REJECTED'), onCancel: closeOrder('CANCELLED', 'SALES_ORDER_CANCELLED') });

module.exports = { create, update, submit, cancel, remove, totals, normalizeLines };
