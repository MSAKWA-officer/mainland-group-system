import { api } from './client';

export const summary = () => api.get('/monitoring/summary').then((r) => r.data);
