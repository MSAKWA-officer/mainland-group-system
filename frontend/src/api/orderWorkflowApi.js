import { api } from './client';

// Phase 4 - sales order approval workflow: Salesperson -> Storekeeper -> Manager -> Salesperson.
// Every path lives here, so if the backend routes are named differently only this file changes.
const base = '/order-workflow';

export const list = (params) => api.get(base, { params }).then((r) => r.data);
// Counts per stage for the tab badges: { STOREKEEPER: n, MANAGER: n, SALESPERSON: n, CLOSED: n }. Optional - the list works without it.
export const summary = () => api.get(`${base}/summary`).then((r) => r.data);
export const get = (id) => api.get(`${base}/${id}`).then((r) => r.data);
// The workflow of one sales order, or null when it was submitted before Phase 4 (no workflow row).
export const byOrder = (orderId) => api.get(`${base}/order/${orderId}`).then((r) => r.data)
  .catch((e) => (e.response?.status === 404 ? null : Promise.reject(e)));

// Storekeeper
export const storekeeperVerify = (id, note) => api.post(`${base}/${id}/storekeeper/verify`, { note }).then((r) => r.data);
export const storekeeperReturn = (id, note) => api.post(`${base}/${id}/storekeeper/return`, { note }).then((r) => r.data);
// Manager (approving issues the stock; rejecting is final; returning sends the order back to the salesperson)
export const managerApprove = (id, note) => api.post(`${base}/${id}/manager/approve`, { note }).then((r) => r.data);
export const managerReject = (id, note) => api.post(`${base}/${id}/manager/reject`, { note }).then((r) => r.data);
export const managerReturn = (id, note) => api.post(`${base}/${id}/manager/return`, { note }).then((r) => r.data);
// Salesperson confirms the approved order was handed over
export const acknowledge = (id, note) => api.post(`${base}/${id}/acknowledge`, { note }).then((r) => r.data);
