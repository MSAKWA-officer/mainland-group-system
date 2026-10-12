import { api } from './client';

export const list = (params) => api.get('/efd-reconciliations', { params }).then((r) => r.data);
export const get = (id) => api.get(`/efd-reconciliations/${id}`).then((r) => r.data);
// Shows the figures for a device and day without saving anything. params: { deviceId, date }
export const preview = (params) => api.get('/efd-reconciliations/preview', { params }).then((r) => r.data);
// body: { deviceId, reconDate }. The figures are always calculated by the server.
export const create = (body) => api.post('/efd-reconciliations', body).then((r) => r.data);
// Re-reads the Z report and the receipts (only while OPEN).
export const refresh = (id) => api.post(`/efd-reconciliations/${id}/refresh`).then((r) => r.data);
// Signs the day off. An explanation (10+ characters) is required when there is a difference.
export const reconcile = (id, explanation) => api.post(`/efd-reconciliations/${id}/reconcile`, { explanation: explanation || null }).then((r) => r.data);
// A reconciliation is never edited or deleted, only voided (a reason is required).
export const voidRecon = (id, reason) => api.post(`/efd-reconciliations/${id}/void`, { reason }).then((r) => r.data);
