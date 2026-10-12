import { api } from './client';

export const list = (params) => api.get('/categories', { params }).then((r) => r.data);
export const get = (id) => api.get(`/categories/${id}`).then((r) => r.data);
export const create = (body) => api.post('/categories', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/categories/${id}`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/categories/${id}`).then((r) => r.data);
