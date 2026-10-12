import { api } from './client';

export const list = (params) => api.get('/approvals', { params }).then((r) => r.data);
export const types = () => api.get('/approvals/types').then((r) => r.data);
export const get = (id) => api.get(`/approvals/${id}`).then((r) => r.data);
export const create = (body) => api.post('/approvals', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/approvals/${id}`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/approvals/${id}`).then((r) => r.data);
// action: submit | cancel | approve | reject
export const act = (id, action, body) => api.post(`/approvals/${id}/${action}`, body).then((r) => r.data);
