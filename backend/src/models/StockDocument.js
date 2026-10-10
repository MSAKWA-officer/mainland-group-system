const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const qty = (extra = {}) => ({ type: D.DECIMAL(14, 3), allowNull: false, defaultValue: 0, ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(14, 2), allowNull: false, defaultValue: 0, ...extra });

const StockDocument = sequelize.define('StockDocument', {
  id, docNo: str(30, { allowNull: false, unique: true }), type: str(20, { allowNull: false }),
  status: str(12, { allowNull: false, defaultValue: 'DRAFT' }),
  docDate: D.DATEONLY,                       // DB default is CURRENT_DATE
  partyName: str(150), reference: str(100), reason: D.TEXT, approvalId: D.UUID,
  createdBy: { type: D.UUID, allowNull: false }, submittedAt: D.DATE, postedAt: D.DATE,
}, { tableName: 'stock_documents' });
module.exports = StockDocument;
