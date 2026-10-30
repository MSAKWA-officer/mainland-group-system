import { api } from './client';

// Owner-only: records users deleted (reversed stock documents, voided cash sales). Read-only.
export const list = (params) => api.get('/deleted-records', { params }).then((r) => r.data);
