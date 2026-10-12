import { api } from './client';

// params: { page, limit, search, isActive ('true'|'false'), licenseStatus (VALID|EXPIRING_SOON|EXPIRED), sortBy (fullName|code|licenseExpiry), sortDir }
// Each driver has: licenseStatus (worked out by the database from licenseExpiry), vehicleCount, fundingCount, staff { id, code, fullName }.
export const list = (params) => api.get('/drivers', { params }).then((r) => r.data);
// Also returns `vehicles` (the vehicles this driver is the default driver of).
export const get = (id) => api.get(`/drivers/${id}`).then((r) => r.data);
// body: { fullName, licenseNo, licenseExpiry, phone?, licenseClass?, address?, notes?, staffId? }. An expired licence is refused.
export const create = (body) => api.post('/drivers', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/drivers/${id}`, body).then((r) => r.data);
// body: { isActive, reason? } (a reason is needed to deactivate; refused while the driver is the default driver of an active vehicle or has pending funding)
export const setStatus = (id, body) => api.patch(`/drivers/${id}/status`, body).then((r) => r.data);
// Only a driver with no vehicles and no fuel funding history; otherwise deactivate.
export const remove = (id) => api.delete(`/drivers/${id}`).then((r) => r.data);
