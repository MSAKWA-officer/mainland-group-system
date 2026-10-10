import { api } from './client';

// params: { page, limit, search, customerId, salespersonId, asOf (YYYY-MM-DD), bucket, sortBy, sortDir }
// Response: { data, total, page, limit, asOf, summary: { customers, outstanding, current, days1to30, days31to60, days61to90, over90 } }
export const list = (params) => api.get('/credit-ageing', { params }).then((r) => r.data);
// One customer, invoice by invoice: { customer, asOf, summary, invoices }
export const get = (customerId, params) => api.get(`/credit-ageing/${customerId}`, { params }).then((r) => r.data);
