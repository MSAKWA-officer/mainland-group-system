const { Op, literal, QueryTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
const { StockLevel, Item, Category, StockBatch } = require('../models');
const { AppError } = require('../utils/errors');
const wh = require('../services/warehouses');
const { like } = require('../utils/schemas');

// Item fields visible in stock screens. Cost price is never exposed here (see stock_reports.valuation).
const itemAttrs = ['id', 'sku', 'name', 'barcode', 'unit', 'reorderLevel', 'sellingPrice', 'trackExpiry', 'isActive', 'categoryId'];
const today = () => new Date().toISOString().slice(0, 10);

/* ---- Stock levels, warehouse aware ----
   - ?warehouseId=...  : quantities of ONE warehouse (the user must be in charge of it; Managers / Owner may look at any). Reorder level = that
                         warehouse's own level when one is set, otherwise the item's default.
   - no warehouseId    : Managers / Owner see the company total (stock_levels). Everybody else sees the sum of THEIR warehouses only,
                         so a storekeeper never sees the stock of a warehouse he is not in charge of.
   Either way each row also carries `warehouses`: where the stock sits (only the warehouses the user may see). */
const NONE = 'There is no warehouse assigned to you yet';

exports.list = async (req, res) => {
  const { search, categoryId, status, isActive, warehouseId, page, limit } = req.query;
  if (warehouseId) await wh.access(req, warehouseId);             // 403 when the warehouse is not the user's
  const mine = warehouseId ? [warehouseId] : await wh.scope(req);  // null = every warehouse
  if (mine && !mine.length) return res.json({ data: [], total: 0, page, limit, warehouseId: null, scopedTo: [], message: NONE });

  const rep = { limit, offset: (page - 1) * limit };
  const where = ['1 = 1'];
  if (categoryId) { where.push('i.category_id = :categoryId'); rep.categoryId = categoryId; }
  if (isActive !== undefined) { where.push('i.is_active = :isActive'); rep.isActive = isActive; }
  if (search) { where.push('(i.name ILIKE :s OR i.sku ILIKE :s OR i.barcode ILIKE :s)'); rep.s = like(search); }

  let qtyExpr; let reorderExpr; let joins = '';
  if (warehouseId) {
    rep.w = warehouseId;
    joins = 'LEFT JOIN warehouse_stock ws ON ws.item_id = i.id AND ws.warehouse_id = :w LEFT JOIN warehouse_item_settings wis ON wis.item_id = i.id AND wis.warehouse_id = :w';
    qtyExpr = 'COALESCE(ws.quantity, 0)'; reorderExpr = 'COALESCE(wis.reorder_level, i.reorder_level)';
  } else if (mine) {
    rep.mine = mine;
    qtyExpr = 'COALESCE((SELECT SUM(x.quantity) FROM warehouse_stock x WHERE x.item_id = i.id AND x.warehouse_id IN (:mine)), 0)'; reorderExpr = 'i.reorder_level';
  } else {
    joins = 'LEFT JOIN stock_levels sl ON sl.item_id = i.id';
    qtyExpr = 'COALESCE(sl.quantity, 0)'; reorderExpr = 'i.reorder_level';
  }
  const inner = `SELECT i.id, i.sku, i.name, i.barcode, i.unit, i.selling_price, i.track_expiry, i.is_active, i.category_id, c.name AS category_name,
      ${qtyExpr} AS quantity, ${reorderExpr} AS reorder_level, i.reorder_level AS item_reorder_level,
      ${warehouseId ? '(wis.item_id IS NOT NULL)' : 'FALSE'} AS reorder_custom
    FROM items i LEFT JOIN categories c ON c.id = i.category_id ${joins} WHERE ${where.join(' AND ')}`;
  const cond = status === 'out' ? 'x.quantity = 0' : status === 'in_stock' ? 'x.quantity > 0'
    : status === 'low' ? 'x.reorder_level > 0 AND x.quantity <= x.reorder_level' : 'TRUE';

  const [{ n }] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM (${inner}) x WHERE ${cond}`, { replacements: rep, type: QueryTypes.SELECT });
  const rows = await sequelize.query(`SELECT x.* FROM (${inner}) x WHERE ${cond} ORDER BY x.name ASC, x.id ASC LIMIT :limit OFFSET :offset`, { replacements: rep, type: QueryTypes.SELECT });

  // Where the stock sits, for the items on this page.
  const by = {};
  if (rows.length) {
    (await sequelize.query(`SELECT ws.item_id AS "itemId", w.id, w.code, w.name, ws.quantity FROM warehouse_stock ws JOIN warehouses w ON w.id = ws.warehouse_id
      WHERE ws.item_id IN (:ids) AND ws.quantity > 0 ${mine ? 'AND ws.warehouse_id IN (:mine)' : ''} ORDER BY w.name`,
    { replacements: { ids: rows.map((r) => r.id), ...(mine && { mine }) }, type: QueryTypes.SELECT }))
      .forEach((r) => { (by[r.itemId] ||= []).push({ id: r.id, code: r.code, name: r.name, quantity: r.quantity }); });
  }
  const data = rows.map((r) => ({
    itemId: r.id, quantity: r.quantity, reorderCustom: r.reorder_custom, warehouses: by[r.id] || [],
    item: { id: r.id, sku: r.sku, name: r.name, barcode: r.barcode, unit: r.unit, reorderLevel: r.reorder_level, itemReorderLevel: r.item_reorder_level,
      sellingPrice: r.selling_price, trackExpiry: r.track_expiry, isActive: r.is_active, categoryId: r.category_id,
      category: r.category_id ? { id: r.category_id, name: r.category_name } : null },
  }));
  res.json({ data, total: n, page, limit, warehouseId: warehouseId || null, scopedTo: mine || null });
};

// One item: the quantity the user may see, where it sits, and its batches (a user restricted to some warehouses only sees the batches held there).
exports.getOne = async (req, res) => {
  const row = await StockLevel.findByPk(req.params.itemId, { include: [{ model: Item, as: 'item', attributes: itemAttrs,
    include: [{ model: Category, as: 'category', attributes: ['id', 'name'] }] }] });
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Item not found');
  const mine = await wh.scope(req);
  const out = row.toJSON();
  const rep = { i: row.itemId, ...(mine && { mine }) };
  const none = mine && !mine.length;
  out.warehouses = none ? [] : await sequelize.query(`SELECT w.id, w.code, w.name, ws.quantity FROM warehouse_stock ws JOIN warehouses w ON w.id = ws.warehouse_id
    WHERE ws.item_id = :i AND ws.quantity > 0 ${mine ? 'AND ws.warehouse_id IN (:mine)' : ''} ORDER BY w.name`, { replacements: rep, type: QueryTypes.SELECT });
  if (mine) out.quantity = out.warehouses.reduce((a, w) => a + Number(w.quantity), 0);
  if (row.item.trackExpiry) {
    out.batches = !mine ? await StockBatch.findAll({ where: { itemId: row.itemId, quantity: { [Op.gt]: 0 } }, order: [['expiryDate', 'ASC']] })
      : none ? [] : await sequelize.query(`SELECT b.id, b.item_id AS "itemId", b.batch_no AS "batchNo", b.expiry_date AS "expiryDate", SUM(wsb.quantity) AS quantity
        FROM warehouse_stock_batches wsb JOIN stock_batches b ON b.id = wsb.batch_id
        WHERE b.item_id = :i AND wsb.quantity > 0 AND wsb.warehouse_id IN (:mine) GROUP BY b.id ORDER BY b.expiry_date`, { replacements: rep, type: QueryTypes.SELECT });
  }
  res.json(out);
};

exports.batches = async (req, res) => {
  const { includeEmpty, warehouseId } = req.query;
  const item = await Item.findByPk(req.params.itemId, { attributes: ['id'] });
  if (!item) throw new AppError(404, 'NOT_FOUND', 'Item not found');
  const t = today();
  if (warehouseId) {                                    // batches (and quantities) of ONE warehouse, so a document posts against what that warehouse really holds
    await wh.access(req, warehouseId);                  // a storekeeper may only look at his own warehouses
    const rows = await sequelize.query(
      `SELECT b.id, b.item_id AS "itemId", b.batch_no AS "batchNo", b.expiry_date AS "expiryDate", wsb.quantity
         FROM warehouse_stock_batches wsb JOIN stock_batches b ON b.id = wsb.batch_id
        WHERE wsb.warehouse_id = :w AND b.item_id = :i ${includeEmpty ? '' : 'AND wsb.quantity > 0'} ORDER BY b.expiry_date ASC`,
      { replacements: { w: warehouseId, i: item.id }, type: QueryTypes.SELECT });
    return res.json(rows.map((b) => ({ ...b, expired: b.expiryDate < t })));
  }
  const rows = await StockBatch.findAll({ where: { itemId: item.id, ...(!includeEmpty && { quantity: { [Op.gt]: 0 } }) }, order: [['expiryDate', 'ASC']] });
  res.json(rows.map((b) => ({ ...b.toJSON(), expired: b.expiryDate < t })));
};

/* ---- Expired list: every batch of an item that tracks expiry, created automatically by stock receiving ---- */
const statusOf = (expiryDate, soon) => {
  const t = today(); const limit = new Date(Date.now() + soon * 864e5).toISOString().slice(0, 10);
  return expiryDate < t ? 'expired' : expiryDate <= limit ? 'soon' : 'valid';
};
const batchItem = { model: Item, as: 'item', required: true, where: { trackExpiry: true }, attributes: ['id', 'sku', 'name', 'unit'] };
// Receiving documents that brought stock into the given batches (oldest first).
const receipts = (ids) => (ids.length ? sequelize.query(
  `SELECT m.batch_id AS "batchId", d.id AS "documentId", d.doc_no AS "docNo", d.doc_date AS "docDate", d.reference, d.party_name AS "partyName",
          d.reason AS notes, m.quantity, u.full_name AS "receivedBy"
     FROM stock_movements m JOIN stock_documents d ON d.id = m.document_id LEFT JOIN users u ON u.id = d.created_by
    WHERE m.batch_id IN (:ids) AND m.movement_type = 'RECEIVING' AND m.direction = 'IN'
    ORDER BY m.occurred_at ASC`, { replacements: { ids }, type: QueryTypes.SELECT }) : Promise.resolve([]));

// Warehouses that hold each batch right now, as { batchId: [{ id, code, name, quantity }] }.
const holders = async (ids) => {
  const by = {};
  if (!ids.length) return by;
  (await sequelize.query(
    `SELECT wsb.batch_id AS "batchId", w.id, w.code, w.name, wsb.quantity FROM warehouse_stock_batches wsb JOIN warehouses w ON w.id = wsb.warehouse_id
      WHERE wsb.batch_id IN (:ids) AND wsb.quantity > 0 ORDER BY w.name`, { replacements: { ids }, type: QueryTypes.SELECT }))
    .forEach((r) => { (by[r.batchId] ||= []).push({ id: r.id, code: r.code, name: r.name, quantity: r.quantity }); });
  return by;
};

exports.expiryBatches = async (req, res) => {
  const { days, includeEmpty } = req.query; const soon = days ?? 30;
  const rows = await StockBatch.findAll({ where: includeEmpty ? {} : { quantity: { [Op.gt]: 0 } }, order: [['expiryDate', 'ASC']], include: [batchItem] });
  const first = new Map();
  (await receipts(rows.map((b) => b.id))).forEach((r) => { if (!first.has(r.batchId)) first.set(r.batchId, r); });
  const where = await holders(rows.map((b) => b.id));
  res.json(rows.map((b) => { const r = first.get(b.id);
    return { ...b.toJSON(), warehouses: where[b.id] || [], dateReceived: r?.docDate || String(b.createdAt.toISOString()).slice(0, 10), status: statusOf(b.expiryDate, soon) }; }));
};

// One batch with everything else about it: item, every receiving document and every expired write-off.
exports.expiryBatch = async (req, res) => {
  const b = await StockBatch.findByPk(req.params.batchId, { include: [{ ...batchItem, attributes: ['id', 'sku', 'name', 'unit', 'barcode'] }] });
  if (!b) throw new AppError(404, 'NOT_FOUND', 'Batch not found');
  const recv = await receipts([b.id]);
  const writeOffs = await sequelize.query(
    `SELECT d.id, d.doc_no AS "docNo", d.doc_date AS "docDate", d.reference, d.reason AS notes, d.status, l.quantity, l.remarks, u.full_name AS "createdBy"
       FROM stock_document_lines l JOIN stock_documents d ON d.id = l.document_id LEFT JOIN users u ON u.id = d.created_by
      WHERE l.batch_id = :id AND d.type = 'EXPIRED' ORDER BY d.created_at DESC`, { replacements: { id: b.id }, type: QueryTypes.SELECT });
  const days = Math.round((new Date(b.expiryDate) - new Date(today())) / 864e5);
  const where = await holders([b.id]);
  res.json({ ...b.toJSON(), warehouses: where[b.id] || [], dateReceived: recv[0]?.docDate || String(b.createdAt.toISOString()).slice(0, 10), status: statusOf(b.expiryDate, 30), daysToExpiry: days,
    receipts: recv, writeOffs });
};
