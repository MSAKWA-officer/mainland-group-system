const { Op, literal } = require('sequelize');
const { StockLevel, Item, Category, StockBatch } = require('../models');
const { AppError } = require('../utils/errors');
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
  const { includeEmpty } = req.query;
  const item = await Item.findByPk(req.params.itemId, { attributes: ['id'] });
  if (!item) throw new AppError(404, 'NOT_FOUND', 'Item not found');
  const rows = await StockBatch.findAll({ where: { itemId: item.id, ...(!includeEmpty && { quantity: { [Op.gt]: 0 } }) }, order: [['expiryDate', 'ASC']] });
  const t = today();
  res.json(rows.map((b) => ({ ...b.toJSON(), expired: b.expiryDate < t })));
};

// Every batch of an item that tracks expiry, filled automatically by stock receiving. Feeds the Expired list.
// status: expired (date passed), soon (within `days`, default 30), valid.
exports.expiryBatches = async (req, res) => {
  const { days, includeEmpty } = req.query; const soon = days ?? 30;
  const rows = await StockBatch.findAll({ where: includeEmpty ? {} : { quantity: { [Op.gt]: 0 } }, order: [['expiryDate', 'ASC']],
    include: [{ model: Item, as: 'item', required: true, where: { trackExpiry: true }, attributes: ['id', 'sku', 'name', 'unit'] }] });
  const t = today(); const limit = new Date(Date.now() + soon * 864e5).toISOString().slice(0, 10);
  res.json(rows.map((b) => ({ ...b.toJSON(), status: b.expiryDate < t ? 'expired' : b.expiryDate <= limit ? 'soon' : 'valid' })));
};
