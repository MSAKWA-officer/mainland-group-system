import { api } from './client';

// Read-only stock reports. Cost and value columns are returned only to users with stock_reports.valuation.
export const summary = (params) => api.get('/stock-reports/summary', { params }).then((r) => r.data);
export const stockOnHand = (params) => api.get('/stock-reports/stock-on-hand', { params }).then((r) => r.data);
export const lowStock = (params) => api.get('/stock-reports/low-stock', { params }).then((r) => r.data);
export const expiry = (params) => api.get('/stock-reports/expiry', { params }).then((r) => r.data);
export const movements = (params) => api.get('/stock-reports/movements', { params }).then((r) => r.data);
export const writeOffs = (params) => api.get('/stock-reports/write-offs', { params }).then((r) => r.data);
export const valuation = () => api.get('/stock-reports/valuation').then((r) => r.data);

// Warehouse Inventory Statement. No warehouseId = all warehouses together (downloads then also hold one statement per warehouse).
export const warehouseStatement = (params) => api.get('/stock-reports/warehouse-statement', { params }).then((r) => r.data);
// format: 'xlsx' | 'pdf'. Returns a Blob. An error comes back as a Blob too, so it is turned into normal JSON for errMsg().
export const downloadWarehouseStatement = async (params) => {
  try {
    return (await api.get('/stock-reports/warehouse-statement/export', { params, responseType: 'blob' })).data;
  } catch (e) {
    if (e.response?.data instanceof Blob) { try { e.response.data = JSON.parse(await e.response.data.text()); } catch { /* keep as is */ } }
    throw e;
  }
};
