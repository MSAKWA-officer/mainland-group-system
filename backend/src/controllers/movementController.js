const { Op } = require('sequelize');
const { StockMovement, Item, StockBatch, User, StockDocument } = require('../models');
const { AppError } = require('../utils/errors');

const inc = [
  { model: Item, as: 'item', attributes: ['id', 'sku', 'name', 'unit'] },
  { model: StockBatch, as: 'batch', attributes: ['id', 'batchNo', 'expiryDate'] },
  { model: User, as: 'performer', attributes: ['id', 'username', 'fullName'] },
  { model: StockDocument, as: 'document', attributes: ['id', 'docNo', 'type', 'reference', 'partyName'] },
];
const pub = (m, req) => { const o = m.toJSON(); if (!req.user.permissions.has('items.view_cost')) delete o.unitCost; return o; };
const startOf = (d) => new Date(`${d}T00:00:00.000Z`);
const dayAfter = (d) => new Date(startOf(d).getTime() + 86400000);

exports.list = async (req, res) => {
  const { itemId, documentId, movementType, direction, performedBy, from, to, page, limit } = req.query;
  const where = {};
  Object.entries({ itemId, documentId, movementType, direction, performedBy }).forEach(([k, v]) => { if (v) where[k] = v; });
  if (from || to) where.occurredAt = { ...(from && { [Op.gte]: startOf(from) }), ...(to && { [Op.lt]: dayAfter(to) }) };
  const { rows, count } = await StockMovement.findAndCountAll({ where, include: inc, order: [['id', 'DESC']], limit, offset: (page - 1) * limit });
  res.json({ data: rows.map((m) => pub(m, req)), total: count, page, limit });
};

exports.getOne = async (req, res) => {
  const m = await StockMovement.findByPk(req.params.id, { include: inc });
  if (!m) throw new AppError(404, 'NOT_FOUND', 'Movement not found');
  res.json(pub(m, req));
};
