import { api } from './client';

export const list = () => api.get('/notifications').then((r) => r.data);
export const readAll = () => api.post('/notifications/read-all');
