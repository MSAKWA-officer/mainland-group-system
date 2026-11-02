'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const ts = { created_at: now, updated_at: now };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });

// Vehicle requests = the "Official Vehicle Use REQUEST Form" on screen.
//   User fills in : date, user's name, department, purpose           (status PENDING)
//   Approver      : approves or rejects                               (APPROVED | REJECTED)
//   Key custodian : plate number, driver, key taken time              (KEY_OUT)  ... key return time (RETURNED)
// Flow: PENDING -> APPROVED | REJECTED, APPROVED -> KEY_OUT -> RETURNED, PENDING / APPROVED -> VOIDED. Never deleted.
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('CREATE SEQUENCE vehicle_request_seq START 1');
    await q.createTable('vehicle_requests', {
      id: pk, request_no: { type: T.STRING(30), allowNull: false, unique: true },
      request_date: { type: T.DATEONLY, allowNull: false }, user_name: { type: T.STRING(100), allowNull: false },
      department: { type: T.STRING(100), allowNull: false }, purpose: { type: T.STRING(255), allowNull: false }, notes: T.TEXT,
      status: { type: T.STRING(10), allowNull: false, defaultValue: 'PENDING' },
      decided_by: fk('users', { allowNull: true }), decided_at: T.DATE, decision_note: T.TEXT,
      vehicle_id: fk('vehicles', { allowNull: true }), driver_id: fk('drivers', { allowNull: true }),
      key_taken_at: T.DATE, key_issued_by: fk('users', { allowNull: true }), key_returned_at: T.DATE, key_returned_by: fk('users', { allowNull: true }),
      created_by: fk('users'), voided_at: T.DATE, voided_by: fk('users', { allowNull: true }), void_reason: T.TEXT, ...ts,
    });
    await sql("ALTER TABLE vehicle_requests ADD CONSTRAINT vehicle_requests_chk CHECK (status IN ('PENDING','APPROVED','REJECTED','KEY_OUT','RETURNED','VOIDED') "
      + "AND (status NOT IN ('KEY_OUT','RETURNED') OR (vehicle_id IS NOT NULL AND driver_id IS NOT NULL AND key_taken_at IS NOT NULL)) "
      + "AND (status <> 'RETURNED' OR (key_returned_at IS NOT NULL AND key_returned_at >= key_taken_at)) "
      + "AND (status NOT IN ('APPROVED','REJECTED','KEY_OUT','RETURNED') OR decided_by IS NOT NULL))");
    await sql("ALTER TABLE vehicle_requests ADD CONSTRAINT vehicle_requests_void_chk CHECK (status <> 'VOIDED' OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL))");
    await sql("CREATE UNIQUE INDEX vehicle_requests_key_out_uq ON vehicle_requests (vehicle_id) WHERE status = 'KEY_OUT'");   // a vehicle's key can only be out once
    for (const c of ['request_date', 'status', 'created_by', 'vehicle_id', 'driver_id']) await q.addIndex('vehicle_requests', [c]);
    await sql('CREATE TRIGGER vehicle_requests_no_delete BEFORE DELETE ON vehicle_requests FOR EACH ROW EXECUTE FUNCTION forbid_change()');
  },
  async down(q) {
    await q.dropTable('vehicle_requests', { cascade: true });
    await q.sequelize.query('DROP SEQUENCE IF EXISTS vehicle_request_seq');
  },
};
