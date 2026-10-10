const { QueryTypes } = require('sequelize');
const { sequelize, Customer } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const { mine, canAll } = require('./salesScope');

/* Read-only reports for Sales & Customers: Customer Balance, Payment History, Credit Ageing.
   Visibility rule (same as the rest of Sales): holding `<module>.read_all` shows every record, otherwise only records that belong to the
   user's own salesperson profile (sales.salesperson_id). A record you may not see looks like "not found".
   Everything is plain SQL so the database does the sums. All user input goes in through named replacements. */
const NONE = '00000000-0000-0000-0000-000000000000';

// { sql: ' AND <alias>.salesperson_id = :sp' | '', rep: { sp } }
async function ownership(req, perm, alias = 's') {
  if (canAll(req, perm)) return { sql: '', rep: {}, all: true };
  const sp = await mine(req);
  return { sql: ` AND ${alias}.salesperson_id = :sp`, rep: { sp: sp ? sp.id : NONE }, all: false };
}

const dir = (d) => (d === 'asc' ? 'ASC' : 'DESC');
const run = (sql, replacements) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

// "As of" date used by ageing. Null = today (database date). Payments made / voided after the date are ignored, so past dates are reproducible.
const AS_OF = 'COALESCE(CAST(:asOf AS date), CURRENT_DATE)';
const PAID_AS_OF = `LEFT JOIN LATERAL (SELECT COALESCE(SUM(p.amount), 0) AS paid FROM sale_payments p
    WHERE p.sale_id = s.id AND p.paid_on <= ${AS_OF} AND (p.voided_at IS NULL OR CAST(p.voided_at AS date) > ${AS_OF})) pp ON true`;
const DUE = 'COALESCE(s.due_date, s.sale_date)';
const BUCKET = `CASE WHEN ${AS_OF} - ${DUE} <= 0 THEN 'CURRENT' WHEN ${AS_OF} - ${DUE} <= 30 THEN 'DAYS_1_30'
    WHEN ${AS_OF} - ${DUE} <= 60 THEN 'DAYS_31_60' WHEN ${AS_OF} - ${DUE} <= 90 THEN 'DAYS_61_90' ELSE 'OVER_90' END`;

// May this user see this customer? Owners/managers: yes. Others: the customer is theirs, or they made credit sales to them.
async function assertCustomer(req, perm, customerId) {
  const c = await Customer.findByPk(customerId);
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Customer not found');
  if (canAll(req, perm)) return c;
  const sp = await mine(req);
  if (sp && c.salespersonId === sp.id) return c;
  if (sp) {
    const [x] = await run(`SELECT 1 AS ok FROM sales WHERE customer_id = :cid AND sale_type = 'CREDIT' AND salesperson_id = :sp LIMIT 1`, { cid: c.id, sp: sp.id });
    if (x) return c;
  }
  throw new AppError(404, 'NOT_FOUND', 'Customer not found');
}

/* ================= 1. CUSTOMER BALANCE ================= */
const BAL_SORT = { balance: 't.balance', overdue: 't.overdue', name: 't.name', code: 't.code', creditLimit: 't."creditLimit"', lastPaymentOn: 't."lastPaymentOn"' };

async function balances(req, q) {
  const own = await ownership(req, 'customer_balances.read_all');
  const where = ['1 = 1']; const rep = { ...own.rep };
  if (!own.all) where.push('(c.salesperson_id = :sp OR s.id IS NOT NULL)');
  if (q.search) { where.push('(c.name ILIKE :search OR c.code ILIKE :search OR c.phone ILIKE :search)'); rep.search = like(q.search); }
  if (q.customerId) { where.push('c.id = :customerId'); rep.customerId = q.customerId; }
  if (q.salespersonId) { where.push('c.salesperson_id = :salespersonId'); rep.salespersonId = q.salespersonId; }
  if (q.isActive !== undefined) { where.push('c.is_active = :isActive'); rep.isActive = q.isActive; }
  const bal = 'COALESCE(SUM(s.total - s.amount_paid), 0)';
  const od = 'COALESCE(SUM(s.total - s.amount_paid) FILTER (WHERE s.total > s.amount_paid AND s.due_date < CURRENT_DATE), 0)';
  const having = [];
  if (!q.includeZero) having.push(`${bal} > 0`);
  if (q.overdueOnly) having.push(`${od} > 0`);
  const inner = `SELECT c.id AS "customerId", c.code, c.name, c.phone, c.type, c.is_active AS "isActive", c.salesperson_id AS "salespersonId",
      c.credit_limit AS "creditLimit", c.payment_terms_days AS "paymentTermsDays",
      COALESCE(SUM(s.total), 0) AS "totalCredit", COALESCE(SUM(s.amount_paid), 0) AS "totalPaid", ${bal} AS balance, ${od} AS overdue,
      COUNT(s.id) FILTER (WHERE s.total > s.amount_paid)::int AS "openSales",
      GREATEST(c.credit_limit - ${bal}, 0) AS "availableCredit",
      (c.credit_limit > 0 AND ${bal} > c.credit_limit) AS "overLimit",
      (SELECT MAX(p.paid_on) FROM sale_payments p JOIN sales s2 ON s2.id = p.sale_id
        WHERE s2.customer_id = c.id AND s2.sale_type = 'CREDIT' AND p.voided_at IS NULL${own.sql.replace(/\bs\./g, 's2.')}) AS "lastPaymentOn"
    FROM customers c
    LEFT JOIN sales s ON s.customer_id = c.id AND s.sale_type = 'CREDIT' AND s.status = 'COMPLETED'${own.sql}
    WHERE ${where.join(' AND ')} GROUP BY c.id${having.length ? ` HAVING ${having.join(' AND ')}` : ''}`;
  const sort = `${BAL_SORT[q.sortBy] || BAL_SORT.balance} ${dir(q.sortDir)} NULLS LAST, t.name ASC`;
  const [rows, [sum]] = await Promise.all([
    run(`SELECT t.* FROM (${inner}) t ORDER BY ${sort} LIMIT :limit OFFSET :offset`, { ...rep, limit: q.limit, offset: (q.page - 1) * q.limit }),
    run(`SELECT COUNT(*)::int AS customers, COALESCE(SUM(balance), 0) AS balance, COALESCE(SUM(overdue), 0) AS overdue,
        COALESCE(SUM("totalCredit"), 0) AS "totalCredit", COALESCE(SUM("totalPaid"), 0) AS "totalPaid",
        COUNT(*) FILTER (WHERE "overLimit")::int AS "overLimitCount" FROM (${inner}) t`, rep),
  ]);
  return { data: rows, total: sum.customers, page: q.page, limit: q.limit, summary: sum };
}

// One customer: position + the invoices still open + latest payments.
async function balanceDetail(req, customerId) {
  const c = await assertCustomer(req, 'customer_balances.read_all', customerId);
  const { data } = await balances(req, { customerId: c.id, includeZero: true, page: 1, limit: 1, sortBy: 'balance', sortDir: 'desc' });
  const position = data[0] || null;
  const own = await ownership(req, 'customer_balances.read_all');
  const [invoices, payments] = await Promise.all([
    openInvoices(own, c.id, null),
    run(`SELECT p.id, p.receipt_no AS "receiptNo", p.amount, p.method, p.reference, p.paid_on AS "paidOn", s.sale_no AS "saleNo"
         FROM sale_payments p JOIN sales s ON s.id = p.sale_id
         WHERE s.customer_id = :cid AND s.sale_type = 'CREDIT' AND p.voided_at IS NULL${own.sql}
         ORDER BY p.paid_on DESC, p.created_at DESC LIMIT 10`, { cid: c.id, ...own.rep }),
  ]);
  return { customer: { id: c.id, code: c.code, name: c.name, phone: c.phone, isActive: c.isActive }, position, openInvoices: invoices, recentPayments: payments };
}

/* ================= 2. PAYMENT HISTORY ================= */
const PAY_FROM = `FROM sale_payments p JOIN sales s ON s.id = p.sale_id LEFT JOIN customers c ON c.id = s.customer_id JOIN users u ON u.id = p.received_by`;
const PAY_COLS = `p.id, p.receipt_no AS "receiptNo", p.amount, p.tendered, p.method, p.reference, p.paid_on AS "paidOn", p.notes,
    p.created_at AS "createdAt", (p.voided_at IS NOT NULL) AS "isVoided", p.voided_at AS "voidedAt", p.void_reason AS "voidReason",
    s.id AS "saleId", s.sale_no AS "saleNo", s.sale_type AS "saleType", s.total AS "saleTotal", s.amount_paid AS "saleAmountPaid", s.due_date AS "dueDate",
    c.id AS "customerId", c.code AS "customerCode", COALESCE(c.name, s.walk_in_name) AS "customerName",
    u.id AS "receivedById", u.full_name AS "receivedBy"`;
const PAY_SORT = { paidOn: 'p.paid_on', amount: 'p.amount', receiptNo: 'p.receipt_no', customer: 'COALESCE(c.name, s.walk_in_name)' };

async function payments(req, q) {
  const own = await ownership(req, 'payment_history.read_all');
  const where = ['1 = 1']; const rep = { ...own.rep };
  if (q.saleType) { where.push('s.sale_type = :saleType'); rep.saleType = q.saleType; }
  if (q.customerId) { where.push('s.customer_id = :customerId'); rep.customerId = q.customerId; }
  if (q.salespersonId) { where.push('s.salesperson_id = :salespersonId'); rep.salespersonId = q.salespersonId; }
  if (q.method) { where.push('p.method = :method'); rep.method = q.method; }
  if (q.receivedBy) { where.push('p.received_by = :receivedBy'); rep.receivedBy = q.receivedBy; }
  if (q.from) { where.push('p.paid_on >= :from'); rep.from = q.from; }
  if (q.to) { where.push('p.paid_on <= :to'); rep.to = q.to; }
  if (q.search) {
    where.push('(p.receipt_no ILIKE :search OR s.sale_no ILIKE :search OR p.reference ILIKE :search OR c.name ILIKE :search OR s.walk_in_name ILIKE :search)');
    rep.search = like(q.search);
  }
  const base = `${PAY_FROM} WHERE ${where.join(' AND ')}${own.sql}`;
  const status = q.status === 'VOIDED' ? ' AND p.voided_at IS NOT NULL' : q.status === 'ALL' ? '' : ' AND p.voided_at IS NULL';
  const [rows, [count], [sum], byMethod] = await Promise.all([
    run(`SELECT ${PAY_COLS} ${base}${status} ORDER BY ${PAY_SORT[q.sortBy] || PAY_SORT.paidOn} ${dir(q.sortDir)}, p.created_at DESC LIMIT :limit OFFSET :offset`,
      { ...rep, limit: q.limit, offset: (q.page - 1) * q.limit }),
    run(`SELECT COUNT(*)::int AS n ${base}${status}`, rep),
    // Summary ignores the status filter: received (active) and voided are always shown side by side.
    run(`SELECT COALESCE(SUM(p.amount) FILTER (WHERE p.voided_at IS NULL), 0) AS "totalReceived", COUNT(*) FILTER (WHERE p.voided_at IS NULL)::int AS "paymentCount",
         COALESCE(SUM(p.amount) FILTER (WHERE p.voided_at IS NOT NULL), 0) AS "totalVoided", COUNT(*) FILTER (WHERE p.voided_at IS NOT NULL)::int AS "voidedCount" ${base}`, rep),
    run(`SELECT p.method, COUNT(*)::int AS count, SUM(p.amount) AS total ${base} AND p.voided_at IS NULL GROUP BY p.method ORDER BY SUM(p.amount) DESC`, rep),
  ]);
  return { data: rows, total: count.n, page: q.page, limit: q.limit, summary: { ...sum, byMethod } };
}

async function paymentOne(req, id) {
  const own = await ownership(req, 'payment_history.read_all');
  const [row] = await run(`SELECT ${PAY_COLS}, c.phone AS "customerPhone", s.status AS "saleStatus", s.payment_status AS "salePaymentStatus",
      vu.full_name AS "voidedByName" ${PAY_FROM} LEFT JOIN users vu ON vu.id = p.voided_by WHERE p.id = :id${own.sql}`, { id, ...own.rep });
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Payment not found');
  return row;
}

/* ================= 3. CREDIT AGEING ================= */
// Open (unpaid) credit invoices of one customer, each with days overdue and its ageing bucket.
const openInvoices = (own, customerId, asOf) => run(`SELECT s.id, s.sale_no AS "saleNo", s.sale_date AS "saleDate", s.due_date AS "dueDate", s.total,
      pp.paid AS "amountPaid", (s.total - pp.paid) AS balance, GREATEST(${AS_OF} - ${DUE}, 0)::int AS "daysOverdue", ${BUCKET} AS bucket,
      s.salesperson_id AS "salespersonId"
    FROM sales s ${PAID_AS_OF}
    WHERE s.customer_id = :cid AND s.sale_type = 'CREDIT' AND s.status = 'COMPLETED' AND s.sale_date <= ${AS_OF} AND s.total - pp.paid > 0${own.sql}
    ORDER BY ${DUE} ASC, s.sale_no ASC`, { cid: customerId, asOf: asOf || null, ...own.rep });

const AGE_SORT = { outstanding: 't.outstanding', oldest: 't."oldestDays"', name: 't.name', over90: 't."over90"' };
const BUCKET_COND = { CURRENT: 'o.days <= 0', DAYS_1_30: 'o.days BETWEEN 1 AND 30', DAYS_31_60: 'o.days BETWEEN 31 AND 60',
  DAYS_61_90: 'o.days BETWEEN 61 AND 90', OVER_90: 'o.days > 90' };

async function ageing(req, q) {
  const own = await ownership(req, 'credit_ageing.read_all');
  const where = ['1 = 1']; const rep = { ...own.rep, asOf: q.asOf || null };
  if (q.search) { where.push('(c.name ILIKE :search OR c.code ILIKE :search)'); rep.search = like(q.search); }
  if (q.customerId) { where.push('o.customer_id = :customerId'); rep.customerId = q.customerId; }
  if (q.salespersonId) { where.push('o.salesperson_id = :salespersonId'); rep.salespersonId = q.salespersonId; }
  const sumIf = (cond) => `COALESCE(SUM(o.bal) FILTER (WHERE ${cond}), 0)`;
  // o = every open credit invoice (balance + days past due as of the chosen date); t = one row per customer.
  const cte = `WITH o AS (SELECT s.customer_id, s.salesperson_id, (s.total - pp.paid) AS bal, (${AS_OF} - ${DUE}) AS days
      FROM sales s ${PAID_AS_OF}
      WHERE s.sale_type = 'CREDIT' AND s.status = 'COMPLETED' AND s.sale_date <= ${AS_OF} AND s.total - pp.paid > 0${own.sql}),
    t AS (SELECT c.id AS "customerId", c.code, c.name, c.phone, c.credit_limit AS "creditLimit", COUNT(*)::int AS "openSales",
      SUM(o.bal) AS outstanding, ${sumIf(BUCKET_COND.CURRENT)} AS "current", ${sumIf(BUCKET_COND.DAYS_1_30)} AS "days1to30",
      ${sumIf(BUCKET_COND.DAYS_31_60)} AS "days31to60", ${sumIf(BUCKET_COND.DAYS_61_90)} AS "days61to90", ${sumIf(BUCKET_COND.OVER_90)} AS "over90",
      GREATEST(MAX(o.days), 0)::int AS "oldestDays"
      FROM o JOIN customers c ON c.id = o.customer_id WHERE ${where.join(' AND ')} GROUP BY c.id
      ${q.bucket ? `HAVING ${sumIf(BUCKET_COND[q.bucket])} > 0` : ''})`;
  const sort = `${AGE_SORT[q.sortBy] || AGE_SORT.outstanding} ${dir(q.sortDir)}, t.name ASC`;
  const [rows, [tot]] = await Promise.all([
    run(`${cte} SELECT t.* FROM t ORDER BY ${sort} LIMIT :limit OFFSET :offset`, { ...rep, limit: q.limit, offset: (q.page - 1) * q.limit }),
    run(`${cte} SELECT COUNT(*)::int AS customers, COALESCE(SUM(outstanding), 0) AS outstanding, COALESCE(SUM("current"), 0) AS "current",
        COALESCE(SUM("days1to30"), 0) AS "days1to30", COALESCE(SUM("days31to60"), 0) AS "days31to60", COALESCE(SUM("days61to90"), 0) AS "days61to90",
        COALESCE(SUM("over90"), 0) AS "over90" FROM t`, rep),
  ]);
  return { data: rows, total: tot.customers, page: q.page, limit: q.limit, asOf: q.asOf || null, summary: tot };
}

async function ageingDetail(req, customerId, asOf) {
  const c = await assertCustomer(req, 'credit_ageing.read_all', customerId);
  const own = await ownership(req, 'credit_ageing.read_all');
  const invoices = await openInvoices(own, c.id, asOf);
  const buckets = { current: 0n, days1to30: 0n, days31to60: 0n, days61to90: 0n, over90: 0n };
  const key = { CURRENT: 'current', DAYS_1_30: 'days1to30', DAYS_31_60: 'days31to60', DAYS_61_90: 'days61to90', OVER_90: 'over90' };
  for (const i of invoices) buckets[key[i.bucket]] += BigInt(Math.round(Number(i.balance) * 100));
  const fmt = (n) => `${n / 100n}.${String(n % 100n).padStart(2, '0')}`;
  const out = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, fmt(v)]));
  out.outstanding = fmt(Object.values(buckets).reduce((a, b) => a + b, 0n));
  return { customer: { id: c.id, code: c.code, name: c.name, phone: c.phone, creditLimit: c.creditLimit }, asOf: asOf || null, summary: out, invoices };
}

module.exports = { balances, balanceDetail, payments, paymentOne, ageing, ageingDetail };
