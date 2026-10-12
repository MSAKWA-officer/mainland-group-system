import { api } from './client';

// params: { page, limit, search, fuelFundingId, vehicleId, driverId, status (ACTIVE|VOIDED|ALL), createdBy, from, to, sortBy (usageDate|amount|litres|usageNo), sortDir }
// Response: { data, total, page, limit, activeTotal, activeLitres }
export const list = (params) => api.get('/fuel-usage', { params }).then((r) => r.data);
export const get = (id) => api.get(`/fuel-usage/${id}`).then((r) => r.data);
// body: { fuelFundingId, litres, amount, usageDate?, odometerKm?, isFullTank?, station?, receiptNo?, notes? }. The price per litre is calculated by the server.
export const create = (body) => api.post('/fuel-usage', body).then((r) => r.data);
// Only the person who recorded it, and only while it is ACTIVE. The funding cannot be changed.
export const update = (id, body) => api.patch(`/fuel-usage/${id}`, body).then((r) => r.data);
export const voidUsage = (id, reason) => api.post(`/fuel-usage/${id}/void`, { reason }).then((r) => r.data);
