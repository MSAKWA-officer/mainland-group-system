import { api } from './client';

// Read-only, company-wide (needs efd_reports.read). CSV download needs efd_reports.export as well.
// Every report returns { report, title, columns, totals, rows } (and from / to, or year).
// daily / devices: { from, to, deviceId? }   monthly: { year?, deviceId? }   unreceipted: { from, to }
// receipts: { from, to, deviceId?, status? (ISSUED|VOIDED), search?, page, limit } -> also { total, page, limit }
export const daily = (params) => api.get('/efd-reports/daily', { params }).then((r) => r.data);
export const devices = (params) => api.get('/efd-reports/devices', { params }).then((r) => r.data);
export const monthly = (params) => api.get('/efd-reports/monthly', { params }).then((r) => r.data);
export const receipts = (params) => api.get('/efd-reports/receipts', { params }).then((r) => r.data);
export const unreceipted = (params) => api.get('/efd-reports/unreceipted', { params }).then((r) => r.data);

// Downloads the same report as a CSV file (name = daily | devices | monthly | receipts | unreceipted). The download is written to the audit log.
export async function download(name, params) {
  try {
    const r = await api.get(`/efd-reports/${name}`, { params: { ...params, format: 'csv' }, responseType: 'blob' });
    const file = /filename="?([^";]+)"?/.exec(r.headers['content-disposition'] || '')?.[1] || `efd-${name}.csv`;
    const url = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    // With responseType 'blob' an error body arrives as a Blob: turn it back into JSON so errMsg() can read it.
    if (e.response?.data instanceof Blob) { try { e.response.data = JSON.parse(await e.response.data.text()); } catch { /* keep the blob */ } }
    throw e;
  }
}
