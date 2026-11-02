'use strict';
const { DataTypes: T, Sequelize } = require('sequelize');
const pk = { type: T.UUID, primaryKey: true, allowNull: false, defaultValue: Sequelize.literal('gen_random_uuid()') };
const now = { type: T.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') };
const ts = { created_at: now, updated_at: now };
const fk = (table, extra = {}) => ({ type: T.UUID, allowNull: false, references: { model: table, key: 'id' }, onDelete: 'RESTRICT', ...extra });

// Vehicle log = the "Official Vehicle USE and FUELING Registration Form" on screen.
//  - vehicle_trips : the USE half (date, user, purpose, start/end time, initial/final mileage, total mileage).
//  - fuel_usages.payment_method : the missing FUELING column (Cash / Card). The other fueling columns already exist in fuel usage
//    (odometer_km = mileage when fueling, litres = fuel qty, receipt_no).
// The monthly sheet (per vehicle) is calculated from vehicle_trips + fuel_usages, so it needs no table of its own.
module.exports = {
  async up(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('CREATE SEQUENCE vehicle_trip_seq START 1');
    await q.createTable('vehicle_trips', {
      id: pk, trip_no: { type: T.STRING(30), allowNull: false, unique: true },
      vehicle_id: fk('vehicles'), trip_date: { type: T.DATEONLY, allowNull: false },
      user_name: { type: T.STRING(100), allowNull: false }, purpose: { type: T.STRING(200), allowNull: false },
      time_start: { type: T.TIME, allowNull: false }, start_km: { type: T.DECIMAL(10, 1), allowNull: false },
      time_end: T.TIME, end_km: T.DECIMAL(10, 1),                                                   // both empty while the trip is still open
      total_km: T.DECIMAL(10, 1),                                                                    // always calculated by the server (end - start)
      notes: T.TEXT, status: { type: T.STRING(10), allowNull: false, defaultValue: 'ACTIVE' },      // ACTIVE | VOIDED
      created_by: fk('users'), voided_at: T.DATE, voided_by: fk('users', { allowNull: true }), void_reason: T.TEXT, ...ts,
    });
    await sql("ALTER TABLE vehicle_trips ADD CONSTRAINT vehicle_trips_chk CHECK (start_km >= 0 AND status IN ('ACTIVE','VOIDED') "
      + "AND ((end_km IS NULL AND time_end IS NULL AND total_km IS NULL) OR (end_km IS NOT NULL AND time_end IS NOT NULL AND total_km IS NOT NULL AND end_km >= start_km AND total_km = end_km - start_km)))");
    await sql("ALTER TABLE vehicle_trips ADD CONSTRAINT vehicle_trips_void_chk CHECK (status <> 'VOIDED' OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL))");
    await sql("CREATE UNIQUE INDEX vehicle_trips_one_open_uq ON vehicle_trips (vehicle_id) WHERE end_km IS NULL AND status = 'ACTIVE'");   // one open trip per vehicle
    for (const c of ['vehicle_id', 'trip_date', 'status', 'created_by']) await q.addIndex('vehicle_trips', [c]);
    await sql('CREATE TRIGGER vehicle_trips_no_delete BEFORE DELETE ON vehicle_trips FOR EACH ROW EXECUTE PROCEDURE forbid_change()');

    await sql('ALTER TABLE fuel_usages ADD COLUMN payment_method VARCHAR(4)');
    await sql("ALTER TABLE fuel_usages ADD CONSTRAINT fuel_usages_payment_chk CHECK (payment_method IS NULL OR payment_method IN ('CASH','CARD'))");
  },
  async down(q) {
    const sql = (s) => q.sequelize.query(s);
    await sql('ALTER TABLE fuel_usages DROP CONSTRAINT IF EXISTS fuel_usages_payment_chk');
    await sql('ALTER TABLE fuel_usages DROP COLUMN IF EXISTS payment_method');
    await q.dropTable('vehicle_trips', { cascade: true });
    await sql('DROP SEQUENCE IF EXISTS vehicle_trip_seq');
  },
};
