const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { cents, str } = require('./saleCore');
const { dmy } = require('../utils/salesReportXlsx');
const { AppError } = require('../utils/errors');

/* Customer balance reports - read-only, calculated live from COMPLETED CREDIT sales. Company-wide (Owner / Manager).
   Everything is "as at" a date (default today): sales made after it are ignored, and so are payments made after it or voided on/before it, so past dates are reproducible.
   Balance = invoice total - payments. Overdue = unpaid part of invoices whose due date (or sale date, when there is none) is before the "as at" date.
   0. balances  - per customer: invoiced, paid, balance, overdue, last payment
   1. ageing    - per customer: balance split into Current / 1-30 / 31-60 / 61-90 / over 90 days past due
   2. invoices  - every unpaid credit invoice, with days overdue
   3. statement - one customer, date range: opening balance, invoices, payments, running balance */
const LIMIT = 5000;
const DETAIL_LIMIT = 20000;
const run = (sql, rep) => sequelize.query(sql, { replacements: rep, type: QueryTypes.SELECT });
const sumC = (rows, k) => rows.reduce((s, r) => s + cents(r[k] ?? 0), 0n);
const sumN = (rows, k) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
const M = (e) => `COALESCE(${e}, 0)::numeric(20,2)::text`;
const cols = (list) => list.map(([key, label, type = 'money']) => ({ key, label, type }));
const moneyTotals = (rows, keys) => Object.fromEntries(keys.map((k) => [k, str(sumC(rows, k))]));
const countTotals = (rows, keys) => Object.fromEntries(keys.map((k) => [k, sumN(rows, k)]));

const AS_OF = 'CAST(:asOf AS date)';
const DUE = 'COALESCE(s.due_date, s.sale_date)';
// o = every credit invoice up to the date, with what was paid by then (bal = still owed, days = days past due; > 0 means overdue).
const CTE = `WITH o AS (SELECT s.sale_no, s.customer_id, s.sale_date, s.due_date, s.total, pp.paid, (s.total - pp.paid) AS bal, (${AS_OF} - ${DUE}) AS days
    FROM sales s LEFT JOIN LATERAL (SELECT COALESCE(SUM(p.amount), 0) AS paid FROM sale_payments p WHERE p.sale_id = s.id AND p.paid_on <= ${AS_OF}
      AND (p.voided_at IS NULL OR CAST(p.voided_at AS date) > ${AS_OF})) pp ON true
    WHERE s.sale_type = 'CREDIT' AND s.status = 'COMPLETED' AND s.customer_id IS NOT NULL AND s.sale_date <= ${AS_OF})`;
const CUST = '(CAST(:cid AS uuid) IS NULL OR c.id = CAST(:cid AS uuid)) AND (CAST(:sp AS uuid) IS NULL OR c.salesperson_id = CAST(:sp AS uuid))';

const asOfOf = async (q) => q.asOf || (await run("SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS d", {}))[0].d;
const ctx = async (q) => { const asOf = await asOfOf(q); return { asOf, rep: { asOf, cid: q.customerId ?? null, sp: q.salespersonId ?? null } }; };
const head = (report, title, exportTitle, asOf, empty) => ({ report, title, exportTitle: `${exportTitle} AS AT ${dmy(asOf)}`, asOf, infoLine: `As at: ${dmy(asOf)}     Credit sales only`, emptyText: empty, sheetName: 'Customer balances' });

/* 0. Balances - company layout: Date | Customer ID | Customer name | Phone | Opening balance | Total credit sales | Total paid | Remaining balance | Remark.
   With "from": opening = what the customer still owed before that date; credit sales / paid = invoices and payments from that date up to "asOf". Without "from" opening is 0 and everything counts.
   Remaining = opening + credit sales - paid (= the balance as at "asOf"). Date = date of the customer's latest credit sale in the period. */
async function balances(req, q) {
  const { asOf, rep } = await ctx(q);
  const from = q.from || null;
  const F = "COALESCE(CAST(:from AS date), DATE '1900-01-01')";
  const OVD = '(SELECT COALESCE(SUM(o.bal), 0) FROM o WHERE o.customer_id = c.id AND o.bal > 0 AND o.days > 0)';
  const rows = await run(`${CTE},
    ci AS (SELECT o.customer_id, SUM(o.total) FILTER (WHERE o.sale_date < ${F}) AS o_inv, SUM(o.total) FILTER (WHERE o.sale_date >= ${F}) AS sales,
        MAX(o.sale_date) FILTER (WHERE o.sale_date >= ${F}) AS last_sale FROM o GROUP BY o.customer_id),
    cp AS (SELECT s.customer_id, SUM(p.amount) FILTER (WHERE p.paid_on < ${F}) AS o_pay, SUM(p.amount) FILTER (WHERE p.paid_on >= ${F}) AS paid
        FROM sale_payments p JOIN sales s ON s.id = p.sale_id
        WHERE s.sale_type = 'CREDIT' AND s.status = 'COMPLETED' AND s.customer_id IS NOT NULL AND s.sale_date <= ${AS_OF} AND p.paid_on <= ${AS_OF}
          AND (p.voided_at IS NULL OR CAST(p.voided_at AS date) > ${AS_OF}) GROUP BY s.customer_id)
    SELECT * FROM (SELECT COALESCE(to_char(ci.last_sale, 'YYYY-MM-DD'), '') AS date, COALESCE(c.code, '') AS "customerId", c.name AS "customerName", COALESCE(c.phone, '') AS phone,
        ${M('COALESCE(ci.o_inv, 0) - COALESCE(cp.o_pay, 0)')} AS opening, ${M('ci.sales')} AS "creditSales", ${M('cp.paid')} AS "totalPaid",
        ${M('COALESCE(ci.o_inv, 0) + COALESCE(ci.sales, 0) - COALESCE(cp.o_pay, 0) - COALESCE(cp.paid, 0)')} AS remaining,
        ${OVD} AS overdue_n, COALESCE(ci.o_inv, 0) + COALESCE(ci.sales, 0) - COALESCE(cp.o_pay, 0) - COALESCE(cp.paid, 0) AS remaining_n
      FROM customers c JOIN ci ON ci.customer_id = c.id LEFT JOIN cp ON cp.customer_id = c.id WHERE ${CUST}) x
    WHERE (CAST(:includeZero AS boolean) OR x.remaining_n > 0) AND (NOT CAST(:overdueOnly AS boolean) OR x.overdue_n > 0)
    ORDER BY x.remaining_n DESC, x."customerName" LIMIT ${LIMIT}`, { ...rep, from, includeZero: !!q.includeZero, overdueOnly: !!q.overdueOnly });
  const out = rows.map(({ overdue_n: od, remaining_n: rem, ...r }) => ({ ...r, remark: Number(od) > 0 ? 'Overdue' : Number(rem) <= 0 ? 'Fully paid' : '' }));
  const info = `As at: ${dmy(asOf)}${from ? `     From: ${dmy(from)}` : ''}     Credit sales only`;
  return { ...head('balances', 'Customer balances', 'CUSTOMER BALANCES', asOf, 'No customer owes money on this date.'), infoLine: info, layout: 'balances',
    columns: [{ key: 'date', label: 'DATE', type: 'text' }, { key: 'customerId', label: 'Customer ID', type: 'text' }, { key: 'customerName', label: 'Customer name', type: 'text' }, { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'opening', label: 'Opening balance (TZS)', type: 'money' }, { key: 'creditSales', label: 'Total Credit Sales', type: 'money' }, { key: 'totalPaid', label: 'Total paid (TZS)', type: 'money', color: '008000' },
      { key: 'remaining', label: 'Remaining balance (TZS)', type: 'money', color: 'FF0000' }, { key: 'remark', label: 'REMARK', type: 'text' }],
    totals: moneyTotals(out, ['opening', 'creditSales', 'totalPaid', 'remaining']), rows: out };
}

/* 1. Ageing */
async function ageing(req, q) {
  const { asOf, rep } = await ctx(q);
  const b = (cond) => M(`SUM(o.bal) FILTER (WHERE ${cond})`);
  const rows = await run(`${CTE} SELECT COALESCE(c.code, '') AS code, c.name, COALESCE(c.phone, '') AS phone,
      ${b('o.days <= 0')} AS "current", ${b('o.days BETWEEN 1 AND 30')} AS "days1to30", ${b('o.days BETWEEN 31 AND 60')} AS "days31to60",
      ${b('o.days BETWEEN 61 AND 90')} AS "days61to90", ${b('o.days > 90')} AS "over90", ${M('SUM(o.bal)')} AS balance
    FROM customers c JOIN o ON o.customer_id = c.id AND o.bal > 0 WHERE ${CUST} GROUP BY c.id ORDER BY SUM(o.bal) DESC, c.name LIMIT ${LIMIT}`, rep);
  return { ...head('ageing', 'Credit ageing', 'CREDIT AGEING', asOf, 'No unpaid credit invoices on this date.'),
    columns: cols([['code', 'Code', 'text'], ['name', 'Customer', 'text'], ['phone', 'Phone', 'text'], ['current', 'Current (not yet due)'], ['days1to30', '1-30 days'], ['days31to60', '31-60 days'],
      ['days61to90', '61-90 days'], ['over90', 'Over 90 days'], ['balance', 'Balance']]),
    totals: moneyTotals(rows, ['current', 'days1to30', 'days31to60', 'days61to90', 'over90', 'balance']), rows };
}

/* 2. Unpaid invoices */
async function invoices(req, q) {
  const { asOf, rep } = await ctx(q);
  const rows = await run(`${CTE} SELECT c.name AS customer, o.sale_no AS "saleNo", to_char(o.sale_date, 'YYYY-MM-DD') AS "saleDate", COALESCE(to_char(o.due_date, 'YYYY-MM-DD'), '') AS "dueDate",
      o.total::numeric(20,2)::text AS invoiced, o.paid::numeric(20,2)::text AS paid, o.bal::numeric(20,2)::text AS balance, GREATEST(o.days, 0)::int AS "daysOverdue",
      CASE WHEN o.days <= 0 THEN 'Current' WHEN o.days <= 30 THEN '1-30 days' WHEN o.days <= 60 THEN '31-60 days' WHEN o.days <= 90 THEN '61-90 days' ELSE 'Over 90 days' END AS bucket
    FROM o JOIN customers c ON c.id = o.customer_id WHERE o.bal > 0 AND ${CUST}
    ORDER BY c.name, COALESCE(o.due_date, o.sale_date), o.sale_no LIMIT ${DETAIL_LIMIT + 1}`, rep);
  if (rows.length > DETAIL_LIMIT) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field: 'asOf', message: `More than ${DETAIL_LIMIT} unpaid invoices: filter by customer or salesperson` }]);
  return { ...head('invoices', 'Unpaid credit invoices', 'UNPAID CREDIT INVOICES', asOf, 'No unpaid credit invoices on this date.'),
    columns: cols([['customer', 'Customer', 'text'], ['saleNo', 'Invoice No.', 'text'], ['saleDate', 'Invoice date', 'text'], ['dueDate', 'Due date', 'text'], ['invoiced', 'Invoiced'], ['paid', 'Paid'],
      ['balance', 'Balance'], ['daysOverdue', 'Days overdue', 'count'], ['bucket', 'Ageing', 'text']]),
    totals: moneyTotals(rows, ['invoiced', 'paid', 'balance']), rows };
}

/* 3. Statement of account for one customer */
async function statement(req, q) {
  const [c] = await run('SELECT id, code, name FROM customers WHERE id = CAST(:cid AS uuid)', { cid: q.customerId });
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Customer not found');
  const rep = { cid: c.id, from: q.from, to: q.to };
  const TX = `WITH tx AS (
      SELECT s.sale_date AS d, 1 AS ord, 'Invoice' AS type, s.sale_no AS ref, 'Credit sale' AS descr, s.total AS debit, 0::numeric AS credit
        FROM sales s WHERE s.customer_id = CAST(:cid AS uuid) AND s.sale_type = 'CREDIT' AND s.status = 'COMPLETED'
      UNION ALL
      SELECT p.paid_on, 2, 'Payment', p.receipt_no, 'Payment for ' || s.sale_no || ' (' || p.method || ')', 0::numeric, p.amount
        FROM sale_payments p JOIN sales s ON s.id = p.sale_id
        WHERE s.customer_id = CAST(:cid AS uuid) AND s.sale_type = 'CREDIT' AND s.status = 'COMPLETED' AND p.voided_at IS NULL)`;
  const [[open], list] = await Promise.all([
    run(`${TX} SELECT COALESCE(SUM(debit - credit), 0)::numeric(20,2)::text AS opening FROM tx WHERE d < CAST(:from AS date)`, rep).then((r) => [r[0]]),
    run(`${TX}, r AS (SELECT tx.*, SUM(debit - credit) OVER (ORDER BY d, ord, ref ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS bal FROM tx)
      SELECT to_char(d, 'YYYY-MM-DD') AS date, type, ref AS reference, descr AS description, NULLIF(debit, 0)::numeric(20,2)::text AS debit,
        NULLIF(credit, 0)::numeric(20,2)::text AS credit, bal::numeric(20,2)::text AS balance
      FROM r WHERE d BETWEEN CAST(:from AS date) AND CAST(:to AS date) ORDER BY d, ord, ref LIMIT ${DETAIL_LIMIT + 1}`, rep),
  ]);
  if (list.length > DETAIL_LIMIT) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field: 'to', message: 'Too many lines: choose a shorter period' }]);
  const rows = [{ date: q.from, type: 'Opening balance', reference: '', description: '', debit: null, credit: null, balance: open.opening }, ...list];
  const closing = list.length ? list[list.length - 1].balance : open.opening;
  return { report: 'statement', title: 'Customer statement', exportTitle: `CUSTOMER STATEMENT - ${String(c.name).toUpperCase()}`, from: q.from, to: q.to,
    infoLine: `Customer: ${c.name} (${c.code})     Period: ${dmy(q.from)} to ${dmy(q.to)}     Closing balance: ${closing}`, emptyText: 'No entries.', sheetName: 'Statement',
    customer: { id: c.id, code: c.code, name: c.name }, openingBalance: open.opening, closingBalance: closing,
    columns: cols([['date', 'Date', 'text'], ['type', 'Type', 'text'], ['reference', 'Reference', 'text'], ['description', 'Description', 'text'], ['debit', 'Invoiced (debit)'], ['credit', 'Paid (credit)'], ['balance', 'Balance']]),
    totals: moneyTotals(list, ['debit', 'credit']), rows };
}

module.exports = { balances, ageing, invoices, statement };
