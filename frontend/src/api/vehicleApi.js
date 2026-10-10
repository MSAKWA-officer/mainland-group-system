import { api } from './client';

// params: { page, limit, search, isActive ('true'|'false'), vehicleType, fuelType, driverId, sortBy (plateNo|code|make), sortDir }
// Each vehicle has: fundingCount, driver { id, code, fullName, phone, isActive } (the default driver).
export const list = (params) => api.get('/vehicles', { params }).then((r) => r.data);
export const get = (id) => api.get(`/vehicles/${id}`).then((r) => r.data);
// body: { plateNo, make, vehicleType, fuelType, model?, year?, tankCapacityLitres?, driverId?, notes? }.
// driverId (set OR clear) needs vehicles.assign: leave the key out entirely when the user does not have it.
export const create = (body) => api.post('/vehicles', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/vehicles/${id}`, body).then((r) => r.data);
// body: { isActive, reason? } (a reason is needed to deactivate; refused while the vehicle has pending funding)
export const setStatus = (id, body) => api.patch(`/vehicles/${id}/status`, body).then((r) => r.data);
// Only a vehicle with no fuel funding history; otherwise deactivate.
export const remove = (id) => api.delete(`/vehicles/${id}`).then((r) => r.data);
