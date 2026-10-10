import { api } from './client';

export const list = (params) => api.get('/staff', { params }).then((r) => r.data);
export const get = (id) => api.get(`/staff/${id}`).then((r) => r.data);
export const create = (body) => api.post('/staff', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/staff/${id}`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/staff/${id}`).then((r) => r.data);
// Activate / deactivate. A reason is required when deactivating.
export const setStatus = (id, body) => api.patch(`/staff/${id}/status`, body).then((r) => r.data);
