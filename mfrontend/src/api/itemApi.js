import { api } from './client';

// Read-only item lookup used by the sales order form (needs items.read).
export const list = (params) => api.get('/items', { params }).then((r) => r.data);
export const get = (id) => api.get(`/items/${id}`).then((r) => r.data);
export const create = (body) => api.post('/items', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/items/${id}`, body).then((r) => r.data);
// body: { isActive, reason? } (a reason is needed to deactivate)
export const setStatus = (id, body) => api.patch(`/items/${id}/status`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/items/${id}`).then((r) => r.data);
