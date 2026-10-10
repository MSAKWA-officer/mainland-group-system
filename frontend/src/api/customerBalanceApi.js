import { api } from './client';

// params: { page, limit, search, salespersonId, isActive, includeZero, overdueOnly, sortBy, sortDir }
export const list = (params) => api.get('/customer-balances', { params }).then((r) => r.data);
// One customer: { customer, position, openInvoices, recentPayments }
export const get = (customerId) => api.get(`/customer-balances/${customerId}`).then((r) => r.data);
