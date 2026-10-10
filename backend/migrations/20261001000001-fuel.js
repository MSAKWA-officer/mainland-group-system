'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const ts = { created_at: now, updated_at: now };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });

// Phase 6 - Fuel: drivers, vehicles and fuel funding (money given to a driver to buy fuel for a vehicle).
// Also adds bank_transactions.fuel_funding_id so a bank row created by a fuel funding can only be voided through that funding.
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('CREATE SEQUENCE driver_code_seq START 1');
    await sql('CREATE SEQUENCE vehicle_code_seq START 1');
    await sql('CREATE SEQUENCE fuel_funding_seq START 1');

    /* ---------------- Drivers ---------------- */
    await q.createTable('drivers', {
      id: pk, code: { type: T.STRING(20), allowNull: false, unique: true },
      full_name: { type: T.STRING(100), allowNull: false }, phone: T.STRING(30),
      license_no: { type: T.STRING(40), allowNull: false }, license_class: T.STRING(10), license_expiry: { type: T.DATEONLY, allowNull: false },
      address: T.STRING(255), notes: T.STRING(255),
      staff_id: fk('staff', { allowNull: true }),                                      // optional link to the staff directory
      is_active: { type: T.BOOLEAN, allowNull: false, defaultValue: true }, created_by: fk('users'), ...ts,
    });
    await sql('CREATE UNIQUE INDEX drivers_license_uq ON drivers (UPPER(license_no))');
    await sql('CREATE UNIQUE INDEX drivers_staff_uq ON drivers (staff_id) WHERE staff_id IS NOT NULL');   // a staff member is one driver at most
    for (const c of ['full_name', 'license_expiry', 'is_active']) await q.addIndex('drivers', [c]);

    /* ---------------- Vehicles ---------------- */
    await q.createTable('vehicles', {
      id: pk, code: { type: T.STRING(20), allowNull: false, unique: true }, plate_no: { type: T.STRING(20), allowNull: false },
      make: { type: T.STRING(60), allowNull: false }, model: T.STRING(60), year: T.SMALLINT,
      vehicle_type: { type: T.STRING(12), allowNull: false, defaultValue: 'TRUCK' }, fuel_type: { type: T.STRING(10), allowNull: false, defaultValue: 'DIESEL' },
      tank_capacity_litres: T.DECIMAL(8, 2),
      driver_id: fk('drivers', { allowNull: true }),                                   // default driver (optional)
      notes: T.STRING(255), is_active: { type: T.BOOLEAN, allowNull: false, defaultValue: true }, created_by: fk('users'), ...ts,
    });
    await sql("ALTER TABLE vehicles ADD CONSTRAINT vehicles_chk CHECK (vehicle_type IN ('TRUCK','PICKUP','VAN','CAR','MOTORCYCLE','OTHER') "
      + "AND fuel_type IN ('DIESEL','PETROL','GAS','OTHER') AND (tank_capacity_litres IS NULL OR tank_capacity_litres > 0) AND (year IS NULL OR year BETWEEN 1950 AND 2100))");
    await sql("CREATE UNIQUE INDEX vehicles_plate_uq ON vehicles (UPPER(TRANSLATE(plate_no, ' -', '')))");   // 'T 123 ABC', 'T123ABC' and 'T-123-ABC' are the same vehicle
    for (const c of ['driver_id', 'is_active']) await q.addIndex('vehicles', [c]);

    /* ---------------- Fuel funding ---------------- */
    // PENDING -> APPROVED (money leaves now) | REJECTED.  PENDING / APPROVED -> VOIDED.
    await q.createTable('fuel_fundings', {
      id: pk, funding_no: { type: T.STRING(30), allowNull: false, unique: true }, vehicle_id: fk('vehicles'), driver_id: fk('drivers'),
      amount: { type: T.DECIMAL(20, 2), allowNull: false }, litres: T.DECIMAL(10, 3), purpose: { type: T.STRING(255), allowNull: false },
      method: { type: T.STRING(15), allowNull: false }, bank_account_id: fk('bank_accounts', { allowNull: true }), reference: T.STRING(100),
      funding_date: { type: T.DATEONLY, allowNull: false }, notes: T.TEXT,
      status: { type: T.STRING(10), allowNull: false, defaultValue: 'PENDING' },
      created_by: fk('users'), decided_by: fk('users', { allowNull: true }), decided_at: T.DATE, decision_note: T.TEXT, disbursed_on: T.DATEONLY,
      voided_at: T.DATE, voided_by: fk('users', { allowNull: true }), void_reason: T.TEXT, ...ts,
    });
    await sql("ALTER TABLE fuel_fundings ADD CONSTRAINT fuel_fundings_chk CHECK (amount > 0 AND (litres IS NULL OR litres > 0) "
      + "AND method IN ('CASH','MOBILE_MONEY','BANK','CARD','CHEQUE') AND status IN ('PENDING','APPROVED','REJECTED','VOIDED'))");
    await sql("ALTER TABLE fuel_fundings ADD CONSTRAINT fuel_fundings_bank_chk CHECK (method IN ('CASH','MOBILE_MONEY') OR bank_account_id IS NOT NULL)");
    await sql("ALTER TABLE fuel_fundings ADD CONSTRAINT fuel_fundings_disb_chk CHECK (status <> 'APPROVED' OR disbursed_on IS NOT NULL)");
    for (const c of ['vehicle_id', 'driver_id', 'bank_account_id', 'status', 'funding_date', 'created_by']) await q.addIndex('fuel_fundings', [c]);

    await q.addColumn('bank_transactions', 'fuel_funding_id', { type: T.UUID, allowNull: true, references: { model: 'fuel_fundings', key: 'id' }, onDelete: 'RESTRICT' });
    await q.addIndex('bank_transactions', ['fuel_funding_id']);

    // Permanent record: a fuel funding is never deleted (it is voided instead).
    await sql('CREATE TRIGGER fuel_fundings_no_delete BEFORE DELETE ON fuel_fundings FOR EACH ROW EXECUTE FUNCTION forbid_change()');
  },
  async down(q) {
    await q.removeColumn('bank_transactions', 'fuel_funding_id');
    for (const t of ['fuel_fundings', 'vehicles', 'drivers']) await q.dropTable(t, { cascade: true });
    for (const s of ['driver_code_seq', 'vehicle_code_seq', 'fuel_funding_seq']) await q.sequelize.query(`DROP SEQUENCE IF EXISTS ${s}`);
  },
};
