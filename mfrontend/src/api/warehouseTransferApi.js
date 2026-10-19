import { api } from './client';

export const list = (params) => api.get('/warehouse-transfers', { params }).then((r) => r.data);
export const get = (id) => api.get(`/warehouse-transfers/${id}`).then((r) => r.data);
export const create = (body) => api.post('/warehouse-transfers', body).then((r) => r.data);
// action: cancel | approve | reject   (reject needs { note })
export const act = (id, action, body) => api.post(`/warehouse-transfers/${id}/${action}`, body || {}).then((r) => r.data);
