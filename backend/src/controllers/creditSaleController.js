const { QueryTypes } = require('sequelize');
const { sequelize, Customer } = require('../models');
const { AppError } = require('../utils/errors');
const q = require('../services/saleQueries');
const svc = require('../services/creditSales');
const approvals = require('../services/approvals');
const { canSee, canAll, mine } = require('../services/salesScope');

const paymentAccounts = require('../services/paymentAccounts');

const only = ['CREDIT'];
const fetch = (req, id) => q.fetch(req, id, only);
const waiting = async (req, id) => {
  const s = await fetch(req, id);
  if (s.status !== 'SUBMITTED' || !s.approvalId) throw new AppError(409, 'BAD_STATE', `This sale is ${s.status}, not waiting for approval`);
  return s;
};

exports.paymentAccounts = async (req, res) => res.json({ data: await paymentAccounts.list() });
exports.list = async (req, res) => res.json(await q.list(req, only, req.query));
exports.getOne = async (req, res) => res.json(await fetch(req, req.params.id));
exports.create = async (req, res) => res.status(201).json(await fetch(req, (await svc.create(req, req.body)).id));
exports.update = async (req, res) => { await fetch(req, req.params.id); res.json(await fetch(req, (await svc.update(req, req.params.id, req.body)).id)); };
exports.remove = async (req, res) => { await fetch(req, req.params.id); await svc.remove(req, req.params.id); res.json({ ok: true }); };
exports.submit = async (req, res) => { await fetch(req, req.params.id); res.json(await fetch(req, (await svc.submit(req, req.params.id)).id)); };
exports.cancel = async (req, res) => { await fetch(req, req.params.id); res.json(await fetch(req, (await svc.cancel(req, req.params.id, req.body.reason)).id)); };
exports.void = async (req, res) => { await fetch(req, req.params.id); res.json(await fetch(req, (await svc.void(req, req.params.id, req.body.reason)).id)); };
exports.approve = async (req, res) => {
  const s = await waiting(req, req.params.id);
  await approvals.approve(req, s.approvalId, req.body.note);              // issues the stock inside the same transaction
  res.json(await fetch(req, s.id));
};
exports.reject = async (req, res) => {
  const s = await waiting(req, req.params.id);
  await approvals.reject(req, s.approvalId, req.body.note);
  res.json(await fetch(req, s.id));
};

exports.receivePayment = async (req, res) => {
  await fetch(req, req.params.id);
  const r = await svc.receivePayment(req, req.params.id, req.body);
  res.status(201).json({ payment: r.payment, sale: await fetch(req, req.params.id) });
};
exports.voidPayment = async (req, res) => {
  await fetch(req, req.params.id);
  await svc.voidPayment(req, req.params.id, req.params.paymentId, req.body.reason);
  res.json(await fetch(req, req.params.id));
};

// Credit position of one customer: limit, outstanding, overdue, available. Used by the form before a sale is created.
exports.creditStatus = async (req, res) => {
  const c = await Customer.findByPk(req.params.customerId);
  if (!c || !(await canSee(req, 'credit_sales.read_all', c.salespersonId))) throw new AppError(404, 'NOT_FOUND', 'Customer not found');
  res.json({ customerId: c.id, name: c.name, isActive: c.isActive, ...(await svc.position(c)) });
};

// Receivables: what each customer still owes, split by how late it is.
exports.receivables = async (req, res) => {
  const where = ["s.sale_type = 'CREDIT'", "s.status = 'COMPLETED'", 's.total > s.amount_paid'];
  const replacements = {};
  if (!canAll(req, 'credit_sales.read_all')) {
    const sp = await mine(req);
    where.push('s.salesperson_id = :sp'); replacements.sp = sp ? sp.id : '00000000-0000-0000-0000-000000000000';
  }
  const rows = await sequelize.query(`SELECT c.id AS "customerId", c.code, c.name, c.credit_limit::text AS "creditLimit",
      COUNT(*)::int AS "openSales",
      SUM(s.total - s.amount_paid)::text AS outstanding,
      COALESCE(SUM(s.total - s.amount_paid) FILTER (WHERE s.due_date >= CURRENT_DATE), 0)::text AS "notDue",
      COALESCE(SUM(s.total - s.amount_paid) FILTER (WHERE CURRENT_DATE - s.due_date BETWEEN 1 AND 30), 0)::text AS "days1to30",
      COALESCE(SUM(s.total - s.amount_paid) FILTER (WHERE CURRENT_DATE - s.due_date BETWEEN 31 AND 60), 0)::text AS "days31to60",
      COALESCE(SUM(s.total - s.amount_paid) FILTER (WHERE CURRENT_DATE - s.due_date BETWEEN 61 AND 90), 0)::text AS "days61to90",
      COALESCE(SUM(s.total - s.amount_paid) FILTER (WHERE CURRENT_DATE - s.due_date > 90), 0)::text AS "over90"
    FROM sales s JOIN customers c ON c.id = s.customer_id WHERE ${where.join(' AND ')}
    GROUP BY c.id ORDER BY SUM(s.total - s.amount_paid) DESC`, { replacements, type: QueryTypes.SELECT });
  res.json({ data: rows });
};
