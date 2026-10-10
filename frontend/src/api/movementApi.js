import { api } from './client';

// Stock movement ledger. Read-only by design: rows are written only when a stock document is posted.
export const list = (params) => api.get('/stock-movements', { params }).then((r) => r.data);
export const get = (id) => api.get(`/stock-movements/${id}`).then((r) => r.data);
