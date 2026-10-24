const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };

// countedQty = what was counted. bookQty = what the books said at the end of the count date (saved when the count was recorded).
const PhysicalCountLine = sequelize.define('PhysicalCountLine', {
  id, countId: { type: D.UUID, allowNull: false }, itemId: { type: D.UUID, allowNull: false },
  countedQty: { type: D.DECIMAL(14, 3), allowNull: false }, bookQty: { type: D.DECIMAL(14, 3), allowNull: false, defaultValue: 0 }, remarks: D.STRING(255),
}, { tableName: 'physical_count_lines', updatedAt: false });
module.exports = PhysicalCountLine;
