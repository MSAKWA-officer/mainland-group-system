const { Op } = require('sequelize');
const { PhysicalCount, PhysicalCountLine, Warehouse, Item, User } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const svc = require('../services/physicalCounts');
const stmt = require('../services/warehouseStatement');
const wh = require('../services/warehouses');

const whInc = { model: Warehouse, as: 'warehouse', attributes: ['id', 'code', 'name'] };
const creator = { model: User, as: 'creator', attributes: ['id', 'username', 'fullName'] };
const voider = { model: User, as: 'voider', attributes: ['id', 'username', 'fullName'] };

// Managers / Owner (warehouses.read_all) see every count; everybody else only the counts of the warehouses they are in charge of.
const visible = async (req) => { const mine = await wh.scope(req); return mine ? { warehouseId: mine } : null; };
const fetch = async (req, id) => {
  const scope = await visible(req);
  const c = await PhysicalCount.findOne({ where: { id, ...(scope || {}) }, include: [whInc, creator, voider,
    { model: PhysicalCountLine, as: 'lines', include: [{ model: Item, as: 'item', attributes: ['id', 'sku', 'name', 'unit'] }] }],
  order: [[{ model: PhysicalCountLine, as: 'lines' }, 'createdAt', 'ASC']] });
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Physical count not found');
  return c;
};
// Totals shown in the list, worked out from the saved lines (difference = counted - book at the count date).
const withTotals = (c) => {
  const j = c.toJSON(); const ls = j.lines || [];
  j.itemsCounted = ls.length; j.itemsWithDifference = ls.filter((l) => Number(l.countedQty) !== Number(l.bookQty)).length;
  j.totalDifference = Math.round(ls.reduce((a, l) => a + (Number(l.countedQty) - Number(l.bookQty)), 0) * 1000) / 1000;
  return j;
};

exports.list = async (req, res) => {
  const { status, search, warehouseId, from, to, page, limit } = req.query; const and = [];
  const scope = await visible(req); if (scope) and.push(scope);
  const where = {};
  if (status) where.status = status;
  if (warehouseId) where.warehouseId = warehouseId;
  if (from || to) where.countDate = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };
  if (search) where[Op.or] = ['countNo', 'note'].map((f) => ({ [f]: { [Op.iLike]: like(search) } }));
  const { rows, count } = await PhysicalCount.findAndCountAll({ where: and.length ? { [Op.and]: [where, ...and] } : where,
    include: [whInc, creator, { model: PhysicalCountLine, as: 'lines', attributes: ['id', 'countedQty', 'bookQty'] }],
    order: [['countDate', 'DESC'], ['createdAt', 'DESC']], limit, offset: (page - 1) * limit, distinct: true });
  res.json({ data: rows.map(withTotals), total: count, page, limit });
};
exports.getOne = async (req, res) => res.json(withTotals(await fetch(req, req.params.id)));
exports.create = async (req, res) => res.status(201).json(withTotals(await fetch(req, (await svc.create(req, req.body)).id)));
exports.void = async (req, res) => { await fetch(req, req.params.id); await svc.voidCount(req, req.params.id, req.body.reason); res.json(withTotals(await fetch(req, req.params.id))); };

// The entry sheet: every product of the warehouse with its book quantity at the end of the chosen day (default today).
exports.sheet = async (req, res) => {
  const { warehouseId } = req.query; const date = req.query.date || stmt.todayLocal();
  await wh.access(req, warehouseId, undefined, { active: true });
  res.json({ warehouseId, date, rows: await svc.sheet(warehouseId, date) });
};
