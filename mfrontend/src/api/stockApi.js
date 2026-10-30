import { api } from './client';

// ---- Stock levels (read-only; quantities only change when an approved document is posted) ----
export const list = (params) => api.get('/stock', { params }).then((r) => r.data);
export const get = (itemId) => api.get(`/stock/${itemId}`).then((r) => r.data);
// Batches of expiry-tracked items created by stock receiving (for the Expired list).
export const expiryBatches = (params) => api.get('/stock/expiry-batches', { params }).then((r) => r.data);
export const expiryBatch = (batchId) => api.get(`/stock/expiry-batches/${batchId}`).then((r) => r.data);
// Delete an EXPIRED batch: removes its stock from the warehouse(s) holding it, atomically. body: { warehouseId? } (omit = every warehouse you may use).
export const writeOffExpiredBatch = (batchId, body = {}) => api.post(`/stock/expiry-batches/${batchId}/write-off`, body).then((r) => r.data);
export const batches = (itemId, params) => api.get(`/stock/${itemId}/batches`, { params }).then((r) => r.data);

// ---- Stock adjustments (the documents that add or remove stock, with approval) ----
export const listAdjustments = (params) => api.get('/stock-adjustments', { params }).then((r) => r.data);
export const getAdjustment = (id) => api.get(`/stock-adjustments/${id}`).then((r) => r.data);
export const createAdjustment = (body) => api.post('/stock-adjustments', body).then((r) => r.data);
export const updateAdjustment = (id, body) => api.patch(`/stock-adjustments/${id}`, body).then((r) => r.data);
export const removeAdjustment = (id) => api.delete(`/stock-adjustments/${id}`).then((r) => r.data);
// action: submit | cancel | approve | reject
export const actAdjustment = (id, action, body) => api.post(`/stock-adjustments/${id}/${action}`, body).then((r) => r.data);
// Delete / edit a POSTED adjustment (reverse / correct) — see receivingApi.
export const reverseAdjustment = (id, body) => api.post(`/stock-adjustments/${id}/reverse`, body).then((r) => r.data);
export const correctAdjustment = (id, body) => api.post(`/stock-adjustments/${id}/correct`, body).then((r) => r.data);
