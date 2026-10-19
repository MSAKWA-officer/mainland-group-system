const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const qty = (extra = {}) => ({ type: D.DECIMAL(14, 3), allowNull: false, defaultValue: 0, ...extra });

const WarehouseTransferLine = sequelize.define('WarehouseTransferLine', {
  id, transferId: { type: D.UUID, allowNull: false }, itemId: { type: D.UUID, allowNull: false }, batchId: D.UUID,
  quantity: qty(), remarks: str(255),
}, { tableName: 'warehouse_transfer_lines', updatedAt: false });
module.exports = WarehouseTransferLine;
