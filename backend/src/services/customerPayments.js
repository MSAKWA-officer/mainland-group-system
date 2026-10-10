const { Op, literal } = require('sequelize');
const { sequelize, Sale, SalePayment, Customer, BankAccount, Bank, BankTransaction, CustomerPayment, CustomerPaymentAllocation, User } = require('../models');
const { AppError } = require('../utils/errors');
const { like } = require('../utils/schemas');
const audit = require('./audit');
const core = require('./saleCore');
const banking = require('./banking');
const { mine, canAll } = require('./salesScope');

/* Customer payments = money received from a customer, applied to their open CREDIT sales and (optionally) paid into one of our bank accounts.
   - One payment can settle several sales. If the client sends no allocations the money is applied oldest-due-first (FIFO).
   - The payment must be fully applied: there is no "customer credit" balance, so paying more than is owed is refused.
   - Each allocation writes a normal `sale_payments` row, so Credit Sales, Payment History, Customer Balances and Credit Ageing all stay correct.
   - When a bank account is chosen, a CUSTOMER_PAYMENT credit is posted to the bank ledger in the SAME database transaction.
   - Voiding reverses everything together (sale payments, sale balances, bank ledger) or nothing at all.
   Lock order is always: customer -> sales (by id) -> bank account -> ledger rows, so concurrent requests cannot deadlock. */
const { cents, str, bad } = core;
const PERM_ALL = 'customer_payments.read_all';
const NEEDS_BANK = ['BANK', 'CHEQUE', 'CARD'];

const audited = (p) => ({ paymentNo: p.paymentNo, customerId: p.customerId, amount: p.amount, method: p.method, bankAccountId: p.bankAccountId,
  reference: p.reference, paidOn: p.paidOn, status: p.status });

// A user without read_all only sees payments of customers that belong to their own salesperson profile. Anyone else's looks like "not found".
async function visibleCustomer(req, customerId, t) {
  const c = await Customer.findByPk(customerId, { transaction: t, ...(t && { lock: t.LOCK.UPDATE }) });
  if (!c) throw new AppError(404, 'NOT_FOUND', 'Customer not found');
  if (canAll(req, PERM_ALL)) return c;
  const sp = await mine(req);
  if (!sp) throw new AppError(403, 'NO_SALESPERSON_PROFILE', 'Your account is not linked to a salesperson profile. Ask an administrator to link it.');
  if (c.salespersonId !== sp.id) throw new AppError(404, 'NOT_FOUND', 'Customer not found');
  return c;
}
const customerFilter = async (req) => {
  if (canAll(req, PERM_ALL)) return {};
  const sp = await mine(req);
  return { salespersonId: sp ? sp.id : '00000000-0000-0000-0000-000000000000' };
};

/* ---------- create ---------- */
const create = (req, body) => sequelize.transaction(async (t) => {
  const customer = await visibleCustomer(req, body.customerId, t);                     // locks the customer: serialises payments per customer
  const amount = cents(body.amount);
  if (amount <= 0n) throw bad('amount', 'Amount must be greater than 0');
  if (NEEDS_BANK.includes(body.method) && !body.bankAccountId) throw bad('bankAccountId', 'Choose the bank account this payment was paid into');
  if (body.method !== 'CASH' && !body.reference) throw bad('reference', 'A payment reference is required for this method');

  if (body.bankAccountId) {                                                            // early, lock-free checks for friendly errors; the account is locked later
    const acc = await BankAccount.findByPk(body.bankAccountId, { transaction: t });
    if (!acc) throw bad('bankAccountId', 'Bank account not found');
    if (!acc.isActive) throw bad('bankAccountId', 'This bank account is inactive');
    if (acc.currency !== banking.BASE_CURRENCY) throw bad('bankAccountId', `Customer payments can only go into ${banking.BASE_CURRENCY} accounts`);
  }
  const today = await core.dbToday(t);
  const paidOn = body.paidOn ?? today;
  if (paidOn > today) throw bad('paidOn', 'Payment date cannot be in the future');

  // ---- decide which sales get the money ----
  let candidateIds;
  if (body.allocations?.length) candidateIds = body.allocations.map((a) => a.saleId);
  else {
    const open = await Sale.findAll({ attributes: ['id'], transaction: t,
      where: { customerId: customer.id, saleType: 'CREDIT', status: 'COMPLETED', [Op.and]: literal('"Sale"."total" > "Sale"."amount_paid"') } });
    candidateIds = open.map((s) => s.id);
  }
  if (!candidateIds.length) throw new AppError(409, 'NOTHING_DUE', 'This customer has no unpaid credit sales');
  const locked = await Sale.findAll({ where: { id: candidateIds }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE });   // id order = same as every other writer
  const byId = new Map(locked.map((s) => [s.id, s]));

  const plan = [];                                                                     // [{ sale, amount (cents) }]
  if (body.allocations?.length) {
    let total = 0n;
    body.allocations.forEach((a, i) => {
      const s = byId.get(a.saleId);
      const f = `allocations.${i}.`;
      if (!s || s.customerId !== customer.id || s.saleType !== 'CREDIT') throw bad(`${f}saleId`, 'Credit sale not found for this customer');
      if (s.status !== 'COMPLETED') throw new AppError(409, 'BAD_STATE', `${s.saleNo} is ${s.status}. Payments can only be applied to completed sales.`);
      const bal = cents(s.total) - cents(s.amountPaid);
      const amt = cents(a.amount);
      if (amt <= 0n) throw bad(`${f}amount`, 'Amount must be greater than 0');
      if (amt > bal) throw new AppError(409, 'OVERPAYMENT', `${s.saleNo}: amount is more than the balance (${str(bal)})`, [{ field: `${f}amount`, message: `Balance is ${str(bal)}` }]);
      total += amt; plan.push({ sale: s, amount: amt });
    });
    if (total !== amount) throw bad('allocations', `Allocations add up to ${str(total)} but the payment is ${str(amount)}`);
  } else {
    const open = locked.filter((s) => s.status === 'COMPLETED' && cents(s.total) > cents(s.amountPaid))
      .sort((a, b) => String(a.dueDate ?? a.saleDate).localeCompare(String(b.dueDate ?? b.saleDate)) || String(a.saleDate).localeCompare(String(b.saleDate)) || a.saleNo.localeCompare(b.saleNo));
    let left = amount; let owed = 0n;
    for (const s of open) {
      const bal = cents(s.total) - cents(s.amountPaid); owed += bal;
      if (left <= 0n) continue;
      const take = bal < left ? bal : left;
      plan.push({ sale: s, amount: take }); left -= take;
    }
    if (left > 0n) throw new AppError(409, 'OVERPAYMENT', `Amount is more than what ${customer.name} owes (${str(owed)})`, [{ field: 'amount', message: `Outstanding is ${str(owed)}` }]);
  }
  for (const { sale } of plan) if (paidOn < sale.saleDate) throw bad('paidOn', `Payment date cannot be before the date of sale ${sale.saleNo} (${sale.saleDate})`);

  // ---- write ----
  const payment = await CustomerPayment.create({
    paymentNo: `CPY-${core.year()}-${core.pad(await core.nextNo('customer_payment_seq', t))}`, customerId: customer.id, amount: str(amount), method: body.method,
    bankAccountId: body.bankAccountId ?? null, reference: body.reference ?? null, paidOn, notes: body.notes ?? null, status: 'ACTIVE', receivedBy: req.user.id,
  }, { transaction: t });
  for (const { sale, amount: part } of plan) {
    const sp = await SalePayment.create({ receiptNo: `RCP-${core.year()}-${core.pad(await core.nextNo('sale_receipt_seq', t))}`, saleId: sale.id, amount: str(part),
      method: body.method, reference: body.reference ?? payment.paymentNo, paidOn, notes: body.notes ?? `Customer payment ${payment.paymentNo}`, receivedBy: req.user.id }, { transaction: t });
    await CustomerPaymentAllocation.create({ customerPaymentId: payment.id, saleId: sale.id, salePaymentId: sp.id, amount: str(part) }, { transaction: t });
    const paid = str(cents(sale.amountPaid) + part); const old = core.snap(sale);
    await sale.update({ amountPaid: paid, paymentStatus: core.paymentStatus(sale.total, paid) }, { transaction: t });
    await audit.log(req, { action: 'CREDIT_PAYMENT_RECEIVED', entityType: 'Sale', entityId: sale.id, oldValues: old,
      newValues: { ...core.snap(sale), receiptNo: sp.receiptNo, amount: sp.amount, method: sp.method, customerPayment: payment.paymentNo } }, t);
  }
  let bankTxn = null;
  if (body.bankAccountId) {
    const account = await banking.lockAccount(body.bankAccountId, t);
    bankTxn = await banking.post(req, { account, type: 'CUSTOMER_PAYMENT', amount: str(amount), txnDate: paidOn, reference: body.reference ?? payment.paymentNo,
      description: `Payment ${payment.paymentNo} from ${customer.name}`, counterparty: customer.name, customerPaymentId: payment.id }, t);
  }
  await audit.log(req, { action: 'CUSTOMER_PAYMENT_RECEIVED', entityType: 'CustomerPayment', entityId: payment.id,
    newValues: { ...audited(payment), sales: plan.map((p) => `${p.sale.saleNo}:${str(p.amount)}`), bankTxnNo: bankTxn?.txnNo ?? null } }, t);
  return payment.id;
});

/* ---------- void ---------- */
const voidPayment = (req, id, reason) => sequelize.transaction(async (t) => {
  if (!reason || reason.trim().length < 3) throw bad('reason', 'A reason is required to void a payment');
  const peek = await CustomerPayment.findByPk(id, { transaction: t });
  if (!peek) throw new AppError(404, 'NOT_FOUND', 'Customer payment not found');
  await visibleCustomer(req, peek.customerId);                                          // hides other people's payments
  const allocs = await CustomerPaymentAllocation.findAll({ where: { customerPaymentId: id }, transaction: t });
  const sales = await Sale.findAll({ where: { id: allocs.map((a) => a.saleId) }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE });
  const p = await CustomerPayment.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (p.status === 'VOIDED') throw new AppError(409, 'BAD_STATE', 'This payment is already voided');
  const saleById = new Map(sales.map((s) => [s.id, s]));
  const old = audited(p);

  for (const a of allocs) {
    const sp = await SalePayment.findByPk(a.salePaymentId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!sp || sp.voidedAt) continue;                                                   // already reversed elsewhere
    const s = saleById.get(a.saleId); const before = core.snap(s);
    await sp.update({ voidedAt: new Date(), voidedBy: req.user.id, voidReason: `Customer payment ${p.paymentNo} voided: ${reason}` }, { transaction: t });
    const paid = str(cents(s.amountPaid) - cents(sp.amount));
    await s.update({ amountPaid: paid, paymentStatus: core.paymentStatus(s.total, paid) }, { transaction: t });
    await audit.log(req, { action: 'CREDIT_PAYMENT_VOIDED', entityType: 'Sale', entityId: s.id, oldValues: before,
      newValues: { ...core.snap(s), receiptNo: sp.receiptNo, amount: sp.amount, customerPayment: p.paymentNo }, reason }, t);
  }
  const txns = await BankTransaction.findAll({ where: { customerPaymentId: p.id, status: 'POSTED' }, attributes: ['id', 'bankAccountId'], transaction: t });
  if (txns.length) {
    const accs = await banking.lockAccounts(txns.map((x) => x.bankAccountId), t);
    const rows = await BankTransaction.findAll({ where: { id: txns.map((x) => x.id) }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE });
    for (const x of rows) await banking.voidLeg(req, x, accs.get(x.bankAccountId), `Customer payment ${p.paymentNo} voided: ${reason}`, t);
  }
  await p.update({ status: 'VOIDED', voidedAt: new Date(), voidedBy: req.user.id, voidReason: reason }, { transaction: t });
  await audit.log(req, { action: 'CUSTOMER_PAYMENT_VOIDED', entityType: 'CustomerPayment', entityId: p.id, oldValues: old, newValues: audited(p), reason }, t);
  return p.id;
});

/* ---------- read ---------- */
const includes = (custWhere) => [
  { model: Customer, as: 'customer', attributes: ['id', 'code', 'name', 'salespersonId'], ...(custWhere && Object.keys(custWhere).length && { where: custWhere, required: true }) },
  { model: BankAccount, as: 'bankAccount', attributes: ['id', 'accountNo', 'accountName', 'currency'], include: [{ model: Bank, as: 'bank', attributes: ['id', 'code', 'name'] }] },
  { model: User, as: 'receiver', attributes: ['id', 'fullName'] },
];
const SORT = { paidOn: 'paidOn', amount: 'amount', paymentNo: 'paymentNo' };

async function list(req, q) {
  const where = {};
  if (q.status !== 'ALL') where.status = q.status;
  for (const k of ['customerId', 'bankAccountId', 'method']) if (q[k]) where[k] = q[k];
  if (q.from || q.to) where.paidOn = { ...(q.from && { [Op.gte]: q.from }), ...(q.to && { [Op.lte]: q.to }) };
  if (q.search) where[Op.or] = [{ paymentNo: { [Op.iLike]: like(q.search) } }, { reference: { [Op.iLike]: like(q.search) } },
    { '$customer.name$': { [Op.iLike]: like(q.search) } }, { '$customer.code$': { [Op.iLike]: like(q.search) } }];
  const order = q.sortBy === 'customer' ? [[{ model: Customer, as: 'customer' }, 'name', q.sortDir.toUpperCase()]] : [[SORT[q.sortBy], q.sortDir.toUpperCase()], ['createdAt', 'DESC']];
  const { rows, count } = await CustomerPayment.findAndCountAll({ where, include: includes(await customerFilter(req)), order, limit: q.limit, offset: (q.page - 1) * q.limit, distinct: true, subQuery: false });
  return { data: rows, total: count, page: q.page, limit: q.limit };
}

async function getOne(req, id) {
  const p = await CustomerPayment.findOne({ where: { id }, include: [...includes(await customerFilter(req)),
    { model: CustomerPaymentAllocation, as: 'allocations', include: [{ model: Sale, as: 'sale', attributes: ['id', 'saleNo', 'saleDate', 'dueDate', 'total', 'amountPaid', 'paymentStatus'] },
      { model: SalePayment, as: 'salePayment', attributes: ['id', 'receiptNo', 'voidedAt'] }] },
    { model: BankTransaction, as: 'bankTransactions', attributes: ['id', 'txnNo', 'status', 'txnDate', 'isReconciled'] },
    { model: User, as: 'voider', attributes: ['id', 'fullName'] }] });
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Customer payment not found');
  return p;
}

// Open credit sales of a customer (what a payment can still be applied to), oldest due first. Used by the "receive payment" screen.
async function openSales(req, customerId) {
  const c = await visibleCustomer(req, customerId);
  const rows = await Sale.findAll({ where: { customerId: c.id, saleType: 'CREDIT', status: 'COMPLETED', [Op.and]: literal('"Sale"."total" > "Sale"."amount_paid"') },
    attributes: ['id', 'saleNo', 'saleDate', 'dueDate', 'total', 'amountPaid', 'paymentStatus', [literal('("Sale"."total" - "Sale"."amount_paid")::text'), 'balance']],
    order: [['dueDate', 'ASC'], ['saleDate', 'ASC'], ['saleNo', 'ASC']] });
  return { customer: { id: c.id, code: c.code, name: c.name }, data: rows };
}

module.exports = { create, void: voidPayment, list, getOne, openSales };
