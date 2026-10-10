const { Op } = require('sequelize');
const { sequelize, Customer, Salesperson, Item, StockBatch, StockDocument, StockDocumentLine, StockMovement } = require('../models');
const ledger = require('./stockLedger');
const { mine, canAll } = require('./salesScope');
const { AppError } = require('../utils/errors');

/* Shared building blocks for Cash sales and Credit sales (money maths, customer/salesperson rules, price rules, FEFO stock issue, restock).
   All money is calculated here on the server with BigInt cents; amounts sent by the client are never trusted. */
const TYPES = { CASH: { perm: 'cash_sales', prefix: 'CSH' }, CREDIT: { perm: 'credit_sales', prefix: 'CRS' } };
const bad = (field, message) => new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field, message }]);
const can = (req, p) => req.user.permissions.has(p);
const year = () => new Date().getFullYear();
const pad = (n) => String(n).padStart(6, '0');
const nextNo = async (seq, t) => (await sequelize.query(`SELECT nextval('${seq}') AS n`, { transaction: t }))[0][0].n;
const dbToday = async (t, plusDays = 0) =>
  (await sequelize.query("SELECT to_char(CURRENT_DATE + CAST(:d AS int), 'YYYY-MM-DD') AS d", { transaction: t, replacements: { d: plusDays } }))[0][0].d;

/* ---------- money ---------- */
const half = (num, den) => (num * 2n + den) / (2n * den);                       // divide, rounding half up (values are never negative)
const lineCents = (qty, price, disc) => half(BigInt(Math.round(qty * 1000)) * BigInt(Math.round(price * 100)) * (10000n - BigInt(Math.round(disc * 100))), 10000000n);
const grossCents = (qty, price) => half(BigInt(Math.round(qty * 1000)) * BigInt(Math.round(price * 100)), 1000n);
const str = (c) => `${c / 100n}.${String(c % 100n).padStart(2, '0')}`;
const cents = (v) => BigInt(Math.round(Number(v) * 100));
function totals(rows, taxRate) {
  let gross = 0n; let net = 0n;
  for (const r of rows) { gross += grossCents(r.quantity, r.unitPrice); net += lineCents(r.quantity, r.unitPrice, r.discountPercent); }
  const tax = half(net * BigInt(Math.round(taxRate * 100)), 10000n);
  return { subtotal: str(gross), discountTotal: str(gross - net), taxTotal: str(tax), total: str(net + tax) };
}
const paymentStatus = (total, paid) => (cents(paid) <= 0n ? 'UNPAID' : cents(paid) >= cents(total) ? 'PAID' : 'PARTIAL');

const snap = (s) => ({ saleNo: s.saleNo, saleType: s.saleType, status: s.status, customerId: s.customerId, walkInName: s.walkInName, salespersonId: s.salespersonId,
  saleDate: s.saleDate, dueDate: s.dueDate, taxRate: s.taxRate, total: s.total, amountPaid: s.amountPaid, paymentStatus: s.paymentStatus, notes: s.notes });

/* ---------- customer + salesperson rules ---------- */
// A user without `<type>.read_all` may only sell to their own customers and only as themselves.
// CASH may be a walk-in (no customer). CREDIT always needs a customer and a salesperson.
async function resolveParties(req, type, { customerId, salespersonId }, t) {
  const readAll = `${TYPES[type].perm}.read_all`;
  const all = canAll(req, readAll);
  const me = all ? null : await mine(req);
  if (!all && !me) throw new AppError(403, 'NO_SALESPERSON_PROFILE', 'Your account is not linked to a salesperson profile. Ask an administrator to link it.');
  let customer = null;
  if (customerId) {
    customer = await Customer.findByPk(customerId, { transaction: t });
    if (!customer || (!all && customer.salespersonId !== me.id)) throw bad('customerId', 'Customer not found');   // someone else's customer looks like "not found"
    if (!customer.isActive) throw bad('customerId', 'This customer is inactive');
  } else if (type === 'CREDIT') throw bad('customerId', 'Choose a customer for a credit sale');
  let spId;
  if (!all) {
    if (salespersonId && salespersonId !== me.id) throw new AppError(403, 'FORBIDDEN', 'You can only sell as yourself');
    spId = me.id;
  } else spId = salespersonId || customer?.salespersonId || (await mine(req))?.id || null;
  let salesperson = null;
  if (spId) {
    salesperson = await Salesperson.findByPk(spId, { transaction: t });
    if (!salesperson) throw bad('salespersonId', 'Salesperson not found');
    if (!salesperson.isActive) throw bad('salespersonId', 'This salesperson is inactive');
  } else if (type === 'CREDIT') throw bad('salespersonId', 'Choose a salesperson for this sale');
  return { customer, salesperson };
}

/* ---------- lines ---------- */
// Validates lines against live item data and prices them. Only users holding `<type>.set_price` may change a price or give a discount.
async function normalizeLines(req, type, lines, t) {
  const seen = new Set();
  lines.forEach((l, i) => { if (seen.has(l.itemId)) throw bad(`lines.${i}.itemId`, 'This item is already on the sale. Change its quantity instead.'); seen.add(l.itemId); });
  const items = await Item.findAll({ where: { id: [...seen] }, transaction: t });
  const byId = new Map(items.map((i) => [i.id, i]));
  const setPrice = can(req, `${TYPES[type].perm}.set_price`);
  const rows = lines.map((l, i) => {
    const f = (k) => `lines.${i}.${k}`;
    const item = byId.get(l.itemId);
    if (!item) throw bad(f('itemId'), 'Item not found');
    if (!item.isActive) throw bad(f('itemId'), 'This item is inactive and cannot be sold');
    const catalog = Number(item.sellingPrice);
    if (l.unitPrice != null && !setPrice && Number(l.unitPrice) !== catalog) throw new AppError(403, 'FORBIDDEN', 'You are not allowed to change prices');
    const unitPrice = l.unitPrice ?? catalog;
    if (unitPrice <= 0) throw bad(f('unitPrice'), 'This item has no selling price yet');
    const discountPercent = l.discountPercent ?? 0;
    if (discountPercent > 0 && !setPrice) throw new AppError(403, 'FORBIDDEN', 'You are not allowed to give discounts');
    return { itemId: item.id, sku: item.sku, itemName: item.name, unit: item.unit, quantity: l.quantity, unitPrice, discountPercent,
      lineTotal: str(lineCents(l.quantity, unitPrice, discountPercent)) };
  });
  return rows.sort((a, b) => (a.itemId < b.itemId ? -1 : 1));      // same lock order as the stock ledger (no deadlocks)
}

/* ---------- stock (through the Phase 2 ledger) ---------- */
// FEFO: for items that track expiry, take stock from the batches that expire first, never from expired batches.
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
    if (need > 0) throw new AppError(409, 'INSUFFICIENT_STOCK',
      `Insufficient non-expired stock for ${label}: ${(wanted - need) / 1000} available, ${Number(l.quantity)} requested`);
  }
  return out;
}

// Issues stock for a sale (creates + posts a SALE stock document). Must run inside the caller's transaction.
async function issueStock(t, req, sale, lines, partyName, approvalId = null) {
  const sorted = [...lines].sort((a, b) => (a.itemId < b.itemId ? -1 : 1));
  const itemRows = await Item.findAll({ where: { id: sorted.map((l) => l.itemId) }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE });
  const items = new Map(itemRows.map((i) => [i.id, i]));
  const alloc = await allocate(t, sorted, items, await dbToday(t));
  const doc = await StockDocument.create({ docNo: `SAL-${year()}-${pad(await nextNo('stock_doc_seq', t))}`, type: 'SALE', status: 'DRAFT',
    partyName: partyName || null, reference: sale.saleNo, approvalId, createdBy: req.user.id }, { transaction: t });
  const docLines = await StockDocumentLine.bulkCreate(alloc.map((a) => ({ ...a, documentId: doc.id, remarks: sale.saleNo })), { transaction: t });
  await ledger.post(t, doc, docLines, req.user.id);
  await doc.update({ status: 'POSTED', postedAt: new Date() }, { transaction: t });
  return { doc, stockLines: docLines.length };
}

// Puts the stock of a COMPLETED sale back (reversing ledger entry, same batches, same cost).
async function restock(t, req, sale, reason) {
  const origLines = await StockDocumentLine.findAll({ where: { documentId: sale.stockDocumentId }, order: [['itemId', 'ASC'], ['createdAt', 'ASC']], transaction: t });
  if (!origLines.length) throw new AppError(409, 'NO_STOCK_DOC', 'This sale has no stock entries to reverse');
  const mv = await StockMovement.findAll({ where: { documentId: sale.stockDocumentId }, attributes: ['lineId', 'unitCost'], transaction: t });
  const costOf = new Map(mv.map((m) => [m.lineId, m.unitCost]));
  const batchIds = origLines.map((l) => l.batchId).filter(Boolean);
  const batches = new Map((batchIds.length ? await StockBatch.findAll({ where: { id: batchIds }, transaction: t }) : []).map((b) => [b.id, b]));
  const doc = await StockDocument.create({ docNo: `SRT-${year()}-${pad(await nextNo('stock_doc_seq', t))}`, type: 'SALE_CANCEL', status: 'DRAFT',
    reference: sale.saleNo, reason: `Voided ${sale.saleNo}: ${reason}`.slice(0, 500), approvalId: sale.approvalId, createdBy: req.user.id }, { transaction: t });
  const lines = await StockDocumentLine.bulkCreate(origLines.map((l) => {
    const b = l.batchId ? batches.get(l.batchId) : null;
    return { documentId: doc.id, itemId: l.itemId, direction: 'IN', quantity: l.quantity, unitCost: costOf.get(l.id) ?? null,
      batchNo: b ? b.batchNo : null, expiryDate: b ? b.expiryDate : null, remarks: `Void ${sale.saleNo}` };
  }), { transaction: t });
  await ledger.post(t, doc, lines, req.user.id);
  await doc.update({ status: 'POSTED', postedAt: new Date() }, { transaction: t });
  return doc;
}

module.exports = { TYPES, bad, can, year, pad, nextNo, dbToday, totals, cents, str, paymentStatus, snap, resolveParties, normalizeLines, issueStock, restock };
