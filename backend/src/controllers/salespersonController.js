const { Op, literal } = require('sequelize');
const { sequelize, Salesperson, User, Customer, SalesOrder, Warehouse } = require('../models');
const whs = require('../services/warehouses');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('../services/audit');
const { mine } = require('../services/salesScope');

const canPay = (req) => req.user.permissions.has('salespersons.view_commission');
const PAY = ['commissionRate', 'monthlyTarget'];
// Commission rate and target are hidden unless the user may see them (or it is their own profile).
const pub = (s, req, own) => { const o = s.toJSON(); if (!canPay(req) && !own) PAY.forEach((k) => delete o[k]); return o; };
const inc = [{ model: User, as: 'user', attributes: ['id', 'username', 'fullName'] }, { model: Warehouse, as: 'warehouse', attributes: ['id', 'code', 'name'] }];
const counts = [
  [literal('(SELECT CAST(COUNT(*) AS int) FROM customers c WHERE c.salesperson_id = "Salesperson"."id")'), 'customerCount'],
  [literal('(SELECT CAST(COUNT(*) AS int) FROM sales_orders o WHERE o.salesperson_id = "Salesperson"."id")'), 'orderCount'],
];
const audited = (s) => ({ code: s.code, userId: s.userId, fullName: s.fullName, phone: s.phone, email: s.email, region: s.region, warehouseId: s.warehouseId,
  commissionRate: s.commissionRate, monthlyTarget: s.monthlyTarget, isActive: s.isActive });
const find = async (id, t) => {
  const s = await Salesperson.findByPk(id, { transaction: t, ...(t && { lock: t.LOCK.UPDATE }) });
  if (!s) throw new AppError(404, 'NOT_FOUND', 'Salesperson not found');
  return s;
};
const show = (id) => Salesperson.findByPk(id, { include: inc, attributes: { include: counts } });
// Choosing the warehouse a salesperson sells from needs warehouses.assign (Manager / Owner), and the warehouse must be active.
const needAssign = async (req, t) => {
  if (req.body.warehouseId === undefined) return;
  if (!req.user.permissions.has('warehouses.assign')) throw new AppError(403, 'FORBIDDEN', 'You are not allowed to assign a warehouse');
  if (req.body.warehouseId) await whs.activeOne(req.body.warehouseId, t);
};
const needPay = (req) => {
  if (PAY.some((k) => req.body[k] !== undefined) && !canPay(req)) throw new AppError(403, 'FORBIDDEN', 'You are not allowed to set commission or targets');
};
// The linked login account must exist, be active and not already belong to another salesperson.
const checkUser = async (userId, selfId, t) => {
  const u = await User.findByPk(userId, { transaction: t });
  if (!u || !u.isActive) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field: 'userId', message: 'User not found or inactive' }]);
  const taken = await Salesperson.findOne({ where: { userId, ...(selfId && { id: { [Op.ne]: selfId } }) }, transaction: t });
  if (taken) throw new AppError(409, 'USER_LINKED', 'That user is already linked to another salesperson', [{ field: 'userId', message: 'Already linked' }]);
  return u;
};

exports.list = async (req, res) => {
  const { search, isActive, page, limit } = req.query; const where = {};
  if (isActive !== undefined) where.isActive = isActive;
  if (search) where[Op.or] = ['fullName', 'code', 'phone', 'region'].map((f) => ({ [f]: { [Op.iLike]: like(search) } }));
  const { rows, count } = await Salesperson.findAndCountAll({ where, include: inc, attributes: { include: counts }, order: [['fullName', 'ASC']], limit, offset: (page - 1) * limit });
  res.json({ data: rows.map((s) => pub(s, req)), total: count, page, limit });
};

exports.getOne = async (req, res) => {
  const s = await show(req.params.id); if (!s) throw new AppError(404, 'NOT_FOUND', 'Salesperson not found');
  res.json(pub(s, req));
};

// The signed-in user's own salesperson profile (needs login only, so a Sales Person can load their own screen).
exports.me = async (req, res) => {
  const sp = await mine(req); if (!sp) throw new AppError(404, 'NOT_FOUND', 'Your account is not linked to a salesperson profile');
  res.json(pub(await show(sp.id), req, true));
};

exports.create = async (req, res) => {
  needPay(req);
  const id = await sequelize.transaction(async (t) => {
    const b = req.body; let { fullName } = b;
    await needAssign(req, t);
    if (b.userId) { const u = await checkUser(b.userId, null, t); fullName = fullName || u.fullName; }
    if (!fullName) throw new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field: 'fullName', message: 'Name is required' }]);
    const [r] = await sequelize.query("SELECT nextval('salesperson_code_seq') AS n", { transaction: t });
    const s = await Salesperson.create({ ...b, fullName, code: `SP-${String(r[0].n).padStart(6, '0')}`, createdBy: req.user.id }, { transaction: t });
    await audit.log(req, { action: 'SALESPERSON_CREATED', entityType: 'Salesperson', entityId: s.id, newValues: audited(s) }, t);
    return s.id;
  });
  res.status(201).json(pub(await show(id), req));
};

exports.update = async (req, res) => {
  needPay(req);
  await sequelize.transaction(async (t) => {
    const s = await find(req.params.id, t); const b = req.body;
    await needAssign(req, t);
    if (b.userId && b.userId !== s.userId) await checkUser(b.userId, s.id, t);
    const old = audited(s); await s.update(b, { transaction: t });
    await audit.log(req, { action: 'SALESPERSON_UPDATED', entityType: 'Salesperson', entityId: s.id, oldValues: old, newValues: audited(s) }, t);
  });
  res.json(pub(await show(req.params.id), req));
};

exports.setStatus = async (req, res) => {
  const { isActive, reason } = req.body;
  if (!isActive && !reason) throw new AppError(400, 'REASON_REQUIRED', 'Give a reason for deactivating this salesperson');
  await sequelize.transaction(async (t) => {
    const s = await find(req.params.id, t);
    if (!isActive && await SalesOrder.count({ where: { salespersonId: s.id, status: 'SUBMITTED' }, transaction: t }))
      throw new AppError(409, 'HAS_PENDING', 'This salesperson has orders waiting for approval. Resolve them first.');
    const old = { isActive: s.isActive }; await s.update({ isActive }, { transaction: t });
    await audit.log(req, { action: isActive ? 'SALESPERSON_ACTIVATED' : 'SALESPERSON_DEACTIVATED', entityType: 'Salesperson', entityId: s.id, oldValues: old, newValues: { isActive }, reason }, t);
  });
  res.json(pub(await show(req.params.id), req));
};

// Hard delete only for a salesperson with no customers and no orders; otherwise deactivate.
exports.remove = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const s = await find(req.params.id, t);
    if (await Customer.count({ where: { salespersonId: s.id }, transaction: t }) || await SalesOrder.count({ where: { salespersonId: s.id }, transaction: t }))
      throw new AppError(409, 'IN_USE', 'This salesperson has customers or orders. Deactivate instead of deleting.');
    const old = audited(s); await s.destroy({ transaction: t });
    await audit.log(req, { action: 'SALESPERSON_DELETED', entityType: 'Salesperson', entityId: s.id, oldValues: old }, t);
  });
  res.json({ ok: true });
};

// Monthly performance: completed sales (cash + credit; the key keeps its old name confirmedOrders), net sales (after discount, before tax), target attainment and commission.
exports.summary = async (req, res) => {
  const sp = req.params.id ? await find(req.params.id) : await mine(req);
  if (!sp) throw new AppError(404, 'NOT_FOUND', 'Salesperson not found');
  const own = !!sp.userId && sp.userId === req.user.id;
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const [r] = (await sequelize.query(`SELECT CAST(COUNT(*) AS int) AS "confirmedOrders", COALESCE(SUM(total), 0) AS "grossTotal",
      COALESCE(SUM(total - tax_total), 0) AS "netSales"
    FROM sales WHERE salesperson_id = :id AND status = 'COMPLETED'
      AND sale_date >= CAST(:m || '-01' AS date) AND sale_date < CAST(:m || '-01' AS date) + interval '1 month'`, { replacements: { id: sp.id, m: month } }))[0];
  const [x] = (await sequelize.query(`SELECT
      (SELECT CAST(COUNT(*) AS int) FROM sales WHERE salesperson_id = :id AND status = 'SUBMITTED') AS "pendingOrders",
      (SELECT CAST(COUNT(*) AS int) FROM customers WHERE salesperson_id = :id AND is_active) AS "activeCustomers"`, { replacements: { id: sp.id } }))[0];
  const out = { salespersonId: sp.id, code: sp.code, fullName: sp.fullName, month, ...r, ...x };
  if (canPay(req) || own) {
    const target = Number(sp.monthlyTarget); const rate = Number(sp.commissionRate);
    out.monthlyTarget = sp.monthlyTarget; out.commissionRate = sp.commissionRate;
    out.attainmentPercent = target > 0 ? Math.round((Number(r.netSales) / target) * 1000) / 10 : null;
    out.commissionEarned = (Math.round(Number(r.netSales) * rate) / 100).toFixed(2);
  }
  res.json(out);
};
