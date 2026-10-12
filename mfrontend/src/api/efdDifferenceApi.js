import { api } from './client';

// Static lists for the filters: { types: [{ code, label }], severities: ['HIGH', ...], maxDays }
export const types = () => api.get('/efd-differences/types').then((r) => r.data);
// Read-only scan. params: { from, to, deviceId, type, severity, page, limit }. Dates default to the last 30 days; at most 92 days at a time.
export const scan = (params) => api.get('/efd-differences', { params }).then((r) => r.data);
