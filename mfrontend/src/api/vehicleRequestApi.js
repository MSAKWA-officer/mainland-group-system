import { api } from './client';

// Official Vehicle Use REQUEST form. Flow: PENDING -> APPROVED | REJECTED; APPROVED -> KEY_OUT -> RETURNED; PENDING / APPROVED -> VOIDED.
// params: { page, limit, search, vehicleId, status (PENDING|APPROVED|REJECTED|KEY_OUT|RETURNED|VOIDED|ALL), from, to, sortBy (requestDate|requestNo|createdAt), sortDir }
// Without vehicle_requests.read_all only the user's own requests are returned.
export const list = (params) => api.get('/vehicle-requests', { params }).then((r) => r.data);
export const get = (id) => api.get(`/vehicle-requests/${id}`).then((r) => r.data);
// body: { userName, department, purpose, requestDate? (today or later), notes? }
export const create = (body) => api.post('/vehicle-requests', body).then((r) => r.data);
// Only the person who raised it, and only while PENDING.
export const update = (id, body) => api.patch(`/vehicle-requests/${id}`, body).then((r) => r.data);
// Approver (not on their own request, the Owner is exempt). Rejecting needs a note.
export const approve = (id, note) => api.post(`/vehicle-requests/${id}/approve`, { note: note || null }).then((r) => r.data);
export const reject = (id, note) => api.post(`/vehicle-requests/${id}/reject`, { note }).then((r) => r.data);
// Key custodian. body: { vehicleId, driverId? (defaults to the vehicle's driver), keyTakenAt? (ISO, defaults to now) }
export const issueKey = (id, body) => api.post(`/vehicle-requests/${id}/issue-key`, body).then((r) => r.data);
// body: { keyReturnedAt? (ISO, defaults to now) }
export const returnKey = (id, body = {}) => api.post(`/vehicle-requests/${id}/return-key`, body).then((r) => r.data);
export const voidRequest = (id, reason) => api.post(`/vehicle-requests/${id}/void`, { reason }).then((r) => r.data);
// The paper register for one month: { month, year, monthNo, rows: [{ date, requestNo, userName, department, purpose, status, plateNo, driverName, keyTaken, keyReturned }] }
export const register = (params) => api.get('/vehicle-requests/register', { params }).then((r) => r.data);
// Downloads the register as Excel in the company form layout (needs vehicle_requests.export; written to the audit log).
export async function downloadRegister(params) {
  try {
    const r = await api.get('/vehicle-requests/register', { params: { ...params, format: 'xlsx' }, responseType: 'blob' });
    const file = /filename="?([^";]+)"?/.exec(r.headers['content-disposition'] || '')?.[1] || 'vehicle-requests.xlsx';
    const url = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    if (e.response?.data instanceof Blob) { try { e.response.data = JSON.parse(await e.response.data.text()); } catch { /* keep the blob */ } }
    throw e;
  }
}
