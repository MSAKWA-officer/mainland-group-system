const { Bank, BankAccount, BankTransaction } = require('../models');
const banking = require('./banking');
const { bad } = require('./saleCore');

/* Registered accounts (Bank accounts module) that a Cash / Credit sale payment can be taken into.
   BANK / CARD -> a bank account, MOBILE_MONEY -> a mobile money account. CASH and CHEQUE need no account.
   Money taken into an account is POSTED to the bank ledger (a CREDIT row), so the account balance goes up; voiding the payment voids that row. */
const NEEDS_ACCOUNT = ['BANK', 'CARD', 'MOBILE_MONEY'];

// Active accounts in the base currency, without balances (so no bank_accounts permission is needed to choose one).
const list = () => BankAccount.findAll({ where: { isActive: true, currency: banking.BASE_CURRENCY }, attributes: ['id', 'accountNo', 'accountName', 'accountType'],
  include: [{ model: Bank, as: 'bank', attributes: ['id', 'code', 'name', 'shortName'] }], order: [[{ model: Bank, as: 'bank' }, 'name', 'ASC'], ['accountName', 'ASC']] });

// Checks the chosen account for a payment method and LOCKS it (needed before posting). Returns the account, or null when the method needs none.
async function resolve(method, bankAccountId, t, field = 'bankAccountId') {
  if (!NEEDS_ACCOUNT.includes(method)) return null;
  if (!bankAccountId) throw bad(field, 'Choose the bank or mobile money account');
  const account = await BankAccount.findByPk(bankAccountId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!account) throw bad(field, 'Account not found');
  if (!account.isActive) throw bad(field, 'This account is inactive');
  if (account.currency !== banking.BASE_CURRENCY) throw bad(field, `Only ${banking.BASE_CURRENCY} accounts can be used`);
  if ((method === 'MOBILE_MONEY') !== (account.accountType === 'MOBILE_MONEY')) throw bad(field, method === 'MOBILE_MONEY' ? 'Choose a mobile money account' : 'Choose a bank account, not a mobile money account');
  return account;
}

// Posts the money received to the account's ledger. `account` must come from resolve() (locked). Returns the ledger row.
const postReceipt = (req, account, { amount, txnDate, reference, sale, payment, counterparty }, t) =>
  banking.post(req, { account, type: 'CUSTOMER_PAYMENT', amount, txnDate, reference: reference ?? payment.receiptNo,
    description: `${sale.saleNo} - receipt ${payment.receiptNo}`.slice(0, 255), counterparty: counterparty ? String(counterparty).slice(0, 150) : null, salePaymentId: payment.id }, t);

// Voids the ledger rows made by these sale payments (the money leaves the account again). A reconciled row, or one whose reversal would overdraw the account, stops the void.
async function voidReceipts(req, salePaymentIds, reason, t) {
  if (!salePaymentIds.length) return;
  const txns = await BankTransaction.findAll({ where: { salePaymentId: salePaymentIds, status: 'POSTED' }, attributes: ['id', 'bankAccountId'], transaction: t });
  if (!txns.length) return;
  const accs = await banking.lockAccounts(txns.map((x) => x.bankAccountId), t);
  const rows = await BankTransaction.findAll({ where: { id: txns.map((x) => x.id) }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE });
  for (const x of rows) await banking.voidLeg(req, x, accs.get(x.bankAccountId), reason, t);
}
module.exports = { NEEDS_ACCOUNT, list, resolve, postReceipt, voidReceipts };
