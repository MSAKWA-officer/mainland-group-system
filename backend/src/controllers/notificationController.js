const { Notification } = require('../models');

exports.list = async (req, res) => {
  const data = await Notification.findAll({ where: { userId: req.user.id }, order: [['createdAt', 'DESC']], limit: 30 });
  res.json({ data, unread: data.filter((n) => !n.readAt).length });
};

exports.readAll = async (req, res) => {
  await Notification.update({ readAt: new Date() }, { where: { userId: req.user.id, readAt: null } });
  res.json({ ok: true });
};
