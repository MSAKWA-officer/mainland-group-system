const {
  Sale, SaleLine, SalePayment, SalesOrder, SalesOrderLine, Customer, Salesperson, User, BankAccount, Bank,
  StockDocument, StockDocumentLine, Item, Warehouse,
} = require('../models');
const creditSales = require('./creditSales');

/* Full details of the record an approval request is about, so the approver sees everything before deciding.
   Read-only. Access is already checked by approvalController.getOne (own request, or approvals.read_all). */
const person = (m, as, attrs = ['id', 'username', 'fullName']) => ({ model: m, as, attributes: attrs });
const customerAttrs = ['id', 'code', 'name', 'phone', 'address', 'city', 'creditLimit', 'paymentTermsDays', 'isActive'];
const num = (v) => Number(v) || 0;
const today = () => new Date().toISOString().slice(0, 10);

// Customer's money position: credit limit, what he already owes (other completed credit sales that are not fully paid) and what he would owe after this one.
async function creditInfo(customer, { total, pending, excludeSaleId, excludeOrderId }) {
  const pos = await creditSales.position(customer);                       // { creditLimit, outstanding, overdue, available, paymentTermsDays }
  const open = (await Sale.findAll({
    where: { saleType: 'CREDIT', status: 'COMPLETED', customerId: customer.id },
    attributes: ['id', 'saleNo', 'saleDate', 'dueDate', 'total', 'amountPaid', 'salesOrderId'], order: [['dueDate', 'ASC']],
  })).filter((s) => num(s.total) > num(s.amountPaid) && s.id !== excludeSaleId && (!excludeOrderId || s.salesOrderId !== excludeOrderId))
    .map((s) => ({ id: s.id, saleNo: s.saleNo, saleDate: s.saleDate, dueDate: s.dueDate, total: s.total, amountPaid: s.amountPaid,
      balance: (num(s.total) - num(s.amountPaid)).toFixed(2), isOverdue: !!s.dueDate && s.dueDate < today() }));
  const otherDebt = open.reduce((a, s) => a + num(s.balance), 0);
  const otherOverdue = open.filter((s) => s.isOverdue).reduce((a, s) => a + num(s.balance), 0);
  const limit = num(pos.creditLimit);
  const info = { creditLimit: pos.creditLimit, paymentTermsDays: pos.paymentTermsDays, outstanding: pos.outstanding, overdue: pos.overdue, available: pos.available,
    hasDebt: open.length > 0, otherDebt: otherDebt.toFixed(2), otherOverdue: otherOverdue.toFixed(2), openSales: open };
  if (pending) {                                                          // not approved yet: show what the position will be if it is approved
    const after = num(pos.outstanding) + num(total);
    Object.assign(info, { afterApproval: after.toFixed(2), availableAfter: (limit - after).toFixed(2), overLimit: after > limit });
  }
  return info;
}

async function forSale(r) {
  const s = await Sale.findByPk(r.entityId, { include: [
    { model: Customer, as: 'customer', attributes: customerAttrs }, person(Salesperson, 'salesperson', ['id', 'code', 'fullName']), person(User, 'creator'),
    { model: StockDocument, as: 'stockDocument', attributes: ['id', 'docNo'] }, { model: SalesOrder, as: 'order', attributes: ['id', 'orderNo'] },
    { model: SaleLine, as: 'lines' },
    { model: SalePayment, as: 'payments', include: [person(User, 'receiver'),
      { model: BankAccount, as: 'bankAccount', attributes: ['id', 'accountNo', 'accountName', 'accountType'], include: [{ model: Bank, as: 'bank', attributes: ['id', 'code', 'name', 'shortName'] }] }] },
  ], order: [[{ model: SaleLine, as: 'lines' }, 'itemName', 'ASC'], [{ model: SalePayment, as: 'payments' }, 'createdAt', 'ASC']] });
  if (!s) return null;
  const j = s.toJSON();
  j.kind = 'SALE';
  j.balance = (num(s.total) - num(s.amountPaid)).toFixed(2);
  if (s.saleType === 'CREDIT' && s.customer) j.credit = await creditInfo(s.customer, { total: s.total, pending: s.status === 'SUBMITTED', excludeSaleId: s.id });
  return j;
}

async function forOrder(r) {
  const o = await SalesOrder.findByPk(r.entityId, { include: [
    { model: Customer, as: 'customer', attributes: customerAttrs }, person(Salesperson, 'salesperson', ['id', 'code', 'fullName']), person(User, 'creator'),
    { model: SalesOrderLine, as: 'lines' },
  ], order: [[{ model: SalesOrderLine, as: 'lines' }, 'itemName', 'ASC']] });
  if (!o) return null;
  const j = o.toJSON();
  j.kind = 'SALES_ORDER';
  if (o.saleType === 'CREDIT' && o.customer) j.credit = await creditInfo(o.customer, { total: o.total, pending: o.status === 'SUBMITTED', excludeOrderId: o.id });
  return j;
}

async function forStockDocument(r) {
  const d = await StockDocument.findByPk(r.entityId, { include: [person(User, 'creator'), { model: Warehouse, as: 'warehouse', attributes: ['id', 'code', 'name'] },
    { model: StockDocumentLine, as: 'lines', include: [{ model: Item, as: 'item', attributes: ['id', 'sku', 'name', 'unit'] }] }] });
  if (!d) return null;
  const j = d.toJSON();
  j.kind = 'STOCK_DOCUMENT';
  return j;
}

const byEntity = { Sale: forSale, SalesOrder: forOrder, StockDocument: forStockDocument };

// Returns null when the request has no linked record (or it no longer exists); the page then shows the request's own note/payload only.
exports.build = async (r) => (r.entityId && byEntity[r.entityType] ? byEntity[r.entityType](r) : null);
