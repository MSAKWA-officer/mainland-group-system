const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

// The EFD device's end-of-day (Z) report, recorded from the printout. PENDING -> VERIFIED | REJECTED, PENDING / VERIFIED -> VOIDED.
// DB triggers block DELETE and any change to the figures of a VERIFIED report.
const EfdZReport = sequelize.define('EfdZReport', {
  id, reportNo: str(30, { allowNull: false, unique: true }), deviceId: { type: D.UUID, allowNull: false },
  reportDate: { type: D.DATEONLY, allowNull: false }, zNumber: str(20, { allowNull: false }),
  receiptsCount: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  grossAmount: money(), vatAmount: money(), netAmount: money(),
  voidedCount: { type: D.INTEGER, allowNull: false, defaultValue: 0 }, voidedAmount: money(),
  firstReceiptNo: str(40), lastReceiptNo: str(40), notes: D.TEXT,
  status: str(10, { allowNull: false, defaultValue: 'PENDING' }),
  createdBy: { type: D.UUID, allowNull: false },
  decidedBy: D.UUID, decidedAt: D.DATE, decisionNote: D.TEXT,
  voidedAt: D.DATE, voidedBy: D.UUID, voidReason: D.TEXT,
}, { tableName: 'efd_z_reports' });
module.exports = EfdZReport;
