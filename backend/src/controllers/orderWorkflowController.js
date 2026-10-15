const { Op, fn, col } = require('sequelize');
const { OrderWorkflow, OrderWorkflowEvent, SalesOrder, SalesOrderLine, Customer, Salesperson, StockLevel, User, Sale } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const svc = require('../services/orderWorkflow');

svc.install();                                                    // the manager decision must go through the storekeeper step, whichever endpoint is used

const person = (as) => ({ model: User, as, attributes: ['id', 'fullName'] });
const customer = { model: Customer, as: 'customer', attributes: ['id', 'code', 'name', 'phone', 'paymentTermsDays'] };
const salesperson = { model: Salesperson, as: 'salesperson', attributes: ['id', 'code', 'fullName', 'userId'] };
const PEOPLE = ['submitter', 'storekeeper', 'manager', 'returner', 'completer'];

// Plain JSON + the buttons this user may press. The salesperson's login id is only used to decide the buttons, never sent out.
const present = (req, wf) => {
  const j = wf.toJSON(); const sp = j.order?.salesperson;
  j.actions = svc.actionsFor(req, wf, wf.order, wf.order.salesperson);
  if (sp) delete sp.userId;
  return j;
};

// Throws 404 unless this user may see the workflow (their own orders, their queue, or everything with order_workflow.read_all).
const visible = async (req, where) => {
  const wf = await OrderWorkflow.findOne({ where: { [Op.and]: [where, await svc.visibility(req)] }, attributes: ['id'], subQuery: false,
    include: [{ model: SalesOrder, as: 'order', attributes: [], required: true }] });
  if (!wf) throw new AppError(404, 'NOT_FOUND', 'Workflow not found');
  return wf.id;
};

const detail = async (req, id) => {
  const wf = await OrderWorkflow.findByPk(id, {
    include: [
      { model: SalesOrder, as: 'order', include: [customer, salesperson, { model: SalesOrderLine, as: 'lines' }] },
      ...PEOPLE.map(person),
      { model: OrderWorkflowEvent, as: 'events', separate: true, order: [['id', 'ASC']], include: [person('actor')] },
    ],
    order: [[{ model: SalesOrder, as: 'order' }, { model: SalesOrderLine, as: 'lines' }, 'itemName', 'ASC']],
  });
  if (!wf) throw new AppError(404, 'NOT_FOUND', 'Workflow not found');
  const j = present(req, wf);
  j.order.lines = j.order.lines || [];
  // The storekeeper and manager are shown the stock on hand next to the quantity asked for.
  if (svc.canSeeStock(req)) {
    const levels = new Map((await StockLevel.findAll({ where: { itemId: j.order.lines.map((l) => l.itemId) } })).map((s) => [s.itemId, Number(s.quantity)]));
    j.order.lines.forEach((l) => { l.available = levels.get(l.itemId) ?? 0; });
  }
  return j;
};

exports.list = async (req, res) => {
  const { stage, status, search, page, limit } = req.query;
  const filters = {};
  if (stage) filters.status = { [Op.in]: svc.statusesOf(stage) };
  if (status) filters.status = stage && !svc.statusesOf(stage).includes(status) ? { [Op.in]: [] } : status;
  if (search) filters[Op.or] = [{ '$order.order_no$': { [Op.iLike]: like(search) } }, { '$order.customer.name$': { [Op.iLike]: like(search) } }];
  const { rows, count } = await OrderWorkflow.findAndCountAll({
    where: { [Op.and]: [filters, await svc.visibility(req)] }, subQuery: false, distinct: true,
    include: [{ model: SalesOrder, as: 'order', required: true, attributes: ['id', 'orderNo', 'orderDate', 'total', 'createdBy', 'salespersonId', 'status', 'saleType', 'paymentMethod', 'dueDate'],
      include: [{ ...customer, required: true }, salesperson, { model: Sale, as: 'sale', required: false, attributes: ['id', 'saleNo', 'paymentStatus', 'amountPaid'] }] }],
    order: [['updatedAt', 'DESC']], limit, offset: (page - 1) * limit,
  });
  res.json({ data: rows.map((w) => present(req, w)), total: count, page, limit });
};

// { STOREKEEPER: n, MANAGER: n, SALESPERSON: n, CLOSED: n } for the tab badges, limited to what this user may see.
exports.summary = async (req, res) => {
  const rows = await OrderWorkflow.findAll({
    attributes: ['status', [fn('COUNT', col('OrderWorkflow.id')), 'n']], where: await svc.visibility(req), group: ['OrderWorkflow.status'], raw: true,
    include: [{ model: SalesOrder, as: 'order', attributes: [], required: true }],
  });
  const out = Object.fromEntries(svc.STAGES.map((s) => [s, 0]));
  rows.forEach((r) => { out[svc.STAGE_OF[r.status]] += Number(r.n); });
  res.json(out);
};

exports.getOne = async (req, res) => res.json(await detail(req, await visible(req, { id: req.params.id })));
exports.byOrder = async (req, res) => res.json(await detail(req, await visible(req, { orderId: req.params.orderId })));

// Every step returns the refreshed workflow, so the screen can redraw straight away.
const step = (name) => async (req, res) => {
  const id = await visible(req, { id: req.params.id });
  await svc[name](req, id, req.body.note);
  res.json(await detail(req, id));
};
exports.storekeeperVerify = step('storekeeperVerify');
exports.storekeeperReturn = step('storekeeperReturn');
exports.managerApprove = step('managerApprove');
exports.managerReject = step('managerReject');
exports.managerReturn = step('managerReturn');
exports.acknowledge = step('acknowledge');
