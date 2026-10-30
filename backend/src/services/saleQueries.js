const { Op, literal } = require('sequelize');
const { Sale, SaleLine, SalePayment, BankAccount, Bank, Customer, Salesperson, User, ApprovalRequest, StockDocument } = require('../models');
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
// Njia ya malipo ya kwanza ya mauzo (Cash sales list: "Benki · CRDB"). Subquery kama lineCount, kwa hiyo kurasa (limit/offset) hazibadiliki.
const payMethod = literal('(SELECT p.method FROM sale_payments p WHERE p.sale_id = "Sale"."id" ORDER BY p.created_at ASC LIMIT 1)');
// Jina la akaunti iliyosajiliwa (mfano "CRDB · Mainland Ltd") kwa orodha ya Cash sales.
const payAccount = literal('(SELECT COALESCE(b.short_name, b.name) || \' · \' || a.account_name FROM sale_payments p JOIN bank_accounts a ON a.id = p.bank_account_id JOIN banks b ON b.id = a.bank_id WHERE p.sale_id = "Sale"."id" ORDER BY p.created_at ASC LIMIT 1)');
const payReference = literal('(SELECT p.reference FROM sale_payments p WHERE p.sale_id = "Sale"."id" ORDER BY p.created_at ASC LIMIT 1)');
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
      { model: SalePayment, as: 'payments', include: [{ model: User, as: 'receiver', attributes: ['id', 'username', 'fullName'] },
        { model: BankAccount, as: 'bankAccount', attributes: ['id', 'accountNo', 'accountName', 'accountType'], include: [{ model: Bank, as: 'bank', attributes: ['id', 'code', 'name', 'shortName'] }] }] }],
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
  else if (q.hideVoided) and.push({ status: { [Op.ne]: 'VOIDED' } });     // deleted (voided) sales leave the list unless the status filter asks for them
  if (paymentStatus) and.push({ paymentStatus });
  if (customerId) and.push({ customerId });
  if (salespersonId) and.push({ salespersonId });
  if (createdBy) and.push({ createdBy });
  if (from || to) and.push({ saleDate: { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) } });
  if (od) and.push(literal(`${overdue.val} = true`));
  if (search) and.push({ [Op.or]: [{ saleNo: { [Op.iLike]: like(search) } }, { walkInName: { [Op.iLike]: like(search) } }, { '$customer.name$': { [Op.iLike]: like(search) } }] });
  const { rows, count } = await Sale.findAndCountAll({ where: { [Op.and]: and }, include: [customer, salesperson],
    attributes: { include: [[lineCount, 'lineCount'], [payMethod, 'payMethod'], [payReference, 'payReference'], [payAccount, 'payAccount'], ...computed] }, order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit, subQuery: false });
  return { data: rows, total: count, page, limit };
}

module.exports = { fetch, list, visibility, computed, permOf };
