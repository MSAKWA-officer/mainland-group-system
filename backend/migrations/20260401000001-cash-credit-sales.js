'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const ts = { created_at: now, updated_at: now };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });
const money = (extra = {}) => ({ type: T.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

// One `sales` table holds both kinds of sale (sale_type CASH | CREDIT), so the Sales register, Cash Sale and Credit Sale
// submodules all read the same records. Stock is issued through the existing Phase 2 ledger (document type SALE / SALE_CANCEL).
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('CREATE SEQUENCE cash_sale_seq START 1');
    await sql('CREATE SEQUENCE credit_sale_seq START 1');
    await sql('CREATE SEQUENCE sale_receipt_seq START 1');

    await q.createTable('sales', {
      id: pk, sale_no: { type: T.STRING(30), allowNull: false, unique: true },
      sale_type: { type: T.STRING(6), allowNull: false },
      customer_id: fk('customers', { allowNull: true }),                       // null = walk-in (cash sales only)
      walk_in_name: T.STRING(150), walk_in_phone: T.STRING(30),
      salesperson_id: fk('salespersons', { allowNull: true }),
      status: { type: T.STRING(12), allowNull: false, defaultValue: 'DRAFT' },
      sale_date: { type: T.DATEONLY, allowNull: false, defaultValue: Sequelize.literal('CURRENT_DATE') },
      due_date: T.DATEONLY,                                                    // credit sales only
      notes: T.TEXT,
      tax_rate: { type: T.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      subtotal: money(), discount_total: money(), tax_total: money(), total: money(),
      amount_paid: money(),
      payment_status: { type: T.STRING(8), allowNull: false, defaultValue: 'UNPAID' },
      approval_id: fk('approval_requests', { allowNull: true }),
      stock_document_id: fk('stock_documents', { allowNull: true }), cancel_document_id: fk('stock_documents', { allowNull: true }),
      created_by: fk('users'),
      submitted_at: T.DATE, completed_at: T.DATE, cancelled_at: T.DATE, voided_at: T.DATE,
      voided_by: fk('users', { allowNull: true }), void_reason: T.TEXT, ...ts,
    });
    await sql("ALTER TABLE sales ADD CONSTRAINT sales_type_chk CHECK (sale_type IN ('CASH','CREDIT'))");
    await sql("ALTER TABLE sales ADD CONSTRAINT sales_status_chk CHECK (status IN ('DRAFT','SUBMITTED','COMPLETED','REJECTED','CANCELLED','VOIDED'))");
    await sql("ALTER TABLE sales ADD CONSTRAINT sales_paystatus_chk CHECK (payment_status IN ('UNPAID','PARTIAL','PAID'))");
    await sql('ALTER TABLE sales ADD CONSTRAINT sales_amounts_chk CHECK (tax_rate BETWEEN 0 AND 100 AND subtotal >= 0 AND discount_total >= 0 AND tax_total >= 0 AND total >= 0 AND amount_paid >= 0 AND amount_paid <= total)');
    await sql("ALTER TABLE sales ADD CONSTRAINT sales_credit_chk CHECK (sale_type = 'CASH' OR (customer_id IS NOT NULL AND due_date IS NOT NULL AND due_date >= sale_date))");
    await sql("ALTER TABLE sales ADD CONSTRAINT sales_cash_chk CHECK (sale_type = 'CREDIT' OR due_date IS NULL)");
    for (const c of ['customer_id', 'salesperson_id', 'status', 'sale_type', 'sale_date', 'due_date', 'created_by', 'payment_status']) await q.addIndex('sales', [c]);

    await q.createTable('sale_lines', {
      id: pk, sale_id: fk('sales', { onDelete: 'CASCADE' }), item_id: fk('items'),
      sku: { type: T.STRING(40), allowNull: false }, item_name: { type: T.STRING(150), allowNull: false }, unit: { type: T.STRING(20), allowNull: false },
      quantity: { type: T.DECIMAL(14, 3), allowNull: false }, unit_price: { type: T.DECIMAL(14, 2), allowNull: false },
      discount_percent: { type: T.DECIMAL(5, 2), allowNull: false, defaultValue: 0 }, line_total: money(),
      created_at: now,
    });
    await sql('ALTER TABLE sale_lines ADD CONSTRAINT sale_lines_chk CHECK (quantity > 0 AND unit_price >= 0 AND discount_percent BETWEEN 0 AND 100 AND line_total >= 0)');
    await q.addIndex('sale_lines', ['sale_id']);
    await q.addIndex('sale_lines', ['item_id']);
    await q.addIndex('sale_lines', ['sale_id', 'item_id'], { unique: true });

    // Lines are frozen once the sale is submitted / completed.
    await sql(`CREATE OR REPLACE FUNCTION sale_lines_guard() RETURNS trigger AS $$
      DECLARE s text; d uuid;
      BEGIN
        IF TG_OP = 'DELETE' THEN d := OLD.sale_id; ELSE d := NEW.sale_id; END IF;
        SELECT status INTO s FROM sales WHERE id = d;
        IF s IN ('SUBMITTED','COMPLETED') THEN RAISE EXCEPTION 'Lines of a % sale cannot be changed', s; END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await sql('CREATE TRIGGER sale_lines_frozen BEFORE INSERT OR UPDATE OR DELETE ON sale_lines FOR EACH ROW EXECUTE FUNCTION sale_lines_guard()');

    // Money received for a sale. Cash sale = one row at the till; credit sale = one row per instalment. Voided rows are kept (never deleted).
    await q.createTable('sale_payments', {
      id: pk, receipt_no: { type: T.STRING(30), allowNull: false, unique: true },
      sale_id: fk('sales'), amount: { type: T.DECIMAL(20, 2), allowNull: false },
      tendered: { type: T.DECIMAL(20, 2), allowNull: true },                  // cash handed over (cash sales), so change = tendered - amount
      method: { type: T.STRING(15), allowNull: false }, reference: T.STRING(100),
      paid_on: { type: T.DATEONLY, allowNull: false, defaultValue: Sequelize.literal('CURRENT_DATE') }, notes: T.TEXT,
      received_by: fk('users'),
      voided_at: T.DATE, voided_by: fk('users', { allowNull: true }), void_reason: T.TEXT, ...ts,
    });
    await sql("ALTER TABLE sale_payments ADD CONSTRAINT sale_payments_chk CHECK (amount > 0 AND (tendered IS NULL OR tendered >= amount) AND method IN ('CASH','MOBILE_MONEY','BANK','CARD','CHEQUE'))");
    await q.addIndex('sale_payments', ['sale_id']);
    await q.addIndex('sale_payments', ['paid_on']);
  },
  async down(q) {
    const sql = (s) => q.sequelize.query(s);
    for (const t of ['sale_payments', 'sale_lines', 'sales']) await q.dropTable(t, { cascade: true });
    await sql('DROP FUNCTION IF EXISTS sale_lines_guard() CASCADE');
    for (const s of ['cash_sale_seq', 'credit_sale_seq', 'sale_receipt_seq']) await sql(`DROP SEQUENCE IF EXISTS ${s}`);
  },
};
