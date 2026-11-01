import { api } from './client';

// Every payment received, in one list: customer payments + cash sale payments + receipts taken directly on credit sales (merged by the API).
// params: { page, limit, search, customerId, bankAccountId, method, source (CUSTOMER_PAYMENT|CASH_SALE|CREDIT_SALE), status (ACTIVE|VOIDED|ALL), from, to, sortBy (paidOn|amount|paymentNo|customer), sortDir }
// rows: { id, source, paymentNo, paidOn, amount, method, reference, status, customer, bankAccount, receiver, saleId, saleNo }  (saleId/saleNo only on cash / credit sale rows)
export const list = (params) => api.get('/customer-payments', { params }).then((r) => r.data);
export const get = (id) => api.get(`/customer-payments/${id}`).then((r) => r.data);
// body: { customerId, amount, method, bankAccountId?, reference?, paidOn?, notes?, allocations?: [{ saleId, amount }] }
// Leave allocations out and the money is applied to the customer's oldest unpaid credit sales first.
export const create = (body) => api.post('/customer-payments', body).then((r) => r.data);
// Credit sales that still owe money, oldest due first -> { customer, data: [{ id, saleNo, saleDate, dueDate, total, amountPaid, balance }] }
export const openSales = (customerId) => api.get(`/customer-payments/open-sales/${customerId}`).then((r) => r.data);
export const voidPayment = (id, reason) => api.post(`/customer-payments/${id}/void`, { reason }).then((r) => r.data);
