import { api } from './client';
import { downloadReport } from './reportDownload';

// Read-only, company-wide (needs customer_balance_reports.read; downloads also need customer_balance_reports.export).
// balances / ageing / invoices: { asOf? (default today), customerId?, salespersonId?, includeZero?, overdueOnly? }
// statement: { customerId, from, to }
const get = (path) => (params) => api.get(`/customer-balance-reports/${path}`, { params }).then((r) => r.data);
export const balances = get('balances');
export const ageing = get('ageing');
export const invoices = get('invoices');
export const statement = get('statement');

// name = balances | ageing | invoices | statement; format = xlsx | pdf | csv
export const download = (name, params, format = 'xlsx') => downloadReport(`/customer-balance-reports/${name}`, params, format, `customer-balances-${name}`);
