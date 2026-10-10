'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const ts = { created_at: now, updated_at: now };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });

module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('CREATE SEQUENCE stock_doc_seq START 1');

    // One header table for all stock documents: receiving, adjustment, reject in/out, expired, damaged.
    await q.createTable('stock_documents', {
      id: pk, doc_no: { type: T.STRING(30), allowNull: false, unique: true },
      type: { type: T.STRING(20), allowNull: false },
      status: { type: T.STRING(12), allowNull: false, defaultValue: 'DRAFT' },
      doc_date: { type: T.DATEONLY, allowNull: false, defaultValue: Sequelize.literal('CURRENT_DATE') },
      party_name: T.STRING(150), reference: T.STRING(100), reason: T.TEXT,
      approval_id: fk('approval_requests', { allowNull: true }),
      created_by: fk('users'), submitted_at: T.DATE, posted_at: T.DATE, ...ts,
    });
    await sql("ALTER TABLE stock_documents ADD CONSTRAINT stock_doc_type_chk CHECK (type IN ('RECEIVING','ADJUSTMENT','REJECT_IN','REJECT_OUT','EXPIRED','DAMAGED'))");
    await sql("ALTER TABLE stock_documents ADD CONSTRAINT stock_doc_status_chk CHECK (status IN ('DRAFT','SUBMITTED','POSTED','REJECTED','CANCELLED'))");
    await q.addIndex('stock_documents', ['type', 'status']);
    await q.addIndex('stock_documents', ['created_by']);
    await q.addIndex('stock_documents', ['doc_date']);

    await q.createTable('stock_document_lines', {
      id: pk, document_id: fk('stock_documents', { onDelete: 'CASCADE' }), item_id: fk('items'),
      direction: { type: T.STRING(3), allowNull: false },
      quantity: { type: T.DECIMAL(14, 3), allowNull: false },
      unit_cost: T.DECIMAL(14, 2), batch_no: T.STRING(60), expiry_date: T.DATEONLY,
      batch_id: fk('stock_batches', { allowNull: true }), remarks: T.STRING(255), created_at: now,
    });
    await sql("ALTER TABLE stock_document_lines ADD CONSTRAINT stock_line_dir_chk CHECK (direction IN ('IN','OUT'))");
    await sql('ALTER TABLE stock_document_lines ADD CONSTRAINT stock_line_qty_chk CHECK (quantity > 0)');
    await q.addIndex('stock_document_lines', ['document_id']);
    await q.addIndex('stock_document_lines', ['item_id']);

    // Lines are frozen once the document is submitted or posted.
    await sql(`CREATE OR REPLACE FUNCTION stock_lines_guard() RETURNS trigger AS $$
      DECLARE s text; d uuid;
      BEGIN
        IF TG_OP = 'DELETE' THEN d := OLD.document_id; ELSE d := NEW.document_id; END IF;
        SELECT status INTO s FROM stock_documents WHERE id = d;
        IF s IN ('SUBMITTED','POSTED') THEN RAISE EXCEPTION 'Lines of a % document cannot be changed', s; END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await sql('CREATE TRIGGER stock_lines_frozen BEFORE INSERT OR UPDATE OR DELETE ON stock_document_lines FOR EACH ROW EXECUTE FUNCTION stock_lines_guard()');

    // The stock ledger: one row per stock change. Append-only, like audit_logs.
    await q.createTable('stock_movements', {
      id: { type: T.BIGINT, primaryKey: true, autoIncrement: true },
      item_id: fk('items'), batch_id: fk('stock_batches', { allowNull: true }),
      document_id: fk('stock_documents'), line_id: fk('stock_document_lines', { allowNull: true }),
      movement_type: { type: T.STRING(20), allowNull: false },
      direction: { type: T.STRING(3), allowNull: false },
      quantity: { type: T.DECIMAL(14, 3), allowNull: false },
      balance_after: { type: T.DECIMAL(14, 3), allowNull: false },
      unit_cost: T.DECIMAL(14, 2), performed_by: fk('users'),
      occurred_at: { type: T.DATE, allowNull: false }, note: T.STRING(255), created_at: now,
    });
    await sql("ALTER TABLE stock_movements ADD CONSTRAINT stock_mv_dir_chk CHECK (direction IN ('IN','OUT'))");
    await sql('ALTER TABLE stock_movements ADD CONSTRAINT stock_mv_qty_chk CHECK (quantity > 0 AND balance_after >= 0)');
    await q.addIndex('stock_movements', ['item_id', 'occurred_at']);
    await q.addIndex('stock_movements', ['document_id']);
    await q.addIndex('stock_movements', ['movement_type']);
    await q.addIndex('stock_movements', ['occurred_at']);
    await sql('CREATE TRIGGER stock_mv_no_change BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION forbid_change()');
    await sql('CREATE TRIGGER stock_mv_no_truncate BEFORE TRUNCATE ON stock_movements FOR EACH STATEMENT EXECUTE FUNCTION forbid_change()');
  },
  async down(q) {
    const sql = (s) => q.sequelize.query(s);
    for (const t of ['stock_movements', 'stock_document_lines', 'stock_documents']) await q.dropTable(t, { cascade: true });
    await sql('DROP FUNCTION IF EXISTS stock_lines_guard() CASCADE');
    await sql('DROP SEQUENCE IF EXISTS stock_doc_seq');
  },
};
