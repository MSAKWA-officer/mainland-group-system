import { api } from './client';

// A transfer is shown as ONE record (its two ledger rows share a transferGroupId, which is the :id here).
// params: { page, limit, search, fromAccountId, toAccountId, status (POSTED|VOIDED|ALL), from, to, sortBy (txnDate|amount|txnNo), sortDir }
export const list = (params) => api.get('/transfers', { params }).then((r) => r.data);
export const get = (groupId) => api.get(`/transfers/${groupId}`).then((r) => r.data);
// body: { fromAccountId, toAccountId, amount, txnDate?, reference?, description? } (a reference or description is required)
export const create = (body) => api.post('/transfers', body).then((r) => r.data);
// Voids both sides. Refused while either side is reconciled.
export const voidTransfer = (groupId, reason) => api.post(`/transfers/${groupId}/void`, { reason }).then((r) => r.data);
