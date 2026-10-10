const { Op } = require('sequelize');
const { sequelize, BankTransaction, BankAccount, Bank, User } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const banking = require('../services/banking');

/* A transfer = two linked bank_transactions rows sharing a transfer_group_id: a TRANSFER_OUT (debit) and a TRANSFER_IN (credit).
   The posting, locking, overdraft and currency rules all live in services/banking.js; this controller only presents the pair as ONE record.
   Voiding either leg voids both (done by banking.voidTransaction). A reconciled leg blocks the void. */
const accountInc = { model: BankAccount, as: 'account', attributes: ['id', 'accountNo', 'accountName', 'currency'], include: [{ model: Bank, as: 'bank', attributes: ['id', 'code', 'name'] }] };
const legInc = [accountInc, { model: User, as: 'creator', attributes: ['id', 'fullName'] }, { model: User, as: 'voider', attributes: ['id', 'fullName'] }];
const SORT = { txnDate: 'txnDate', amount: 'amount', txnNo: 'txnNo' };

const leg = (x) => x && ({ txnId: x.id, txnNo: x.txnNo, account: x.account, status: x.status, isReconciled: x.isReconciled });
const shape = (out, inn) => ({
  transferGroupId: out.transferGroupId, txnDate: out.txnDate, amount: out.amount, reference: out.reference, description: out.description,
  status: out.status, createdAt: out.createdAt, creator: out.creator, voidedAt: out.voidedAt, voider: out.voider, voidReason: out.voidReason,
  from: leg(out), to: leg(inn),
});
const legsOf = async (groups) => (groups.length ? BankTransaction.findAll({ where: { transferGroupId: groups, type: 'TRANSFER_IN' }, include: [accountInc] }) : []);

exports.list = async (req, res) => {
  const q = req.query; const where = { type: 'TRANSFER_OUT' }; const and = [];
  if (q.status !== 'ALL') where.status = q.status;
  if (q.fromAccountId) where.bankAccountId = q.fromAccountId;
  if (q.toAccountId) and.push(sequelize.literal(`"BankTransaction"."transfer_group_id" IN (SELECT transfer_group_id FROM bank_transactions WHERE type = 'TRANSFER_IN' AND bank_account_id = ${sequelize.escape(q.toAccountId)})`));
  if (q.from || q.to) where.txnDate = { ...(q.from && { [Op.gte]: q.from }), ...(q.to && { [Op.lte]: q.to }) };
  if (q.search) where[Op.or] = ['txnNo', 'reference', 'description', 'counterparty'].map((f) => ({ [f]: { [Op.iLike]: like(q.search) } }));
  const { rows, count } = await BankTransaction.findAndCountAll({ where: and.length ? { [Op.and]: [where, ...and] } : where, include: legInc,
    order: [[SORT[q.sortBy], q.sortDir.toUpperCase()], ['createdAt', 'DESC']], limit: q.limit, offset: (q.page - 1) * q.limit, distinct: true });
  const ins = new Map((await legsOf(rows.map((r) => r.transferGroupId))).map((x) => [x.transferGroupId, x]));
  res.json({ data: rows.map((r) => shape(r, ins.get(r.transferGroupId))), total: count, page: q.page, limit: q.limit });
};

const load = async (group) => {
  const out = await BankTransaction.findOne({ where: { transferGroupId: group, type: 'TRANSFER_OUT' }, include: legInc });
  if (!out) throw new AppError(404, 'NOT_FOUND', 'Transfer not found');
  const [inn] = await legsOf([group]);
  return shape(out, inn);
};

exports.getOne = async (req, res) => res.json(await load(req.params.id));

exports.create = async (req, res) => {
  const [outId] = await banking.transfer(req, req.body);
  const out = await BankTransaction.findByPk(outId, { attributes: ['transferGroupId'] });
  res.status(201).json(await load(out.transferGroupId));
};

exports.void = async (req, res) => {
  const out = await BankTransaction.findOne({ where: { transferGroupId: req.params.id, type: 'TRANSFER_OUT' }, attributes: ['id'] });
  if (!out) throw new AppError(404, 'NOT_FOUND', 'Transfer not found');
  await banking.voidTransaction(req, out.id, req.body.reason);
  res.json(await load(req.params.id));
};
