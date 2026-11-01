const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { cents, str } = require('./saleCore');
const { dmy } = require('../utils/salesReportXlsx');
const { AppError } = require('../utils/errors');

/* Payments reports - read-only, calculated live. Company-wide (Owner / Manager).
   MONEY RECEIVED = sale_payments of COMPLETED cash and credit sales that are not voided (this already includes payments made through "Customer payments",
   because every allocation writes a normal sale_payments row). Dates are the payment date (paid_on).
   0. detail    - one row per receipt
   1. summary   - period by period (day, month, year) split by payment method
   2. methods   - per payment method, with share of the total
   3. customers - per customer (walk-in cash sales grouped in one row)
   4. accounts  - per bank / mobile money account (payments with no account: cash, cheque, older records)
   5. paidOut   - MONEY PAID OUT (Payments module: suppliers, expenses ...), active payments only */
const LIMIT = 5000;
const DETAIL_LIMIT = 20000;
const run = (sql, rep) => sequelize.query(sql, { replacements: rep, type: QueryTypes.SELECT });
const sumC = (rows, k) => rows.reduce((s, r) => s + cents(r[k] ?? 0), 0n);
const sumN = (rows, k) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
const M = (e) => `COALESCE(${e}, 0)::numeric(20,2)::text`;
const cols = (list) => list.map(([key, label, type = 'money']) => ({ key, label, type }));
const moneyTotals = (rows, keys) => Object.fromEntries(keys.map((k) => [k, str(sumC(rows, k))]));
const countTotals = (rows, keys) => Object.fromEntries(keys.map((k) => [k, sumN(rows, k)]));

const METHODS = [['cash', 'CASH'], ['mobileMoney', 'MOBILE_MONEY'], ['bank', 'BANK'], ['card', 'CARD'], ['cheque', 'CHEQUE']];
const METHOD_KEYS = METHODS.map(([k]) => k);
const METHOD_NAME = (col) => `CASE ${col} WHEN 'CASH' THEN 'Cash' WHEN 'MOBILE_MONEY' THEN 'Mobile money' WHEN 'BANK' THEN 'Bank' WHEN 'CARD' THEN 'Card' WHEN 'CHEQUE' THEN 'Cheque' ELSE ${col} END`;
const perMethod = () => METHODS.map(([k, m]) => `${M(`SUM(p.amount) FILTER (WHERE p.method = '${m}')`)} AS "${k}"`).join(', ');
const METHOD_COLS = [['cash', 'Cash'], ['mobileMoney', 'Mobile money'], ['bank', 'Bank'], ['card', 'Card'], ['cheque', 'Cheque']];

const FROM = 'FROM sale_payments p JOIN sales s ON s.id = p.sale_id LEFT JOIN customers c ON c.id = s.customer_id';
const ACCOUNT_JOIN = 'LEFT JOIN bank_accounts ba ON ba.id = p.bank_account_id LEFT JOIN banks b ON b.id = ba.bank_id';
const ACCOUNT_TEXT = "COALESCE(COALESCE(b.short_name, b.name) || ' - ' || ba.account_name, '')";

const scope = (q) => ({
  rep: { from: q.from, to: q.to, method: q.method ?? null, saleType: q.saleType ?? null, customerId: q.customerId ?? null, bank: q.bankAccountId ?? null },
  where: `p.voided_at IS NULL AND s.status = 'COMPLETED' AND p.paid_on BETWEEN CAST(:from AS date) AND CAST(:to AS date)
    AND (CAST(:method AS text) IS NULL OR p.method = CAST(:method AS text)) AND (CAST(:saleType AS text) IS NULL OR s.sale_type = CAST(:saleType AS text))
    AND (CAST(:customerId AS uuid) IS NULL OR s.customer_id = CAST(:customerId AS uuid)) AND (CAST(:bank AS uuid) IS NULL OR p.bank_account_id = CAST(:bank AS uuid))`,
});
const head = (report, title, exportTitle, q, empty = 'No payments received in this period.') => {
  const filt = [q.method && `Method: ${q.method}`, q.saleType && `Sales: ${q.saleType}`].filter(Boolean).join('     ');
  return { report, title, exportTitle, from: q.from, to: q.to, infoLine: `Period: ${dmy(q.from)} to ${dmy(q.to)}${filt ? `     ${filt}` : ''}`, emptyText: empty, sheetName: 'Payments report' };
};

/* 0. Receipts list */
async function detail(req, q) {
  const { rep, where } = scope(q);
  const rows = await run(`SELECT to_char(p.paid_on, 'YYYY-MM-DD') AS date, p.receipt_no AS "receiptNo", s.sale_no AS "saleNo", s.sale_type AS "saleType",
      COALESCE(c.name, NULLIF(s.walk_in_name, ''), 'Walk-in customer') AS customer, ${METHOD_NAME('p.method')} AS method, ${ACCOUNT_TEXT} AS account,
      COALESCE(p.reference, '') AS reference, u.full_name AS "receivedBy", p.amount::numeric(20,2)::text AS total
    ${FROM} JOIN users u ON u.id = p.received_by ${ACCOUNT_JOIN}
    WHERE ${where} ORDER BY p.paid_on, p.receipt_no LIMIT ${DETAIL_LIMIT + 1}`, rep);
  if (rows.length > DETAIL_LIMIT) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field: 'to', message: `More than ${DETAIL_LIMIT} payments: choose a shorter period` }]);
  return { ...head('detail', 'Payments received', 'PAYMENTS RECEIVED REPORT', q),
    columns: cols([['date', 'Date', 'text'], ['receiptNo', 'Receipt No.', 'text'], ['saleNo', 'Sale No.', 'text'], ['saleType', 'Sale type', 'text'], ['customer', 'Customer', 'text'],
      ['method', 'Method', 'text'], ['account', 'Bank / mobile account', 'text'], ['reference', 'Reference', 'text'], ['receivedBy', 'Received by', 'text'], ['total', 'Amount (TZS)']]),
    totals: moneyTotals(rows, ['total']), rows };
}

/* 1. Summary by day / month / year, split by method */
async function summary(req, q) {
  const { rep, where } = scope(q);
  const g = ['month', 'year'].includes(q.groupBy) ? q.groupBy : 'day';
  const fmt = { day: 'YYYY-MM-DD', month: 'YYYY-MM', year: 'YYYY' }[g];
  const rows = await run(`SELECT to_char(date_trunc('${g}', p.paid_on), '${fmt}') AS period, COUNT(*)::int AS count, ${perMethod()}, ${M('SUM(p.amount)')} AS total
    ${FROM} WHERE ${where} GROUP BY 1 ORDER BY 1`, rep);
  return { ...head('summary', `Payments received by ${g}`, `${{ day: 'DAILY', month: 'MONTHLY', year: 'YEARLY' }[g]} PAYMENTS SUMMARY`, q), groupBy: g,
    columns: cols([['period', { day: 'Date', month: 'Month', year: 'Year' }[g], 'text'], ['count', 'Receipts', 'count'], ...METHOD_COLS, ['total', 'Total']]),
    totals: { ...countTotals(rows, ['count']), ...moneyTotals(rows, [...METHOD_KEYS, 'total']) }, rows };
}

/* 2. By payment method */
async function methods(req, q) {
  const { rep, where } = scope(q);
  const rows = await run(`SELECT ${METHOD_NAME('p.method')} AS method, COUNT(*)::int AS count, ${M('SUM(p.amount)')} AS total
    ${FROM} WHERE ${where} GROUP BY p.method ORDER BY SUM(p.amount) DESC`, rep);
  const all = Number(str(sumC(rows, 'total')));
  rows.forEach((r) => { r.share = all > 0 ? Number(((Number(r.total) / all) * 100).toFixed(1)) : 0; });
  return { ...head('methods', 'Payments by method', 'PAYMENTS SUMMARY BY METHOD', q),
    columns: cols([['method', 'Method', 'text'], ['count', 'Receipts', 'count'], ['total', 'Total'], ['share', 'Share (%)', 'qty']]),
    totals: { ...countTotals(rows, ['count']), ...moneyTotals(rows, ['total']), share: Number(sumN(rows, 'share').toFixed(1)) }, rows };
}

/* 3. By customer */
async function customers(req, q) {
  const { rep, where } = scope(q);
  const rows = await run(`SELECT COALESCE(c.code, '') AS code, COALESCE(c.name, 'Walk-in customers') AS name, COUNT(*)::int AS count, ${perMethod()},
      ${M('SUM(p.amount)')} AS total, to_char(MAX(p.paid_on), 'YYYY-MM-DD') AS "lastPayment"
    ${FROM} WHERE ${where} GROUP BY c.id, c.code, c.name ORDER BY SUM(p.amount) DESC, name LIMIT ${LIMIT}`, rep);
  return { ...head('customers', 'Payments by customer', 'PAYMENTS SUMMARY BY CUSTOMER', q),
    columns: cols([['code', 'Code', 'text'], ['name', 'Customer', 'text'], ['count', 'Receipts', 'count'], ...METHOD_COLS, ['total', 'Total'], ['lastPayment', 'Last payment', 'text']]),
    totals: { ...countTotals(rows, ['count']), ...moneyTotals(rows, [...METHOD_KEYS, 'total']) }, rows };
}

/* 4. By bank / mobile money account */
async function accounts(req, q) {
  const { rep, where } = scope(q);
  const rows = await run(`SELECT COALESCE(b.short_name, b.name, '') AS "bankName", COALESCE(ba.account_no, '') AS "accountNo",
      COALESCE(ba.account_name, 'No account (cash, cheque, older records)') AS "accountName", COUNT(*)::int AS count, ${M('SUM(p.amount)')} AS total
    ${FROM} ${ACCOUNT_JOIN} WHERE ${where} GROUP BY ba.id, b.id ORDER BY SUM(p.amount) DESC, "accountName" LIMIT ${LIMIT}`, rep);
  return { ...head('accounts', 'Payments by account', 'PAYMENTS SUMMARY BY ACCOUNT', q),
    columns: cols([['bankName', 'Bank', 'text'], ['accountNo', 'Account No.', 'text'], ['accountName', 'Account name', 'text'], ['count', 'Receipts', 'count'], ['total', 'Total']]),
    totals: { ...countTotals(rows, ['count']), ...moneyTotals(rows, ['total']) }, rows };
}

/* 5. Money paid out (Payments module) */
async function paidOut(req, q) {
  const { rep } = scope(q);
  const rows = await run(`SELECT to_char(p.paid_on, 'YYYY-MM-DD') AS date, p.payment_no AS "paymentNo", p.payee, ${METHOD_NAME('p.method')} AS method, ${ACCOUNT_TEXT} AS account,
      COALESCE(p.reference, '') AS reference, p.amount::numeric(20,2)::text AS total
    FROM payments p ${ACCOUNT_JOIN}
    WHERE p.status = 'ACTIVE' AND p.paid_on BETWEEN CAST(:from AS date) AND CAST(:to AS date) AND (CAST(:method AS text) IS NULL OR p.method = CAST(:method AS text))
    ORDER BY p.paid_on, p.payment_no LIMIT ${DETAIL_LIMIT + 1}`, rep);
  if (rows.length > DETAIL_LIMIT) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field: 'to', message: `More than ${DETAIL_LIMIT} payments: choose a shorter period` }]);
  return { ...head('paidOut', 'Payments made', 'PAYMENTS MADE (PAID OUT) REPORT', q, 'No payments made in this period.'),
    columns: cols([['date', 'Date', 'text'], ['paymentNo', 'Payment No.', 'text'], ['payee', 'Payee', 'text'], ['method', 'Method', 'text'], ['account', 'Bank / mobile account', 'text'],
      ['reference', 'Reference', 'text'], ['total', 'Amount (TZS)']]),
    totals: moneyTotals(rows, ['total']), rows };
}

module.exports = { detail, summary, methods, customers, accounts, paidOut };
