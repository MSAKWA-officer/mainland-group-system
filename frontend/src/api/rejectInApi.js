import { api } from './client';

// Reject in = customer returns. Stock only increases when an approver posts the document.
export const list = (params) => api.get('/stock-reject-in', { params }).then((r) => r.data);
export const get = (id) => api.get(`/stock-reject-in/${id}`).then((r) => r.data);
export const create = (body) => api.post('/stock-reject-in', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/stock-reject-in/${id}`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/stock-reject-in/${id}`).then((r) => r.data);
// action: submit | cancel | approve | reject
export const act = (id, action, body) => api.post(`/stock-reject-in/${id}/${action}`, body).then((r) => r.data);
