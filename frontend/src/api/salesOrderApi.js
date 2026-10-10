import { api } from './client';

export const list = (params) => api.get('/sales-orders', { params }).then((r) => r.data);
export const get = (id) => api.get(`/sales-orders/${id}`).then((r) => r.data);
export const create = (body) => api.post('/sales-orders', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/sales-orders/${id}`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/sales-orders/${id}`).then((r) => r.data);
export const submit = (id) => api.post(`/sales-orders/${id}/submit`).then((r) => r.data);
export const cancel = (id, reason) => api.post(`/sales-orders/${id}/cancel`, { reason }).then((r) => r.data);
// Approving a sales order issues the stock. Rejecting needs a note.
export const approve = (id, note) => api.post(`/sales-orders/${id}/approve`, { note }).then((r) => r.data);
export const reject = (id, note) => api.post(`/sales-orders/${id}/reject`, { note }).then((r) => r.data);
