const { Op, literal } = require('sequelize');
const { sequelize, Discount, Category, Item, Customer, SalesOrderLine } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('../services/audit');
const discountSvc = require('../services/discounts');
const { canSee } = require('../services/salesScope');

const inc = [
  { model: Category, as: 'category', attributes: ['id', 'name'] },
  { model: Item, as: 'item', attributes: ['id', 'sku', 'name'] },
  { model: Customer, as: 'customer', attributes: ['id', 'code', 'name'] },
];
const usage = [literal('(SELECT CAST(COUNT(*) AS int) FROM sales_order_lines l WHERE l.discount_id = "Discount"."id")'), 'usageCount'];
const audited = (d) => ({ code: d.code, name: d.name, description: d.description, percent: d.percent, scope: d.scope, categoryId: d.categoryId, itemId: d.itemId,
  customerId: d.customerId, minQuantity: d.minQuantity, validFrom: d.validFrom, validTo: d.validTo, isActive: d.isActive });
const bad = (field, message) => new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field, message }]);
const show = (id) => Discount.findByPk(id, { include: inc, attributes: { include: [usage] } });
const find = async (id, t) => {
  const d = await Discount.findByPk(id, { transaction: t, ...(t && { lock: t.LOCK.UPDATE }) });
  if (!d) throw new AppError(404, 'NOT_FOUND', 'Discount not found');
  return d;
};

// The scope decides which of categoryId / itemId is used; the database CHECK enforces the same rule.
async function checkTargets(d, t) {
  if (d.scope === 'CATEGORY') {
    if (!d.categoryId) throw bad('categoryId', 'Choose a category');
    const c = await Category.findByPk(d.categoryId, { transaction: t });
    if (!c || !c.isActive) throw bad('categoryId', 'Choose an active category');
  }
  if (d.scope === 'ITEM') {
    if (!d.itemId) throw bad('itemId', 'Choose an item');
    const i = await Item.findByPk(d.itemId, { transaction: t });
    if (!i || !i.isActive) throw bad('itemId', 'Choose an active item');
  }
  if (d.customerId) {
    const c = await Customer.findByPk(d.customerId, { transaction: t });
    if (!c || !c.isActive) throw bad('customerId', 'Choose an active customer');
  }
  if (d.validTo && d.validFrom && d.validTo < d.validFrom) throw bad('validTo', 'The end date cannot be before the start date');
}
const dupName = async (name, selfId, t) => {
  const hit = await Discount.findOne({ where: { [Op.and]: [literal(`LOWER("Discount"."name") = ${sequelize.escape(name.toLowerCase())}`)], ...(selfId && { id: { [Op.ne]: selfId } }) }, transaction: t });
  if (hit) throw new AppError(409, 'DUPLICATE', 'A discount with this name already exists', [{ field: 'name', message: 'Already in use' }]);
};
// Fields that do not belong to the chosen scope are cleared, so a scope change never leaves stale targets behind.
const clean = (b) => ({ ...b, ...(b.scope === 'ALL' && { categoryId: null, itemId: null }), ...(b.scope === 'CATEGORY' && { itemId: null }), ...(b.scope === 'ITEM' && { categoryId: null }) });

exports.list = async (req, res) => {
  const { search, scope, isActive, customerId, current, page, limit } = req.query; const where = {};
  if (scope) where.scope = scope;
  if (isActive !== undefined) where.isActive = isActive;
  if (customerId) where.customerId = customerId;
  if (current) Object.assign(where, { isActive: true, validFrom: { [Op.lte]: literal('CURRENT_DATE') }, [Op.and]: [literal('("Discount"."valid_to" IS NULL OR "Discount"."valid_to" >= CURRENT_DATE)')] });
  if (search) where[Op.or] = ['name', 'code'].map((f) => ({ [f]: { [Op.iLike]: like(search) } }));
  const { rows, count } = await Discount.findAndCountAll({ where, include: inc, attributes: { include: [usage] }, order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit, distinct: true });
  res.json({ data: rows, total: count, page, limit });
};

/* Discounts the signed-in user may use right now for one item + customer + quantity (what the order form shows in its dropdown).
   Only needs discounts.apply, so a Sales Person never sees the full discount list. A customer outside their own book looks like "not found". */
exports.available = async (req, res) => {
  const { itemId, customerId, quantity } = req.query;
  const [item, customer] = await Promise.all([Item.findByPk(itemId), Customer.findByPk(customerId)]);
  if (!item) throw new AppError(404, 'NOT_FOUND', 'Item not found');
  if (!customer || !(await canSee(req, 'sales_orders.read_all', customer.salespersonId))) throw new AppError(404, 'NOT_FOUND', 'Customer not found');
  const rows = await Discount.findAll({
    where: { isActive: true, validFrom: { [Op.lte]: literal('CURRENT_DATE') }, minQuantity: { [Op.lte]: quantity },
      [Op.and]: [literal('("Discount"."valid_to" IS NULL OR "Discount"."valid_to" >= CURRENT_DATE)')],
      [Op.or]: [{ scope: 'ALL' }, { scope: 'ITEM', itemId: item.id }, { scope: 'CATEGORY', categoryId: item.categoryId }] },
    attributes: ['id', 'code', 'name', 'percent', 'scope', 'minQuantity', 'validTo', 'customerId'], order: [['percent', 'DESC']] });
  const day = await discountSvc.today();
  res.json(rows.filter((d) => !discountSvc.check(d, item, customer.id, quantity, day)).map((d) => { const o = d.toJSON(); delete o.customerId; return o; }));
};

exports.getOne = async (req, res) => {
  const d = await show(req.params.id); if (!d) throw new AppError(404, 'NOT_FOUND', 'Discount not found');
  res.json(d);
};

exports.create = async (req, res) => {
  const id = await sequelize.transaction(async (t) => {
    const b = clean(req.body);
    await checkTargets(b, t);
    await dupName(b.name, null, t);
    const [r] = await sequelize.query("SELECT nextval('discount_code_seq') AS n", { transaction: t });
    const d = await Discount.create({ ...b, code: `DSC-${String(r[0].n).padStart(6, '0')}`, createdBy: req.user.id }, { transaction: t });
    await audit.log(req, { action: 'DISCOUNT_CREATED', entityType: 'Discount', entityId: d.id, newValues: audited(d) }, t);
    return d.id;
  });
  res.status(201).json(await show(id));
};

exports.update = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const d = await find(req.params.id, t);
    const merged = clean({ ...audited(d), ...req.body });                 // validate the final shape, not just the changed fields
    await checkTargets(merged, t);
    if (req.body.name && req.body.name.toLowerCase() !== d.name.toLowerCase()) await dupName(req.body.name, d.id, t);
    const old = audited(d);
    const touched = ['scope', 'categoryId', 'itemId'].some((k) => req.body[k] !== undefined);
    await d.update({ ...req.body, ...(touched && { scope: merged.scope, categoryId: merged.categoryId, itemId: merged.itemId }) }, { transaction: t });
    await audit.log(req, { action: 'DISCOUNT_UPDATED', entityType: 'Discount', entityId: d.id, oldValues: old, newValues: audited(d) }, t);
  });
  res.json(await show(req.params.id));
};

exports.setStatus = async (req, res) => {
  const { isActive, reason } = req.body;
  if (!isActive && !reason) throw new AppError(400, 'REASON_REQUIRED', 'Give a reason for deactivating this discount');
  await sequelize.transaction(async (t) => {
    const d = await find(req.params.id, t);
    if (isActive && d.validTo && d.validTo < await discountSvc.today(t)) throw new AppError(409, 'EXPIRED', 'This discount has expired. Extend its end date first.');
    const old = { isActive: d.isActive }; await d.update({ isActive }, { transaction: t });
    await audit.log(req, { action: isActive ? 'DISCOUNT_ACTIVATED' : 'DISCOUNT_DEACTIVATED', entityType: 'Discount', entityId: d.id, oldValues: old, newValues: { isActive }, reason }, t);
  });
  res.json(await show(req.params.id));
};

// Hard delete only for a discount that no order line has used; otherwise deactivate.
exports.remove = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const d = await find(req.params.id, t);
    if (await SalesOrderLine.count({ where: { discountId: d.id }, transaction: t })) throw new AppError(409, 'IN_USE', 'This discount has been used on orders. Deactivate it instead of deleting it.');
    const old = audited(d); await d.destroy({ transaction: t });
    await audit.log(req, { action: 'DISCOUNT_DELETED', entityType: 'Discount', entityId: d.id, oldValues: old }, t);
  });
  res.json({ ok: true });
};
