const { Op, literal } = require('sequelize');
const { Sale, SaleLine, SalePayment, Customer, Salesperson, User, ApprovalRequest, StockDocument } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const { scope, canSee } = require('./salesScope');
const { TYPES } = require('./saleCore');

/* Read side shared by the Sales register, Cash sales and Credit sales.
   Visibility rule (same as customers and sales orders): holding `<type>.read_all` shows every sale of that type, otherwise only sales
   of your own salesperson profile. A sale you may not see looks like "not found". */
const customer = { model: Customer, as: 'customer', attributes: ['id', 'code', 'name', 'phone', 'creditLimit', 'paymentTermsDays'] };
const salesperson = { model: Salesperson, as: 'salesperson', attributes: ['id', 'code', 'fullName'] };
const creator = { model: User, as: 'creator', attributes: ['id', 'username', 'fullName'] };
const approval = { model: ApprovalRequest, as: 'approval', attributes: ['id', 'status', 'decidedBy', 'decidedAt', 'decisionNote'] };
const stockDoc = { model: StockDocument, as: 'stockDocument', attributes: ['id', 'docNo', 'status', 'postedAt'] };
const lineCount = literal('(SELECT CAST(COUNT(*) AS int) FROM sale_lines l WHERE l.sale_id = "Sale"."id")');
// Balance and overdue are worked out by the database so lists can filter and sort on them.
const balance = literal(`(CASE WHEN "Sale"."sale_type" = 'CREDIT' AND "Sale"."status" = 'COMPLETED' THEN "Sale"."total" - "Sale"."amount_paid" ELSE 0 END)`);
const overdue = literal(`(CASE WHEN "Sale"."sale_type" = 'CREDIT' AND "Sale"."status" = 'COMPLETED' AND "Sale"."total" > "Sale"."amount_paid" AND "Sale"."due_date" < CURRENT_DATE THEN true ELSE false END)`);
const computed = [[balance, 'balance'], [overdue, 'isOverdue']];

const permOf = (saleType) => TYPES[saleType].perm;

// Builds the visibility condition for the given sale types, or null when the user may not read any of them.
async function visibility(req, types) {
  const parts = [];
  for (const t of types) {
    if (!req.user.permissions.has(`${permOf(t)}.read`)) continue;
    parts.push(await scope(req, `${permOf(t)}.read_all`, { saleType: t }));
  }
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : { [Op.or]: parts };
}

async function fetch(req, id, types = Object.keys(TYPES)) {
  const s = await Sale.findByPk(id, {
    attributes: { include: computed },
    include: [customer, salesperson, creator, approval, stockDoc,
      { model: SaleLine, as: 'lines' },
      { model: SalePayment, as: 'payments', include: [{ model: User, as: 'receiver', attributes: ['id', 'username', 'fullName'] }] }],
    order: [[{ model: SaleLine, as: 'lines' }, 'itemName', 'ASC'], [{ model: SalePayment, as: 'payments' }, 'createdAt', 'ASC']],
  });
  const ok = s && types.includes(s.saleType) && req.user.permissions.has(`${permOf(s.saleType)}.read`)
    && await canSee(req, `${permOf(s.saleType)}.read_all`, s.salespersonId);
  if (!ok) throw new AppError(404, 'NOT_FOUND', 'Sale not found');
  return s;
}

async function list(req, types, q) {
  const vis = await visibility(req, types);
  if (!vis) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this');
  const and = [vis];
  const { saleType, status, paymentStatus, customerId, salespersonId, createdBy, search, from, to, overdue: od, page, limit } = q;
  if (saleType) and.push({ saleType });
  if (status) and.push({ status });
  if (paymentStatus) and.push({ paymentStatus });
  if (customerId) and.push({ customerId });
  if (salespersonId) and.push({ salespersonId });
  if (createdBy) and.push({ createdBy });
  if (from || to) and.push({ saleDate: { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) } });
  if (od) and.push(literal(`${overdue.val} = true`));
  if (search) and.push({ [Op.or]: [{ saleNo: { [Op.iLike]: like(search) } }, { walkInName: { [Op.iLike]: like(search) } }, { '$customer.name$': { [Op.iLike]: like(search) } }] });
  const { rows, count } = await Sale.findAndCountAll({ where: { [Op.and]: and }, include: [customer, salesperson],
    attributes: { include: [[lineCount, 'lineCount'], ...computed] }, order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit, subQuery: false });
  return { data: rows, total: count, page, limit };
}

module.exports = { fetch, list, visibility, computed, permOf };
