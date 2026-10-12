import { api } from './client';

export const list = (params) => api.get('/banks', { params }).then((r) => r.data);
export const get = (id) => api.get(`/banks/${id}`).then((r) => r.data);
export const create = (body) => api.post('/banks', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/banks/${id}`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/banks/${id}`).then((r) => r.data);
// body: { isActive, reason? } (a reason is needed to deactivate)
export const setStatus = (id, body) => api.patch(`/banks/${id}/status`, body).then((r) => r.data);
