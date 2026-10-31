const { ApprovalRequest, User } = require('../models');
const { AppError } = require('../utils/errors');
const svc = require('../services/approvals');
const details = require('../services/approvalDetails');

const view = (r) => r.toJSON();
const people = [
  { model: User, as: 'requester', attributes: ['id', 'username', 'fullName'] },
  { model: User, as: 'decider', attributes: ['id', 'username', 'fullName'] },
];

exports.types = (req, res) =>
  res.json([...svc.registry].map(([type, d]) => ({ type, label: d.label })));

exports.list = async (req, res) => {
  const { status, page, limit } = req.query; const where = {};
  if (status) where.status = status;
  if (!req.user.permissions.has('approvals.read_all')) where.requestedBy = req.user.id; // others only see their own
  const { rows, count } = await ApprovalRequest.findAndCountAll({ where, order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit, include: people });
  res.json({ data: rows.map(view), total: count, page, limit });
};

exports.getOne = async (req, res) => {
  const r = await ApprovalRequest.findByPk(req.params.id, { include: people });
  if (!r || (r.requestedBy !== req.user.id && !req.user.permissions.has('approvals.read_all')))
    throw new AppError(404, 'NOT_FOUND', 'Approval request not found');
  // `details` = the full record being approved (sale with items / payments / customer debts, sales order, stock document).
  res.json({ ...view(r), details: await details.build(r) });
};

exports.create = async (req, res) => res.status(201).json(view(await svc.create(req, req.body)));
exports.update = async (req, res) => res.json(view(await svc.update(req, req.params.id, req.body)));
exports.remove = async (req, res) => { await svc.remove(req, req.params.id); res.json({ ok: true }); };
exports.submit = async (req, res) => res.json(view(await svc.submit(req, req.params.id)));
exports.cancel = async (req, res) => res.json(view(await svc.cancel(req, req.params.id)));
exports.approve = async (req, res) => res.json(view(await svc.approve(req, req.params.id, req.body.note)));
exports.reject = async (req, res) => res.json(view(await svc.reject(req, req.params.id, req.body.note)));
