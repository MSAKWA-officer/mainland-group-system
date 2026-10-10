'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const ts = { created_at: now, updated_at: now };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });
const money = (extra = {}) => ({ type: T.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('CREATE SEQUENCE salesperson_code_seq START 1');
    await sql('CREATE SEQUENCE customer_code_seq START 1');
    await sql('CREATE SEQUENCE sales_order_seq START 1');

    await q.createTable('salespersons', {
      id: pk, code: { type: T.STRING(20), allowNull: false, unique: true },
      user_id: fk('users', { allowNull: true }),            // optional login account; needed for "own customers / own orders" scoping
      full_name: { type: T.STRING(100), allowNull: false }, phone: T.STRING(30), email: T.STRING(150), region: T.STRING(80),
      commission_rate: { type: T.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      monthly_target: money(),
      is_active: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: fk('users'), ...ts,
    });
    await sql('CREATE UNIQUE INDEX salespersons_user_uq ON salespersons (user_id) WHERE user_id IS NOT NULL');
    await sql('ALTER TABLE salespersons ADD CONSTRAINT salespersons_chk CHECK (commission_rate BETWEEN 0 AND 100 AND monthly_target >= 0)');
    await q.addIndex('salespersons', ['full_name']);

    await q.createTable('customers', {
      id: pk, code: { type: T.STRING(20), allowNull: false, unique: true },
      name: { type: T.STRING(150), allowNull: false }, type: { type: T.STRING(12), allowNull: false, defaultValue: 'INDIVIDUAL' },
      contact_person: T.STRING(100), phone: T.STRING(30), email: T.STRING(150), address: T.STRING(255), city: T.STRING(80),
      tin: T.STRING(30), credit_limit: money(), payment_terms_days: { type: T.INTEGER, allowNull: false, defaultValue: 0 },
      salesperson_id: fk('salespersons', { allowNull: true }), notes: T.TEXT,
      is_active: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: fk('users'), ...ts,
    });
    await sql("ALTER TABLE customers ADD CONSTRAINT customers_chk CHECK (type IN ('INDIVIDUAL','COMPANY') AND credit_limit >= 0 AND payment_terms_days BETWEEN 0 AND 365)");
    await sql('CREATE UNIQUE INDEX customers_email_uq ON customers (LOWER(email)) WHERE email IS NOT NULL');
    await sql('CREATE UNIQUE INDEX customers_tin_uq ON customers (UPPER(tin)) WHERE tin IS NOT NULL');
    await q.addIndex('customers', ['name']);
    await q.addIndex('customers', ['phone']);
    await q.addIndex('customers', ['salesperson_id']);

    await q.createTable('sales_orders', {
      id: pk, order_no: { type: T.STRING(30), allowNull: false, unique: true },
      customer_id: fk('customers'), salesperson_id: fk('salespersons'),
      status: { type: T.STRING(12), allowNull: false, defaultValue: 'DRAFT' },
      order_date: { type: T.DATEONLY, allowNull: false, defaultValue: Sequelize.literal('CURRENT_DATE') },
      delivery_date: T.DATEONLY, notes: T.TEXT,
      tax_rate: { type: T.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      subtotal: money(), discount_total: money(), tax_total: money(), total: money(),
      approval_id: fk('approval_requests', { allowNull: true }),
      stock_document_id: fk('stock_documents', { allowNull: true }), cancel_document_id: fk('stock_documents', { allowNull: true }),
      created_by: fk('users'), submitted_at: T.DATE, confirmed_at: T.DATE, cancelled_at: T.DATE, cancel_reason: T.TEXT, ...ts,
    });
    await sql("ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_status_chk CHECK (status IN ('DRAFT','SUBMITTED','CONFIRMED','REJECTED','CANCELLED'))");
    await sql('ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_amounts_chk CHECK (tax_rate BETWEEN 0 AND 100 AND subtotal >= 0 AND discount_total >= 0 AND tax_total >= 0 AND total >= 0)');
    await q.addIndex('sales_orders', ['customer_id']);
    await q.addIndex('sales_orders', ['salesperson_id']);
    await q.addIndex('sales_orders', ['status']);
    await q.addIndex('sales_orders', ['order_date']);
    await q.addIndex('sales_orders', ['created_by']);

    await q.createTable('sales_order_lines', {
      id: pk, order_id: fk('sales_orders', { onDelete: 'CASCADE' }), item_id: fk('items'),
      sku: { type: T.STRING(40), allowNull: false }, item_name: { type: T.STRING(150), allowNull: false }, unit: { type: T.STRING(20), allowNull: false },
      quantity: { type: T.DECIMAL(14, 3), allowNull: false }, unit_price: { type: T.DECIMAL(14, 2), allowNull: false },
      discount_percent: { type: T.DECIMAL(5, 2), allowNull: false, defaultValue: 0 }, line_total: money(),
      created_at: now,
    });
    await sql('ALTER TABLE sales_order_lines ADD CONSTRAINT sales_lines_chk CHECK (quantity > 0 AND unit_price >= 0 AND discount_percent BETWEEN 0 AND 100 AND line_total >= 0)');
    await q.addIndex('sales_order_lines', ['order_id']);
    await q.addIndex('sales_order_lines', ['item_id']);
    await q.addIndex('sales_order_lines', ['order_id', 'item_id'], { unique: true });   // one line per item per order

    // Lines are frozen once the order is submitted or confirmed.
    await sql(`CREATE OR REPLACE FUNCTION sales_lines_guard() RETURNS trigger AS $$
      DECLARE s text; d uuid;
      BEGIN
        IF TG_OP = 'DELETE' THEN d := OLD.order_id; ELSE d := NEW.order_id; END IF;
        SELECT status INTO s FROM sales_orders WHERE id = d;
        IF s IN ('SUBMITTED','CONFIRMED') THEN RAISE EXCEPTION 'Lines of a % order cannot be changed', s; END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await sql('CREATE TRIGGER sales_lines_frozen BEFORE INSERT OR UPDATE OR DELETE ON sales_order_lines FOR EACH ROW EXECUTE FUNCTION sales_lines_guard()');

    // Sales issue stock through the Phase 2 ledger using two extra system document types.
    await sql('ALTER TABLE stock_documents DROP CONSTRAINT stock_doc_type_chk');
    await sql("ALTER TABLE stock_documents ADD CONSTRAINT stock_doc_type_chk CHECK (type IN ('RECEIVING','ADJUSTMENT','REJECT_IN','REJECT_OUT','EXPIRED','DAMAGED','SALE','SALE_CANCEL'))");
  },
  async down(q) {
    const sql = (s) => q.sequelize.query(s);
    for (const t of ['sales_order_lines', 'sales_orders', 'customers', 'salespersons']) await q.dropTable(t, { cascade: true });
    await sql('DROP FUNCTION IF EXISTS sales_lines_guard() CASCADE');
    for (const s of ['salesperson_code_seq', 'customer_code_seq', 'sales_order_seq']) await sql(`DROP SEQUENCE IF EXISTS ${s}`);
    // NOT VALID: stock documents already posted for sales stay in the ledger (it is append-only).
    await sql('ALTER TABLE stock_documents DROP CONSTRAINT stock_doc_type_chk');
    await sql("ALTER TABLE stock_documents ADD CONSTRAINT stock_doc_type_chk CHECK (type IN ('RECEIVING','ADJUSTMENT','REJECT_IN','REJECT_OUT','EXPIRED','DAMAGED')) NOT VALID");
  },
};
