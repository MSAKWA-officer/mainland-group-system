import { api } from './client';

export const list = (params) => api.get('/bank-accounts', { params }).then((r) => r.data);
export const get = (id) => api.get(`/bank-accounts/${id}`).then((r) => r.data);
export const create = (body) => api.post('/bank-accounts', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/bank-accounts/${id}`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/bank-accounts/${id}`).then((r) => r.data);
// body: { isActive, reason? } (a reason is needed to deactivate; the balance must be zero)
export const setStatus = (id, body) => api.patch(`/bank-accounts/${id}/status`, body).then((r) => r.data);
// params: { from?, to?, page?, limit? } (needs bank_accounts.view_balance + bank_transactions.read)
export const statement = (id, params) => api.get(`/bank-accounts/${id}/statement`, { params }).then((r) => r.data);
