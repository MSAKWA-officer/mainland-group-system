import { api } from './client';

// params: { page, limit, search, category, status (PENDING|APPROVED|REJECTED|VOIDED|ALL), paymentStatus (UNPAID|PARTIAL|PAID), createdBy, from, to, sortBy, sortDir }
// Response: { data, total, page, limit, approvedTotal }
export const list = (params) => api.get('/expenses', { params }).then((r) => r.data);
// params: { from?, to? } -> { total, categories: [{ category, count, total }] } (approved expenses only)
export const summary = (params) => api.get('/expenses/summary', { params }).then((r) => r.data);
export const get = (id) => api.get(`/expenses/${id}`).then((r) => r.data);
export const create = (body) => api.post('/expenses', body).then((r) => r.data);
// Only the person who submitted it, and only while it is PENDING.
export const update = (id, body) => api.patch(`/expenses/${id}`, body).then((r) => r.data);
export const approve = (id, note) => api.post(`/expenses/${id}/approve`, { note: note || null }).then((r) => r.data);
export const reject = (id, note) => api.post(`/expenses/${id}/reject`, { note }).then((r) => r.data);
// Refused while the expense has active payments.
export const voidExpense = (id, reason) => api.post(`/expenses/${id}/void`, { reason }).then((r) => r.data);
