import { api } from './client';

export const summary = (module) => api.get('/dashboard/summary', { params: module ? { module } : undefined }).then((r) => r.data);
