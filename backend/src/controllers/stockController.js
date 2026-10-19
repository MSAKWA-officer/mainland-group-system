const { Op, literal, QueryTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
const { StockLevel, Item, Category, StockBatch } = require('../models');
const { AppError } = require('../utils/errors');
const wh = require('../services/warehouses');
const { like } = require('../utils/schemas');

// Item fields visible in stock screens. Cost price is never exposed here (see stock_reports.valuation).
const itemAttrs = ['id', 'sku', 'name', 'barcode', 'unit', 'reorderLevel', 'sellingPrice', 'trackExpiry', 'isActive', 'categoryId'];
const today = () => new Date().toISOString().slice(0, 10);

exports.list = async (req, res) => {
  const { search, categoryId, status, isActive, page, limit } = req.query;
  const itemWhere = {};
  if (categoryId) itemWhere.categoryId = categoryId;
  if (isActive !== undefined) itemWhere.isActive = isActive;
  if (search) itemWhere[Op.or] = ['name', 'sku', 'barcode'].map((f) => ({ [f]: { [Op.iLike]: like(search) } }));
  const where = [];
  if (status === 'out') where.push({ quantity: 0 });
  if (status === 'in_stock') where.push({ quantity: { [Op.gt]: 0 } });
  if (status === 'low') where.push(literal('"item"."reorder_level" > 0 AND "StockLevel"."quantity" <= "item"."reorder_level"'));
  const { rows, count } = await StockLevel.findAndCountAll({
    where: where.length ? { [Op.and]: where } : undefined,
    include: [{ model: Item, as: 'item', required: true, where: itemWhere, attributes: itemAttrs,
      include: [{ model: Category, as: 'category', attributes: ['id', 'name'] }] }],
    order: [[{ model: Item, as: 'item' }, 'name', 'ASC']], limit, offset: (page - 1) * limit,
  });
  res.json({ data: rows, total: count, page, limit });
};

exports.getOne = async (req, res) => {
  const row = await StockLevel.findByPk(req.params.itemId, { include: [{ model: Item, as: 'item', attributes: itemAttrs,
    include: [{ model: Category, as: 'category', attributes: ['id', 'name'] }] }] });
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Item not found');
  const out = row.toJSON();
  if (row.item.trackExpiry) out.batches = await StockBatch.findAll({ where: { itemId: row.itemId, quantity: { [Op.gt]: 0 } }, order: [['expiryDate', 'ASC']] });
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

exports.expiryBatches = async (req, res) => {
  const { days, includeEmpty } = req.query; const soon = days ?? 30;
  const rows = await StockBatch.findAll({ where: includeEmpty ? {} : { quantity: { [Op.gt]: 0 } }, order: [['expiryDate', 'ASC']], include: [batchItem] });
  const first = new Map();
  (await receipts(rows.map((b) => b.id))).forEach((r) => { if (!first.has(r.batchId)) first.set(r.batchId, r); });
  res.json(rows.map((b) => { const r = first.get(b.id);
    return { ...b.toJSON(), dateReceived: r?.docDate || String(b.createdAt.toISOString()).slice(0, 10), status: statusOf(b.expiryDate, soon) }; }));
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
  res.json({ ...b.toJSON(), dateReceived: recv[0]?.docDate || String(b.createdAt.toISOString()).slice(0, 10), status: statusOf(b.expiryDate, 30), daysToExpiry: days,
    receipts: recv, writeOffs });
};
