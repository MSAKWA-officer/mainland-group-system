const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });
const int = () => ({ type: D.INTEGER, allowNull: false, defaultValue: 0 });

// Daily EFD reconciliation: the Z report of a device compared with the EFD receipts recorded in the system for that day.
// The figures are a snapshot calculated by the server. OPEN -> RECONCILED, OPEN / RECONCILED -> VOIDED. A RECONCILED day is frozen by a DB trigger.
const EfdReconciliation = sequelize.define('EfdReconciliation', {
  id, reconNo: str(30, { allowNull: false, unique: true }), deviceId: { type: D.UUID, allowNull: false }, reconDate: { type: D.DATEONLY, allowNull: false },
  zReportId: { type: D.UUID, allowNull: false },
  zGross: money(), zVat: money(), zCount: int(),
  receiptsGross: money(), receiptsVat: money(), receiptsCount: int(),
  voidedReceiptsCount: int(), voidedReceiptsAmount: money(),
  unreceiptedOrdersCount: int(), unreceiptedOrdersAmount: money(),
  grossVariance: money(), vatVariance: money(), countVariance: int(),
  status: str(10, { allowNull: false, defaultValue: 'OPEN' }), explanation: D.TEXT,
  createdBy: { type: D.UUID, allowNull: false }, refreshedAt: D.DATE,
  reconciledBy: D.UUID, reconciledAt: D.DATE,
  voidedAt: D.DATE, voidedBy: D.UUID, voidReason: D.TEXT,
}, { tableName: 'efd_reconciliations' });
module.exports = EfdReconciliation;
