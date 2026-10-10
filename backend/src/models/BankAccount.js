const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });
const money = (extra = {}) => ({ type: D.DECIMAL(20, 2), allowNull: false, defaultValue: 0, ...extra });

const BankAccount = sequelize.define('BankAccount', {
  id, bankId: { type: D.UUID, allowNull: false }, accountNo: str(40, { allowNull: false }), accountName: str(150, { allowNull: false }),
  accountType: str(12, { allowNull: false, defaultValue: 'CURRENT' }), currency: str(3, { allowNull: false, defaultValue: 'TZS' }),
  branch: str(100), openingBalance: money(), openingDate: D.DATEONLY,           // DB default is CURRENT_DATE
  allowOverdraft: { type: D.BOOLEAN, allowNull: false, defaultValue: false }, notes: str(255),
  isActive: { type: D.BOOLEAN, allowNull: false, defaultValue: true }, createdBy: { type: D.UUID, allowNull: false },
}, { tableName: 'bank_accounts' });
module.exports = BankAccount;
