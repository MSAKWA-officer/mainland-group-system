const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { mine } = require('./salesScope');
const { balanceSql } = require('./banking');
const customerReports = require('./customerReports');

/* Dashboard summary: one block per module, each a list of small figures ("metrics").
   - A metric is only included when the user holds the permission of the page it links to.
   - Visibility follows the same rules as the module itself: without `*.read_all` a user only sees their own records.
   - Nothing is stored; every figure is calculated live by the database.
   - A module that fails returns { error: true } so one broken query never blanks the whole dashboard.
   Metric: { key, value, kind: 'count' | 'money' | 'qty', tone?: 'warn' | 'bad', to?: route, currency? }
   */
const NONE = '00000000-0000-0000-0000-000000000000';
const MONTH = "date_trunc('month', CURRENT_DATE)";

const q = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
const one = async (sql, replacements) => (await q(sql, replacements))[0];
const can = (req, p) => req.user.permissions.has(p);
const n = (v) => Number(v || 0);
const tone = (v, t) => (n(v) > 0 ? t : undefined);
const m = (key, value, kind, to, extra = {}) => ({ key, value: String(value ?? 0), kind, to, ...extra });

// Runs `fn` only when the user holds `perm`; pushes whatever metrics it returns.
const when = async (req, perm, out, fn) => { if (can(req, perm)) out.push(...[].concat(await fn())); };

/* ---------- Approvals ---------- */
async function approvals(req) {
  const out = [];
  await when(req, 'approvals.read', out, async () => {
    const all = can(req, 'approvals.read_all');
    const scope = all ? '' : ' AND requested_by = :uid';             // without read_all only the user's own requests
    const r = await one(`SELECT COUNT(*) FILTER (WHERE status = 'SUBMITTED' AND requested_by <> :uid)::int AS "toDecide",
        COUNT(*) FILTER (WHERE status = 'DRAFT' AND requested_by = :uid)::int AS "myDrafts",
        COUNT(*) FILTER (WHERE status = 'SUBMITTED' AND requested_by = :uid)::int AS "mySubmitted",
        COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int AS "allSubmitted",
        COUNT(*) FILTER (WHERE status IN ('APPROVED', 'EXECUTED') AND decided_at >= ${MONTH})::int AS approved,
        COUNT(*) FILTER (WHERE status = 'REJECTED' AND decided_at >= ${MONTH})::int AS rejected
      FROM approval_requests WHERE 1 = 1${scope}`, { uid: req.user.id });
    const list = [];
    if (can(req, 'approvals.approve') && all) list.push(m('approvalsToDecide', r.toDecide, 'count', '/approvals', { tone: tone(r.toDecide, 'warn') }));
    list.push(m('approvalsMyDrafts', r.myDrafts, 'count', '/approvals'), m('approvalsMySubmitted', r.mySubmitted, 'count', '/approvals', { tone: tone(r.mySubmitted, 'warn') }));
    if (all) list.push(m('approvalsAllSubmitted', r.allSubmitted, 'count', '/approvals'));
    list.push(m('approvalsApprovedMonth', r.approved, 'count', '/approvals'), m('approvalsRejectedMonth', r.rejected, 'count', '/approvals', { tone: tone(r.rejected, 'bad') }));
    return list;
  });
  return out;
}

/* ---------- 1. Inventory ---------- */
const STOCK_DOC_PERM = { RECEIVING: 'receiving', ADJUSTMENT: 'adjustments', REJECT_IN: 'reject_in', REJECT_OUT: 'reject_out', EXPIRED: 'expired', DAMAGED: 'damaged' };
const LEVELS = 'FROM items i LEFT JOIN stock_levels sl ON sl.item_id = i.id WHERE i.is_active';

const qtyText = (v) => String(v ?? 0);

async function inventory(req) {
  const out = [];
  // Items: how many exist, how many are sold / tracked
  await when(req, 'items.read', out, async () => {
    const r = await one(`SELECT COUNT(*) FILTER (WHERE is_active)::int AS active, COUNT(*) FILTER (WHERE NOT is_active)::int AS inactive,
        COUNT(*) FILTER (WHERE is_active AND track_expiry)::int AS tracked FROM items`);
    return [m('activeItems', r.active, 'count', '/items'), m('inactiveItems', r.inactive, 'count', '/items'), m('expiryTrackedItems', r.tracked, 'count', '/items')];
  });
  await when(req, 'categories.read', out, async () => m('categories', (await one('SELECT COUNT(*)::int AS c FROM categories')).c, 'count', '/categories'));

  // Stock on hand: units, items in / out / low, batches, retail value
  await when(req, 'stock.read', out, async () => {
    const [lvl, exp] = await Promise.all([
      one(`SELECT COALESCE(SUM(COALESCE(sl.quantity, 0)), 0)::text AS units,
             COUNT(*) FILTER (WHERE COALESCE(sl.quantity, 0) > 0)::int AS "inStock",
             COUNT(*) FILTER (WHERE COALESCE(sl.quantity, 0) <= 0)::int AS "out",
             COUNT(*) FILTER (WHERE COALESCE(sl.quantity, 0) > 0 AND i.reorder_level > 0 AND sl.quantity <= i.reorder_level)::int AS low,
             COALESCE(SUM(COALESCE(sl.quantity, 0) * i.selling_price), 0)::text AS retail ${LEVELS}`),
      one(`SELECT COUNT(*)::int AS batches, COALESCE(SUM(quantity), 0)::text AS "batchUnits",
             COUNT(*) FILTER (WHERE expiry_date < CURRENT_DATE)::int AS expired,
             COALESCE(SUM(quantity) FILTER (WHERE expiry_date < CURRENT_DATE), 0)::text AS "expiredUnits",
             COUNT(*) FILTER (WHERE expiry_date >= CURRENT_DATE AND expiry_date <= CURRENT_DATE + 30)::int AS soon,
             COALESCE(SUM(quantity) FILTER (WHERE expiry_date >= CURRENT_DATE AND expiry_date <= CURRENT_DATE + 30), 0)::text AS "soonUnits"
           FROM stock_batches WHERE quantity > 0`),
    ]);
    return [
      m('totalUnits', qtyText(lvl.units), 'qty', '/stock'),
      m('itemsInStock', lvl.inStock, 'count', '/stock'),
      m('outOfStock', lvl.out, 'count', '/stock', { tone: tone(lvl.out, 'bad') }),
      m('lowStock', lvl.low, 'count', '/stock', { tone: tone(lvl.low, 'warn') }),
      m('retailValue', lvl.retail, 'money', '/stock'),
      m('batchesOnHand', exp.batches, 'count', '/stock'),
      m('batchUnits', qtyText(exp.batchUnits), 'qty', '/stock'),
      m('expiringSoon', exp.soon, 'count', '/stock', { tone: tone(exp.soon, 'warn') }),
      m('expiringSoonUnits', qtyText(exp.soonUnits), 'qty', '/stock', { tone: tone(exp.soon, 'warn') }),
      m('expiredOnHand', exp.expired, 'count', '/stock', { tone: tone(exp.expired, 'bad') }),
      m('expiredUnits', qtyText(exp.expiredUnits), 'qty', '/stock', { tone: tone(exp.expired, 'bad') }),
    ];
  });
  await when(req, 'stock_reports.valuation', out, async () => m('stockValue', (await one(
    'SELECT COALESCE(SUM(COALESCE(sl.quantity, 0) * i.cost_price), 0)::text AS v ' + LEVELS)).v, 'money', '/reports'));

  // Stock movements: units in / out
  await when(req, 'movements.read', out, async () => {
    const r = await one(`SELECT COUNT(*) FILTER (WHERE occurred_at::date = CURRENT_DATE)::int AS today,
        COALESCE(SUM(quantity) FILTER (WHERE direction = 'IN' AND occurred_at::date = CURRENT_DATE), 0)::text AS "inToday",
        COALESCE(SUM(quantity) FILTER (WHERE direction = 'OUT' AND occurred_at::date = CURRENT_DATE), 0)::text AS "outToday",
        COALESCE(SUM(quantity) FILTER (WHERE direction = 'IN' AND occurred_at >= ${MONTH}), 0)::text AS "inMonth",
        COALESCE(SUM(quantity) FILTER (WHERE direction = 'OUT' AND occurred_at >= ${MONTH}), 0)::text AS "outMonth"
      FROM stock_movements`);
    return [m('movementsToday', r.today, 'count', '/movements'), m('unitsInToday', qtyText(r.inToday), 'qty', '/movements'),
      m('unitsOutToday', qtyText(r.outToday), 'qty', '/movements'), m('unitsInMonth', qtyText(r.inMonth), 'qty', '/movements'),
      m('unitsOutMonth', qtyText(r.outMonth), 'qty', '/movements')];
  });

  // Documents per type (this month) + anything still waiting from before approval was removed
  const types = Object.entries(STOCK_DOC_PERM).filter(([, p]) => can(req, `${p}.read`)).map(([t]) => t);
  if (types.length) {
    const r = await one(`SELECT COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'POSTED' AND type = 'RECEIVING' AND posted_at >= ${MONTH})::int AS rec,
        COUNT(*) FILTER (WHERE status = 'POSTED' AND type = 'ADJUSTMENT' AND posted_at >= ${MONTH})::int AS adj,
        COUNT(*) FILTER (WHERE status = 'POSTED' AND type = 'REJECT_IN' AND posted_at >= ${MONTH})::int AS rin,
        COUNT(*) FILTER (WHERE status = 'POSTED' AND type = 'REJECT_OUT' AND posted_at >= ${MONTH})::int AS rout,
        COUNT(*) FILTER (WHERE status = 'POSTED' AND type = 'EXPIRED' AND posted_at >= ${MONTH})::int AS exp,
        COUNT(*) FILTER (WHERE status = 'POSTED' AND type = 'DAMAGED' AND posted_at >= ${MONTH})::int AS dmg
      FROM stock_documents WHERE type IN (:types)`, { types });
    const route = { RECEIVING: '/receiving', ADJUSTMENT: '/adjustments', REJECT_IN: '/reject-in', REJECT_OUT: '/reject-out', EXPIRED: '/expired', DAMAGED: '/damaged' };
    const cnt = { RECEIVING: r.rec, ADJUSTMENT: r.adj, REJECT_IN: r.rin, REJECT_OUT: r.rout, EXPIRED: r.exp, DAMAGED: r.dmg };
    const keys = { RECEIVING: 'receivingsMonth', ADJUSTMENT: 'adjustmentsMonth', REJECT_IN: 'rejectInMonth', REJECT_OUT: 'rejectOutMonth', EXPIRED: 'expiredMonth', DAMAGED: 'damagedMonth' };
    for (const t of types) out.push(m(keys[t], cnt[t], 'count', route[t]));
    if (r.pending > 0) out.push(m('pendingStockDocs', r.pending, 'count', can(req, 'approvals.read') ? '/approvals' : undefined, { tone: 'warn' }));
  }

  return out;
}

/* ---------- 2. Sales & Customers ---------- */
async function sales(req) {
  const out = [];
  const me = await mine(req);
  const own = (perm, alias) => (can(req, perm) ? { sql: '', rep: {} } : { sql: ` AND ${alias}.salesperson_id = :sp`, rep: { sp: me ? me.id : NONE } });

  await when(req, 'customers.read', out, async () => {
    const o = own('customers.read_all', 'c');
    const r = await one(`SELECT COUNT(*) FILTER (WHERE c.is_active)::int AS active, COUNT(*) FILTER (WHERE NOT c.is_active)::int AS inactive FROM customers c WHERE 1 = 1${o.sql}`, o.rep);
    return [m('activeCustomers', r.active, 'count', '/customers'), m('inactiveCustomers', r.inactive, 'count', '/customers')];
  });
  await when(req, 'salespersons.read', out, async () => m('activeSalespersons', (await one(
    'SELECT COUNT(*)::int AS c FROM salespersons WHERE is_active')).c, 'count', '/salespersons'));
  await when(req, 'sales_orders.read', out, async () => {
    const o = own('sales_orders.read_all', 'o');
    const r = await one(`SELECT COUNT(*) FILTER (WHERE status = 'DRAFT')::int AS draft, COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int AS submitted,
        COUNT(*) FILTER (WHERE status = 'CONFIRMED' AND confirmed_at >= ${MONTH})::int AS confirmed
      FROM sales_orders o WHERE 1 = 1${o.sql}`, o.rep);
    return [m('ordersDraft', r.draft, 'count', '/sales-orders'), m('ordersSubmitted', r.submitted, 'count', '/sales-orders', { tone: tone(r.submitted, 'warn') }),
      m('ordersConfirmedMonth', r.confirmed, 'count', '/sales-orders')];
  });
  await when(req, 'order_workflow.read', out, async () => {
    const all = can(req, 'order_workflow.read_all');
    const r = await one(`SELECT COUNT(*) FILTER (WHERE status = 'AWAITING_STOREKEEPER')::int AS sk, COUNT(*) FILTER (WHERE status = 'AWAITING_MANAGER')::int AS mg,
        COUNT(*) FILTER (WHERE status = 'RETURNED')::int AS ret FROM order_workflows`);
    const list = [];
    if (all || can(req, 'order_workflow.storekeeper_review')) list.push(m('awaitingStorekeeper', r.sk, 'count', '/order-workflow', { tone: tone(r.sk, 'warn') }));
    if (all || can(req, 'order_workflow.manager_review')) list.push(m('awaitingManager', r.mg, 'count', '/order-workflow', { tone: tone(r.mg, 'warn') }));
    if (all) list.push(m('returnedOrders', r.ret, 'count', '/order-workflow'));
    return list;
  });
  // Sales of this month, per type, using the visibility rule of each type.
  for (const [type, perm, key, to] of [['CASH', 'cash_sales', 'cashSalesMonth', '/cash-sales'], ['CREDIT', 'credit_sales', 'creditSalesMonth', '/credit-sales']]) {
    await when(req, `${perm}.read`, out, async () => {
      const o = own(`${perm}.read_all`, 's');
      const r = await one(`SELECT COALESCE(SUM(total), 0)::text AS total, COUNT(*)::int AS c FROM sales s
        WHERE s.sale_type = :type AND s.status = 'COMPLETED' AND s.sale_date >= ${MONTH}${o.sql}`, { type, ...o.rep });
      const d = await one(`SELECT COALESCE(SUM(total), 0)::text AS total FROM sales s
        WHERE s.sale_type = :type AND s.status = 'COMPLETED' AND s.sale_date = CURRENT_DATE${o.sql}`, { type, ...o.rep });
      return [m(key.replace('Month', 'Today'), d.total, 'money', to), m(key, r.total, 'money', to), m(`${key}Count`, r.c, 'count', to)];
    });
  }
  await when(req, 'customer_balances.read', out, async () => {
    const { summary: s } = await customerReports.balances(req, { page: 1, limit: 1, sortBy: 'balance', sortDir: 'desc', includeZero: false });
    return [m('receivables', s.balance, 'money', '/customer-balances'), m('overdueReceivables', s.overdue, 'money', '/customer-balances', { tone: tone(s.overdue, 'bad') }),
      m('overLimitCustomers', s.overLimitCount, 'count', '/customer-balances', { tone: tone(s.overLimitCount, 'warn') })];
  });
  await when(req, 'credit_ageing.read', out, async () => {
    const { summary: s } = await customerReports.ageing(req, { page: 1, limit: 1, sortBy: 'outstanding', sortDir: 'desc' });
    return m('over90', s.over90, 'money', '/credit-ageing', { tone: tone(s.over90, 'bad') });
  });
  await when(req, 'discounts.read', out, async () => m('activeDiscounts', (await one(
    'SELECT COUNT(*)::int AS c FROM discounts WHERE is_active AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)')).c, 'count', '/discounts'));
  return out;
}

/* ---------- 3. EFD ---------- */
async function efd(req) {
  const out = [];
  const mineOnly = (perm, alias) => (can(req, perm) ? { sql: '', rep: {} } : { sql: ` AND ${alias}.created_by = :uid`, rep: { uid: req.user.id } });
  await when(req, 'efd_devices.read', out, async () => m('activeDevices', (await one('SELECT COUNT(*)::int AS c FROM efd_devices WHERE is_active')).c, 'count', '/efd-devices'));
  await when(req, 'efd_receipts.read', out, async () => {
    const o = mineOnly('efd_receipts.read_all', 'r');
    const r = await one(`SELECT COUNT(*)::int AS c, COALESCE(SUM(amount), 0)::text AS total FROM efd_receipts r WHERE r.status = 'ISSUED' AND r.issued_at >= ${MONTH}${o.sql}`, o.rep);
    return [m('receiptsMonth', r.c, 'count', '/efd-receipts'), m('receiptsMonthAmount', r.total, 'money', '/efd-receipts')];
  });
  await when(req, 'efd_z_reports.read', out, async () => {
    const o = mineOnly('efd_z_reports.read_all', 'z');
    const r = await one(`SELECT COUNT(*)::int AS c FROM efd_z_reports z WHERE z.status = 'PENDING'${o.sql}`, o.rep);
    return m('zPending', r.c, 'count', '/efd-z-reports', { tone: tone(r.c, 'warn') });
  });
  await when(req, 'efd_reconciliations.read', out, async () => {
    const o = mineOnly('efd_reconciliations.read_all', 'e');
    const r = await one(`SELECT COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open,
        COUNT(*) FILTER (WHERE status = 'OPEN' AND (gross_variance <> 0 OR count_variance <> 0))::int AS variance
      FROM efd_reconciliations e WHERE 1 = 1${o.sql}`, o.rep);
    return [m('reconOpen', r.open, 'count', '/efd-reconciliations', { tone: tone(r.open, 'warn') }),
      m('reconWithVariance', r.variance, 'count', '/efd-reconciliations', { tone: tone(r.variance, 'bad') })];
  });
  return out;
}

/* ---------- 4. Banking & Payments ---------- */
async function banking(req) {
  const out = [];
  await when(req, 'bank_accounts.read', out, async () => m('activeAccounts', (await one('SELECT COUNT(*)::int AS c FROM bank_accounts WHERE is_active')).c, 'count', '/bank-accounts'));
  await when(req, 'bank_accounts.view_balance', out, async () => (await q(
    `SELECT a.currency, COALESCE(SUM(${balanceSql('a')}), 0)::text AS balance FROM bank_accounts a WHERE a.is_active GROUP BY a.currency ORDER BY a.currency`))
    .map((r) => m('bankBalance', r.balance, 'money', '/bank-accounts', { currency: r.currency })));
  await when(req, 'bank_transactions.read', out, async () => {
    const r = await one(`SELECT COALESCE(SUM(amount) FILTER (WHERE direction = 'CREDIT'), 0)::text AS cin, COALESCE(SUM(amount) FILTER (WHERE direction = 'DEBIT'), 0)::text AS cout,
        COUNT(*) FILTER (WHERE NOT is_reconciled)::int AS unrec
      FROM bank_transactions WHERE status = 'POSTED' AND txn_date >= ${MONTH}`);
    return [m('moneyInMonth', r.cin, 'money', '/bank-transactions'), m('moneyOutMonth', r.cout, 'money', '/bank-transactions'),
      ...(can(req, 'bank_transactions.reconcile') ? [m('unreconciled', r.unrec, 'count', '/reconciliation', { tone: tone(r.unrec, 'warn') })] : [])];
  });
  await when(req, 'customer_payments.read', out, async () => {
    const me = await mine(req);
    const all = can(req, 'customer_payments.read_all');
    const r = await one(`SELECT COALESCE(SUM(p.amount), 0)::text AS total FROM customer_payments p JOIN customers c ON c.id = p.customer_id
      WHERE p.status = 'ACTIVE' AND p.paid_on >= ${MONTH}${all ? '' : ' AND c.salesperson_id = :sp'}`, { sp: me ? me.id : NONE });
    return m('customerPaymentsMonth', r.total, 'money', '/customer-payments');
  });
  await when(req, 'expenses.read', out, async () => {
    const mineOnly = can(req, 'expenses.read_all') ? '' : ' AND created_by = :uid';
    const r = await one(`SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
        COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0)::text AS pending_amount,
        COALESCE(SUM(amount) FILTER (WHERE status = 'APPROVED' AND expense_date >= ${MONTH}), 0)::text AS approved_month
      FROM expenses WHERE 1 = 1${mineOnly}`, { uid: req.user.id });
    return [m('expensesPending', r.pending, 'count', '/expenses', { tone: tone(r.pending, 'warn') }), m('expensesPendingAmount', r.pending_amount, 'money', '/expenses'),
      m('expensesApprovedMonth', r.approved_month, 'money', '/expenses')];
  });
  await when(req, 'payments.read', out, async () => m('paymentsOutMonth', (await one(
    `SELECT COALESCE(SUM(amount), 0)::text AS t FROM payments WHERE status = 'ACTIVE' AND paid_on >= ${MONTH}`)).t, 'money', '/payments'));
  await when(req, 'transfers.read', out, async () => m('transfersMonth', (await one(
    `SELECT COUNT(DISTINCT transfer_group_id)::int AS c FROM bank_transactions WHERE transfer_group_id IS NOT NULL AND status = 'POSTED' AND txn_date >= ${MONTH}`)).c, 'count', '/transfers'));
  return out;
}

/* ---------- 5. Fuel ---------- */
async function fuel(req) {
  const out = [];
  await when(req, 'vehicles.read', out, async () => m('activeVehicles', (await one('SELECT COUNT(*)::int AS c FROM vehicles WHERE is_active')).c, 'count', '/vehicles'));
  await when(req, 'drivers.read', out, async () => {
    const r = await one(`SELECT COUNT(*) FILTER (WHERE is_active)::int AS active,
        COUNT(*) FILTER (WHERE is_active AND license_expiry < CURRENT_DATE)::int AS expired,
        COUNT(*) FILTER (WHERE is_active AND license_expiry >= CURRENT_DATE AND license_expiry <= CURRENT_DATE + 30)::int AS soon FROM drivers`);
    return [m('activeDrivers', r.active, 'count', '/drivers'), m('licenceExpired', r.expired, 'count', '/drivers', { tone: tone(r.expired, 'bad') }),
      m('licenceExpiring', r.soon, 'count', '/drivers', { tone: tone(r.soon, 'warn') })];
  });
  await when(req, 'fuel_funding.read', out, async () => {
    const mineOnly = can(req, 'fuel_funding.read_all') ? '' : ' AND created_by = :uid';
    const r = await one(`SELECT COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
        COALESCE(SUM(amount) FILTER (WHERE status = 'APPROVED' AND funding_date >= ${MONTH}), 0)::text AS funded
      FROM fuel_fundings WHERE 1 = 1${mineOnly}`, { uid: req.user.id });
    return [m('fundingPending', r.pending, 'count', '/fuel-funding', { tone: tone(r.pending, 'warn') }), m('fundedMonth', r.funded, 'money', '/fuel-funding')];
  });
  await when(req, 'fuel_usage.read', out, async () => {
    const mineOnly = can(req, 'fuel_usage.read_all') ? '' : ' AND created_by = :uid';
    const r = await one(`SELECT COALESCE(SUM(litres), 0)::text AS litres, COALESCE(SUM(amount), 0)::text AS amount
      FROM fuel_usages WHERE status = 'ACTIVE' AND usage_date >= ${MONTH}${mineOnly}`, { uid: req.user.id });
    return [m('litresMonth', r.litres, 'qty', '/fuel-usage'), m('fuelSpentMonth', r.amount, 'money', '/fuel-usage')];
  });
  await when(req, 'fuel_balances.read', out, async () => {
    const mineOnly = can(req, 'fuel_balances.read_all') ? '' : ' AND f.created_by = :uid';
    const r = await one(`SELECT COALESCE(SUM(f.amount - COALESCE(u.used, 0)), 0)::text AS bal
      FROM fuel_fundings f LEFT JOIN (SELECT fuel_funding_id, SUM(amount) AS used FROM fuel_usages WHERE status = 'ACTIVE' GROUP BY fuel_funding_id) u ON u.fuel_funding_id = f.id
      WHERE f.status = 'APPROVED'${mineOnly}`, { uid: req.user.id });
    return m('unspentFuel', r.bal, 'money', '/fuel-balances');
  });
  return out;
}

/* ---------- 6. Administration ---------- */
async function admin(req) {
  const out = [];
  await when(req, 'staff.read', out, async () => m('activeStaff', (await one('SELECT COUNT(*)::int AS c FROM staff WHERE is_active')).c, 'count', '/staff'));
  await when(req, 'users.read', out, async () => {
    const r = await one(`SELECT COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active, COUNT(*) FILTER (WHERE status <> 'ACTIVE')::int AS inactive FROM users`);
    return [m('activeUsers', r.active, 'count', '/users'), m('inactiveUsers', r.inactive, 'count', '/users')];
  });
  await when(req, 'roles.read', out, async () => m('roles', (await one('SELECT COUNT(*)::int AS c FROM roles')).c, 'count', '/roles'));
  await when(req, 'audit.read', out, async () => m('auditEvents24h', (await one(
    "SELECT COUNT(*)::int AS c FROM audit_logs WHERE occurred_at > NOW() - INTERVAL '24 hours'")).c, 'count', '/audit'));
  return out;
}

const MODULES = [['approvals', approvals], ['inventory', inventory], ['sales', sales], ['efd', efd], ['banking', banking], ['fuel', fuel], ['admin', admin]];

async function summary(req, only) {
  const results = await Promise.all(MODULES.filter(([key]) => !only || key === only).map(async ([key, fn]) => {
    try { return { key, metrics: await fn(req) }; } catch (e) { console.error(`dashboard summary: ${key} failed:`, e.message); return { key, error: true, metrics: [] }; }
  }));
  // A module the user can see nothing of is left out entirely (same idea as the hidden menu groups).
  return { generatedAt: new Date().toISOString(), modules: results.filter((r) => r.error || r.metrics.length) };
}

module.exports = { summary };
