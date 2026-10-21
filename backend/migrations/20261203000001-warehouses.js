'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const ts = { created_at: now, updated_at: now };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });
const qty = (extra = {}) => ({ type: T.DECIMAL(14, 3), allowNull: false, defaultValue: 0, ...extra });

/* Warehouses: several physical stores, each with its own stock.
   - stock_levels / stock_batches stay the COMPANY-WIDE totals (all existing reports keep working).
   - warehouse_stock / warehouse_stock_batches split those totals per warehouse. The ledger (services/stockLedger.js) keeps both in step,
     so SUM(warehouse_stock) always equals stock_levels.
   - Moving stock between warehouses changes ONLY the per-warehouse rows (company total is unchanged) and needs a Manager's approval. */
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('CREATE SEQUENCE warehouse_code_seq START 1');
    await sql('CREATE SEQUENCE warehouse_transfer_seq START 1');

    await q.createTable('warehouses', {
      id: pk, code: { type: T.STRING(20), allowNull: false, unique: true },
      name: { type: T.STRING(100), allowNull: false }, location: T.STRING(255), description: T.STRING(255),
      is_default: { type: T.BOOLEAN, allowNull: false, defaultValue: false },   // used when a stock document names no warehouse
      is_active: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: fk('users'), ...ts,
    });
    await sql('CREATE UNIQUE INDEX warehouses_name_uq ON warehouses (LOWER(name))');
    await sql('CREATE UNIQUE INDEX warehouses_one_default_uq ON warehouses (is_default) WHERE is_default');

    // Storekeepers in charge of a warehouse (a warehouse can have several, a storekeeper can look after several).
    await q.createTable('warehouse_storekeepers', {
      warehouse_id: { ...fk('warehouses'), primaryKey: true }, user_id: { ...fk('users'), primaryKey: true },
      assigned_by: fk('users'), created_at: now,
    });
    await q.addIndex('warehouse_storekeepers', ['user_id']);

    await q.createTable('warehouse_stock', {
      warehouse_id: { ...fk('warehouses'), primaryKey: true }, item_id: { ...fk('items'), primaryKey: true }, quantity: qty(), updated_at: now,
    });
    await sql('ALTER TABLE warehouse_stock ADD CONSTRAINT warehouse_stock_qty_chk CHECK (quantity >= 0)');
    await q.addIndex('warehouse_stock', ['item_id']);

    await q.createTable('warehouse_stock_batches', {
      warehouse_id: { ...fk('warehouses'), primaryKey: true }, batch_id: { ...fk('stock_batches'), primaryKey: true }, quantity: qty(), updated_at: now,
    });
    await sql('ALTER TABLE warehouse_stock_batches ADD CONSTRAINT warehouse_stock_batches_qty_chk CHECK (quantity >= 0)');

    // Per-warehouse ledger, append-only like stock_movements.
    await q.createTable('warehouse_movements', {
      id: { type: T.BIGINT, primaryKey: true, autoIncrement: true },
      warehouse_id: fk('warehouses'), item_id: fk('items'), batch_id: fk('stock_batches', { allowNull: true }),
      movement_type: { type: T.STRING(20), allowNull: false }, direction: { type: T.STRING(3), allowNull: false },
      quantity: { type: T.DECIMAL(14, 3), allowNull: false }, balance_after: { type: T.DECIMAL(14, 3), allowNull: false },
      ref_type: T.STRING(30), ref_id: T.UUID, performed_by: fk('users'),
      occurred_at: { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') }, note: T.STRING(255), created_at: now,
    });
    await sql("ALTER TABLE warehouse_movements ADD CONSTRAINT wh_mv_dir_chk CHECK (direction IN ('IN','OUT'))");
    await sql('ALTER TABLE warehouse_movements ADD CONSTRAINT wh_mv_qty_chk CHECK (quantity > 0 AND balance_after >= 0)');
    await q.addIndex('warehouse_movements', ['warehouse_id', 'occurred_at']);
    await q.addIndex('warehouse_movements', ['item_id']);
    await q.addIndex('warehouse_movements', ['ref_id']);
    await sql('CREATE TRIGGER wh_mv_no_change BEFORE UPDATE OR DELETE ON warehouse_movements FOR EACH ROW EXECUTE PROCEDURE forbid_change()');
    await sql('CREATE TRIGGER wh_mv_no_truncate BEFORE TRUNCATE ON warehouse_movements FOR EACH STATEMENT EXECUTE PROCEDURE forbid_change()');

    // Transfer between warehouses. Created by a storekeeper (SUBMITTED), stock moves only when a manager approves (COMPLETED).
    await q.createTable('warehouse_transfers', {
      id: pk, transfer_no: { type: T.STRING(30), allowNull: false, unique: true },
      from_warehouse_id: fk('warehouses'), to_warehouse_id: fk('warehouses'),
      status: { type: T.STRING(12), allowNull: false, defaultValue: 'SUBMITTED' },
      transfer_date: { type: T.DATEONLY, allowNull: false, defaultValue: Sequelize.literal('CURRENT_DATE') },
      reason: T.TEXT, approval_id: fk('approval_requests', { allowNull: true }),
      created_by: fk('users'), submitted_at: T.DATE, completed_at: T.DATE, ...ts,
    });
    await sql("ALTER TABLE warehouse_transfers ADD CONSTRAINT wh_tr_status_chk CHECK (status IN ('SUBMITTED','COMPLETED','REJECTED','CANCELLED'))");
    await sql('ALTER TABLE warehouse_transfers ADD CONSTRAINT wh_tr_diff_chk CHECK (from_warehouse_id <> to_warehouse_id)');
    await q.addIndex('warehouse_transfers', ['status']);
    await q.addIndex('warehouse_transfers', ['from_warehouse_id']);
    await q.addIndex('warehouse_transfers', ['to_warehouse_id']);
    await q.addIndex('warehouse_transfers', ['created_by']);

    await q.createTable('warehouse_transfer_lines', {
      id: pk, transfer_id: fk('warehouse_transfers', { onDelete: 'CASCADE' }), item_id: fk('items'),
      batch_id: fk('stock_batches', { allowNull: true }),
      quantity: { type: T.DECIMAL(14, 3), allowNull: false }, remarks: T.STRING(255), created_at: now,
    });
    await sql('ALTER TABLE warehouse_transfer_lines ADD CONSTRAINT wh_tr_line_qty_chk CHECK (quantity > 0)');
    await q.addIndex('warehouse_transfer_lines', ['transfer_id']);

    // Which warehouse a stock document moves stock in / out of, and which warehouse a salesperson sells from.
    await sql('ALTER TABLE stock_documents ADD COLUMN warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT');
    await sql('CREATE INDEX stock_documents_warehouse_idx ON stock_documents (warehouse_id)');
    await sql('ALTER TABLE salespersons ADD COLUMN warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT');
    await sql('CREATE INDEX salespersons_warehouse_idx ON salespersons (warehouse_id)');

    // Existing installations: everything that is in stock today goes into one "Main Warehouse" so the numbers stay consistent.
    const [[owner]] = await sql('SELECT id FROM users ORDER BY created_at ASC LIMIT 1');
    if (owner) {
      const [[w]] = await q.sequelize.query(
        `INSERT INTO warehouses (code, name, is_default, created_by)
         VALUES ('WH-' || LPAD(nextval('warehouse_code_seq')::text, 6, '0'), 'Main Warehouse', TRUE, :uid) RETURNING id`, { replacements: { uid: owner.id } });
      const r = { replacements: { w: w.id } };
      await q.sequelize.query('INSERT INTO warehouse_stock (warehouse_id, item_id, quantity) SELECT :w, item_id, quantity FROM stock_levels WHERE quantity > 0', r);
      await q.sequelize.query('INSERT INTO warehouse_stock_batches (warehouse_id, batch_id, quantity) SELECT :w, id, quantity FROM stock_batches WHERE quantity > 0', r);
      await q.sequelize.query('UPDATE stock_documents SET warehouse_id = :w', r);
      await q.sequelize.query('UPDATE salespersons SET warehouse_id = :w', r);
    }
  },
  async down(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('ALTER TABLE salespersons DROP COLUMN IF EXISTS warehouse_id');
    await sql('ALTER TABLE stock_documents DROP COLUMN IF EXISTS warehouse_id');
    for (const t of ['warehouse_transfer_lines', 'warehouse_transfers', 'warehouse_movements', 'warehouse_stock_batches', 'warehouse_stock', 'warehouse_storekeepers', 'warehouses'])
      await q.dropTable(t, { cascade: true });
    await sql('DROP SEQUENCE IF EXISTS warehouse_transfer_seq');
    await sql('DROP SEQUENCE IF EXISTS warehouse_code_seq');
  },
};