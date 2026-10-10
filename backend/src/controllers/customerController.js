const { Op, literal } = require('sequelize');
const { sequelize, Customer, Salesperson, SalesOrder } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('../services/audit');
const { mine, canAll, scope, canSee } = require('../services/salesScope');

const inc = [{ model: Salesperson, as: 'salesperson', attributes: ['id', 'code', 'fullName'] }];
const orderCount = [literal('(SELECT CAST(COUNT(*) AS int) FROM sales_orders o WHERE o.customer_id = "Customer"."id")'), 'orderCount'];
const audited = (c) => ({ code: c.code, name: c.name, type: c.type, contactPerson: c.contactPerson, phone: c.phone, email: c.email, address: c.address,
  city: c.city, tin: c.tin, creditLimit: c.creditLimit, paymentTermsDays: c.paymentTermsDays, salespersonId: c.salespersonId, isActive: c.isActive });
const bad = (field, message) => new AppError(400, 'VALIDATION_ERROR', 'Check the highlighted fields', [{ field, message }]);
const show = (id) => Customer.findByPk(id, { include: inc, attributes: { include: [orderCount] } });
// A customer that belongs to someone else looks like "not found" to users who may only see their own.
const find = async (req, id, t) => {
  const c = await Customer.findByPk(id, { transaction: t, ...(t && { lock: t.LOCK.UPDATE }) });
  if (!c || !(await canSee(req, 'customers.read_all', c.salespersonId))) throw new AppError(404, 'NOT_FOUND', 'Customer not found');
  return c;
};
const activeSalesperson = async (id, t) => {
  const s = await Salesperson.findByPk(id, { transaction: t });
  if (!s || !s.isActive) throw bad('salespersonId', 'Choose an active salesperson');
};
// Friendly duplicate messages (the database unique indexes are the final guard).
const checkUnique = async (b, selfId, t) => {
  const not = selfId ? { id: { [Op.ne]: selfId } } : {};
  if (b.email && await Customer.findOne({ where: { ...not, [Op.and]: [literal(`LOWER("Customer"."email") = ${sequelize.escape(b.email.toLowerCase())}`)] }, transaction: t }))
    throw new AppError(409, 'DUPLICATE', 'A customer with this email already exists', [{ field: 'email', message: 'Already in use' }]);
  if (b.tin && await Customer.findOne({ where: { ...not, [Op.and]: [literal(`UPPER("Customer"."tin") = ${sequelize.escape(b.tin.toUpperCase())}`)] }, transaction: t }))
    throw new AppError(409, 'DUPLICATE', 'A customer with this TIN already exists', [{ field: 'tin', message: 'Already in use' }]);
};

exports.list = async (req, res) => {
  const { search, type, salespersonId, isActive, page, limit } = req.query; let where = {};
  if (type) where.type = type;
  if (isActive !== undefined) where.isActive = isActive;
  if (salespersonId) where.salespersonId = salespersonId;
  if (search) where[Op.or] = ['name', 'code', 'phone', 'email', 'tin'].map((f) => ({ [f]: { [Op.iLike]: like(search) } }));
  where = await scope(req, 'customers.read_all', where);
  const { rows, count } = await Customer.findAndCountAll({ where, include: inc, attributes: { include: [orderCount] }, order: [['name', 'ASC']], limit, offset: (page - 1) * limit });
  res.json({ data: rows, total: count, page, limit });
};

exports.getOne = async (req, res) => {
  await find(req, req.params.id);
  res.json(await show(req.params.id));
};

exports.create = async (req, res) => {
  const id = await sequelize.transaction(async (t) => {
    const b = { ...req.body };
    if (!canAll(req, 'customers.read_all')) {                                   // a Sales Person always owns the customers they create
      const me = await mine(req);
      if (!me) throw new AppError(403, 'NO_SALESPERSON_PROFILE', 'Your account is not linked to a salesperson profile. Ask an administrator to link it.');
      if (b.salespersonId && b.salespersonId !== me.id) throw new AppError(403, 'FORBIDDEN', 'You can only create customers for yourself');
      b.salespersonId = me.id;
    } else if (b.salespersonId && !req.user.permissions.has('customers.assign')) throw new AppError(403, 'FORBIDDEN', 'You are not allowed to assign customers to a salesperson');
    if (b.salespersonId) await activeSalesperson(b.salespersonId, t);
    await checkUnique(b, null, t);
    const [r] = await sequelize.query("SELECT nextval('customer_code_seq') AS n", { transaction: t });
    const c = await Customer.create({ ...b, code: `CUS-${String(r[0].n).padStart(6, '0')}`, createdBy: req.user.id }, { transaction: t });
    await audit.log(req, { action: 'CUSTOMER_CREATED', entityType: 'Customer', entityId: c.id, newValues: audited(c) }, t);
    return c.id;
  });
  res.status(201).json(await show(id));
};

exports.update = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const c = await find(req, req.params.id, t); const b = req.body;
    if (b.salespersonId !== undefined && b.salespersonId !== c.salespersonId) {
      if (!req.user.permissions.has('customers.assign')) throw new AppError(403, 'FORBIDDEN', 'You are not allowed to reassign customers');
      if (b.salespersonId) await activeSalesperson(b.salespersonId, t);
    }
    if (b.email !== undefined || b.tin !== undefined) await checkUnique({ email: b.email ?? null, tin: b.tin ?? null }, c.id, t);
    const old = audited(c); await c.update(b, { transaction: t });
    await audit.log(req, { action: 'CUSTOMER_UPDATED', entityType: 'Customer', entityId: c.id, oldValues: old, newValues: audited(c) }, t);
  });
  res.json(await show(req.params.id));
};

exports.setStatus = async (req, res) => {
  const { isActive, reason } = req.body;
  if (!isActive && !reason) throw new AppError(400, 'REASON_REQUIRED', 'Give a reason for deactivating this customer');
  await sequelize.transaction(async (t) => {
    const c = await find(req, req.params.id, t);
    if (!isActive && await SalesOrder.count({ where: { customerId: c.id, status: 'SUBMITTED' }, transaction: t }))
      throw new AppError(409, 'HAS_PENDING', 'This customer has orders waiting for approval. Resolve them first.');
    const old = { isActive: c.isActive }; await c.update({ isActive }, { transaction: t });
    await audit.log(req, { action: isActive ? 'CUSTOMER_ACTIVATED' : 'CUSTOMER_DEACTIVATED', entityType: 'Customer', entityId: c.id, oldValues: old, newValues: { isActive }, reason }, t);
  });
  res.json(await show(req.params.id));
};

// Hard delete only for a customer without any order history; otherwise deactivate.
exports.remove = async (req, res) => {
  await sequelize.transaction(async (t) => {
    const c = await find(req, req.params.id, t);
    if (await SalesOrder.count({ where: { customerId: c.id }, transaction: t })) throw new AppError(409, 'IN_USE', 'This customer has orders. Deactivate instead of deleting.');
    const old = audited(c); await c.destroy({ transaction: t });
    await audit.log(req, { action: 'CUSTOMER_DELETED', entityType: 'Customer', entityId: c.id, oldValues: old }, t);
  });
  res.json({ ok: true });
};
