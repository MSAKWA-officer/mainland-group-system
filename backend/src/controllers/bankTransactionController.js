const { Op } = require('sequelize');
const { BankTransaction, BankAccount, Bank, User, CustomerPayment } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const banking = require('../services/banking');

const includes = [
  { model: BankAccount, as: 'account', attributes: ['id', 'accountNo', 'accountName', 'currency'], include: [{ model: Bank, as: 'bank', attributes: ['id', 'code', 'name'] }] },
  { model: User, as: 'creator', attributes: ['id', 'fullName'] },
];
const detail = [...includes, { model: User, as: 'voider', attributes: ['id', 'fullName'] }, { model: User, as: 'reconciler', attributes: ['id', 'fullName'] },
  { model: CustomerPayment, as: 'customerPayment', attributes: ['id', 'paymentNo', 'status'] }];
const show = (id) => BankTransaction.findByPk(id, { include: detail });
const SORT = { txnDate: 'txnDate', amount: 'amount', txnNo: 'txnNo' };

exports.list = async (req, res) => {
  const q = req.query; const where = {};
  for (const k of ['bankAccountId', 'type', 'direction', 'isReconciled', 'transferGroupId', 'customerPaymentId']) if (q[k] !== undefined) where[k] = q[k];
  if (q.status !== 'ALL') where.status = q.status;
  if (q.from || q.to) where.txnDate = { ...(q.from && { [Op.gte]: q.from }), ...(q.to && { [Op.lte]: q.to }) };
  if (q.search) where[Op.or] = ['txnNo', 'reference', 'description', 'counterparty'].map((f) => ({ [f]: { [Op.iLike]: like(q.search) } }));
  const { rows, count } = await BankTransaction.findAndCountAll({ where, include: includes, order: [[SORT[q.sortBy], q.sortDir.toUpperCase()], ['createdAt', 'DESC']],
    limit: q.limit, offset: (q.page - 1) * q.limit, distinct: true });
  res.json({ data: rows, total: count, page: q.page, limit: q.limit });
};

exports.getOne = async (req, res) => {
  const x = await show(req.params.id); if (!x) throw new AppError(404, 'NOT_FOUND', 'Bank transaction not found');
  res.json(x);
};

exports.create = async (req, res) => res.status(201).json(await show(await banking.record(req, req.body)));

exports.transfer = async (req, res) => {
  const [out, inn] = await banking.transfer(req, req.body);
  res.status(201).json({ out: await show(out), in: await show(inn) });
};

exports.void = async (req, res) => res.json(await show(await banking.voidTransaction(req, req.params.id, req.body.reason)));

exports.reconcile = async (req, res) => res.json(await show(await banking.setReconciled(req, req.params.id, req.body.reconciled)));
