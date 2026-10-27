const { sequelize, Sale, SaleLine, SalePayment, Customer, Salesperson, Item, CustomerPaymentAllocation } = require('../models');
const approvals = require('./approvals');
const paymentAccounts = require('./paymentAccounts');
const audit = require('./audit');
const core = require('./saleCore');
const { AppError } = require('../utils/errors');

/* Credit sale lifecycle:
     DRAFT -> (submit) SUBMITTED -> (approve) COMPLETED | (reject) REJECTED | (cancel) CANCELLED
     COMPLETED -> (void, only while nothing has been paid) VOIDED
   Stock is issued and the receivable is created when the sale is approved (inside the approval transaction, FEFO, through the Phase 2 ledger).
   Payments are recorded afterwards with receivePayment(); the balance is total - payments. The customer's credit limit is checked on submit
   (as a warning flag for the approver) and again, under a lock, at approval. Exceeding the limit needs `credit_sales.override_limit`. */
const { bad, snap, cents, str } = core;
const TYPE = 'CREDIT_SALE';

const load = async (id, t) => {
  const s = await Sale.findByPk(id, { transaction: t, ...(t && { lock: t.LOCK.UPDATE }) });
  if (!s || s.saleType !== 'CREDIT') throw new AppError(404, 'NOT_FOUND', 'Credit sale not found');
  return s;
};
const mustOwn = (req, s, what) => {
  if (s.createdBy !== req.user.id) throw new AppError(403, 'FORBIDDEN', `Only the creator can ${what} this sale`);
};
const checkDue = (dueDate, saleDate) => { if (dueDate && saleDate && dueDate < saleDate) throw bad('dueDate', 'Due date cannot be before the sale date'); };

// Outstanding balance of a customer = unpaid part of COMPLETED credit sales. Overdue = the part whose due date has passed.
async function position(customer, t) {
  const [r] = (await sequelize.query(`SELECT
      COALESCE(SUM(total - amount_paid), 0)::text AS outstanding,
      COALESCE(SUM(total - amount_paid) FILTER (WHERE due_date < CURRENT_DATE), 0)::text AS overdue
    FROM sales WHERE sale_type = 'CREDIT' AND status = 'COMPLETED' AND customer_id = :id AND total > amount_paid`,
  { transaction: t, replacements: { id: customer.id } }))[0];
  const limit = cents(customer.creditLimit); const out = cents(r.outstanding);
  return { creditLimit: customer.creditLimit, outstanding: r.outstanding, overdue: r.overdue, available: str(limit > out ? limit - out : 0n),
    paymentTermsDays: customer.paymentTermsDays, limitCents: limit, outstandingCents: out };
}
const publicPosition = ({ limitCents, outstandingCents, ...p }) => p;
const exceeds = (pos, total) => pos.outstandingCents + cents(total) > pos.limitCents;

/* ---------- create / update / submit / cancel / delete ---------- */
const create = (req, body) => sequelize.transaction(async (t) => {
  const { customer, salesperson } = await core.resolveParties(req, 'CREDIT', body, t);
  const rows = await core.normalizeLines(req, 'CREDIT', body.lines, t);
  const taxRate = body.taxRate ?? 0;
  const tot = core.totals(rows, taxRate);
  if (cents(tot.total) <= 0n) throw bad('lines', 'The sale total must be greater than zero');
  const today = await core.dbToday(t);
  const dueDate = body.dueDate ?? await core.dbToday(t, customer.paymentTermsDays);
  checkDue(dueDate, today);
  const saleNo = `${core.TYPES.CREDIT.prefix}-${core.year()}-${core.pad(await core.nextNo('credit_sale_seq', t))}`;
  const sale = await Sale.create({ saleNo, saleType: 'CREDIT', customerId: customer.id, salespersonId: salesperson.id, status: 'DRAFT',
    dueDate, notes: body.notes ?? null, taxRate, ...tot, createdBy: req.user.id }, { transaction: t });
  await SaleLine.bulkCreate(rows.map((r) => ({ ...r, saleId: sale.id })), { transaction: t });
  await audit.log(req, { action: 'CREDIT_SALE_CREATED', entityType: 'Sale', entityId: sale.id, newValues: { ...snap(sale), lines: rows.length } }, t);
  return sale;
});

const update = (req, id, body) => sequelize.transaction(async (t) => {
  const s = await load(id, t);
  mustOwn(req, s, 'edit');
  if (s.status !== 'DRAFT') throw new AppError(409, 'BAD_STATE', `Cannot edit a sale that is ${s.status}`);
  const old = snap(s);
  const head = {};
  let customer = null;
  if (body.customerId !== undefined || body.salespersonId !== undefined) {
    const r = await core.resolveParties(req, 'CREDIT', { customerId: body.customerId ?? s.customerId, salespersonId: body.salespersonId ?? s.salespersonId }, t);
    customer = r.customer; head.customerId = r.customer.id; head.salespersonId = r.salesperson.id;
    if (body.customerId && body.customerId !== s.customerId && body.dueDate === undefined) head.dueDate = await core.dbToday(t, customer.paymentTermsDays);
  }
  for (const k of ['dueDate', 'notes', 'taxRate']) if (body[k] !== undefined) head[k] = body[k];
  checkDue(head.dueDate ?? s.dueDate, s.saleDate);
  if (head.dueDate && head.dueDate < await core.dbToday(t)) throw bad('dueDate', 'Due date cannot be in the past');
  let rows;
  if (body.lines) {
    rows = await core.normalizeLines(req, 'CREDIT', body.lines, t);
    await SaleLine.destroy({ where: { saleId: s.id }, transaction: t });
    await SaleLine.bulkCreate(rows.map((r) => ({ ...r, saleId: s.id })), { transaction: t });
  } else if (head.taxRate !== undefined) {
    rows = (await SaleLine.findAll({ where: { saleId: s.id }, transaction: t }))
      .map((l) => ({ quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent) }));
  }
  if (rows) {
    Object.assign(head, core.totals(rows, head.taxRate ?? Number(s.taxRate)));
    if (cents(head.total) <= 0n) throw bad('lines', 'The sale total must be greater than zero');
  }
  await s.update(head, { transaction: t });
  await audit.log(req, { action: 'CREDIT_SALE_UPDATED', entityType: 'Sale', entityId: s.id, oldValues: old, newValues: { ...snap(s), ...(rows && { lines: rows.length }) } }, t);
  return s;
});

// Submit = create the approval request + submit it + lock the sale, all in ONE transaction.
const submit = (req, id) => sequelize.transaction(async (t) => {
  const s = await load(id, t);
  mustOwn(req, s, 'submit');
  if (s.status !== 'DRAFT') throw new AppError(409, 'BAD_STATE', `Cannot submit a sale that is ${s.status}`);
  const lines = await SaleLine.findAll({ where: { saleId: s.id }, transaction: t });
  if (!lines.length) throw bad('lines', 'Add at least one item');
  const { customer } = await core.resolveParties(req, 'CREDIT', { customerId: s.customerId, salespersonId: s.salespersonId }, t);   // still active / still yours?
  const items = await Item.findAll({ where: { id: lines.map((l) => l.itemId) }, transaction: t });
  const inactive = items.find((i) => !i.isActive);
  if (inactive) throw bad('lines', `${inactive.sku} - ${inactive.name} is inactive. Remove it from the sale.`);
  const pos = await position(customer, t);
  const overLimit = exceeds(pos, s.total);
  const ar = await approvals.create(req, { type: TYPE, entityType: 'Sale', entityId: s.id,
    payload: { saleNo: s.saleNo, customer: customer.name, lines: lines.length, total: s.total, dueDate: s.dueDate,
      creditLimit: pos.creditLimit, outstanding: pos.outstanding, overLimit } }, t);
  await approvals.submit(req, ar.id, t);
  const old = snap(s);
  await s.update({ status: 'SUBMITTED', submittedAt: new Date(), approvalId: ar.id }, { transaction: t });
  await audit.log(req, { action: 'CREDIT_SALE_SUBMITTED', entityType: 'Sale', entityId: s.id, oldValues: old, newValues: { ...snap(s), overLimit } }, t);
  return s;
});

const cancel = async (req, id, reason) => {
  const peek = await load(id);
  if (peek.status === 'SUBMITTED') {                                  // the approval service closes the sale through the onCancel hook
    mustOwn(req, peek, 'cancel');
    await approvals.cancel(req, peek.approvalId);
    return load(id);
  }
  return sequelize.transaction(async (t) => {
    const s = await load(id, t);
    if (s.status !== 'DRAFT') throw new AppError(409, 'BAD_STATE', `Cannot cancel a sale that is ${s.status}. A completed sale is voided instead.`);
    mustOwn(req, s, 'cancel');
    const old = snap(s);
    await s.update({ status: 'CANCELLED', cancelledAt: new Date(), voidReason: reason ?? null }, { transaction: t });
    await audit.log(req, { action: 'CREDIT_SALE_CANCELLED', entityType: 'Sale', entityId: s.id, oldValues: old, newValues: snap(s), reason }, t);
    return s;
  });
};

// Draft / rejected / cancelled sales that never moved stock can be deleted by the creator or the Owner.
const remove = (req, id) => sequelize.transaction(async (t) => {
  const s = await load(id, t);
  if (s.createdBy !== req.user.id && req.user.role !== 'OWNER') throw new AppError(403, 'FORBIDDEN', 'Only the creator or the Owner can delete this sale');
  if (!['DRAFT', 'CANCELLED', 'REJECTED'].includes(s.status) || s.stockDocumentId)
    throw new AppError(409, 'BAD_STATE', 'Only draft, rejected or cancelled sales without stock history can be deleted. Completed sales are kept as a permanent record.');
  const old = { ...snap(s), lines: await SaleLine.count({ where: { saleId: s.id }, transaction: t }) };
  await s.destroy({ transaction: t });
  await audit.log(req, { action: 'CREDIT_SALE_DELETED', entityType: 'Sale', entityId: id, oldValues: old }, t);
});

/* ---------- payments (receipts) ---------- */
const receivePayment = (req, id, body) => sequelize.transaction(async (t) => {
  const s = await load(id, t);
  if (s.status !== 'COMPLETED') throw new AppError(409, 'BAD_STATE', `Payments can only be recorded on a completed sale (this one is ${s.status})`);
  const balance = cents(s.total) - cents(s.amountPaid);
  if (balance <= 0n) throw new AppError(409, 'ALREADY_PAID', 'This sale is already fully paid');
  const amount = cents(body.amount);
  if (amount <= 0n) throw bad('amount', 'Amount must be greater than 0');
  if (amount > balance) throw new AppError(409, 'OVERPAYMENT', `Amount is more than the balance (${str(balance)})`, [{ field: 'amount', message: `Balance is ${str(balance)}` }]);
  const today = await core.dbToday(t);
  const paidOn = body.paidOn ?? today;
  if (paidOn > today) throw bad('paidOn', 'Payment date cannot be in the future');
  if (paidOn < s.saleDate) throw bad('paidOn', 'Payment date cannot be before the sale date');
  const account = await paymentAccounts.resolve(body.method, body.bankAccountId, t);          // BANK / CARD / MOBILE_MONEY must name a registered account
  const p = await SalePayment.create({ receiptNo: `RCP-${core.year()}-${core.pad(await core.nextNo('sale_receipt_seq', t))}`, saleId: s.id, amount: str(amount),
    method: body.method, bankAccountId: account?.id ?? null, reference: body.reference ?? null, paidOn, notes: body.notes ?? null, receivedBy: req.user.id }, { transaction: t });
  // Money received into a bank / mobile money account is posted to its ledger, so the account balance goes up.
  const customer = s.customerId ? await Customer.findByPk(s.customerId, { attributes: ['name'], transaction: t }) : null;
  const bankTxn = account ? await paymentAccounts.postReceipt(req, account, { amount: str(amount), txnDate: paidOn, reference: body.reference, sale: s, payment: p, counterparty: customer?.name }, t) : null;
  const paid = str(cents(s.amountPaid) + amount);
  const old = snap(s);
  await s.update({ amountPaid: paid, paymentStatus: core.paymentStatus(s.total, paid) }, { transaction: t });
  await audit.log(req, { action: 'CREDIT_PAYMENT_RECEIVED', entityType: 'Sale', entityId: s.id, oldValues: old,
    newValues: { ...snap(s), receiptNo: p.receiptNo, amount: p.amount, method: p.method, bankAccountId: account?.id ?? null, bankTxnNo: bankTxn?.txnNo ?? null } }, t);
  return { sale: s, payment: p };
});

const voidPayment = (req, id, paymentId, reason) => sequelize.transaction(async (t) => {
  const s = await load(id, t);
  if (s.status !== 'COMPLETED') throw new AppError(409, 'BAD_STATE', `Cannot change payments of a sale that is ${s.status}`);
  if (!reason || reason.trim().length < 3) throw bad('reason', 'A reason is required to void a payment');
  const p = await SalePayment.findOne({ where: { id: paymentId, saleId: s.id }, transaction: t, lock: t.LOCK.UPDATE });
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Payment not found');
  if (p.voidedAt) throw new AppError(409, 'BAD_STATE', 'This payment is already voided');
  // Phase 5: a payment that came from a Customer Payment is reversed there, so the bank ledger and the sale always agree.
  if (await CustomerPaymentAllocation.count({ where: { salePaymentId: p.id }, transaction: t }))
    throw new AppError(409, 'LINKED', 'This payment was received through Customer Payments. Void the customer payment instead.');
  const old = snap(s);
  await paymentAccounts.voidReceipts(req, [p.id], `Sale ${s.saleNo} payment ${p.receiptNo} voided: ${reason}`, t);     // takes the money back out of the account
  await p.update({ voidedAt: new Date(), voidedBy: req.user.id, voidReason: reason }, { transaction: t });
  const paid = str(cents(s.amountPaid) - cents(p.amount));
  await s.update({ amountPaid: paid, paymentStatus: core.paymentStatus(s.total, paid) }, { transaction: t });
  await audit.log(req, { action: 'CREDIT_PAYMENT_VOIDED', entityType: 'Sale', entityId: s.id, oldValues: old,
    newValues: { ...snap(s), receiptNo: p.receiptNo, amount: p.amount }, reason }, t);
  return { sale: s, payment: p };
});

// Void a COMPLETED credit sale: only while nothing is paid on it (void the payments first). Puts the stock back.
const voidSale = (req, id, reason) => sequelize.transaction(async (t) => {
  const s = await load(id, t);
  if (s.status !== 'COMPLETED') throw new AppError(409, 'BAD_STATE', `Cannot void a sale that is ${s.status}`);
  if (s.salesOrderId) throw new AppError(409, 'FROM_ORDER', 'This sale was created from a sales order. Cancel the sales order instead; it will void this sale and return the stock.');
  if (!reason || reason.trim().length < 3) throw bad('reason', 'A reason is required to void a sale');
  if (cents(s.amountPaid) > 0n) throw new AppError(409, 'HAS_PAYMENTS', 'This sale has payments. Void the payments first, then void the sale.');
  const old = snap(s);
  const doc = await core.restock(t, req, s, reason);
  await s.update({ status: 'VOIDED', voidedAt: new Date(), voidedBy: req.user.id, voidReason: reason, cancelDocumentId: doc.id }, { transaction: t });
  await audit.log(req, { action: 'CREDIT_SALE_VOIDED', entityType: 'Sale', entityId: s.id, oldValues: old, newValues: { ...snap(s), restockDocument: doc.docNo }, reason }, t);
  return s;
});

/* ---------- approval hooks: run inside services/approvals.js's transaction ---------- */
const completeSale = async (r, ctx) => {
  const t = ctx.transaction;
  const s = await Sale.findByPk(r.entityId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!s || s.saleType !== 'CREDIT' || s.status !== 'SUBMITTED') throw new AppError(409, 'BAD_STATE', 'This credit sale is not waiting for approval');
  const customer = await Customer.findByPk(s.customerId, { transaction: t, lock: t.LOCK.UPDATE });   // serialises approvals for the same customer
  const sp = await Salesperson.findByPk(s.salespersonId, { transaction: t });
  if (!customer.isActive) throw new AppError(409, 'CUSTOMER_INACTIVE', 'The customer of this sale is inactive');
  if (!sp.isActive) throw new AppError(409, 'SALESPERSON_INACTIVE', 'The salesperson of this sale is inactive');
  const pos = await position(customer, t);
  if (exceeds(pos, s.total) && !ctx.user.permissions.has('credit_sales.override_limit'))
    throw new AppError(409, 'CREDIT_LIMIT_EXCEEDED',
      `Credit limit exceeded: limit ${pos.creditLimit}, outstanding ${pos.outstanding}, this sale ${s.total}. You need permission to override the limit.`);
  const lines = await SaleLine.findAll({ where: { saleId: s.id }, transaction: t });
  const { doc, stockLines } = await core.issueStock(t, ctx.req, s, lines, customer.name, r.id);
  const old = snap(s);
  await s.update({ status: 'COMPLETED', completedAt: new Date(), stockDocumentId: doc.id }, { transaction: t });
  await audit.log(ctx.req, { action: 'CREDIT_SALE_COMPLETED', entityType: 'Sale', entityId: s.id, oldValues: old,
    newValues: { ...snap(s), stockDocument: doc.docNo, stockLines, limitOverridden: exceeds(pos, s.total) } }, t);
};
const closeSale = (status, action) => async (r, ctx) => {
  const t = ctx.transaction;
  const s = await Sale.findByPk(r.entityId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!s || s.status !== 'SUBMITTED') return;
  await s.update({ status, ...(status === 'CANCELLED' && { cancelledAt: new Date() }) }, { transaction: t });
  await audit.log(ctx.req, { action, entityType: 'Sale', entityId: s.id, oldValues: { status: 'SUBMITTED' },
    newValues: { status, saleNo: s.saleNo }, reason: r.decisionNote || undefined }, t);
};
approvals.register(TYPE, { label: 'Credit sale', approvePermission: 'credit_sales.approve',
  execute: completeSale, onReject: closeSale('REJECTED', 'CREDIT_SALE_REJECTED'), onCancel: closeSale('CANCELLED', 'CREDIT_SALE_CANCELLED') });

module.exports = { create, update, submit, cancel, remove, receivePayment, voidPayment, void: voidSale, position: async (c) => publicPosition(await position(c)),
  internal: { position, exceeds } };   // used by services/salesOrders.js when an approved credit order becomes a credit sale
