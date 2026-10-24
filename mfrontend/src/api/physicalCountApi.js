import { api } from './client';

export const list = (params) => api.get('/physical-counts', { params }).then((r) => r.data);
export const get = (id) => api.get(`/physical-counts/${id}`).then((r) => r.data);
// Every product of the warehouse with its book quantity at the end of `date` (the entry sheet).
export const sheet = (params) => api.get('/physical-counts/sheet', { params }).then((r) => r.data);
export const create = (body) => api.post('/physical-counts', body).then((r) => r.data);
export const voidCount = (id, reason) => api.post(`/physical-counts/${id}/void`, { reason }).then((r) => r.data);
