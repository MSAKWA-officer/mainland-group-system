'use strict';
// A sales order is now either a CASH sale or a CREDIT sale (chosen by the salesperson when the order is created).
// When the order is approved, the system creates the matching record in `sales` automatically (sales.sales_order_id points back to the order),
// so it shows up on the Sales register and on the Cash sales or Credit sales page.
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql("ALTER TABLE sales_orders ADD COLUMN sale_type varchar(6) NOT NULL DEFAULT 'CASH'");
    await sql('ALTER TABLE sales_orders ADD COLUMN due_date date');
    await sql('ALTER TABLE sales_orders ADD COLUMN payment_method varchar(15)');
    await sql('ALTER TABLE sales_orders ADD COLUMN payment_reference varchar(100)');
    await sql("ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_sale_type_chk CHECK (sale_type IN ('CASH','CREDIT'))");
    await sql("ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_pay_method_chk CHECK (payment_method IS NULL OR payment_method IN ('CASH','MOBILE_MONEY','BANK','CARD','CHEQUE'))");
    await q.addIndex('sales_orders', ['sale_type']);
    await sql('ALTER TABLE sales ADD COLUMN sales_order_id uuid REFERENCES sales_orders(id) ON DELETE RESTRICT');
    await sql('CREATE UNIQUE INDEX sales_sales_order_id_uq ON sales (sales_order_id) WHERE sales_order_id IS NOT NULL');
  },
  async down(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('DROP INDEX IF EXISTS sales_sales_order_id_uq');
    await sql('ALTER TABLE sales DROP COLUMN IF EXISTS sales_order_id');
    await sql('ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_pay_method_chk');
    await sql('ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_sale_type_chk');
    for (const c of ['payment_reference', 'payment_method', 'due_date', 'sale_type']) await sql(`ALTER TABLE sales_orders DROP COLUMN IF EXISTS ${c}`);
  },
};
