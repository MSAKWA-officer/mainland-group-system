'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const ts = { created_at: now, updated_at: now };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });

// Phase 6b - Fuel usage: what the driver actually bought with the money in an APPROVED fuel funding.
// Fuel balances and Fuel reports are calculated from fuel_fundings + fuel_usages, so they need no tables of their own.
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('CREATE SEQUENCE fuel_usage_seq START 1');

    await q.createTable('fuel_usages', {
      id: pk, usage_no: { type: T.STRING(30), allowNull: false, unique: true },
      fuel_funding_id: fk('fuel_fundings'), vehicle_id: fk('vehicles'), driver_id: fk('drivers'),   // vehicle + driver are copied from the funding for fast reports
      usage_date: { type: T.DATEONLY, allowNull: false },
      litres: { type: T.DECIMAL(10, 3), allowNull: false }, amount: { type: T.DECIMAL(20, 2), allowNull: false },
      price_per_litre: { type: T.DECIMAL(14, 2), allowNull: false },                              // always calculated by the server (amount / litres)
      odometer_km: T.DECIMAL(10, 1), is_full_tank: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
      station: T.STRING(100), receipt_no: T.STRING(50), notes: T.TEXT,
      status: { type: T.STRING(10), allowNull: false, defaultValue: 'ACTIVE' },                   // ACTIVE | VOIDED
      created_by: fk('users'), voided_at: T.DATE, voided_by: fk('users', { allowNull: true }), void_reason: T.TEXT, ...ts,
    });
    await sql("ALTER TABLE fuel_usages ADD CONSTRAINT fuel_usages_chk CHECK (litres > 0 AND amount > 0 AND price_per_litre >= 0 "
      + "AND (odometer_km IS NULL OR odometer_km >= 0) AND status IN ('ACTIVE','VOIDED'))");
    await sql("ALTER TABLE fuel_usages ADD CONSTRAINT fuel_usages_void_chk CHECK (status <> 'VOIDED' OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL))");
    // The same receipt (at the same station) cannot be claimed twice while it is active.
    await sql("CREATE UNIQUE INDEX fuel_usages_receipt_uq ON fuel_usages (COALESCE(UPPER(station), ''), UPPER(receipt_no)) WHERE receipt_no IS NOT NULL AND status = 'ACTIVE'");
    for (const c of ['fuel_funding_id', 'vehicle_id', 'driver_id', 'usage_date', 'status', 'created_by']) await q.addIndex('fuel_usages', [c]);
    await q.addIndex('fuel_usages', ['vehicle_id', 'odometer_km']);

    // Permanent record: fuel usage is never deleted (it is voided instead).
    await sql('CREATE TRIGGER fuel_usages_no_delete BEFORE DELETE ON fuel_usages FOR EACH ROW EXECUTE FUNCTION forbid_change()');
  },
  async down(q) {
    await q.dropTable('fuel_usages', { cascade: true });
    await q.sequelize.query('DROP SEQUENCE IF EXISTS fuel_usage_seq');
  },
};
