import { api } from './client';

// Damaged stock write-off. Stock only decreases when an approver posts the document.
export const list = (params) => api.get('/stock-damaged', { params }).then((r) => r.data);
export const get = (id) => api.get(`/stock-damaged/${id}`).then((r) => r.data);
export const create = (body) => api.post('/stock-damaged', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/stock-damaged/${id}`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/stock-damaged/${id}`).then((r) => r.data);
// action: submit | cancel | approve | reject
export const act = (id, action, body) => api.post(`/stock-damaged/${id}/${action}`, body).then((r) => r.data);
