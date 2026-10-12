import { api } from './client';

// Money paid OUT (suppliers, landlord, staff...). Money received from customers is customerPaymentApi.
// params: { page, limit, search, expenseId, bankAccountId, method, status (ACTIVE|VOIDED|ALL), from, to, sortBy (paidOn|amount|paymentNo|payee), sortDir }
// Response: { data, total, page, limit, activeTotal }
export const list = (params) => api.get('/payments', { params }).then((r) => r.data);
export const get = (id) => api.get(`/payments/${id}`).then((r) => r.data);
// body: { expenseId? | payee?, amount, method, bankAccountId?, reference?, paidOn?, notes? }
export const create = (body) => api.post('/payments', body).then((r) => r.data);
export const voidPayment = (id, reason) => api.post(`/payments/${id}/void`, { reason }).then((r) => r.data);
