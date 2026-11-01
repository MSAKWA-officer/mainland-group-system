import { api } from './client';

// Money received into a bank account and earmarked for a purpose. Flow: POSTED -> VOIDED. Each receipt posts one DEPOSIT to the bank ledger.
// params: { page, limit, search, bankAccountId, source (OWNER_CAPITAL|HEAD_OFFICE|LOAN|GRANT|OTHER), purpose (FUEL|EXPENSES|OTHER), status (POSTED|VOIDED|ALL), from, to, sortBy (receiptDate|amount|receiptNo), sortDir }
// Response: { data, total, page, limit, postedTotal }
export const list = (params) => api.get('/fund-receipts', { params }).then((r) => r.data);
// params: { from?, to?, groupBy (purpose|source|account) } -> { groupBy, total, rows: [{ label, count, total }] } (posted receipts only)
export const summary = (params) => api.get('/fund-receipts/summary', { params }).then((r) => r.data);
// Also returns voider and bankTransactions (the ledger row posted at creation).
export const get = (id) => api.get(`/fund-receipts/${id}`).then((r) => r.data);
// body: { bankAccountId, source, receivedFrom, purpose, amount, receiptDate?, reference?, notes? }
export const create = (body) => api.post('/fund-receipts', body).then((r) => r.data);
// Voids the receipt and its bank row. Refused when the row is reconciled or when the account no longer holds the money.
export const voidReceipt = (id, reason) => api.post(`/fund-receipts/${id}/void`, { reason }).then((r) => r.data);
