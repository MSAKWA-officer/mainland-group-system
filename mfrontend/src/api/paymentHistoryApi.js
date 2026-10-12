import { api } from './client';

// params: { page, limit, search, customerId, salespersonId, saleType, method, status (ACTIVE|VOIDED|ALL), from, to, sortBy, sortDir }
// Response: { data, total, page, limit, summary: { totalReceived, paymentCount, totalVoided, voidedCount, byMethod } }
export const list = (params) => api.get('/payment-history', { params }).then((r) => r.data);
export const get = (id) => api.get(`/payment-history/${id}`).then((r) => r.data);
