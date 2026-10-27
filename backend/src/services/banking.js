const crypto = require('crypto');
const { QueryTypes, literal } = require('sequelize');
const { sequelize, BankAccount, BankTransaction } = require('../models');
const { AppError } = require('../utils/errors');
const audit = require('./audit');
const core = require('./saleCore');

/* Bank ledger rules (all money maths is BigInt cents on the server; amounts sent by the client are never trusted):
   - A bank account's balance is never stored. It is opening_balance + POSTED credits - POSTED debits, so it can never drift from the ledger.
   - Every posting locks the account row first (SELECT ... FOR UPDATE), so two requests can never both spend the same money.
   - Transactions are never edited or deleted (the database refuses it). A mistake is VOIDED, with a reason, and stays on the record.
   - A reconciled transaction cannot be voided until it is un-reconciled.
   - Debits that would take the account below zero are refused unless the account was created with allow_overdraft. */
const { cents, str, bad } = core;
const BASE_CURRENCY = 'TZS';
const CREDIT_TYPES = ['DEPOSIT', 'TRANSFER_IN', 'INTEREST', 'CUSTOMER_PAYMENT'];
const directionOf = (type) => (CREDIT_TYPES.includes(type) ? 'CREDIT' : 'DEBIT');
const label = (a) => `${a.accountNo}${a.accountName ? ` (${a.accountName})` : ''}`;

// SQL fragment: current balance of the account aliased `alias` (use inside raw SQL).
const balanceSql = (alias = 'a') => `(${alias}.opening_balance + COALESCE((SELECT SUM(CASE WHEN x.direction = 'CREDIT' THEN x.amount ELSE -x.amount END)
  FROM bank_transactions x WHERE x.bank_account_id = ${alias}.id AND x.status = 'POSTED'), 0))`;
// Same thing as a Sequelize attribute for BankAccount queries.
const balanceAttr = () => [literal(`${balanceSql('"BankAccount"')}::text`), 'balance'];

const snap = (t) => ({ txnNo: t.txnNo, bankAccountId: t.bankAccountId, type: t.type, direction: t.direction, amount: t.amount, txnDate: t.txnDate,
  reference: t.reference, description: t.description, counterparty: t.counterparty, status: t.status });

async function lockAccount(id, t) {
  const a = await BankAccount.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!a) throw new AppError(404, 'NOT_FOUND', 'Bank account not found');
  return a;
}
// Lock several accounts in a fixed order (by id) so two transfers in opposite directions can never deadlock.
async function lockAccounts(ids, t) {
  const out = new Map();
  for (const id of [...new Set(ids)].sort()) out.set(id, await lockAccount(id, t));
  return out;
}
async function balanceCents(account, t) {
  const [r] = await sequelize.query(`SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0)::text AS net
    FROM bank_transactions WHERE bank_account_id = :id AND status = 'POSTED'`, { transaction: t, replacements: { id: account.id }, type: QueryTypes.SELECT });
  return cents(account.openingBalance) + cents(r.net);
}

/* ---------- post one ledger row (caller already holds the account lock inside transaction t) ---------- */
async function post(req, a, t) {
  const { account, type, amount, txnDate, reference, description, counterparty, transferGroupId, customerPaymentId, paymentId, fuelFundingId, salePaymentId } = a;
  if (!account.isActive) throw new AppError(409, 'ACCOUNT_INACTIVE', `Bank account ${label(account)} is inactive`);
  const amt = cents(amount);
  if (amt <= 0n) throw bad('amount', 'Amount must be greater than 0');
  const today = await core.dbToday(t);
  const date = txnDate ?? today;
  if (date > today) throw bad('txnDate', 'Transaction date cannot be in the future');
  if (date < account.openingDate) throw bad('txnDate', `Transaction date cannot be before the account opening date (${account.openingDate})`);
  const direction = directionOf(type);
  if (direction === 'DEBIT' && !account.allowOverdraft) {
    const bal = await balanceCents(account, t);
    if (bal - amt < 0n) throw new AppError(409, 'INSUFFICIENT_FUNDS', `Insufficient funds in ${label(account)}: balance is ${str(bal)}`, [{ field: 'amount', message: `Balance is ${str(bal)}` }]);
  }
  const txn = await BankTransaction.create({
    txnNo: `BTX-${core.year()}-${core.pad(await core.nextNo('bank_txn_seq', t))}`, bankAccountId: account.id, type, direction, amount: str(amt), txnDate: date,
    reference: reference ?? null, description: description ?? null, counterparty: counterparty ?? null,
    transferGroupId: transferGroupId ?? null, customerPaymentId: customerPaymentId ?? null, paymentId: paymentId ?? null, fuelFundingId: fuelFundingId ?? null, salePaymentId: salePaymentId ?? null, status: 'POSTED', createdBy: req.user.id,
  }, { transaction: t });
  await audit.log(req, { action: 'BANK_TRANSACTION_POSTED', entityType: 'BankTransaction', entityId: txn.id, newValues: snap(txn) }, t);
  return txn;
}

// A manual deposit / withdrawal / charge / interest entry.
const record = (req, body) => sequelize.transaction(async (t) => {
  const account = await lockAccount(body.bankAccountId, t);
  const txn = await post(req, { account, ...body }, t);
  return txn.id;
});

// Move money between two of our own accounts: one DEBIT leg and one CREDIT leg that share a transfer_group_id.
const transfer = (req, body) => sequelize.transaction(async (t) => {
  if (body.fromAccountId === body.toAccountId) throw bad('toAccountId', 'Choose two different accounts');
  const accs = await lockAccounts([body.fromAccountId, body.toAccountId], t);
  const from = accs.get(body.fromAccountId); const to = accs.get(body.toAccountId);
  if (from.currency !== to.currency) throw new AppError(409, 'CURRENCY_MISMATCH', `Cannot transfer between ${from.currency} and ${to.currency} accounts`);
  const group = crypto.randomUUID();
  const common = { amount: body.amount, txnDate: body.txnDate, reference: body.reference, description: body.description, transferGroupId: group };
  const out = await post(req, { account: from, type: 'TRANSFER_OUT', counterparty: label(to), ...common }, t);
  const inn = await post(req, { account: to, type: 'TRANSFER_IN', counterparty: label(from), ...common }, t);
  await audit.log(req, { action: 'BANK_TRANSFER_MADE', entityType: 'BankTransaction', entityId: group,
    newValues: { from: label(from), to: label(to), amount: out.amount, txnDate: out.txnDate, outTxnNo: out.txnNo, inTxnNo: inn.txnNo } }, t);
  return [out.id, inn.id];
});

/* ---------- void ---------- */
// Voids one posted row inside transaction t (the account must already be locked). Used by voidTransaction and by customer-payment voids.
async function voidLeg(req, txn, account, reason, t) {
  if (txn.status === 'VOIDED') throw new AppError(409, 'BAD_STATE', `Transaction ${txn.txnNo} is already voided`);
  if (txn.isReconciled) throw new AppError(409, 'RECONCILED', `Transaction ${txn.txnNo} is reconciled. Un-reconcile it before voiding.`);
  if (txn.direction === 'CREDIT' && !account.allowOverdraft) {
    const bal = await balanceCents(account, t);
    if (bal - cents(txn.amount) < 0n)
      throw new AppError(409, 'INSUFFICIENT_FUNDS', `Voiding ${txn.txnNo} would take ${label(account)} below zero (balance ${str(bal)}). Void the later withdrawals first.`);
  }
  const old = snap(txn);
  await txn.update({ status: 'VOIDED', voidedAt: new Date(), voidedBy: req.user.id, voidReason: reason }, { transaction: t });
  await audit.log(req, { action: 'BANK_TRANSACTION_VOIDED', entityType: 'BankTransaction', entityId: txn.id, oldValues: old, newValues: snap(txn), reason }, t);
  return txn;
}

const voidTransaction = (req, id, reason) => sequelize.transaction(async (t) => {
  if (!reason || reason.trim().length < 3) throw bad('reason', 'A reason is required to void a transaction');
  const peek = await BankTransaction.findByPk(id, { transaction: t });
  if (!peek) throw new AppError(404, 'NOT_FOUND', 'Bank transaction not found');
  if (peek.customerPaymentId) throw new AppError(409, 'LINKED', 'This transaction came from a customer payment. Void the customer payment instead.');
  if (peek.paymentId) throw new AppError(409, 'LINKED', 'This transaction came from a payment. Void the payment instead.');
  if (peek.salePaymentId) throw new AppError(409, 'LINKED', 'This transaction came from a sale payment. Void the sale payment (or the sale) instead.');
  if (peek.fuelFundingId) throw new AppError(409, 'LINKED', 'This transaction came from a fuel funding. Void the fuel funding instead.');
  const legs = peek.transferGroupId
    ? await BankTransaction.findAll({ where: { transferGroupId: peek.transferGroupId }, attributes: ['id', 'bankAccountId'], transaction: t })
    : [peek];
  const accs = await lockAccounts(legs.map((l) => l.bankAccountId), t);               // accounts first (same order as post()), then the ledger rows
  const fresh = await BankTransaction.findAll({ where: { id: legs.map((l) => l.id) }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE });
  for (const leg of fresh) await voidLeg(req, leg, accs.get(leg.bankAccountId), reason, t);
  return peek.id;
});

const setReconciled = (req, id, flag) => sequelize.transaction(async (t) => {
  const txn = await BankTransaction.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!txn) throw new AppError(404, 'NOT_FOUND', 'Bank transaction not found');
  if (txn.status !== 'POSTED') throw new AppError(409, 'BAD_STATE', `A ${txn.status.toLowerCase()} transaction cannot be reconciled`);
  if (txn.isReconciled === flag) throw new AppError(409, 'BAD_STATE', flag ? 'Already reconciled' : 'This transaction is not reconciled');
  await txn.update(flag ? { isReconciled: true, reconciledAt: new Date(), reconciledBy: req.user.id } : { isReconciled: false, reconciledAt: null, reconciledBy: null }, { transaction: t });
  await audit.log(req, { action: flag ? 'BANK_TRANSACTION_RECONCILED' : 'BANK_TRANSACTION_UNRECONCILED', entityType: 'BankTransaction', entityId: txn.id,
    oldValues: { isReconciled: !flag }, newValues: { isReconciled: flag, txnNo: txn.txnNo } }, t);
  return txn.id;
});

/* ---------- statement ---------- */
// Opening balance at `from`, every posted row in the range with a running balance, closing balance at `to`.
async function statement(account, { from, to, page, limit }) {
  const rep = { id: account.id, from: from ?? null, to: to ?? null, limit, offset: (page - 1) * limit };
  const inRange = '(CAST(:from AS date) IS NULL OR r.txn_date >= CAST(:from AS date)) AND (CAST(:to AS date) IS NULL OR r.txn_date <= CAST(:to AS date))';
  const base = `SELECT x.id, x.txn_no, x.type, x.direction, x.amount, x.txn_date, x.reference, x.description, x.counterparty, x.is_reconciled, x.created_at,
      CASE WHEN x.direction = 'CREDIT' THEN x.amount ELSE -x.amount END AS signed,
      a.opening_balance + SUM(CASE WHEN x.direction = 'CREDIT' THEN x.amount ELSE -x.amount END)
        OVER (ORDER BY x.txn_date, x.created_at, x.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
    FROM bank_transactions x JOIN bank_accounts a ON a.id = x.bank_account_id WHERE x.bank_account_id = :id AND x.status = 'POSTED'`;
  const [sum] = await sequelize.query(`SELECT
      (SELECT opening_balance FROM bank_accounts WHERE id = :id) + COALESCE(SUM(r.signed) FILTER (WHERE CAST(:from AS date) IS NOT NULL AND r.txn_date < CAST(:from AS date)), 0) AS opening,
      COALESCE(SUM(r.amount) FILTER (WHERE r.direction = 'CREDIT' AND ${inRange}), 0) AS credits,
      COALESCE(SUM(r.amount) FILTER (WHERE r.direction = 'DEBIT' AND ${inRange}), 0) AS debits,
      COUNT(*) FILTER (WHERE ${inRange}) AS cnt
    FROM (${base}) r`, { replacements: rep, type: QueryTypes.SELECT });
  const rows = await sequelize.query(`SELECT r.id, r.txn_no AS "txnNo", r.type, r.direction, r.amount::text AS amount, r.txn_date AS "txnDate", r.reference, r.description,
      r.counterparty, r.is_reconciled AS "isReconciled", r.running::text AS "balance"
    FROM (${base}) r WHERE ${inRange} ORDER BY r.txn_date, r.created_at, r.id LIMIT :limit OFFSET :offset`, { replacements: rep, type: QueryTypes.SELECT });
  const opening = cents(sum.opening); const credits = cents(sum.credits); const debits = cents(sum.debits);
  return { account: { id: account.id, accountNo: account.accountNo, accountName: account.accountName, currency: account.currency }, from: from ?? null, to: to ?? null,
    openingBalance: str(opening), totalCredits: str(credits), totalDebits: str(debits), closingBalance: str(opening + credits - debits),
    data: rows, total: Number(sum.cnt), page, limit };
}

module.exports = { BASE_CURRENCY, CREDIT_TYPES, directionOf, label, balanceSql, balanceAttr, lockAccount, lockAccounts, balanceCents, post, record, transfer, voidLeg, voidTransaction, setReconciled, statement };
