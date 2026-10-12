import { api } from './client';

export const list = (params) => api.get('/customers', { params }).then((r) => r.data);
export const get = (id) => api.get(`/customers/${id}`).then((r) => r.data);
export const create = (body) => api.post('/customers', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/customers/${id}`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/customers/${id}`).then((r) => r.data);
// Activate / deactivate. A reason is required when deactivating.
export const setStatus = (id, body) => api.patch(`/customers/${id}/status`, body).then((r) => r.data);
