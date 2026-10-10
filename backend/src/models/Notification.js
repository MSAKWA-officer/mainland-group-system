const { DataTypes: D } = require('sequelize');
const sequelize = require('../config/sequelize');
const id = { type: D.UUID, defaultValue: D.UUIDV4, primaryKey: true };
const str = (n, extra = {}) => ({ type: D.STRING(n), ...extra });

const Notification = sequelize.define('Notification', {
  id, userId: { type: D.UUID, allowNull: false }, title: str(150, { allowNull: false }),
  body: D.TEXT, link: str(200), readAt: D.DATE,
}, { tableName: 'notifications', updatedAt: false });
module.exports = Notification;
