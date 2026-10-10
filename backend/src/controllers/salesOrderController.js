const { Op, literal } = require('sequelize');
const { SalesOrder, SalesOrderLine, Customer, Salesperson, User, ApprovalRequest, StockDocument } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const svc = require('../services/salesOrders');
const approvals = require('../services/approvals');
const { scope, canSee } = require('../services/salesScope');

const customer = { model: Customer, as: 'customer', attributes: ['id', 'code', 'name', 'phone', 'paymentTermsDays'] };
const salesperson = { model: Salesperson, as: 'salesperson', attributes: ['id', 'code', 'fullName'] };
const creator = { model: User, as: 'creator', attributes: ['id', 'username', 'fullName'] };
const approval = { model: ApprovalRequest, as: 'approval', attributes: ['id', 'status', 'decidedBy', 'decidedAt', 'decisionNote'] };
const stockDoc = { model: StockDocument, as: 'stockDocument', attributes: ['id', 'docNo', 'status', 'postedAt'] };
const lineCount = literal('(SELECT CAST(COUNT(*) AS int) FROM sales_order_lines l WHERE l.order_id = "SalesOrder"."id")');
const startOf = (d) => d; // dates are plain YYYY-MM-DD (DATEONLY)

// A user without sales_orders.read_all can only touch orders of their own salesperson profile.
const fetch = async (req, id) => {
  const o = await SalesOrder.findByPk(id, { include: [customer, salesperson, creator, approval, stockDoc,
    { model: SalesOrderLine, as: 'lines' }], order: [[{ model: SalesOrderLine, as: 'lines' }, 'itemName', 'ASC']] });
  if (!o || !(await canSee(req, 'sales_orders.read_all', o.salespersonId))) throw new AppError(404, 'NOT_FOUND', 'Sales order not found');
  return o;
};
const waiting = async (req, id) => {
  const o = await fetch(req, id);
  if (o.status !== 'SUBMITTED' || !o.approvalId) throw new AppError(409, 'BAD_STATE', `This order is ${o.status}, not waiting for approval`);
  return o;
};

exports.list = async (req, res) => {
  const { status, customerId, salespersonId, createdBy, search, from, to, page, limit } = req.query; let where = {};
  if (status) where.status = status;
  if (customerId) where.customerId = customerId;
  if (salespersonId) where.salespersonId = salespersonId;
  if (createdBy) where.createdBy = createdBy;
  if (from || to) where.orderDate = { ...(from && { [Op.gte]: startOf(from) }), ...(to && { [Op.lte]: startOf(to) }) };
  if (search) where[Op.or] = [{ orderNo: { [Op.iLike]: like(search) } }, { '$customer.name$': { [Op.iLike]: like(search) } }];
  where = await scope(req, 'sales_orders.read_all', where);
  const { rows, count } = await SalesOrder.findAndCountAll({ where, include: [{ ...customer, required: true }, salesperson], attributes: { include: [[lineCount, 'lineCount']] },
    order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit, subQuery: false });
  res.json({ data: rows, total: count, page, limit });
};

exports.getOne = async (req, res) => res.json(await fetch(req, req.params.id));
exports.create = async (req, res) => res.status(201).json(await fetch(req, (await svc.create(req, req.body)).id));
exports.update = async (req, res) => { await fetch(req, req.params.id); res.json(await fetch(req, (await svc.update(req, req.params.id, req.body)).id)); };
exports.remove = async (req, res) => { await fetch(req, req.params.id); await svc.remove(req, req.params.id); res.json({ ok: true }); };
exports.submit = async (req, res) => { await fetch(req, req.params.id); res.json(await fetch(req, (await svc.submit(req, req.params.id)).id)); };
exports.cancel = async (req, res) => { await fetch(req, req.params.id); res.json(await fetch(req, (await svc.cancel(req, req.params.id, req.body.reason)).id)); };
exports.approve = async (req, res) => {
  const o = await waiting(req, req.params.id);
  await approvals.approve(req, o.approvalId, req.body.note);              // issues the stock inside the same transaction
  res.json(await fetch(req, o.id));
};
exports.reject = async (req, res) => {
  const o = await waiting(req, req.params.id);
  await approvals.reject(req, o.approvalId, req.body.note);
  res.json(await fetch(req, o.id));
};
