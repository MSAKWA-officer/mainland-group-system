// Run from the backend folder (same level as package.json):
//   node scripts/diagnose-order-sales.js
// READ-ONLY. It changes nothing. It shows why an approved Sales Order did not appear in Sales / Cash sales / Credit sales.
require('dotenv').config();

const { QueryTypes } = require('sequelize');
const { sequelize } = require('../src/models');

const q = (sql, replacements) => sequelize.query(sql, { type: QueryTypes.SELECT, replacements });
const ok = (b) => (b ? 'OK     ' : 'MISSING');

(async () => {
  await sequelize.authenticate();
  const [db] = await q('SELECT current_database() AS db, CURRENT_DATE::text AS today');
  console.log(`Database: ${db.db}   (today on DB: ${db.today})\n`);

  // 1. Columns / migration that the "order -> sale" feature needs
  const cols = await q(`SELECT table_name, column_name FROM information_schema.columns
    WHERE (table_name = 'sales_orders' AND column_name IN ('sale_type','due_date','payment_method','payment_reference'))
       OR (table_name = 'sales' AND column_name = 'sales_order_id')`);
  const has = (t, c) => cols.some((x) => x.table_name === t && x.column_name === c);
  console.log('1) Database columns');
  console.log(`   ${ok(has('sales_orders', 'sale_type'))} sales_orders.sale_type`);
  console.log(`   ${ok(has('sales_orders', 'due_date'))} sales_orders.due_date`);
  console.log(`   ${ok(has('sales_orders', 'payment_method'))} sales_orders.payment_method`);
  console.log(`   ${ok(has('sales', 'sales_order_id'))} sales.sales_order_id`);
  const meta = await q(`SELECT name FROM "SequelizeMeta" WHERE name = '20261202000001-sales-order-sale-type.js'`).catch(() => []);
  console.log(`   ${ok(meta.length)} migration 20261202000001-sales-order-sale-type.js recorded\n`);
  if (!has('sales', 'sales_order_id') || !has('sales_orders', 'sale_type')) {
    console.log('   >>> The database is missing the new columns. Run:  node scripts/add-sale-type.js   (or npm run migrate)\n');
  }

  // 2. Last orders and whether each one has a sale
  if (has('sales', 'sales_order_id') && has('sales_orders', 'sale_type')) {
    const rows = await q(`SELECT o.order_no, o.status, o.sale_type, o.total::text AS total, to_char(o.confirmed_at,'YYYY-MM-DD HH24:MI') AS confirmed_at,
        w.status AS workflow, s.sale_no, s.status AS sale_status, s.sale_type AS sale_kind
      FROM sales_orders o
      LEFT JOIN order_workflows w ON w.order_id = o.id
      LEFT JOIN sales s ON s.sales_order_id = o.id
      ORDER BY o.created_at DESC LIMIT 10`);
    console.log('2) Last 10 sales orders');
    console.table(rows.map((r) => ({ order: r.order_no, status: r.status, type: r.sale_type, total: r.total, workflow: r.workflow || '-',
      sale: r.sale_no ? `${r.sale_no} (${r.sale_status})` : (r.status === 'CONFIRMED' ? 'NO SALE  <<<' : '-') })));

    const orphan = await q(`SELECT o.order_no, o.sale_type, o.total::text AS total FROM sales_orders o
      WHERE o.status = 'CONFIRMED' AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.sales_order_id = o.id) ORDER BY o.created_at`);
    console.log(`3) CONFIRMED orders with NO sale record: ${orphan.length}`);
    orphan.forEach((o) => console.log(`   ${o.order_no}  ${o.sale_type}  ${o.total}`));
    if (orphan.length) console.log('   >>> These were approved before the feature worked. Create their sales with:  node scripts/backfill-sales-from-orders.js\n');

    // 4. What the Sales pages will actually list
    const sales = await q(`SELECT sale_type, status, COUNT(*)::int AS n, COUNT(sales_order_id)::int AS from_orders FROM sales GROUP BY sale_type, status ORDER BY 1, 2`);
    console.log('4) Sales table');
    console.table(sales);
  }

  // 5. Who can see sales pages
  const perms = await q(`SELECT r.code AS role,
      bool_or(p.code = 'sales.read') AS "sales.read", bool_or(p.code = 'cash_sales.read') AS "cash_sales.read",
      bool_or(p.code = 'credit_sales.read') AS "credit_sales.read", bool_or(p.code = 'cash_sales.read_all') AS "cash.read_all", bool_or(p.code = 'credit_sales.read_all') AS "credit.read_all"
    FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id LEFT JOIN permissions p ON p.id = rp.permission_id GROUP BY r.code ORDER BY r.code`).catch((e) => { console.log('   (could not read role permissions:', e.message, ')'); return []; });
  if (perms.length) { console.log('5) Permissions to open the Sales pages (without *.read_all a user sees only their own salesperson profile\'s sales)'); console.table(perms); }

  await sequelize.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });