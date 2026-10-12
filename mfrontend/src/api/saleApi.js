import { api } from './client';

// Sales register: cash + credit sales together (read-only).
export const list = (params) => api.get('/sales', { params }).then((r) => r.data);
export const get = (id) => api.get(`/sales/${id}`).then((r) => r.data);
export const summary = (params) => api.get('/sales/summary', { params }).then((r) => r.data);
