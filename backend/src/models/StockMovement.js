const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const qty = (extra = {}) => ({ type: D.DECIMAL(14, 3), allowNull: false, defaultValue: 0, ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(14, 2), allowNull: false, defaultValue: 0, ...extra });

// Append-only ledger (DB triggers block UPDATE / DELETE / TRUNCATE).
const StockMovement = sequelize.define('StockMovement', {
  id: { type: D.BIGINT, primaryKey: true, autoIncrement: true },
  itemId: { type: D.UUID, allowNull: false }, batchId: D.UUID, documentId: { type: D.UUID, allowNull: false }, lineId: D.UUID,
  movementType: str(20, { allowNull: false }), direction: str(3, { allowNull: false }),
  quantity: { type: D.DECIMAL(14, 3), allowNull: false }, balanceAfter: { type: D.DECIMAL(14, 3), allowNull: false },
  unitCost: D.DECIMAL(14, 2), performedBy: { type: D.UUID, allowNull: false },
  occurredAt: { type: D.DATE, allowNull: false }, note: str(255),
}, { tableName: 'stock_movements', updatedAt: false });
module.exports = StockMovement;
