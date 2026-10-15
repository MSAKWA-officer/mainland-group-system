// Run from the backend folder (same level as package.json).
//
//   node scripts/backfill-sales-from-orders.js                      -> DRY RUN: only lists CONFIRMED orders that have no sale
//   node scripts/backfill-sales-from-orders.js --apply              -> creates the missing sales
//   node scripts/backfill-sales-from-orders.js --apply --order SO-2026-000012 --type CREDIT
//                                                                   -> only that order, and set it as CASH or CREDIT first
//
// Why: an order approved while the new "order -> sale" code (or its database columns) was not active has no record in `sales`,
// so it never shows on the Sales / Cash sales / Credit sales pages. This creates that record the same way approval does
// (services/salesOrders.js createSaleFromOrder). STOCK IS NOT TOUCHED: the sale re-uses the order's existing stock document.
// Orders that were created before the sale-type feature all have the default type CASH. If one was really a credit sale,
// pass --order <no> --type CREDIT (a credit sale is created UNPAID with a due date; the credit limit is not re-checked).
require('dotenv').config();

const { sequelize, SalesOrder, SalesOrderLine, Sale, Customer, StockDocument, User, Role } = require('../src/models');
const audit = require('../src/services/audit');
const orders = require('../src/services/salesOrders');

const arg = (name) => { const i = process.argv.indexOf(name); return i === -1 ? undefined : process.argv[i + 1]; };
const APPLY = process.argv.includes('--apply');
const ONLY = arg('--order');
const TYPE = arg('--type');

(async () => {
  if (TYPE && !['CASH', 'CREDIT'].includes(TYPE)) throw new Error('--type must be CASH or CREDIT');
  if (TYPE && !ONLY) throw new Error('--type can only be used together with --order <orderNo>');
  await sequelize.authenticate();

  const todo = await SalesOrder.findAll({
    where: { status: 'CONFIRMED', ...(ONLY && { orderNo: ONLY }) },
    include: [{ model: Sale, as: 'sale', required: false, attributes: ['id'] }], order: [['createdAt', 'ASC']],
  });
  const missing = todo.filter((o) => !o.sale);
  if (ONLY && !todo.length) throw new Error(`No CONFIRMED order ${ONLY} found`);
  if (ONLY && todo.length && !missing.length) { console.log(`${ONLY} already has a sale. Nothing to do.`); return; }
  if (!missing.length) { console.log('No CONFIRMED order is missing its sale. Nothing to do.'); return; }

  console.log(`${missing.length} CONFIRMED order(s) without a sale:`);
  missing.forEach((o) => console.log(`  ${o.orderNo}  ${TYPE || o.saleType}  total ${o.total}  confirmed ${o.confirmedAt ? o.confirmedAt.toISOString().slice(0, 10) : '-'}`));
  if (!APPLY) { console.log('\nDRY RUN. Nothing was changed. Add --apply to create these sales.'); return; }

  // The audit trail needs a real user as the actor: use the first active Owner.
  const actor = await User.findOne({ where: { status: 'ACTIVE' }, include: [{ model: Role, as: 'role', required: true, where: { code: 'OWNER' } }], order: [['createdAt', 'ASC']] });
  if (!actor) throw new Error('No active Owner user found to record in the audit log');
  actor.permissions = new Set();
  const req = { user: actor, ip: null, headers: { 'user-agent': 'backfill-sales-from-orders' } };

  let done = 0;
  for (const m of missing) {
    try {
      await sequelize.transaction(async (t) => {
        const o = await SalesOrder.findByPk(m.id, { transaction: t, lock: t.LOCK.UPDATE });
        if (o.status !== 'CONFIRMED') throw new Error(`is now ${o.status}`);
        if (await Sale.findOne({ where: { salesOrderId: o.id }, transaction: t })) throw new Error('already has a sale');
        if (!o.stockDocumentId) throw new Error('has no stock document (stock was never issued), so it cannot be turned into a sale');
        const doc = await StockDocument.findByPk(o.stockDocumentId, { transaction: t });
        if (!doc || doc.status !== 'POSTED') throw new Error('its stock document is not POSTED');
        if (TYPE && TYPE !== o.saleType) {
          const old = { saleType: o.saleType };
          await o.update({ saleType: TYPE, ...(TYPE === 'CREDIT' ? { paymentMethod: null, paymentReference: null } : { dueDate: null, paymentMethod: o.paymentMethod || 'CASH' }) }, { transaction: t });
          await audit.log(req, { action: 'SALES_ORDER_TYPE_CORRECTED', entityType: 'SalesOrder', entityId: o.id, oldValues: old, newValues: { saleType: TYPE, orderNo: o.orderNo }, reason: 'Backfill' }, t);
        }
        const customer = await Customer.findByPk(o.customerId, { transaction: t });
        const lines = await SalesOrderLine.findAll({ where: { orderId: o.id }, order: [['itemId', 'ASC']], transaction: t });
        const sale = await orders.createSaleFromOrder({ req, user: actor }, o, customer, lines, doc, false, t);
        await audit.log(req, { action: 'SALE_BACKFILLED_FROM_ORDER', entityType: 'Sale', entityId: sale.id, newValues: { saleNo: sale.saleNo, saleType: sale.saleType, orderNo: o.orderNo } }, t);
        console.log(`  OK    ${o.orderNo} -> ${sale.saleNo} (${sale.saleType})`);
      });
      done++;
    } catch (e) { console.log(`  SKIP  ${m.orderNo}: ${e.message}`); }
  }
  console.log(`\nCreated ${done} of ${missing.length}.`);
})().catch((e) => { console.error('FAILED:', e.message); process.exitCode = 1; }).finally(() => sequelize.close());