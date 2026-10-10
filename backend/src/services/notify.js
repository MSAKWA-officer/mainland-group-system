const { Notification } = require('../models');
module.exports = (userIds, { title, body, link }, t) =>
  userIds.length ? Notification.bulkCreate(userIds.map((userId) => ({ userId, title, body, link })), { transaction: t }) : null;
