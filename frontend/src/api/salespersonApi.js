import { api } from './client';

export const list = (params) => api.get('/salespersons', { params }).then((r) => r.data);
export const get = (id) => api.get(`/salespersons/${id}`).then((r) => r.data);
export const me = () => api.get('/salespersons/me').then((r) => r.data);
export const create = (body) => api.post('/salespersons', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/salespersons/${id}`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/salespersons/${id}`).then((r) => r.data);
// Activate / deactivate. A reason is required when deactivating.
export const setStatus = (id, body) => api.patch(`/salespersons/${id}/status`, body).then((r) => r.data);
// Monthly performance. `month` is YYYY-MM (defaults to the current month on the server).
export const summary = (id, month) => api.get(`/salespersons/${id}/summary`, { params: month ? { month } : {} }).then((r) => r.data);
