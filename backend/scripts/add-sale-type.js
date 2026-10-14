const { Client } = require('pg');

const sql = [
  "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS sale_type varchar(6) NOT NULL DEFAULT 'CASH'",
  'ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS due_date date',
  'ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_method varchar(15)',
  'ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_reference varchar(100)',
  "ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_sale_type_chk CHECK (sale_type IN ('CASH','CREDIT'))",
  "ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_pay_method_chk CHECK (payment_method IS NULL OR payment_method IN ('CASH','MOBILE_MONEY','BANK','CARD','CHEQUE'))",
  'CREATE INDEX IF NOT EXISTS sales_orders_sale_type ON sales_orders (sale_type)',
  'ALTER TABLE sales ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES sales_orders(id) ON DELETE RESTRICT',
  'CREATE UNIQUE INDEX IF NOT EXISTS sales_sales_order_id_uq ON sales (sales_order_id) WHERE sales_order_id IS NOT NULL',
  `INSERT INTO "SequelizeMeta" (name) VALUES ('20261202000001-sales-order-sale-type.js') ON CONFLICT DO NOTHING`,
];

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  for (const q of sql) {
    try { await c.query(q); console.log('OK   ', q.slice(0, 70)); }
    catch (e) { console.log('SKIP ', q.slice(0, 70), '->', e.message); }
  }
  await c.end();
})();