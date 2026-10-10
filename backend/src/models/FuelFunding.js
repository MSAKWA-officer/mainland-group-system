const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

// Money given to a driver to buy fuel for a vehicle. Flow: PENDING -> APPROVED | REJECTED, and PENDING / APPROVED -> VOIDED.
// The money only leaves (bank ledger WITHDRAWAL, when a bank account is used) at the moment of approval.
const FuelFunding = sequelize.define('FuelFunding', {
  id, fundingNo: str(30, { allowNull: false, unique: true }), vehicleId: { type: D.UUID, allowNull: false }, driverId: { type: D.UUID, allowNull: false },
  amount: { type: D.DECIMAL(20, 2), allowNull: false }, litres: D.DECIMAL(10, 3), purpose: str(255, { allowNull: false }),
  method: str(15, { allowNull: false }), bankAccountId: D.UUID, reference: str(100), fundingDate: { type: D.DATEONLY, allowNull: false }, notes: D.TEXT,
  status: str(10, { allowNull: false, defaultValue: 'PENDING' }),
  createdBy: { type: D.UUID, allowNull: false }, decidedBy: D.UUID, decidedAt: D.DATE, decisionNote: D.TEXT, disbursedOn: D.DATEONLY,
  voidedAt: D.DATE, voidedBy: D.UUID, voidReason: D.TEXT,
}, { tableName: 'fuel_fundings' });
module.exports = FuelFunding;
