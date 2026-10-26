import { api } from './client';

// Read-only, company-wide (needs sales_reports.read). CSV download also needs sales_reports.export.
// Every report returns { report, title, from, to, columns: [{ key, label, type }], totals, rows }.
// detail (sales list: one row per product sold) / summary: { from, to, groupBy? (day|month|year), saleType? (CASH|CREDIT), salespersonId? }   salespersons / customers / products: same without groupBy
export const detail = (params) => api.get('/sales-reports/detail', { params }).then((r) => r.data);
export const summary = (params) => api.get('/sales-reports/summary', { params }).then((r) => r.data);
export const salespersons = (params) => api.get('/sales-reports/salespersons', { params }).then((r) => r.data);
export const customers = (params) => api.get('/sales-reports/customers', { params }).then((r) => r.data);
export const products = (params) => api.get('/sales-reports/products', { params }).then((r) => r.data);

// Downloads the same report as an Excel file (format 'xlsx', the company layout) or CSV (name = detail | summary | salespersons | customers | products). The download is written to the audit log.
export async function download(name, params, format = 'xlsx') {
  try {
    const r = await api.get(`/sales-reports/${name}`, { params: { ...params, format }, responseType: 'blob' });
    const file = /filename="?([^";]+)"?/.exec(r.headers['content-disposition'] || '')?.[1] || `sales-${name}.${format}`;
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
