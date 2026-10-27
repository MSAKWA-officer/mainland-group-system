const { sequelize, Sale, SaleLine, SalePayment } = require('../models');
const paymentAccounts = require('./paymentAccounts');
const audit = require('./audit');
const core = require('./saleCore');
const { AppError } = require('../utils/errors');

/* Cash sale = counter sale. Paid in full at the till, stock is issued immediately (FEFO), and the sale is COMPLETED in ONE transaction:
   either the sale, the payment, the stock movements and the audit entry are all saved, or none are.
   A completed cash sale is never edited or deleted. A mistake is fixed with VOID, which puts the stock back (reversing ledger entry). */
const { bad, snap } = core;

const create = (req, body) => sequelize.transaction(async (t) => {
  const { customer, salesperson } = await core.resolveParties(req, 'CASH', body, t);
  const rows = await core.normalizeLines(req, 'CASH', body.lines, t);
  const taxRate = body.taxRate ?? 0;
  const tot = core.totals(rows, taxRate);
  const total = core.cents(tot.total);
  if (total <= 0n) throw bad('lines', 'The sale total must be greater than zero');

  // Payment: the customer pays the full amount. For CASH the tendered amount may be higher (change is returned).
  const { method, reference, bankAccountId } = body.payment;
  // BANK / CARD must use a registered bank account, MOBILE_MONEY a registered mobile money account (Bank accounts module). The account is locked for posting.
  const account = await paymentAccounts.resolve(method, bankAccountId, t, 'payment.bankAccountId');
  let tendered = null;
  if (method === 'CASH') {
    tendered = body.payment.amountTendered ?? Number(tot.total);
    if (core.cents(tendered) < total) throw bad('payment.amountTendered', `Amount received is less than the total (${tot.total})`);
  }

  const saleNo = `${core.TYPES.CASH.prefix}-${core.year()}-${core.pad(await core.nextNo('cash_sale_seq', t))}`;
  const sale = await Sale.create({ saleNo, saleType: 'CASH', customerId: customer?.id ?? null,
    walkInName: customer ? null : body.walkInName ?? null, walkInPhone: customer ? null : body.walkInPhone ?? null,
    salespersonId: salesperson?.id ?? null, status: 'DRAFT', notes: body.notes ?? null, taxRate, ...tot, createdBy: req.user.id }, { transaction: t });
  const lines = await SaleLine.bulkCreate(rows.map((r) => ({ ...r, saleId: sale.id })), { transaction: t });
  const { doc, stockLines } = await core.issueStock(t, req, sale, lines, customer?.name || body.walkInName || 'Walk-in customer');
  const payment = await SalePayment.create({ receiptNo: `RCP-${core.year()}-${core.pad(await core.nextNo('sale_receipt_seq', t))}`, saleId: sale.id,
    amount: tot.total, tendered, method, reference: reference ?? null, bankAccountId: account?.id ?? null, receivedBy: req.user.id }, { transaction: t });
  // The full sale amount goes into the chosen account's ledger, so its balance increases (not the cash tendered: change is only returned for CASH).
  const bankTxn = account ? await paymentAccounts.postReceipt(req, account, { amount: tot.total, reference, sale, payment, counterparty: customer?.name || body.walkInName || 'Walk-in customer' }, t) : null;
  await sale.update({ status: 'COMPLETED', completedAt: new Date(), amountPaid: tot.total, paymentStatus: 'PAID', stockDocumentId: doc.id }, { transaction: t });
  await audit.log(req, { action: 'CASH_SALE_COMPLETED', entityType: 'Sale', entityId: sale.id,
    newValues: { ...snap(sale), method, bankAccountId: account?.id ?? null, bankTxnNo: bankTxn?.txnNo ?? null, lines: rows.length, stockDocument: doc.docNo, stockLines } }, t);
  return sale;
});

const void_ = (req, id, reason) => sequelize.transaction(async (t) => {
  const sale = await Sale.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!sale || sale.saleType !== 'CASH') throw new AppError(404, 'NOT_FOUND', 'Cash sale not found');
  if (sale.status !== 'COMPLETED') throw new AppError(409, 'BAD_STATE', `Cannot void a sale that is ${sale.status}`);
  if (sale.salesOrderId) throw new AppError(409, 'FROM_ORDER', 'This sale was created from a sales order. Cancel the sales order instead; it will void this sale and return the stock.');
  if (!reason || reason.trim().length < 3) throw bad('reason', 'A reason is required to void a sale');
  const old = snap(sale);
  // Take the money back out of the bank / mobile money account first (stops the void if that row is reconciled or the account would go below zero).
  const paid = await SalePayment.findAll({ where: { saleId: sale.id, voidedAt: null }, attributes: ['id'], transaction: t });
  await paymentAccounts.voidReceipts(req, paid.map((x) => x.id), `Cash sale ${sale.saleNo} voided: ${reason}`, t);
  const doc = await core.restock(t, req, sale, reason);
  await SalePayment.update({ voidedAt: new Date(), voidedBy: req.user.id, voidReason: `Sale voided: ${reason}`.slice(0, 500) },
    { where: { saleId: sale.id, voidedAt: null }, transaction: t });
  await sale.update({ status: 'VOIDED', voidedAt: new Date(), voidedBy: req.user.id, voidReason: reason, cancelDocumentId: doc.id }, { transaction: t });
  await audit.log(req, { action: 'CASH_SALE_VOIDED', entityType: 'Sale', entityId: sale.id, oldValues: old,
    newValues: { ...snap(sale), restockDocument: doc.docNo }, reason }, t);
  return sale;
});

module.exports = { create, void: void_ };
