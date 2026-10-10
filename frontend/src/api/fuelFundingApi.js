import { api } from './client';

// Money given to a driver to buy fuel for a vehicle. Flow: PENDING -> APPROVED | REJECTED, and PENDING / APPROVED -> VOIDED.
// Without fuel_funding.read_all the server only returns the requests the user raised.
// params: { page, limit, search, vehicleId, driverId, method, bankAccountId, status (PENDING|APPROVED|REJECTED|VOIDED|ALL), createdBy, from, to, sortBy (fundingDate|amount|fundingNo), sortDir }
// Response: { data, total, page, limit, approvedTotal }
export const list = (params) => api.get('/fuel-funding', { params }).then((r) => r.data);
// params: { from?, to?, groupBy (vehicle|driver) } -> { groupBy, total, rows: [{ id, label, count, total, litres }] } (approved fundings only)
export const summary = (params) => api.get('/fuel-funding/summary', { params }).then((r) => r.data);
// Also returns voider and bankTransactions (the ledger rows posted at approval).
export const get = (id) => api.get(`/fuel-funding/${id}`).then((r) => r.data);
// body: { vehicleId, amount, purpose, method, driverId?, litres?, bankAccountId?, reference?, fundingDate?, notes? }
// driverId defaults to the vehicle's default driver. bankAccountId is required for BANK / CARD / CHEQUE.
export const create = (body) => api.post('/fuel-funding', body).then((r) => r.data);
// Only the person who raised it, and only while it is PENDING. (A driver cannot be cleared on edit; pick another one.)
export const update = (id, body) => api.patch(`/fuel-funding/${id}`, body).then((r) => r.data);
// The money leaves at approval (a bank withdrawal is posted when a bank account was chosen). You cannot approve your own request (Owner excepted).
export const approve = (id, note) => api.post(`/fuel-funding/${id}/approve`, { note: note || null }).then((r) => r.data);
export const reject = (id, note) => api.post(`/fuel-funding/${id}/reject`, { note }).then((r) => r.data);
// Refused while the funding still has ACTIVE fuel usage.
export const voidFunding = (id, reason) => api.post(`/fuel-funding/${id}/void`, { reason }).then((r) => r.data);
