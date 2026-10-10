const { Op, literal, fn, col, where: sqlWhere } = require('sequelize');
const { sequelize, Bank, BankAccount } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('../services/audit');

const accountCount = [literal('(SELECT CAST(COUNT(*) AS int) FROM bank_accounts a WHERE a.bank_id = "Bank"."id")'), 'accountCount'];
const audited = (b) => ({ code: b.code, name: b.name, shortName: b.shortName, swiftCode: b.swiftCode, country: b.country, phone: b.phone, website: b.website, notes: b.notes, isActive: b.isActive });
const show = (id) => Bank.findByPk(id, { attributes: { include: [accountCount] } });
const find = async (id, t) => {
  const b = await Bank.findByPk(id, { transaction: t, ...(t && { lock: t.LOCK.UPDATE }) });
  if (!b) throw new AppError(404, 'NOT_FOUND', 'Bank not found');
  return b;
};
const dupName = async (name, selfId, t) => {
  const w = [sqlWhere(fn('LOWER', col('name')), name.toLowerCase())];
  if (selfId) w.push({ id: { [Op.ne]: selfId } });
  if (await Bank.findOne({ where: { [Op.and]: w }, transaction: t }))
    throw new AppError(409, 'DUPLICATE', 'A bank with this name already exists', [{ field: 'name', message: 'Already registered' }]);
};

exports.list = async (req, res) => {
  const { search, isActive, country, page, limit } = req.query; const where = {};
  if (isActive !== undefined) where.isActive = isActive;
  if (country) where.country = country;
  if (search) where[Op.or] = ['name', 'shortName', 'code', 'swiftCode'].map((f) => ({ [f]: { [Op.iLike]: like(search) } }));
  const { rows, count } = await Bank.findAndCountAll({ where, attributes: { include: [accountCount] }, order: [['name', 'ASC']], limit, offset: (page - 1) * limit });
  res.json({ data: rows, total: count, page, limit });
};

exports.getOne = async (req, res) => {
  const b = await show(req.params.id); if (!b) throw new AppError(404, 'NOT_FOUND', 'Bank not found');
  res.json(b);
};

exports.create = async (req, res) => {
  const id = await sequelize.transaction(async (t) => {
    await dupName(req.body.name, null, t);
    const [r] = await sequelize.query("SELECT nextval('bank_code_seq') AS n", { transaction: t });
    const b = await Bank.create({ ...req.body, code: `BNK-${String(r[0].n).padStart(6, '0')}`, createdBy: req.user.id }, { transaction: t });
    await audit.log(req, { action: 'BANK_CREATED', entityType: 'Bank', entityId: b.id, newValues: audited(b) }, t);
    return b.id;
  });
  res.status(201).json(await show(id));
};

exports.update = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const b = await find(req.params.id, t);
    if (req.body.name && req.body.name.toLowerCase() !== b.name.toLowerCase()) await dupName(req.body.name, b.id, t);
    const old = audited(b); await b.update(req.body, { transaction: t });
    await audit.log(req, { action: 'BANK_UPDATED', entityType: 'Bank', entityId: b.id, oldValues: old, newValues: audited(b) }, t);
  });
  res.json(await show(req.params.id));
};

exports.setStatus = async (req, res) => {
  const { isActive, reason } = req.body;
  if (!isActive && !reason) throw new AppError(400, 'REASON_REQUIRED', 'Give a reason for deactivating this bank');
  await sequelize.transaction(async (t) => {
    const b = await find(req.params.id, t);
    if (!isActive && await BankAccount.count({ where: { bankId: b.id, isActive: true }, transaction: t }))
      throw new AppError(409, 'HAS_ACTIVE_ACCOUNTS', 'This bank still has active accounts. Deactivate them first.');
    const old = { isActive: b.isActive }; await b.update({ isActive }, { transaction: t });
    await audit.log(req, { action: isActive ? 'BANK_ACTIVATED' : 'BANK_DEACTIVATED', entityType: 'Bank', entityId: b.id, oldValues: old, newValues: { isActive }, reason }, t);
  });
  res.json(await show(req.params.id));
};

// Hard delete only for a bank that has no accounts; otherwise deactivate.
exports.remove = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const b = await find(req.params.id, t);
    if (await BankAccount.count({ where: { bankId: b.id }, transaction: t })) throw new AppError(409, 'IN_USE', 'This bank has accounts. Deactivate it instead of deleting it.');
    const old = audited(b); await b.destroy({ transaction: t });
    await audit.log(req, { action: 'BANK_DELETED', entityType: 'Bank', entityId: b.id, oldValues: old }, t);
  });
  res.json({ ok: true });
};
