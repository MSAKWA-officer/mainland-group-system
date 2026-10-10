const { Op } = require('sequelize');
const { AuditLog } = require('../models');
const audit = require('../services/audit');

exports.list = async (req, res) => {
  const { from, to, page, limit, ...f } = req.query; const where = { ...f };
  if (from || to) where.occurredAt = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };
  const { rows, count } = await AuditLog.findAndCountAll({ where, order: [['id', 'DESC']], limit, offset: (page - 1) * limit,
    attributes: { exclude: ['prevHash'] } });
  res.json({ data: rows, total: count, page, limit });
};

exports.verify = async (req, res) => res.json(await audit.verify());
