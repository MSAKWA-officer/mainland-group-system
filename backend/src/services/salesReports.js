const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const core = require('./saleCore');
const { TZ } = require('./efdZReports');
const { AppError } = require('../utils/errors');

/* Sales reports - read-only, calculated live from COMPLETED cash and credit sales (voided / cancelled / draft sales never count).
   Company-wide, so a type is only included when the user may read ALL of it (cash_sales.read_all / credit_sales.read_all: Owner and Manager).
   Dates are the sale date. Amounts: total = after discount, including tax; paid = money received so far; outstanding = total - paid (credit sales not yet paid).
   0. detail       - Daily / Monthly / Yearly / date-range sales list: one row per product sold (the Excel "Daily sales report" layout)
   1. summary      - period by period (day, month or year): cash, credit and combined
   2. salespersons - per salesperson
   3. customers    - per customer (walk-in cash sales are grouped in one row)
   4. products     - per product: quantity sold and sales value (after line discount, before tax) */
const { cents, str } = core;
const EXPORT_LIMIT = 5000;
const DETAIL_LIMIT = 20000;
const run = (sql, rep) => sequelize.query(sql, { replacements: rep, type: QueryTypes.SELECT });
const sumC = (rows, k) => rows.reduce((s, r) => s + cents(r[k] ?? 0), 0n);
const sumN = (rows, k) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
const M = (e) => `COALESCE(${e}, 0)::numeric(20,2)::text`;

// Which sale types this user may report on, and the shared WHERE for one request.
const scope = (req, q) => {
  const has = (p) => req.user.permissions.has(p);
  let types = [['CASH', 'cash_sales.read_all'], ['CREDIT', 'credit_sales.read_all']].filter(([, p]) => has(p)).map(([t]) => t);
  if (q.saleType) types = types.filter((t) => t === q.saleType);
  return { types, rep: { from: q.from, to: q.to, types: types.length ? types : ['NONE'], sp: q.salespersonId ?? null, tz: TZ },
    where: `s.status = 'COMPLETED' AND s.sale_type IN (:types) AND s.sale_date BETWEEN CAST(:from AS date) AND CAST(:to AS date)
      AND (CAST(:sp AS uuid) IS NULL OR s.salesperson_id = CAST(:sp AS uuid))` };
};
const cols = (list) => list.map(([key, label, type = 'money']) => ({ key, label, type }));
const moneyTotals = (rows, keys) => Object.fromEntries(keys.map((k) => [k, str(sumC(rows, k))]));
const countTotals = (rows, keys) => Object.fromEntries(keys.map((k) => [k, sumN(rows, k)]));
const head = (report, title, q, types) => ({ report, title, from: q.from, to: q.to, types });

/* 0. Sales list - one row per product sold. Total sale = line value after discount, before VAT (same basis as the By product report). */
async function detail(req, q) {
  const { types, rep, where } = scope(req, q);
  const rows = await run(`SELECT to_char(s.sale_date, 'YYYY-MM-DD') AS date, s.sale_no AS "receiptNo",
      COALESCE(c.name, NULLIF(s.walk_in_name, ''), 'Walk-in customer') AS customer, COALESCE(sp.full_name, '') AS salesperson,
      l.item_name AS product, l.quantity::numeric(20,3)::text AS qty, l.unit_price::numeric(20,2)::text AS "unitPrice",
      (l.quantity * l.unit_price - l.line_total)::numeric(20,2)::text AS discount, l.line_total::numeric(20,2)::text AS total
    FROM sales s JOIN sale_lines l ON l.sale_id = s.id
      LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN salespersons sp ON sp.id = s.salesperson_id
    WHERE ${where} ORDER BY s.sale_date, s.sale_no, l.item_name LIMIT ${DETAIL_LIMIT + 1}`, rep);
  if (rows.length > DETAIL_LIMIT) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field: 'to', message: `More than ${DETAIL_LIMIT} sale lines: choose a shorter period` }]);
  return { ...head('detail', 'Sales report', q, types),
    columns: cols([['date', 'Date', 'text'], ['receiptNo', 'Invoice/Receipt No.', 'text'], ['customer', 'Customer', 'text'], ['salesperson', 'Salesperson', 'text'], ['product', 'Product / Description', 'text'],
      ['qty', 'Qty', 'qty'], ['unitPrice', 'Unit Price (TZS)'], ['discount', 'Discount (TZS)'], ['total', 'Total Sale (TZS)']]),
    totals: { qty: sumN(rows, 'qty'), ...moneyTotals(rows, ['discount', 'total']) }, rows };
}

/* 1. Summary by day, month or year */
async function summary(req, q) {
  const { types, rep, where } = scope(req, q);
  const g = ['month', 'year'].includes(q.groupBy) ? q.groupBy : 'day';
  const fmt = { day: 'YYYY-MM-DD', month: 'YYYY-MM', year: 'YYYY' }[g];
  const rows = await run(`SELECT to_char(date_trunc('${g}', s.sale_date), '${fmt}') AS period,
      COUNT(*) FILTER (WHERE s.sale_type = 'CASH')::int AS "cashCount", ${M("SUM(s.total) FILTER (WHERE s.sale_type = 'CASH')")} AS "cashTotal",
      COUNT(*) FILTER (WHERE s.sale_type = 'CREDIT')::int AS "creditCount", ${M("SUM(s.total) FILTER (WHERE s.sale_type = 'CREDIT')")} AS "creditTotal",
      COUNT(*)::int AS count, ${M('SUM(s.total)')} AS total, ${M('SUM(s.tax_total)')} AS vat, ${M('SUM(s.discount_total)')} AS discounts,
      ${M('SUM(s.amount_paid)')} AS paid, ${M('SUM(s.total - s.amount_paid)')} AS outstanding
    FROM sales s WHERE ${where} GROUP BY 1 ORDER BY 1`, rep);
  return { ...head('summary', `Sales summary by ${g}`, q, types), groupBy: g,
    columns: cols([['period', { day: 'Date', month: 'Month', year: 'Year' }[g], 'text'], ['cashCount', 'Cash sales', 'count'], ['cashTotal', 'Cash total'], ['creditCount', 'Credit sales', 'count'], ['creditTotal', 'Credit total'],
      ['count', 'Sales', 'count'], ['total', 'Total'], ['vat', 'VAT'], ['discounts', 'Discounts'], ['paid', 'Paid'], ['outstanding', 'Outstanding']]),
    totals: { ...countTotals(rows, ['cashCount', 'creditCount', 'count']), ...moneyTotals(rows, ['cashTotal', 'creditTotal', 'total', 'vat', 'discounts', 'paid', 'outstanding']) }, rows };
}

/* 2. By salesperson */
async function salespersons(req, q) {
  const { types, rep, where } = scope(req, q);
  const rows = await run(`SELECT sp.id AS "salespersonId", COALESCE(sp.code, '') AS code, COALESCE(sp.full_name, 'No salesperson') AS name,
      COUNT(*)::int AS count, ${M("SUM(s.total) FILTER (WHERE s.sale_type = 'CASH')")} AS "cashTotal", ${M("SUM(s.total) FILTER (WHERE s.sale_type = 'CREDIT')")} AS "creditTotal",
      ${M('SUM(s.total)')} AS total, ${M('SUM(s.total - s.tax_total)')} AS net, ${M('SUM(s.discount_total)')} AS discounts, ${M('SUM(s.amount_paid)')} AS paid, ${M('SUM(s.total - s.amount_paid)')} AS outstanding
    FROM sales s LEFT JOIN salespersons sp ON sp.id = s.salesperson_id WHERE ${where}
    GROUP BY sp.id, sp.code, sp.full_name ORDER BY SUM(s.total) DESC, name LIMIT ${EXPORT_LIMIT}`, rep);
  return { ...head('salespersons', 'Sales by salesperson', q, types),
    columns: cols([['code', 'Code', 'text'], ['name', 'Salesperson', 'text'], ['count', 'Sales', 'count'], ['cashTotal', 'Cash total'], ['creditTotal', 'Credit total'], ['total', 'Total'], ['net', 'Net (before VAT)'],
      ['discounts', 'Discounts'], ['paid', 'Paid'], ['outstanding', 'Outstanding']]),
    totals: { ...countTotals(rows, ['count']), ...moneyTotals(rows, ['cashTotal', 'creditTotal', 'total', 'net', 'discounts', 'paid', 'outstanding']) }, rows };
}

/* 3. By customer (walk-in cash sales have no customer: one row) */
async function customers(req, q) {
  const { types, rep, where } = scope(req, q);
  const rows = await run(`SELECT c.id AS "customerId", COALESCE(c.code, '') AS code, COALESCE(c.name, 'Walk-in customers') AS name, COALESCE(c.tin, '') AS tin,
      COUNT(*)::int AS count, ${M("SUM(s.total) FILTER (WHERE s.sale_type = 'CASH')")} AS "cashTotal", ${M("SUM(s.total) FILTER (WHERE s.sale_type = 'CREDIT')")} AS "creditTotal",
      ${M('SUM(s.total)')} AS total, ${M('SUM(s.amount_paid)')} AS paid, ${M('SUM(s.total - s.amount_paid)')} AS outstanding, to_char(MAX(s.sale_date), 'YYYY-MM-DD') AS "lastSale"
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE ${where}
    GROUP BY c.id, c.code, c.name, c.tin ORDER BY SUM(s.total) DESC, name LIMIT ${EXPORT_LIMIT}`, rep);
  return { ...head('customers', 'Sales by customer', q, types),
    columns: cols([['code', 'Code', 'text'], ['name', 'Customer', 'text'], ['tin', 'TIN', 'text'], ['count', 'Sales', 'count'], ['cashTotal', 'Cash total'], ['creditTotal', 'Credit total'], ['total', 'Total'],
      ['paid', 'Paid'], ['outstanding', 'Outstanding'], ['lastSale', 'Last sale', 'text']]),
    totals: { ...countTotals(rows, ['count']), ...moneyTotals(rows, ['cashTotal', 'creditTotal', 'total', 'paid', 'outstanding']) }, rows };
}

/* 4. By product */
async function products(req, q) {
  const { types, rep, where } = scope(req, q);
  const rows = await run(`SELECT l.item_id AS "itemId", l.sku, MAX(l.item_name) AS name, MAX(l.unit) AS unit, COUNT(DISTINCT s.id)::int AS count,
      COALESCE(SUM(l.quantity), 0)::numeric(20,3)::text AS quantity,
      ${M("SUM(l.line_total) FILTER (WHERE s.sale_type = 'CASH')")} AS "cashValue", ${M("SUM(l.line_total) FILTER (WHERE s.sale_type = 'CREDIT')")} AS "creditValue", ${M('SUM(l.line_total)')} AS value,
      CASE WHEN SUM(l.quantity) > 0 THEN (SUM(l.line_total) / SUM(l.quantity))::numeric(20,2)::text ELSE '0.00' END AS "avgPrice"
    FROM sales s JOIN sale_lines l ON l.sale_id = s.id WHERE ${where}
    GROUP BY l.item_id, l.sku ORDER BY SUM(l.line_total) DESC, l.sku LIMIT ${EXPORT_LIMIT}`, rep);
  return { ...head('products', 'Sales by product', q, types),
    columns: cols([['sku', 'Code', 'text'], ['name', 'Product', 'text'], ['unit', 'Unit', 'text'], ['count', 'Sales', 'count'], ['quantity', 'Quantity', 'qty'], ['cashValue', 'Cash value'], ['creditValue', 'Credit value'],
      ['value', 'Value (before VAT)'], ['avgPrice', 'Average price']]),
    totals: { ...countTotals(rows, ['count']), quantity: sumN(rows, 'quantity'), ...moneyTotals(rows, ['cashValue', 'creditValue', 'value']) }, rows };
}

module.exports = { detail, summary, salespersons, customers, products };
