import { api } from './client';

export const list = (params) => api.get('/efd-devices', { params }).then((r) => r.data);
export const get = (id) => api.get(`/efd-devices/${id}`).then((r) => r.data);
export const create = (body) => api.post('/efd-devices', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/efd-devices/${id}`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/efd-devices/${id}`).then((r) => r.data);
// body: { isActive, reason? } (a reason is needed to deactivate)
export const setStatus = (id, body) => api.patch(`/efd-devices/${id}/status`, body).then((r) => r.data);
