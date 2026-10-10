import { api } from './client';

export const list = (params) => api.get('/users', { params }).then((r) => r.data);
export const get = (id) => api.get(`/users/${id}`).then((r) => r.data);
export const create = (body) => api.post('/users', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/users/${id}`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/users/${id}`).then((r) => r.data);
export const setStatus = (id, body) => api.post(`/users/${id}/status`, body).then((r) => r.data);
export const resetPassword = (id, newPassword) => api.post(`/users/${id}/reset-password`, { newPassword });
