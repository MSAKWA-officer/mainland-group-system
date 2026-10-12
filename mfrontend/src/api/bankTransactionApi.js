import { api } from './client';

// params: { page, limit, search, bankAccountId, type, direction (CREDIT|DEBIT), status (POSTED|VOIDED|ALL), isReconciled, transferGroupId, customerPaymentId, from, to, sortBy (txnDate|amount|txnNo), sortDir }
// Response: { data, total, page, limit }
export const list = (params) => api.get('/bank-transactions', { params }).then((r) => r.data);
export const get = (id) => api.get(`/bank-transactions/${id}`).then((r) => r.data);
// body: { bankAccountId, type (DEPOSIT|WITHDRAWAL|CHARGE|INTEREST), amount, txnDate?, counterparty?, reference?, description? } (a reference or description is required)
export const create = (body) => api.post('/bank-transactions', body).then((r) => r.data);
// body: { fromAccountId, toAccountId, amount, txnDate?, reference?, description? } -> { out, in }
export const transfer = (body) => api.post('/bank-transactions/transfer', body).then((r) => r.data);
// Transactions are never edited or deleted. A mistake is voided with a reason (a transfer voids both legs).
export const voidTxn = (id, reason) => api.post(`/bank-transactions/${id}/void`, { reason }).then((r) => r.data);
export const reconcile = (id, reconciled) => api.patch(`/bank-transactions/${id}/reconcile`, { reconciled }).then((r) => r.data);
