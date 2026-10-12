import { api } from './client';

export const list = (params) => api.get('/discounts', { params }).then((r) => r.data);
export const get = (id) => api.get(`/discounts/${id}`).then((r) => r.data);
export const create = (body) => api.post('/discounts', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/discounts/${id}`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/discounts/${id}`).then((r) => r.data);
// body: { isActive, reason? } (a reason is needed to deactivate)
export const setStatus = (id, body) => api.patch(`/discounts/${id}/status`, body).then((r) => r.data);
// Discounts usable right now for one item + customer + quantity (needs only discounts.apply). Used by the order form.
export const available = (params) => api.get('/discounts/available', { params }).then((r) => r.data);
