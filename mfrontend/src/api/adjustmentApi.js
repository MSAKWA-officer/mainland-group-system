import { api } from './client';

// Stock adjustment documents. Stock only changes when an approver posts the document.
export const list = (params) => api.get('/stock-adjustments', { params }).then((r) => r.data);
export const get = (id) => api.get(`/stock-adjustments/${id}`).then((r) => r.data);
export const create = (body) => api.post('/stock-adjustments', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/stock-adjustments/${id}`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/stock-adjustments/${id}`).then((r) => r.data);
// action: submit | cancel | approve | reject
export const act = (id, action, body) => api.post(`/stock-adjustments/${id}/${action}`, body).then((r) => r.data);
