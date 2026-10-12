import { api } from './client';

// Read-only. A "balance" belongs to an APPROVED fuel funding: money given - ACTIVE usage.
// params: { page, limit, search, vehicleId, driverId, state (OPEN|SETTLED|ALL), from, to, sortBy (disbursedOn|balance|funded|fundingNo), sortDir }
// Response: { data, total, page, limit, totals: { funded, used, balance } }
export const list = (params) => api.get('/fuel-balances', { params }).then((r) => r.data);
// params: { groupBy (vehicle|driver), state, from, to } -> { groupBy, totals, rows: [{ id, label, fundings, openFundings, funded, used, balance, fundedLitres, usedLitres }] }
export const summary = (params) => api.get('/fuel-balances/summary', { params }).then((r) => r.data);
// id = the FUNDING id -> the balance row plus `usages` (every ACTIVE usage line)
export const get = (fundingId) => api.get(`/fuel-balances/${fundingId}`).then((r) => r.data);
