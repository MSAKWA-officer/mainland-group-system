const q = require('../services/saleQueries');
const svc = require('../services/cashSales');

const { Bank, BankAccount } = require('../models');
const banking = require('../services/banking');

const only = ['CASH'];
// Registered accounts a cashier can choose when taking a payment. No balances are sent, so cash_sales.create is enough (no bank_accounts.read needed).
exports.paymentAccounts = async (req, res) => {
  const rows = await BankAccount.findAll({ where: { isActive: true, currency: banking.BASE_CURRENCY }, attributes: ['id', 'accountNo', 'accountName', 'accountType'],
    include: [{ model: Bank, as: 'bank', attributes: ['id', 'code', 'name', 'shortName'] }], order: [[{ model: Bank, as: 'bank' }, 'name', 'ASC'], ['accountName', 'ASC']] });
  res.json({ data: rows });
};
exports.list = async (req, res) => res.json(await q.list(req, only, req.query));
exports.getOne = async (req, res) => res.json(await q.fetch(req, req.params.id, only));
exports.create = async (req, res) => res.status(201).json(await q.fetch(req, (await svc.create(req, req.body)).id, only));
exports.correct = async (req, res) => {
  await q.fetch(req, req.params.id, only);                                 // 404 if it is not yours to see
  res.json(await q.fetch(req, (await svc.correct(req, req.params.id, req.body)).id, only));
};
exports.void = async (req, res) => {
  await q.fetch(req, req.params.id, only);                                 // 404 if it is not yours to see
  res.json(await q.fetch(req, (await svc.void(req, req.params.id, req.body.reason)).id, only));
};
