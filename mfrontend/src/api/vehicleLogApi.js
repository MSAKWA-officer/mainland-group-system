import { api } from './client';

// Vehicle log = the Official Vehicle USE and FUELING Registration Form. This API holds the USE half (trips); the FUELING half is Fuel usage.
// params: { page, limit, search, vehicleId, status (ACTIVE|VOIDED|ALL), open ('true' = trips not closed yet), from, to, sortBy (tripDate|tripNo|totalKm), sortDir }
// Response: { data, total, page, limit, activeKm }
export const list = (params) => api.get('/vehicle-log', { params }).then((r) => r.data);
export const get = (id) => api.get(`/vehicle-log/${id}`).then((r) => r.data);
// body: { vehicleId, userName, purpose, timeStart ('HH:MM'), startKm, tripDate?, timeEnd?, endKm?, notes? }
// Leave timeEnd + endKm empty to open a trip; fill both later to close it. Total mileage is calculated by the server.
export const create = (body) => api.post('/vehicle-log', body).then((r) => r.data);
// Only the person who recorded it, and only while ACTIVE. The vehicle cannot be changed.
export const update = (id, body) => api.patch(`/vehicle-log/${id}`, body).then((r) => r.data);
export const voidTrip = (id, reason) => api.post(`/vehicle-log/${id}/void`, { reason }).then((r) => r.data);
// The paper form for one vehicle and month: { vehicle, month, year, monthNo, rows: [{ date, userName, purpose, timeStart, startKm, timeEnd, endKm, totalKm, fuelOdometerKm, litres, paymentMethod, receiptNo }], totals }
export const sheet = (params) => api.get('/vehicle-log/sheet', { params }).then((r) => r.data);
// Downloads the sheet as Excel in the company form layout (needs vehicle_log.export; written to the audit log).
export async function downloadSheet(params) {
  try {
    const r = await api.get('/vehicle-log/sheet', { params: { ...params, format: 'xlsx' }, responseType: 'blob' });
    const file = /filename="?([^";]+)"?/.exec(r.headers['content-disposition'] || '')?.[1] || 'vehicle-log.xlsx';
    const url = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    if (e.response?.data instanceof Blob) { try { e.response.data = JSON.parse(await e.response.data.text()); } catch { /* keep the blob */ } }
    throw e;
  }
}
