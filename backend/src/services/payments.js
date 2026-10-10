const { Op } = require('sequelize');
const { sequelize, Payment, Expense, BankAccount, Bank, BankTransaction, User } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('./audit');
const core = require('./saleCore');
const banking = require('./banking');
const expenses = require('./expenses');

/* Payments = money paid OUT: to a supplier, landlord, staff member ... (money received from customers is customer_payments).
   - A payment can settle an APPROVED expense (it can never pay more than what is still outstanding) or stand alone with a payee.
   - When a bank account is chosen, a WITHDRAWAL is posted to the bank ledger in the SAME database transaction, so the balance, the
     insufficient-funds rule, the opening-date rule and the audit trail all apply. Cash / mobile money may be paid without a bank account.
   - Voiding reverses the payment and its bank ledger row together (or nothing at all). A reconciled bank row blocks the void until un-reconciled.
   Lock order is always: expense -> bank account -> ledger rows, so concurrent requests cannot deadlock. */
const { cents, str, bad } = core;

const audited = (p) => ({ paymentNo: p.paymentNo, expenseId: p.expenseId, payee: p.payee, amount: p.amount, method: p.method, bankAccountId: p.bankAccountId,
  reference: p.reference, paidOn: p.paidOn, status: p.status });

const create = (req, body) => sequelize.transaction(async (t) => {
  const amt = cents(body.amount);
  const today = await core.dbToday(t);
  const paidOn = body.paidOn ?? today;
  if (paidOn > today) throw bad('paidOn', 'Payment date cannot be in the future');

  let expense = null; let payee = body.payee ?? null;
  if (body.expenseId) {
    expense = await Expense.findByPk(body.expenseId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!expense) throw bad('expenseId', 'Expense not found');
    if (expense.status !== 'APPROVED') throw new AppError(409, 'BAD_STATE', `Only an approved expense can be paid (this one is ${expense.status.toLowerCase()})`);
    if (paidOn < expense.expenseDate) throw bad('paidOn', `Payment date cannot be before the expense date (${expense.expenseDate})`);
    const { paid } = await expenses.activePaid(expense.id, t);
    const outstanding = cents(expense.amount) - paid;
    if (amt > outstanding) throw new AppError(409, 'OVERPAYMENT', `This expense has only ${str(outstanding)} left to pay`, [{ field: 'amount', message: `At most ${str(outstanding)}` }]);
    payee = payee ?? expense.payee;
  }
  if (!payee) throw bad('payee', 'Enter who this payment is made to');

  let account = null;
  if (body.bankAccountId) {
    account = await banking.lockAccount(body.bankAccountId, t);
    if (account.currency !== banking.BASE_CURRENCY) throw bad('bankAccountId', `Payments can only be made from ${banking.BASE_CURRENCY} accounts`);
  }
  const p = await Payment.create({
    paymentNo: `PAY-${core.year()}-${core.pad(await core.nextNo('payment_seq', t))}`, expenseId: expense?.id ?? null, payee, amount: str(amt), method: body.method,
    bankAccountId: account?.id ?? null, reference: body.reference ?? null, paidOn, notes: body.notes ?? null, status: 'ACTIVE', createdBy: req.user.id,
  }, { transaction: t });
  await audit.log(req, { action: 'PAYMENT_CREATED', entityType: 'Payment', entityId: p.id, newValues: audited(p) }, t);
  if (account) {
    await banking.post(req, { account, type: 'WITHDRAWAL', amount: str(amt), txnDate: paidOn, reference: body.reference ?? p.paymentNo,
      description: `Payment ${p.paymentNo} to ${payee}`, counterparty: payee, paymentId: p.id }, t);
  }
  return p.id;
});

const voidPayment = (req, id, reason) => sequelize.transaction(async (t) => {
  if (!reason || reason.trim().length < 3) throw bad('reason', 'A reason is required to void a payment');
  const p = await Payment.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Payment not found');
  if (p.status !== 'ACTIVE') throw new AppError(409, 'BAD_STATE', 'This payment is already voided');
  if (p.expenseId) await Expense.findByPk(p.expenseId, { transaction: t, lock: t.LOCK.UPDATE });
  const peek = await BankTransaction.findAll({ where: { paymentId: p.id, status: 'POSTED' }, attributes: ['id', 'bankAccountId'], transaction: t });
  const accs = await banking.lockAccounts(peek.map((x) => x.bankAccountId), t);
  const rows = await BankTransaction.findAll({ where: { id: peek.map((x) => x.id) }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE });
  const old = audited(p);
  for (const x of rows) await banking.voidLeg(req, x, accs.get(x.bankAccountId), `Payment ${p.paymentNo} voided: ${reason}`, t);
  await p.update({ status: 'VOIDED', voidedAt: new Date(), voidedBy: req.user.id, voidReason: reason }, { transaction: t });
  await audit.log(req, { action: 'PAYMENT_VOIDED', entityType: 'Payment', entityId: p.id, oldValues: old, newValues: audited(p), reason }, t);
  return p.id;
});

/* ---------- reads ---------- */
const accountInc = { model: BankAccount, as: 'bankAccount', attributes: ['id', 'accountNo', 'accountName', 'currency'],
  include: [{ model: Bank, as: 'bank', attributes: ['id', 'code', 'name'] }] };
const listInc = [accountInc, { model: User, as: 'creator', attributes: ['id', 'fullName'] }, { model: Expense, as: 'expense', attributes: ['id', 'expenseNo', 'description'] }];
const SORT = { paidOn: 'paidOn', amount: 'amount', paymentNo: 'paymentNo', payee: 'payee' };

async function list(req, q) {
  const where = {};
  for (const k of ['expenseId', 'bankAccountId', 'method']) if (q[k] !== undefined) where[k] = q[k];
  if (q.status !== 'ALL') where.status = q.status;
  if (q.from || q.to) where.paidOn = { ...(q.from && { [Op.gte]: q.from }), ...(q.to && { [Op.lte]: q.to }) };
  if (q.search) where[Op.or] = ['paymentNo', 'payee', 'reference'].map((f) => ({ [f]: { [Op.iLike]: like(q.search) } }));
  const { rows, count } = await Payment.findAndCountAll({ where, include: listInc, order: [[SORT[q.sortBy], q.sortDir.toUpperCase()], ['createdAt', 'DESC']],
    limit: q.limit, offset: (q.page - 1) * q.limit, distinct: true });
  const [sum] = await Payment.findAll({ where: { ...where, status: 'ACTIVE' }, attributes: [[sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('amount')), 0), 'total']], raw: true });
  return { data: rows, total: count, page: q.page, limit: q.limit, activeTotal: String(sum.total) };
}

async function getOne(req, id) {
  const p = await Payment.findByPk(id, { include: [...listInc, { model: User, as: 'voider', attributes: ['id', 'fullName'] },
    { model: BankTransaction, as: 'bankTransactions', attributes: ['id', 'txnNo', 'type', 'amount', 'txnDate', 'status', 'isReconciled'], required: false }] });
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Payment not found');
  return p;
}

module.exports = { create, void: voidPayment, list, getOne };
