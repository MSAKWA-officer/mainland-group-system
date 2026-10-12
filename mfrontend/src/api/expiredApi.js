import { api } from './client';

// Expired stock write-off. Stock only decreases when an approver posts the document.
export const list = (params) => api.get('/stock-expired', { params }).then((r) => r.data);
export const get = (id) => api.get(`/stock-expired/${id}`).then((r) => r.data);
export const create = (body) => api.post('/stock-expired', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/stock-expired/${id}`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/stock-expired/${id}`).then((r) => r.data);
// action: submit | cancel | approve | reject
export const act = (id, action, body) => api.post(`/stock-expired/${id}/${action}`, body).then((r) => r.data);
