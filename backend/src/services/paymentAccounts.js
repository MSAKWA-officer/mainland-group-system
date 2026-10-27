const { Bank, BankAccount } = require('../models');
const banking = require('./banking');
const { bad } = require('./saleCore');

/* Registered accounts (Bank accounts module) that a sale payment can be taken into.
   BANK / CARD -> a bank account, MOBILE_MONEY -> a mobile money account. CASH and CHEQUE need no account. */
const NEEDS_ACCOUNT = ['BANK', 'CARD', 'MOBILE_MONEY'];

// Active accounts in the base currency, without balances (so no bank_accounts permission is needed to choose one).
const list = () => BankAccount.findAll({ where: { isActive: true, currency: banking.BASE_CURRENCY }, attributes: ['id', 'accountNo', 'accountName', 'accountType'],
  include: [{ model: Bank, as: 'bank', attributes: ['id', 'code', 'name', 'shortName'] }], order: [[{ model: Bank, as: 'bank' }, 'name', 'ASC'], ['accountName', 'ASC']] });

// Checks the chosen account for a payment method. Returns the account, or null when the method needs none. `field` names the field in error messages.
async function resolve(method, bankAccountId, t, field = 'bankAccountId') {
  if (!NEEDS_ACCOUNT.includes(method)) return null;
  if (!bankAccountId) throw bad(field, 'Choose the bank or mobile money account');
  const account = await BankAccount.findByPk(bankAccountId, { transaction: t });
  if (!account) throw bad(field, 'Account not found');
  if (!account.isActive) throw bad(field, 'This account is inactive');
  if (account.currency !== banking.BASE_CURRENCY) throw bad(field, `Only ${banking.BASE_CURRENCY} accounts can be used`);
  if ((method === 'MOBILE_MONEY') !== (account.accountType === 'MOBILE_MONEY')) throw bad(field, method === 'MOBILE_MONEY' ? 'Choose a mobile money account' : 'Choose a bank account, not a mobile money account');
  return account;
}
module.exports = { NEEDS_ACCOUNT, list, resolve };
