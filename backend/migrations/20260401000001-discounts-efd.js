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
    await sql('CREATE SEQUENCE discount_code_seq START 1');

    /* ---------------- Discounts ---------------- */
    await q.createTable('discounts', {
      id: pk, code: { type: T.STRING(20), allowNull: false, unique: true },
      name: { type: T.STRING(100), allowNull: false }, description: T.STRING(255),
      percent: { type: T.DECIMAL(5, 2), allowNull: false },
      scope: { type: T.STRING(10), allowNull: false, defaultValue: 'ALL' },            // ALL items | one CATEGORY | one ITEM
      category_id: fk('categories', { allowNull: true }), item_id: fk('items', { allowNull: true }),
      customer_id: fk('customers', { allowNull: true }),                                // optional: a discount for one customer only
      min_quantity: { type: T.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },      // optional volume condition
      valid_from: { type: T.DATEONLY, allowNull: false, defaultValue: Sequelize.literal('CURRENT_DATE') },
      valid_to: T.DATEONLY,
      is_active: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: fk('users'), ...ts,
    });
    await sql('ALTER TABLE discounts ADD CONSTRAINT discounts_percent_chk CHECK (percent > 0 AND percent <= 100 AND min_quantity >= 0)');
    await sql("ALTER TABLE discounts ADD CONSTRAINT discounts_scope_chk CHECK ("
      + "(scope = 'ALL' AND category_id IS NULL AND item_id IS NULL) OR "
      + "(scope = 'CATEGORY' AND category_id IS NOT NULL AND item_id IS NULL) OR "
      + "(scope = 'ITEM' AND item_id IS NOT NULL AND category_id IS NULL))");
    await sql('ALTER TABLE discounts ADD CONSTRAINT discounts_dates_chk CHECK (valid_to IS NULL OR valid_to >= valid_from)');
    await sql('CREATE UNIQUE INDEX discounts_name_uq ON discounts (LOWER(name))');
    await q.addIndex('discounts', ['is_active', 'valid_from', 'valid_to']);
    await q.addIndex('discounts', ['category_id']);
    await q.addIndex('discounts', ['item_id']);
    await q.addIndex('discounts', ['customer_id']);

    // Order lines remember which discount they used (and its name, so history survives renames).
    await q.addColumn('sales_order_lines', 'discount_id', fk('discounts', { allowNull: true }));
    await q.addColumn('sales_order_lines', 'discount_name', { type: T.STRING(100), allowNull: true });
    await q.addIndex('sales_order_lines', ['discount_id']);

    /* ---------------- EFD numbers ---------------- */
    await q.createTable('efd_devices', {
      id: pk, serial_no: { type: T.STRING(40), allowNull: false, unique: true }, name: { type: T.STRING(100), allowNull: false },
      tin: { type: T.STRING(30), allowNull: false }, vrn: T.STRING(30), location: T.STRING(150), notes: T.STRING(255),
      is_active: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: fk('users'), ...ts,
    });

    await q.createTable('efd_receipts', {
      id: pk, device_id: fk('efd_devices'), sales_order_id: fk('sales_orders'),
      receipt_no: { type: T.STRING(40), allowNull: false }, verification_code: T.STRING(40),
      issued_at: { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      amount: money(), vat_amount: money(), customer_tin: T.STRING(30),      // snapshots of the order at the time of recording
      status: { type: T.STRING(10), allowNull: false, defaultValue: 'ISSUED' },
      void_reason: T.TEXT, voided_at: T.DATE, voided_by: fk('users', { allowNull: true }),
      created_by: fk('users'), ...ts,
    });
    await sql("ALTER TABLE efd_receipts ADD CONSTRAINT efd_receipts_status_chk CHECK (status IN ('ISSUED','VOIDED'))");
    await sql('ALTER TABLE efd_receipts ADD CONSTRAINT efd_receipts_amount_chk CHECK (amount >= 0 AND vat_amount >= 0)');
    await q.addIndex('efd_receipts', ['device_id', 'receipt_no'], { unique: true });                 // a device never issues the same number twice
    await sql("CREATE UNIQUE INDEX efd_receipts_order_uq ON efd_receipts (sales_order_id) WHERE status = 'ISSUED'");   // one live receipt per order
    await q.addIndex('efd_receipts', ['sales_order_id']);
    await q.addIndex('efd_receipts', ['issued_at']);
    await q.addIndex('efd_receipts', ['status']);

    // Fiscal records are never deleted or rewritten: only a receipt's status can move ISSUED -> VOIDED.
    await sql(`CREATE OR REPLACE FUNCTION efd_receipts_guard() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'EFD receipts cannot be deleted. Void the receipt instead.'; END IF;
        IF NEW.receipt_no <> OLD.receipt_no OR NEW.device_id <> OLD.device_id OR NEW.sales_order_id <> OLD.sales_order_id
           OR NEW.amount <> OLD.amount OR NEW.vat_amount <> OLD.vat_amount OR NEW.issued_at <> OLD.issued_at THEN
          RAISE EXCEPTION 'EFD receipt details cannot be changed. Void the receipt and record a new one.';
        END IF;
        IF OLD.status = 'VOIDED' AND NEW.status <> 'VOIDED' THEN RAISE EXCEPTION 'A voided EFD receipt cannot be reopened.'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await sql('CREATE TRIGGER efd_receipts_no_rewrite BEFORE UPDATE OR DELETE ON efd_receipts FOR EACH ROW EXECUTE FUNCTION efd_receipts_guard()');
    await sql('CREATE TRIGGER efd_receipts_no_truncate BEFORE TRUNCATE ON efd_receipts FOR EACH STATEMENT EXECUTE FUNCTION forbid_change()');
  },
  async down(q) {
    const sql = (s) => q.sequelize.query(s);
    await q.dropTable('efd_receipts', { cascade: true });
    await q.dropTable('efd_devices', { cascade: true });
    await sql('DROP FUNCTION IF EXISTS efd_receipts_guard() CASCADE');
    await q.removeColumn('sales_order_lines', 'discount_name');
    await q.removeColumn('sales_order_lines', 'discount_id');
    await q.dropTable('discounts', { cascade: true });
    await sql('DROP SEQUENCE IF EXISTS discount_code_seq');
  },
};
