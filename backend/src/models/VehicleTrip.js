const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

// One line of the Official Vehicle USE Registration: who used the vehicle, why, and the mileage. Flow: ACTIVE -> VOIDED. Never deleted.
// endKm / timeEnd are empty while the trip is open. totalKm is always calculated by the server.
const VehicleTrip = sequelize.define('VehicleTrip', {
  id, tripNo: str(30, { allowNull: false, unique: true }), vehicleId: { type: D.UUID, allowNull: false }, tripDate: { type: D.DATEONLY, allowNull: false },
  userName: str(100, { allowNull: false }), purpose: str(200, { allowNull: false }),
  timeStart: { type: D.TIME, allowNull: false }, startKm: { type: D.DECIMAL(10, 1), allowNull: false },
  timeEnd: D.TIME, endKm: D.DECIMAL(10, 1), totalKm: D.DECIMAL(10, 1), notes: D.TEXT,
  status: str(10, { allowNull: false, defaultValue: 'ACTIVE' }),
  createdBy: { type: D.UUID, allowNull: false }, voidedAt: D.DATE, voidedBy: D.UUID, voidReason: D.TEXT,
}, { tableName: 'vehicle_trips' });
module.exports = VehicleTrip;
