const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

// Official Vehicle Use REQUEST form. The user asks, an approver decides, the key custodian records the vehicle, driver and key times.
// Flow: PENDING -> APPROVED | REJECTED; APPROVED -> KEY_OUT -> RETURNED; PENDING / APPROVED -> VOIDED. Never deleted.
const VehicleRequest = sequelize.define('VehicleRequest', {
  id, requestNo: str(30, { allowNull: false, unique: true }), requestDate: { type: D.DATEONLY, allowNull: false },
  userName: str(100, { allowNull: false }), department: str(100, { allowNull: false }), purpose: str(255, { allowNull: false }), notes: D.TEXT,
  status: str(10, { allowNull: false, defaultValue: 'PENDING' }),
  decidedBy: D.UUID, decidedAt: D.DATE, decisionNote: D.TEXT,
  vehicleId: D.UUID, driverId: D.UUID, keyTakenAt: D.DATE, keyIssuedBy: D.UUID, keyReturnedAt: D.DATE, keyReturnedBy: D.UUID,
  createdBy: { type: D.UUID, allowNull: false }, voidedAt: D.DATE, voidedBy: D.UUID, voidReason: D.TEXT,
}, { tableName: 'vehicle_requests' });
module.exports = VehicleRequest;
