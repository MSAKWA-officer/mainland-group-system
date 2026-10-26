import { api } from './client';

export const list = (params) => api.get('/efd-receipts', { params }).then((r) => r.data);
export const get = (id) => api.get(`/efd-receipts/${id}`).then((r) => r.data);
export const create = (body) => api.post('/efd-receipts', body).then((r) => r.data);
// A recorded receipt is never edited or deleted, only voided (a reason is required).
export const voidReceipt = (id, reason) => api.post(`/efd-receipts/${id}/void`, { reason }).then((r) => r.data);
// Completed sales that can still get an EFD number (used by the picker).
export const eligibleSales = (params) => api.get('/efd-receipts/eligible-sales', { params }).then((r) => r.data);
