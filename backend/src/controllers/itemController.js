const { Op, QueryTypes } = require('sequelize');
const { sequelize, Item, Category, StockLevel, StockBatch, StockMovement, StockDocumentLine } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('../services/audit');
const wh = require('../services/warehouses');

const canCost = (req) => req.user.permissions.has('items.view_cost');
const pub = (i, req) => { const o = i.toJSON(); if (!canCost(req)) delete o.costPrice; return o; };
const inc = [{ model: Category, as: 'category', attributes: ['id', 'name'] }, { model: StockLevel, as: 'stock', attributes: ['quantity'] }];
const audited = (i) => ({ sku: i.sku, name: i.name, description: i.description, barcode: i.barcode, categoryId: i.categoryId, unit: i.unit,
  costPrice: i.costPrice, sellingPrice: i.sellingPrice, reorderLevel: i.reorderLevel, trackExpiry: i.trackExpiry, isActive: i.isActive });
const find = async (id, t) => {
  const i = await Item.findByPk(id, { transaction: t, ...(t && { lock: t.LOCK.UPDATE }) });
  if (!i) throw new AppError(404, 'NOT_FOUND', 'Item not found');
  return i;
};
const show = (id) => Item.findByPk(id, { include: inc });
const hasActivity = async (itemId, t) =>
  (await StockMovement.count({ where: { itemId }, transaction: t })) + (await StockDocumentLine.count({ where: { itemId }, transaction: t })) > 0;
const mustSetCost = (req) => {
  if (req.body.costPrice !== undefined && !canCost(req)) throw new AppError(403, 'FORBIDDEN', 'You are not allowed to set the cost price');
};
const activeCategory = async (id, t) => {
  const c = await Category.findByPk(id, { transaction: t });
  if (!c || !c.isActive) throw new AppError(400, 'BAD_CATEGORY', 'Choose an active category');
};

// Restricted users (a salesperson) only see items that sit in their own warehouse(s), with the quantity of THOSE warehouses.
const itemIdsOf = async (mine) => (mine.length
  ? (await sequelize.query('SELECT DISTINCT item_id FROM warehouse_stock WHERE warehouse_id IN (:mine)', { replacements: { mine }, type: QueryTypes.SELECT })).map((r) => r.item_id)
  : []);
const qtyIn = async (ids, mine) => {
  const by = {};
  if (!ids.length || !mine.length) return by;
  (await sequelize.query('SELECT item_id, SUM(quantity)::text AS q FROM warehouse_stock WHERE item_id IN (:ids) AND warehouse_id IN (:mine) GROUP BY item_id',
    { replacements: { ids, mine }, type: QueryTypes.SELECT })).forEach((r) => { by[r.item_id] = r.q; });
  return by;
};

exports.list = async (req, res) => {
  const { search, categoryId, isActive, trackExpiry, page, limit } = req.query; const where = {};
  const mine = await wh.itemScope(req);                                   // null = whole catalogue
  if (mine) where.id = { [Op.in]: await itemIdsOf(mine) };
  if (categoryId) where.categoryId = categoryId;
  if (isActive !== undefined) where.isActive = isActive;
  if (trackExpiry !== undefined) where.trackExpiry = trackExpiry;
  if (search) where[Op.or] = ['name', 'sku', 'barcode'].map((f) => ({ [f]: { [Op.iLike]: like(search) } }));
  const { rows, count } = await Item.findAndCountAll({ where, include: inc, distinct: true, order: [['name', 'ASC']], limit, offset: (page - 1) * limit });
  const by = mine ? await qtyIn(rows.map((i) => i.id), mine) : null;
  res.json({ data: rows.map((i) => { const o = pub(i, req); if (by) o.stock = { quantity: by[i.id] || '0' }; return o; }), total: count, page, limit });
};

exports.getOne = async (req, res) => {
  const i = await show(req.params.id); if (!i) throw new AppError(404, 'NOT_FOUND', 'Item not found');
  const out = pub(i, req);
  const mine = await wh.itemScope(req);
  if (mine) {                                                             // an item outside the user's warehouse(s) does not exist for them
    if (!(await itemIdsOf(mine)).includes(i.id)) throw new AppError(404, 'NOT_FOUND', 'Item not found');
    out.stock = { quantity: (await qtyIn([i.id], mine))[i.id] || '0' };
  }
  if (i.trackExpiry) out.batches = mine
    ? await sequelize.query(`SELECT b.id, b.item_id AS "itemId", b.batch_no AS "batchNo", b.expiry_date AS "expiryDate", SUM(wsb.quantity) AS quantity
        FROM warehouse_stock_batches wsb JOIN stock_batches b ON b.id = wsb.batch_id
        WHERE b.item_id = :i AND wsb.quantity > 0 AND wsb.warehouse_id IN (:mine) GROUP BY b.id ORDER BY b.expiry_date`,
      { replacements: { i: i.id, mine: mine.length ? mine : ['00000000-0000-0000-0000-000000000000'] }, type: QueryTypes.SELECT })
    : await StockBatch.findAll({ where: { itemId: i.id, quantity: { [Op.gt]: 0 } }, order: [['expiryDate', 'ASC']] });
  res.json(out);
};

exports.create = async (req, res) => {
  mustSetCost(req);
  const id = await sequelize.transaction(async (t) => {
    await activeCategory(req.body.categoryId, t);
    let { sku } = req.body;
    if (!sku) { const [r] = await sequelize.query("SELECT nextval('item_sku_seq') AS n", { transaction: t }); sku = `ITM-${String(r[0].n).padStart(6, '0')}`; }
    const i = await Item.create({ ...req.body, sku, createdBy: req.user.id }, { transaction: t });
    await StockLevel.create({ itemId: i.id, quantity: 0 }, { transaction: t });      // opening stock is added through Stock receiving / Adjustment
    await audit.log(req, { action: 'ITEM_CREATED', entityType: 'Item', entityId: i.id, newValues: audited(i) }, t);
    return i.id;
  });
  res.status(201).json(pub(await show(id), req));
};

exports.update = async (req, res) => {
  mustSetCost(req);
  const b = req.body;
  await sequelize.transaction(async (t) => {
    const i = await find(req.params.id, t);
    if (b.categoryId && b.categoryId !== i.categoryId) await activeCategory(b.categoryId, t);
    if (((b.trackExpiry !== undefined && b.trackExpiry !== i.trackExpiry) || (b.unit && b.unit !== i.unit)) && await hasActivity(i.id, t))
      throw new AppError(409, 'LOCKED_FIELD', 'Unit and expiry tracking cannot be changed once the item has stock activity');
    const old = audited(i); await i.update(b, { transaction: t });
    await audit.log(req, { action: 'ITEM_UPDATED', entityType: 'Item', entityId: i.id, oldValues: old, newValues: audited(i) }, t);
  });
  res.json(pub(await show(req.params.id), req));
};

exports.setStatus = async (req, res) => {
  const { isActive, reason } = req.body;
  if (!isActive && !reason) throw new AppError(400, 'REASON_REQUIRED', 'Give a reason for deactivating this item');
  await sequelize.transaction(async (t) => {
    const i = await find(req.params.id, t);
    if (isActive) await activeCategory(i.categoryId, t);
    const old = { isActive: i.isActive }; await i.update({ isActive }, { transaction: t });
    await audit.log(req, { action: isActive ? 'ITEM_ACTIVATED' : 'ITEM_DEACTIVATED', entityType: 'Item', entityId: i.id, oldValues: old, newValues: { isActive }, reason }, t);
  });
  res.json(pub(await show(req.params.id), req));
};

// Hard delete is only possible for an item that never had any stock activity (the ledger must stay complete).
exports.remove = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const i = await find(req.params.id, t);
    if (await hasActivity(i.id, t)) throw new AppError(409, 'IN_USE', 'This item has stock history. Deactivate it instead of deleting it.');
    const old = audited(i);
    await StockLevel.destroy({ where: { itemId: i.id }, transaction: t });
    await i.destroy({ transaction: t });
    await audit.log(req, { action: 'ITEM_DELETED', entityType: 'Item', entityId: i.id, oldValues: old }, t);
  });
  res.json({ ok: true });
};
