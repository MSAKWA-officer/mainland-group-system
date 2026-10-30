import { api } from './client';

// Stock receiving documents. Stock only increases when an approver posts the document.
export const list = (params) => api.get('/stock-receiving', { params }).then((r) => r.data);
export const get = (id) => api.get(`/stock-receiving/${id}`).then((r) => r.data);
export const create = (body) => api.post('/stock-receiving', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/stock-receiving/${id}`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/stock-receiving/${id}`).then((r) => r.data);
// action: submit | cancel | approve | reject
export const act = (id, action, body) => api.post(`/stock-receiving/${id}/${action}`, body).then((r) => r.data);
// Delete a POSTED document (stock goes back; the document stays as Voided). body: { reason }
export const reverse = (id, body) => api.post(`/stock-receiving/${id}/reverse`, body).then((r) => r.data);
// Edit a POSTED document: the old one is reversed and the corrected one is posted. body: full document + changeReason. Returns the NEW document.
export const correct = (id, body) => api.post(`/stock-receiving/${id}/correct`, body).then((r) => r.data);
