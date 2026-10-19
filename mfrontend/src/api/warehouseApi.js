import { api } from './client';

export const list = (params) => api.get('/warehouses', { params }).then((r) => r.data);
export const get = (id) => api.get(`/warehouses/${id}`).then((r) => r.data);
export const create = (body) => api.post('/warehouses', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/warehouses/${id}`, body).then((r) => r.data);
// body: { isActive, reason? }
export const setStatus = (id, body) => api.patch(`/warehouses/${id}/status`, body).then((r) => r.data);
// Active warehouses for dropdowns. Default = the ones the user may use; { all: true } = every active warehouse.
export const options = (params) => api.get('/warehouses/options', { params }).then((r) => r.data);
export const storekeepers = () => api.get('/warehouses/storekeepers').then((r) => r.data);
export const stock = (id, params) => api.get(`/warehouses/${id}/stock`, { params }).then((r) => r.data);
export const movements = (id, params) => api.get(`/warehouses/${id}/movements`, { params }).then((r) => r.data);
