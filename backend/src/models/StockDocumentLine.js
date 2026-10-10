const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const qty = (extra = {}) => ({ type: D.DECIMAL(14, 3), allowNull: false, defaultValue: 0, ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(14, 2), allowNull: false, defaultValue: 0, ...extra });

const StockDocumentLine = sequelize.define('StockDocumentLine', {
  id, documentId: { type: D.UUID, allowNull: false }, itemId: { type: D.UUID, allowNull: false },
  direction: str(3, { allowNull: false }), quantity: { type: D.DECIMAL(14, 3), allowNull: false },
  unitCost: D.DECIMAL(14, 2), batchNo: str(60), expiryDate: D.DATEONLY, batchId: D.UUID, remarks: str(255),
}, { tableName: 'stock_document_lines', updatedAt: false });
module.exports = StockDocumentLine;
