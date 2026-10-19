const { Op } = require('sequelize');
const { WarehouseTransfer, WarehouseTransferLine, Warehouse, Item, StockBatch, User, ApprovalRequest } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const svc = require('../services/warehouseTransfers');
const approvals = require('../services/approvals');
const wh = require('../services/warehouses');

const whInc = (as) => ({ model: Warehouse, as, attributes: ['id', 'code', 'name'] });
const creator = { model: User, as: 'creator', attributes: ['id', 'username', 'fullName'] };
const approval = { model: ApprovalRequest, as: 'approval', attributes: ['id', 'status', 'decidedBy', 'decidedAt', 'decisionNote'] };
const lines = { model: WarehouseTransferLine, as: 'lines', include: [
  { model: Item, as: 'item', attributes: ['id', 'sku', 'name', 'unit', 'trackExpiry'] },
  { model: StockBatch, as: 'batch', attributes: ['id', 'batchNo', 'expiryDate'] }] };

// Storekeepers see transfers of their warehouses (either side) and their own requests; Managers / Owner (warehouse_transfers.read_all) see all.
const visible = async (req) => {
  if (req.user.permissions.has('warehouse_transfers.read_all')) return null;
  const mine = (await wh.scope(req)) || [];
  return { [Op.or]: [{ createdBy: req.user.id }, { fromWarehouseId: mine }, { toWarehouseId: mine }] };
};
const fetch = async (req, id) => {
  const scope = await visible(req);
  const tr = await WarehouseTransfer.findOne({ where: { id, ...(scope && { [Op.and]: [scope] }) },
    include: [whInc('fromWarehouse'), whInc('toWarehouse'), creator, approval, lines], order: [[{ model: WarehouseTransferLine, as: 'lines' }, 'createdAt', 'ASC']] });
  if (!tr) throw new AppError(404, 'NOT_FOUND', 'Transfer not found');
  return tr;
};
const waiting = async (req, id) => {
  const tr = await fetch(req, id);
  if (tr.status !== 'SUBMITTED' || !tr.approvalId) throw new AppError(409, 'BAD_STATE', `This transfer is ${tr.status}, not waiting for approval`);
  return tr;
};

exports.list = async (req, res) => {
  const { status, search, warehouseId, from, to, page, limit } = req.query; const and = [];
  const scope = await visible(req); if (scope) and.push(scope);
  const where = {};
  if (status) where.status = status;
  if (warehouseId) and.push({ [Op.or]: [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }] });
  if (from || to) where.transferDate = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };
  if (search) where[Op.or] = ['transferNo', 'reason'].map((f) => ({ [f]: { [Op.iLike]: like(search) } }));
  const { rows, count } = await WarehouseTransfer.findAndCountAll({ where: and.length ? { [Op.and]: [where, ...and] } : where,
    include: [whInc('fromWarehouse'), whInc('toWarehouse'), creator,
      { model: WarehouseTransferLine, as: 'lines', attributes: ['id', 'quantity'], include: [{ model: Item, as: 'item', attributes: ['id', 'name', 'unit'] }] }],
    order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit, distinct: true });
  res.json({ data: rows, total: count, page, limit });
};
exports.getOne = async (req, res) => res.json(await fetch(req, req.params.id));
exports.create = async (req, res) => res.status(201).json(await fetch(req, (await svc.create(req, req.body)).id));
exports.cancel = async (req, res) => { await svc.cancel(req, req.params.id); res.json(await fetch(req, req.params.id)); };
exports.approve = async (req, res) => {
  const tr = await waiting(req, req.params.id);
  await approvals.approve(req, tr.approvalId, req.body.note);                  // moves the stock inside the same transaction
  res.json(await fetch(req, tr.id));
};
exports.reject = async (req, res) => {
  const tr = await waiting(req, req.params.id);
  await approvals.reject(req, tr.approvalId, req.body.note);
  res.json(await fetch(req, tr.id));
};
