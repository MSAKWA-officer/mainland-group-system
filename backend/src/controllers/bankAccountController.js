const { Op, literal } = require('sequelize');
const { sequelize, Bank, BankAccount, BankTransaction, CustomerPayment } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('../services/audit');
const banking = require('../services/banking');
const core = require('../services/saleCore');

const { cents, str } = core;
const canBalance = (req) => req.user.permissions.has('bank_accounts.view_balance');
const txnCount = [literal('(SELECT CAST(COUNT(*) AS int) FROM bank_transactions x WHERE x.bank_account_id = "BankAccount"."id")'), 'transactionCount'];
// The balance is only sent to users holding bank_accounts.view_balance. Everyone else gets accounts without any money figure.
const attrs = (req) => ({ include: [txnCount, ...(canBalance(req) ? [banking.balanceAttr()] : [])] });
const withBank = [{ model: Bank, as: 'bank', attributes: ['id', 'code', 'name', 'shortName'] }];
const audited = (a) => ({ bankId: a.bankId, accountNo: a.accountNo, accountName: a.accountName, accountType: a.accountType, currency: a.currency, branch: a.branch,
  openingBalance: a.openingBalance, openingDate: a.openingDate, allowOverdraft: a.allowOverdraft, notes: a.notes, isActive: a.isActive });
const show = (req, id) => BankAccount.findByPk(id, { attributes: attrs(req), include: withBank });
const find = async (id, t) => {
  const a = await BankAccount.findByPk(id, { transaction: t, ...(t && { lock: t.LOCK.UPDATE }) });
  if (!a) throw new AppError(404, 'NOT_FOUND', 'Bank account not found');
  return a;
};
const dupNo = async (bankId, accountNo, selfId, t) => {
  if (await BankAccount.findOne({ where: { bankId, accountNo, ...(selfId && { id: { [Op.ne]: selfId } }) }, transaction: t }))
    throw new AppError(409, 'DUPLICATE', 'This account number is already registered for that bank', [{ field: 'accountNo', message: 'Already registered' }]);
};
const hasHistory = async (id, t) => (await BankTransaction.count({ where: { bankAccountId: id }, transaction: t })) + (await CustomerPayment.count({ where: { bankAccountId: id }, transaction: t })) > 0;

exports.list = async (req, res) => {
  const { search, bankId, accountType, currency, isActive, page, limit } = req.query; const where = {};
  if (bankId) where.bankId = bankId;
  if (accountType) where.accountType = accountType;
  if (currency) where.currency = currency;
  if (isActive !== undefined) where.isActive = isActive;
  if (search) where[Op.or] = [{ accountNo: { [Op.iLike]: like(search) } }, { accountName: { [Op.iLike]: like(search) } }, { '$bank.name$': { [Op.iLike]: like(search) } }];
  const { rows, count } = await BankAccount.findAndCountAll({ where, attributes: attrs(req), include: withBank, order: [[{ model: Bank, as: 'bank' }, 'name', 'ASC'], ['accountNo', 'ASC']],
    limit, offset: (page - 1) * limit, subQuery: false });
  res.json({ data: rows, total: count, page, limit });
};

exports.getOne = async (req, res) => {
  const a = await show(req, req.params.id); if (!a) throw new AppError(404, 'NOT_FOUND', 'Bank account not found');
  res.json(a);
};

exports.create = async (req, res) => {
  const id = await sequelize.transaction(async (t) => {
    const bank = await Bank.findByPk(req.body.bankId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!bank) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field: 'bankId', message: 'Bank not found' }]);
    if (!bank.isActive) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field: 'bankId', message: 'This bank is inactive' }]);
    await dupNo(bank.id, req.body.accountNo, null, t);
    const today = await core.dbToday(t);
    if (req.body.openingDate && req.body.openingDate > today) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field: 'openingDate', message: 'Opening date cannot be in the future' }]);
    const a = await BankAccount.create({ ...req.body, openingDate: req.body.openingDate ?? today, createdBy: req.user.id }, { transaction: t });
    await audit.log(req, { action: 'BANK_ACCOUNT_CREATED', entityType: 'BankAccount', entityId: a.id, newValues: audited(a) }, t);
    return a.id;
  });
  res.status(201).json(await show(req, id));
};

exports.update = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const a = await find(req.params.id, t);
    const same = (k) => (k === 'openingBalance' ? Number(req.body[k]) === Number(a[k]) : String(req.body[k]) === String(a[k]));
    const locked = ['bankId', 'accountNo', 'currency', 'openingBalance', 'openingDate'].filter((k) => req.body[k] !== undefined && !same(k));
    if (locked.length && await hasHistory(a.id, t))
      throw new AppError(409, 'LOCKED_FIELD', `${locked.join(', ')} cannot be changed once the account has transactions or customer payments`, locked.map((f) => ({ field: f, message: 'Locked' })));
    if (req.body.bankId && req.body.bankId !== a.bankId) {
      const bank = await Bank.findByPk(req.body.bankId, { transaction: t });
      if (!bank || !bank.isActive) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field: 'bankId', message: 'Bank not found or inactive' }]);
    }
    if (req.body.bankId || req.body.accountNo) await dupNo(req.body.bankId ?? a.bankId, req.body.accountNo ?? a.accountNo, a.id, t);
    if (req.body.allowOverdraft === false && a.allowOverdraft && (await banking.balanceCents(a, t)) < 0n)
      throw new AppError(409, 'NEGATIVE_BALANCE', 'This account is overdrawn. Bring the balance back to zero before turning overdraft off.');
    const old = audited(a); await a.update(req.body, { transaction: t });
    await audit.log(req, { action: 'BANK_ACCOUNT_UPDATED', entityType: 'BankAccount', entityId: a.id, oldValues: old, newValues: audited(a) }, t);
  });
  res.json(await show(req, req.params.id));
};

exports.setStatus = async (req, res) => {
  const { isActive, reason } = req.body;
  if (!isActive && !reason) throw new AppError(400, 'REASON_REQUIRED', 'Give a reason for deactivating this account');
  await sequelize.transaction(async (t) => {
    const a = await find(req.params.id, t);
    if (isActive) {
      const bank = await Bank.findByPk(a.bankId, { transaction: t });
      if (!bank.isActive) throw new AppError(409, 'BANK_INACTIVE', 'Activate the bank first');
    } else {
      const bal = await banking.balanceCents(a, t);
      if (bal !== 0n) throw new AppError(409, 'HAS_BALANCE', `This account still holds ${str(bal)} ${a.currency}. Transfer or withdraw it before deactivating.`);
    }
    const old = { isActive: a.isActive }; await a.update({ isActive }, { transaction: t });
    await audit.log(req, { action: isActive ? 'BANK_ACCOUNT_ACTIVATED' : 'BANK_ACCOUNT_DEACTIVATED', entityType: 'BankAccount', entityId: a.id, oldValues: old, newValues: { isActive }, reason }, t);
  });
  res.json(await show(req, req.params.id));
};

// Hard delete only for an account that never had any activity; otherwise deactivate.
exports.remove = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const a = await find(req.params.id, t);
    if (await hasHistory(a.id, t)) throw new AppError(409, 'IN_USE', 'This account has transactions. Deactivate it instead of deleting it.');
    const old = audited(a); await a.destroy({ transaction: t });
    await audit.log(req, { action: 'BANK_ACCOUNT_DELETED', entityType: 'BankAccount', entityId: a.id, oldValues: old }, t);
  });
  res.json({ ok: true });
};

exports.statement = async (req, res) => {
  const a = await BankAccount.findByPk(req.params.id, { include: withBank });
  if (!a) throw new AppError(404, 'NOT_FOUND', 'Bank account not found');
  res.json({ ...(await banking.statement(a, req.query)), bank: a.bank });
};
