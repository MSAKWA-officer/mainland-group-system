import { api } from './client';

export const list = (params) => api.get('/efd-z-reports', { params }).then((r) => r.data);
export const get = (id) => api.get(`/efd-z-reports/${id}`).then((r) => r.data);
export const create = (body) => api.post('/efd-z-reports', body).then((r) => r.data);
// Only your own PENDING report can be edited, and the device cannot be changed (void it and record a new one).
export const update = (id, body) => api.patch(`/efd-z-reports/${id}`, body).then((r) => r.data);
export const verify = (id, note) => api.post(`/efd-z-reports/${id}/verify`, { note: note || null }).then((r) => r.data);
export const reject = (id, note) => api.post(`/efd-z-reports/${id}/reject`, { note }).then((r) => r.data);
// A Z report is a fiscal record: it is never deleted, only voided (a reason is required).
export const voidReport = (id, reason) => api.post(`/efd-z-reports/${id}/void`, { reason }).then((r) => r.data);
