const { Op, literal } = require('sequelize');
const { sequelize, Category, Item } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('../services/audit');

const audited = (c) => ({ name: c.name, description: c.description, parentId: c.parentId, isActive: c.isActive });
const count = literal('(SELECT CAST(COUNT(*) AS int) FROM items i WHERE i.category_id = "Category"."id")');
const inc = [{ model: Category, as: 'parent', attributes: ['id', 'name'] }];
const find = async (id, t) => {
  const c = await Category.findByPk(id, { transaction: t, ...(t && { lock: t.LOCK.UPDATE }) });
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Category not found');
  return c;
};
const show = async (id) => Category.findByPk(id, { include: inc, attributes: { include: [[count, 'itemCount']] } });

// A category cannot become its own ancestor.
const checkParent = async (id, parentId, t) => {
  let cur = parentId;
  while (cur) {
    if (cur === id) throw new AppError(400, 'BAD_PARENT', 'A category cannot be placed under itself or one of its sub-categories');
    const p = await Category.findByPk(cur, { transaction: t });
    if (!p) throw new AppError(400, 'BAD_PARENT', 'Parent category not found');
    cur = p.parentId;
  }
};

exports.list = async (req, res) => {
  const { search, parentId, isActive, page, limit } = req.query; const where = {};
  if (isActive !== undefined) where.isActive = isActive;
  if (parentId) where.parentId = parentId;
  if (search) where.name = { [Op.iLike]: like(search) };
  const { rows, count: total } = await Category.findAndCountAll({ where, include: inc, attributes: { include: [[count, 'itemCount']] },
    order: [['name', 'ASC']], limit, offset: (page - 1) * limit });
  res.json({ data: rows, total, page, limit });
};

exports.getOne = async (req, res) => {
  const c = await show(req.params.id); if (!c) throw new AppError(404, 'NOT_FOUND', 'Category not found');
  res.json(c);
};

exports.create = async (req, res) => {
  const c = await sequelize.transaction(async (t) => {
    if (req.body.parentId) await checkParent(null, req.body.parentId, t);
    const c = await Category.create({ ...req.body, createdBy: req.user.id }, { transaction: t });
    await audit.log(req, { action: 'CATEGORY_CREATED', entityType: 'Category', entityId: c.id, newValues: audited(c) }, t);
    return c;
  });
  res.status(201).json(await show(c.id));
};

exports.update = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const c = await find(req.params.id, t);
    if (req.body.parentId !== undefined && req.body.parentId !== c.parentId && req.body.parentId) await checkParent(c.id, req.body.parentId, t);
    if (req.body.isActive === false && c.isActive && await Item.count({ where: { categoryId: c.id, isActive: true }, transaction: t }))
      throw new AppError(409, 'CATEGORY_IN_USE', 'Move or deactivate the active items in this category first');
    const old = audited(c); await c.update(req.body, { transaction: t });
    await audit.log(req, { action: 'CATEGORY_UPDATED', entityType: 'Category', entityId: c.id, oldValues: old, newValues: audited(c) }, t);
  });
  res.json(await show(req.params.id));
};

exports.remove = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const c = await find(req.params.id, t);
    if (await Item.count({ where: { categoryId: c.id }, transaction: t })) throw new AppError(409, 'CATEGORY_IN_USE', 'This category has items. Deactivate it instead.');
    if (await Category.count({ where: { parentId: c.id }, transaction: t })) throw new AppError(409, 'CATEGORY_IN_USE', 'This category has sub-categories. Remove or move them first.');
    const old = audited(c); await c.destroy({ transaction: t });
    await audit.log(req, { action: 'CATEGORY_DELETED', entityType: 'Category', entityId: c.id, oldValues: old }, t);
  });
  res.json({ ok: true });
};
