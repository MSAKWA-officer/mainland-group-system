const { Op, QueryTypes } = require('sequelize');
const { sequelize, FundReceipt, BankAccount, Bank, BankTransaction, User } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('./audit');
const core = require('./saleCore');
const banking = require('./banking');

/* Fund receipts = money received into a bank account and earmarked for a purpose (fuel, expenses, other).
   - Flow: POSTED -> VOIDED. Records are never deleted or edited; a mistake is voided with a reason.
   - Creating a receipt posts ONE DEPOSIT (CREDIT) to the bank ledger in the SAME database transaction, so the account lock, opening-date rule,
     future-date rule and audit trail all apply, and a failed posting leaves nothing behind.
   - Voiding a receipt voids its bank row with it (or nothing at all). A reconciled row blocks the void until un-reconciled, and the void is
     refused if it would take the account below zero (the money was already spent: void the later withdrawals / fuel fundings first).
   - Lock order is always: receipt -> bank account -> ledger rows, the same as fuel funding, so concurrent requests cannot deadlock. */
const { cents, str, bad } = core;
const SOURCES = ['OWNER_CAPITAL', 'HEAD_OFFICE', 'LOAN', 'GRANT', 'OTHER'];
const PURPOSES = ['FUEL', 'EXPENSES', 'OTHER'];
const PURPOSE_LABEL = { FUEL: 'Fuel', EXPENSES: 'Expenses', OTHER: 'Other' };
const notFound = () => new AppError(404, 'NOT_FOUND', 'Fund receipt not found');

const audited = (r) => ({ receiptNo: r.receiptNo, bankAccountId: r.bankAccountId, source: r.source, receivedFrom: r.receivedFrom, purpose: r.purpose,
  amount: r.amount, receiptDate: r.receiptDate, reference: r.reference, status: r.status });

const create = (req, body) => sequelize.transaction(async (t) => {
  const account = await banking.lockAccount(body.bankAccountId, t);
  if (!account.isActive) throw bad('bankAccountId', 'This bank account is inactive');
  if (account.currency !== banking.BASE_CURRENCY) throw bad('bankAccountId', `Funds can only be received into ${banking.BASE_CURRENCY} accounts`);
  const today = await core.dbToday(t);
  const date = body.receiptDate ?? today;
  if (date > today) throw bad('receiptDate', 'Receipt date cannot be in the future');
  const r = await FundReceipt.create({
    receiptNo: `FR-${core.year()}-${core.pad(await core.nextNo('fund_receipt_seq', t))}`, bankAccountId: account.id, source: body.source,
    receivedFrom: body.receivedFrom, purpose: body.purpose, amount: str(cents(body.amount)), receiptDate: date,
    reference: body.reference ?? null, notes: body.notes ?? null, status: 'POSTED', createdBy: req.user.id,
  }, { transaction: t });
  await banking.post(req, { account, type: 'DEPOSIT', amount: r.amount, txnDate: date, reference: r.reference ?? r.receiptNo,
    description: `Funds received ${r.receiptNo} for ${PURPOSE_LABEL[r.purpose]}`, counterparty: r.receivedFrom, fundReceiptId: r.id }, t);
  await audit.log(req, { action: 'FUND_RECEIPT_CREATED', entityType: 'FundReceipt', entityId: r.id, newValues: audited(r) }, t);
  return r.id;
});

const voidReceipt = (req, id, reason) => sequelize.transaction(async (t) => {
  if (!reason || reason.trim().length < 3) throw bad('reason', 'A reason is required to void a fund receipt');
  const r = await FundReceipt.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!r) throw notFound();
  if (r.status !== 'POSTED') throw new AppError(409, 'BAD_STATE', `A ${r.status.toLowerCase()} receipt cannot be voided`);
  const old = audited(r);
  const peek = await BankTransaction.findAll({ where: { fundReceiptId: r.id, status: 'POSTED' }, attributes: ['id', 'bankAccountId'], transaction: t });
  const accs = await banking.lockAccounts(peek.map((x) => x.bankAccountId), t);
  const rows = await BankTransaction.findAll({ where: { id: peek.map((x) => x.id) }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE });
  for (const x of rows) await banking.voidLeg(req, x, accs.get(x.bankAccountId), `Fund receipt ${r.receiptNo} voided: ${reason}`, t);
  await r.update({ status: 'VOIDED', voidedAt: new Date(), voidedBy: req.user.id, voidReason: reason }, { transaction: t });
  await audit.log(req, { action: 'FUND_RECEIPT_VOIDED', entityType: 'FundReceipt', entityId: r.id, oldValues: old, newValues: audited(r), reason }, t);
  return r.id;
});

/* ---------- reads ---------- */
const inc = [
  { model: BankAccount, as: 'bankAccount', attributes: ['id', 'accountNo', 'accountName', 'currency'], include: [{ model: Bank, as: 'bank', attributes: ['id', 'code', 'name'] }] },
  { model: User, as: 'creator', attributes: ['id', 'fullName'] },
];
const SORT = { receiptDate: 'receiptDate', amount: 'amount', receiptNo: 'receiptNo' };

async function list(q) {
  const where = {};
  for (const k of ['bankAccountId', 'source', 'purpose']) if (q[k] !== undefined) where[k] = q[k];
  if (q.status !== 'ALL') where.status = q.status;
  if (q.from || q.to) where.receiptDate = { ...(q.from && { [Op.gte]: q.from }), ...(q.to && { [Op.lte]: q.to }) };
  if (q.search) where[Op.or] = ['receiptNo', 'receivedFrom', 'reference'].map((f) => ({ [f]: { [Op.iLike]: like(q.search) } }));
  const { rows, count } = await FundReceipt.findAndCountAll({ where, include: inc, order: [[SORT[q.sortBy], q.sortDir.toUpperCase()], ['createdAt', 'DESC']],
    limit: q.limit, offset: (q.page - 1) * q.limit, distinct: true });
  const [sum] = await FundReceipt.findAll({ where: { ...where, status: 'POSTED' },
    attributes: [[sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('amount')), 0), 'postedTotal']], raw: true });
  return { data: rows, total: count, page: q.page, limit: q.limit, postedTotal: String(sum.postedTotal) };
}

async function getOne(id) {
  const r = await FundReceipt.findByPk(id, { include: [...inc, { model: User, as: 'voider', attributes: ['id', 'fullName'] },
    { model: BankTransaction, as: 'bankTransactions', attributes: ['id', 'txnNo', 'type', 'amount', 'txnDate', 'status', 'isReconciled'], required: false }] });
  if (!r) throw notFound();
  return r;
}

// Posted receipts over a date range, grouped by purpose (default), source or bank account.
async function summary({ from, to, groupBy }) {
  const col = { purpose: 'f.purpose', source: 'f.source', account: "a.account_no || ' (' || a.account_name || ')'" }[groupBy];
  const rows = await sequelize.query(`SELECT ${col} AS label, COUNT(*)::int AS count, SUM(f.amount)::text AS total
    FROM fund_receipts f JOIN bank_accounts a ON a.id = f.bank_account_id
    WHERE f.status = 'POSTED' AND (CAST(:from AS date) IS NULL OR f.receipt_date >= CAST(:from AS date)) AND (CAST(:to AS date) IS NULL OR f.receipt_date <= CAST(:to AS date))
    GROUP BY ${col} ORDER BY SUM(f.amount) DESC`, { replacements: { from: from ?? null, to: to ?? null }, type: QueryTypes.SELECT });
  const total = rows.reduce((s, r) => s + cents(r.total), 0n);
  return { groupBy, from: from ?? null, to: to ?? null, total: str(total), rows };
}

module.exports = { SOURCES, PURPOSES, create, void: voidReceipt, list, getOne, summary };
