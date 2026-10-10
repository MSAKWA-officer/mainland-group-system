const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

// Fuel actually bought by a driver with the money of an APPROVED FuelFunding. Flow: ACTIVE -> VOIDED. Never deleted.
// vehicleId / driverId are copied from the funding. pricePerLitre is always calculated by the server.
const FuelUsage = sequelize.define('FuelUsage', {
  id, usageNo: str(30, { allowNull: false, unique: true }),
  fuelFundingId: { type: D.UUID, allowNull: false }, vehicleId: { type: D.UUID, allowNull: false }, driverId: { type: D.UUID, allowNull: false },
  usageDate: { type: D.DATEONLY, allowNull: false }, litres: { type: D.DECIMAL(10, 3), allowNull: false }, amount: { type: D.DECIMAL(20, 2), allowNull: false },
  pricePerLitre: { type: D.DECIMAL(14, 2), allowNull: false }, odometerKm: D.DECIMAL(10, 1), isFullTank: { type: D.BOOLEAN, allowNull: false, defaultValue: true },
  station: str(100), receiptNo: str(50), notes: D.TEXT,
  status: str(10, { allowNull: false, defaultValue: 'ACTIVE' }),
  createdBy: { type: D.UUID, allowNull: false }, voidedAt: D.DATE, voidedBy: D.UUID, voidReason: D.TEXT,
}, { tableName: 'fuel_usages' });
module.exports = FuelUsage;
