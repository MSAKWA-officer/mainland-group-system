import { api } from './client';

export const list = (params) => api.get('/audit-logs', { params }).then((r) => r.data);
export const verify = () => api.get('/audit-logs/verify').then((r) => r.data);
