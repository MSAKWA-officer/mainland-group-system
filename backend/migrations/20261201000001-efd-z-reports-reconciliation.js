'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const ts = { created_at: now, updated_at: now };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });
const money = (extra = {}) => ({ type: T.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

// Phase 7 - EFD: Z reports (the device's end-of-day fiscal report) and Daily reconciliation (Z report vs receipts recorded in the system).
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('CREATE SEQUENCE efd_z_report_seq START 1');
    await sql('CREATE SEQUENCE efd_reconciliation_seq START 1');

    /* ---------------- Z reports ---------------- */
    await q.createTable('efd_z_reports', {
      id: pk, report_no: { type: T.STRING(30), allowNull: false, unique: true },          // internal number, e.g. ZR-2026-000001
      device_id: fk('efd_devices'), report_date: { type: T.DATEONLY, allowNull: false },   // the trading day the Z report closes
      z_number: { type: T.STRING(20), allowNull: false },                                  // the Z counter printed by the device
      receipts_count: { type: T.INTEGER, allowNull: false, defaultValue: 0 },
      gross_amount: money(), vat_amount: money(), net_amount: money(),                     // net = gross - vat, always calculated by the server
      voided_count: { type: T.INTEGER, allowNull: false, defaultValue: 0 },                // receipts cancelled on the device that day
      voided_amount: money(),
      first_receipt_no: T.STRING(40), last_receipt_no: T.STRING(40), notes: T.TEXT,
      status: { type: T.STRING(10), allowNull: false, defaultValue: 'PENDING' },           // PENDING -> VERIFIED | REJECTED ; PENDING / VERIFIED -> VOIDED
      created_by: fk('users'),
      decided_by: fk('users', { allowNull: true }), decided_at: T.DATE, decision_note: T.TEXT,
      voided_at: T.DATE, voided_by: fk('users', { allowNull: true }), void_reason: T.TEXT, ...ts,
    });
    await sql("ALTER TABLE efd_z_reports ADD CONSTRAINT efd_z_reports_status_chk CHECK (status IN ('PENDING','VERIFIED','REJECTED','VOIDED'))");
    await sql('ALTER TABLE efd_z_reports ADD CONSTRAINT efd_z_reports_amount_chk CHECK (gross_amount >= 0 AND vat_amount >= 0 AND vat_amount <= gross_amount '
      + 'AND net_amount = gross_amount - vat_amount AND voided_amount >= 0 AND receipts_count >= 0 AND voided_count >= 0)');
    await sql("ALTER TABLE efd_z_reports ADD CONSTRAINT efd_z_reports_z_chk CHECK (z_number ~ '^[0-9]{1,20}$')");
    await sql("ALTER TABLE efd_z_reports ADD CONSTRAINT efd_z_reports_void_chk CHECK (status <> 'VOIDED' OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL))");
    await sql("ALTER TABLE efd_z_reports ADD CONSTRAINT efd_z_reports_decision_chk CHECK (status NOT IN ('VERIFIED','REJECTED') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))");
    // One live Z report per device per day, and a device's Z counter is never used twice by a live report.
    await sql("CREATE UNIQUE INDEX efd_z_reports_day_uq ON efd_z_reports (device_id, report_date) WHERE status IN ('PENDING','VERIFIED')");
    await sql("CREATE UNIQUE INDEX efd_z_reports_znum_uq ON efd_z_reports (device_id, CAST(z_number AS numeric)) WHERE status IN ('PENDING','VERIFIED')");
    for (const c of ['device_id', 'report_date', 'status', 'created_by']) await q.addIndex('efd_z_reports', [c]);

    // A verified Z report is a fiscal record: only its status may move on (VERIFIED -> VOIDED). Never deleted.
    await sql(`CREATE OR REPLACE FUNCTION efd_z_reports_guard() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Z reports cannot be deleted. Void the report instead.'; END IF;
        IF OLD.status IN ('VOIDED','REJECTED') AND NEW.status <> OLD.status THEN RAISE EXCEPTION 'A % Z report cannot be reopened.', lower(OLD.status); END IF;
        IF OLD.status = 'VERIFIED' AND (NEW.device_id <> OLD.device_id OR NEW.report_date <> OLD.report_date OR NEW.z_number <> OLD.z_number
           OR NEW.gross_amount <> OLD.gross_amount OR NEW.vat_amount <> OLD.vat_amount OR NEW.net_amount <> OLD.net_amount
           OR NEW.receipts_count <> OLD.receipts_count OR NEW.voided_count <> OLD.voided_count OR NEW.voided_amount <> OLD.voided_amount) THEN
          RAISE EXCEPTION 'A verified Z report cannot be changed. Void it and record a new one.';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await sql('CREATE TRIGGER efd_z_reports_no_rewrite BEFORE UPDATE OR DELETE ON efd_z_reports FOR EACH ROW EXECUTE FUNCTION efd_z_reports_guard()');
    await sql('CREATE TRIGGER efd_z_reports_no_truncate BEFORE TRUNCATE ON efd_z_reports FOR EACH STATEMENT EXECUTE FUNCTION forbid_change()');

    /* ---------------- Daily reconciliation ---------------- */
    await q.createTable('efd_reconciliations', {
      id: pk, recon_no: { type: T.STRING(30), allowNull: false, unique: true },            // e.g. RC-2026-000001
      device_id: fk('efd_devices'), recon_date: { type: T.DATEONLY, allowNull: false },
      z_report_id: fk('efd_z_reports'),
      // Snapshot of the figures at the moment of reconciliation (all calculated by the server).
      z_gross: money(), z_vat: money(), z_count: { type: T.INTEGER, allowNull: false, defaultValue: 0 },
      receipts_gross: money(), receipts_vat: money(), receipts_count: { type: T.INTEGER, allowNull: false, defaultValue: 0 },
      voided_receipts_count: { type: T.INTEGER, allowNull: false, defaultValue: 0 }, voided_receipts_amount: money(),
      unreceipted_orders_count: { type: T.INTEGER, allowNull: false, defaultValue: 0 }, unreceipted_orders_amount: money(),
      gross_variance: money(), vat_variance: money(), count_variance: { type: T.INTEGER, allowNull: false, defaultValue: 0 },   // Z report minus system receipts
      status: { type: T.STRING(10), allowNull: false, defaultValue: 'OPEN' },              // OPEN -> RECONCILED ; OPEN / RECONCILED -> VOIDED
      explanation: T.TEXT,                                                                 // required to reconcile when there is any difference
      created_by: fk('users'), refreshed_at: T.DATE,
      reconciled_by: fk('users', { allowNull: true }), reconciled_at: T.DATE,
      voided_at: T.DATE, voided_by: fk('users', { allowNull: true }), void_reason: T.TEXT, ...ts,
    });
    await sql("ALTER TABLE efd_reconciliations ADD CONSTRAINT efd_reconciliations_status_chk CHECK (status IN ('OPEN','RECONCILED','VOIDED'))");
    await sql('ALTER TABLE efd_reconciliations ADD CONSTRAINT efd_reconciliations_amount_chk CHECK (z_gross >= 0 AND z_vat >= 0 AND receipts_gross >= 0 AND receipts_vat >= 0 '
      + 'AND voided_receipts_amount >= 0 AND unreceipted_orders_amount >= 0 AND z_count >= 0 AND receipts_count >= 0 AND voided_receipts_count >= 0 AND unreceipted_orders_count >= 0)');
    await sql("ALTER TABLE efd_reconciliations ADD CONSTRAINT efd_reconciliations_state_chk CHECK ("
      + "(status <> 'RECONCILED' OR (reconciled_by IS NOT NULL AND reconciled_at IS NOT NULL)) "
      + "AND (status <> 'VOIDED' OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL)))");
    await sql("CREATE UNIQUE INDEX efd_reconciliations_day_uq ON efd_reconciliations (device_id, recon_date) WHERE status IN ('OPEN','RECONCILED')");
    for (const c of ['device_id', 'recon_date', 'z_report_id', 'status', 'created_by']) await q.addIndex('efd_reconciliations', [c]);

    // A reconciled day is frozen: only RECONCILED -> VOIDED is allowed. Never deleted.
    await sql(`CREATE OR REPLACE FUNCTION efd_reconciliations_guard() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Reconciliations cannot be deleted. Void the reconciliation instead.'; END IF;
        IF OLD.status = 'VOIDED' AND NEW.status <> 'VOIDED' THEN RAISE EXCEPTION 'A voided reconciliation cannot be reopened.'; END IF;
        IF OLD.status = 'RECONCILED' AND (NEW.status NOT IN ('RECONCILED','VOIDED') OR NEW.device_id <> OLD.device_id OR NEW.recon_date <> OLD.recon_date
           OR NEW.z_report_id <> OLD.z_report_id OR NEW.z_gross <> OLD.z_gross OR NEW.z_vat <> OLD.z_vat OR NEW.z_count <> OLD.z_count
           OR NEW.receipts_gross <> OLD.receipts_gross OR NEW.receipts_vat <> OLD.receipts_vat OR NEW.receipts_count <> OLD.receipts_count
           OR NEW.gross_variance <> OLD.gross_variance OR NEW.vat_variance <> OLD.vat_variance OR NEW.count_variance <> OLD.count_variance) THEN
          RAISE EXCEPTION 'A reconciled day cannot be changed. Void the reconciliation and start again.';
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await sql('CREATE TRIGGER efd_reconciliations_no_rewrite BEFORE UPDATE OR DELETE ON efd_reconciliations FOR EACH ROW EXECUTE FUNCTION efd_reconciliations_guard()');
    await sql('CREATE TRIGGER efd_reconciliations_no_truncate BEFORE TRUNCATE ON efd_reconciliations FOR EACH STATEMENT EXECUTE FUNCTION forbid_change()');
  },
  async down(q) {
    const sql = (s) => q.sequelize.query(s);
    await q.dropTable('efd_reconciliations', { cascade: true });
    await q.dropTable('efd_z_reports', { cascade: true });
    await sql('DROP FUNCTION IF EXISTS efd_reconciliations_guard() CASCADE');
    await sql('DROP FUNCTION IF EXISTS efd_z_reports_guard() CASCADE');
    await sql('DROP SEQUENCE IF EXISTS efd_reconciliation_seq');
    await sql('DROP SEQUENCE IF EXISTS efd_z_report_seq');
  },
};
