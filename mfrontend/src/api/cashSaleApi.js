import { api } from './client';

export const list = (params) => api.get('/cash-sales', { params }).then((r) => r.data);
export const get = (id) => api.get(`/cash-sales/${id}`).then((r) => r.data);
// Creating a cash sale takes the payment and issues the stock in one step. There is no draft and no approval.
export const create = (body) => api.post('/cash-sales', body).then((r) => r.data);
// Voiding puts the stock back. A reason is required.
export const voidSale = (id, reason) => api.post(`/cash-sales/${id}/void`, { reason }).then((r) => r.data);
// Active bank / mobile money accounts registered in Bank accounts, for choosing how a payment was taken. No balances. Needs cash_sales.create.
export const paymentAccounts = () => api.get('/cash-sales/payment-accounts').then((r) => r.data);
