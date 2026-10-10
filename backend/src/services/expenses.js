const { Op, literal, QueryTypes } = require('sequelize');
const { sequelize, Expense, User } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('./audit');
const core = require('./saleCore');

/* Expenses = a cost the business has incurred. Money only leaves when a Payment is recorded against it.
   - Flow: PENDING -> APPROVED | REJECTED. PENDING / APPROVED -> VOIDED (refused while any active payment exists).
   - Anyone with expenses.create can submit; only expenses.approve can decide. You cannot approve your own expense (the Owner is exempt, as nobody sits above them).
   - Without expenses.read_all a user only sees the expenses they submitted. Someone else's expense looks like "not found".
   - Every change locks the expense row first and writes its audit row in the same database transaction. Expenses are never deleted. */
const { cents, str, bad } = core;
const PERM_ALL = 'expenses.read_all';
const OWNER_ROLE = 'OWNER';

const audited = (e) => ({ expenseNo: e.expenseNo, category: e.category, description: e.description, payee: e.payee, reference: e.reference,
  amount: e.amount, expenseDate: e.expenseDate, status: e.status });
const paidSql = `(SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.expense_id = "Expense"."id" AND p.status = 'ACTIVE')`;
const paidAttr = [literal(`${paidSql}::text`), 'paidAmount'];
const outstandingAttr = [literal(`("Expense"."amount" - ${paidSql})::text`), 'outstandingAmount'];
const paymentState = [literal(`CASE WHEN "Expense"."status" <> 'APPROVED' THEN NULL WHEN ${paidSql} <= 0 THEN 'UNPAID' WHEN ${paidSql} >= "Expense"."amount" THEN 'PAID' ELSE 'PARTIAL' END`), 'paymentStatus'];
const includes = [{ model: User, as: 'creator', attributes: ['id', 'fullName'] }, { model: User, as: 'decider', attributes: ['id', 'fullName'] }];

const canAll = (req) => req.user.permissions.has(PERM_ALL);
const scope = (req) => (canAll(req) ? {} : { createdBy: req.user.id });
const notFound = () => new AppError(404, 'NOT_FOUND', 'Expense not found');

async function lock(req, id, t) {
  const e = await Expense.findOne({ where: { id, ...scope(req) }, transaction: t, lock: t.LOCK.UPDATE });
  if (!e) throw notFound();
  return e;
}
async function activePaid(id, t) {
  const [r] = await sequelize.query(`SELECT COALESCE(SUM(amount), 0)::text AS paid, COUNT(*)::int AS n FROM payments WHERE expense_id = :id AND status = 'ACTIVE'`,
    { replacements: { id }, transaction: t, type: QueryTypes.SELECT });
  return { paid: cents(r.paid), count: r.n };
}
async function checkDate(date, t) {
  if (date && date > await core.dbToday(t)) throw bad('expenseDate', 'Expense date cannot be in the future');
}

const create = (req, body) => sequelize.transaction(async (t) => {
  await checkDate(body.expenseDate, t);
  const e = await Expense.create({
    expenseNo: `EXP-${core.year()}-${core.pad(await core.nextNo('expense_seq', t))}`, category: body.category, description: body.description,
    payee: body.payee ?? null, reference: body.reference ?? null, amount: str(cents(body.amount)), expenseDate: body.expenseDate ?? await core.dbToday(t),
    notes: body.notes ?? null, status: 'PENDING', createdBy: req.user.id,
  }, { transaction: t });
  await audit.log(req, { action: 'EXPENSE_CREATED', entityType: 'Expense', entityId: e.id, newValues: audited(e) }, t);
  return e.id;
});

// Only the person who submitted it can change it, and only while it is still waiting for a decision.
const update = (req, id, body) => sequelize.transaction(async (t) => {
  const e = await lock(req, id, t);
  if (e.createdBy !== req.user.id) throw new AppError(403, 'FORBIDDEN', 'Only the person who submitted this expense can edit it');
  if (e.status !== 'PENDING') throw new AppError(409, 'BAD_STATE', `A ${e.status.toLowerCase()} expense cannot be edited`);
  await checkDate(body.expenseDate, t);
  const old = audited(e);
  const patch = { ...body, ...(body.amount !== undefined && { amount: str(cents(body.amount)) }) };
  await e.update(patch, { transaction: t });
  await audit.log(req, { action: 'EXPENSE_UPDATED', entityType: 'Expense', entityId: e.id, oldValues: old, newValues: audited(e) }, t);
  return e.id;
});

const decide = (req, id, approve, note) => sequelize.transaction(async (t) => {
  const e = await lock(req, id, t);
  if (e.status !== 'PENDING') throw new AppError(409, 'BAD_STATE', `This expense is already ${e.status.toLowerCase()}`);
  if (e.createdBy === req.user.id && req.user.role !== OWNER_ROLE)
    throw new AppError(403, 'SELF_APPROVAL', 'You cannot approve or reject your own expense. Ask another approver.');
  if (!approve && (!note || note.trim().length < 3)) throw bad('note', 'Give a reason for rejecting this expense');
  const old = audited(e);
  await e.update({ status: approve ? 'APPROVED' : 'REJECTED', decidedBy: req.user.id, decidedAt: new Date(), decisionNote: note ?? null }, { transaction: t });
  await audit.log(req, { action: approve ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED', entityType: 'Expense', entityId: e.id, oldValues: old, newValues: audited(e), reason: note ?? null }, t);
  return e.id;
});

const voidExpense = (req, id, reason) => sequelize.transaction(async (t) => {
  if (!reason || reason.trim().length < 3) throw bad('reason', 'A reason is required to void an expense');
  const e = await lock(req, id, t);
  if (!['PENDING', 'APPROVED'].includes(e.status)) throw new AppError(409, 'BAD_STATE', `A ${e.status.toLowerCase()} expense cannot be voided`);
  const { count } = await activePaid(e.id, t);
  if (count > 0) throw new AppError(409, 'HAS_PAYMENTS', 'This expense has payments. Void the payments first.');
  const old = audited(e);
  await e.update({ status: 'VOIDED', voidedAt: new Date(), voidedBy: req.user.id, voidReason: reason }, { transaction: t });
  await audit.log(req, { action: 'EXPENSE_VOIDED', entityType: 'Expense', entityId: e.id, oldValues: old, newValues: audited(e), reason }, t);
  return e.id;
});

/* ---------- reads ---------- */
const SORT = { expenseDate: 'expenseDate', amount: 'amount', expenseNo: 'expenseNo', category: 'category' };

async function list(req, q) {
  const where = { ...scope(req) };
  for (const k of ['category', 'status', 'createdBy']) if (q[k] !== undefined && !(k === 'status' && q[k] === 'ALL')) where[k] = q[k];
  if (!canAll(req)) where.createdBy = req.user.id;                                   // a filter can never widen the scope
  if (q.from || q.to) where.expenseDate = { ...(q.from && { [Op.gte]: q.from }), ...(q.to && { [Op.lte]: q.to }) };
  if (q.search) where[Op.or] = ['expenseNo', 'description', 'payee', 'reference'].map((f) => ({ [f]: { [Op.iLike]: like(q.search) } }));
  const and = [];
  if (q.paymentStatus) and.push(literal(`(CASE WHEN "Expense"."status" <> 'APPROVED' THEN NULL WHEN ${paidSql} <= 0 THEN 'UNPAID' WHEN ${paidSql} >= "Expense"."amount" THEN 'PAID' ELSE 'PARTIAL' END) = '${q.paymentStatus}'`));
  const { rows, count } = await Expense.findAndCountAll({ where: and.length ? { [Op.and]: [where, ...and] } : where,
    attributes: { include: [paidAttr, outstandingAttr, paymentState] }, include: includes,
    order: [[SORT[q.sortBy], q.sortDir.toUpperCase()], ['createdAt', 'DESC']], limit: q.limit, offset: (q.page - 1) * q.limit, distinct: true });
  const sum = await Expense.findAll({ where: { ...where, status: 'APPROVED' }, attributes: [[sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('amount')), 0), 'approvedTotal']], raw: true });
  return { data: rows, total: count, page: q.page, limit: q.limit, approvedTotal: String(sum[0].approvedTotal) };
}

async function getOne(req, id) {
  const { Payment } = require('../models');
  const e = await Expense.findOne({ where: { id, ...scope(req) }, attributes: { include: [paidAttr, outstandingAttr, paymentState] },
    include: [...includes, { model: User, as: 'voider', attributes: ['id', 'fullName'] },
      { model: Payment, as: 'payments', attributes: ['id', 'paymentNo', 'amount', 'method', 'paidOn', 'status'], required: false }],
    order: [[{ model: Payment, as: 'payments' }, 'paidOn', 'DESC']] });
  if (!e) throw notFound();
  return e;
}

// Totals per category over a date range (approved expenses only). Respects the same own / all scope.
async function summary(req, { from, to }) {
  const rows = await sequelize.query(`SELECT category, COUNT(*)::int AS count, SUM(amount)::text AS total FROM expenses
    WHERE status = 'APPROVED' AND (CAST(:from AS date) IS NULL OR expense_date >= CAST(:from AS date)) AND (CAST(:to AS date) IS NULL OR expense_date <= CAST(:to AS date))
    ${canAll(req) ? '' : 'AND created_by = :uid'} GROUP BY category ORDER BY SUM(amount) DESC`,
    { replacements: { from: from ?? null, to: to ?? null, uid: req.user.id }, type: QueryTypes.SELECT });
  const total = rows.reduce((s, r) => s + cents(r.total), 0n);
  return { from: from ?? null, to: to ?? null, total: str(total), categories: rows };
}

module.exports = { create, update, approve: (req, id, note) => decide(req, id, true, note), reject: (req, id, note) => decide(req, id, false, note),
  void: voidExpense, list, getOne, summary, activePaid };
