import { api } from './client';

export const list = (params) => api.get('/credit-sales', { params }).then((r) => r.data);
export const get = (id) => api.get(`/credit-sales/${id}`).then((r) => r.data);
export const create = (body) => api.post('/credit-sales', body).then((r) => r.data);
export const update = (id, body) => api.patch(`/credit-sales/${id}`, body).then((r) => r.data);
export const remove = (id) => api.delete(`/credit-sales/${id}`).then((r) => r.data);
export const submit = (id) => api.post(`/credit-sales/${id}/submit`).then((r) => r.data);
export const cancel = (id, reason) => api.post(`/credit-sales/${id}/cancel`, { reason }).then((r) => r.data);
// Approving issues the stock and creates the receivable. Rejecting needs a note.
export const approve = (id, note) => api.post(`/credit-sales/${id}/approve`, { note }).then((r) => r.data);
export const reject = (id, note) => api.post(`/credit-sales/${id}/reject`, { note }).then((r) => r.data);
// Voiding a completed sale puts the stock back. Only possible while nothing is paid on it. A reason is required.
export const voidSale = (id, reason) => api.post(`/credit-sales/${id}/void`, { reason }).then((r) => r.data);
// Payments (receipts). body: { amount, method, reference?, paidOn?, notes? }
export const receivePayment = (id, body) => api.post(`/credit-sales/${id}/payments`, body).then((r) => r.data);
export const voidPayment = (id, paymentId, reason) => api.post(`/credit-sales/${id}/payments/${paymentId}/void`, { reason }).then((r) => r.data);
// Credit position of a customer: limit, outstanding, overdue, available.
export const creditStatus = (customerId) => api.get(`/credit-sales/credit-status/${customerId}`).then((r) => r.data);
// What each customer owes, by age.
export const receivables = () => api.get('/credit-sales/receivables').then((r) => r.data);
