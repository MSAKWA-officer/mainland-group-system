import { api } from './client';
import { downloadReport } from './reportDownload';

// Read-only, company-wide (needs payment_reports.read; downloads also need payment_reports.export; paidOut also needs payments.read).
// Every report returns { report, title, reportTitle, from, to, columns: [{ key, label, type }], totals, rows }.
// Params: from, to (required), method? (CASH|MOBILE_MONEY|BANK|CARD|CHEQUE), saleType? (CASH|CREDIT), customerId?, bankAccountId?, groupBy? (summary only: day|month|year)
const get = (path) => (params) => api.get(`/payment-reports/${path}`, { params }).then((r) => r.data);
export const detail = get('detail');
export const summary = get('summary');
export const methods = get('methods');
export const customers = get('customers');
export const accounts = get('accounts');
export const paidOut = get('paid-out');

const PATH = { paidOut: 'paid-out' };
// name = detail | summary | methods | customers | accounts | paidOut; format = xlsx | pdf | csv
export const download = (name, params, format = 'xlsx') => downloadReport(`/payment-reports/${PATH[name] || name}`, params, format, `payments-${name}`);
