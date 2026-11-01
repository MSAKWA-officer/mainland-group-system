const respond = require('../utils/reportRespond')({ svc: require('../services/customerBalanceReports'), file: 'customer-balances', entityType: 'CustomerBalanceReport', action: 'CUSTOMER_BALANCE_REPORT_EXPORTED' });
exports.balances = respond('balances');
exports.ageing = respond('ageing');
exports.invoices = respond('invoices');
exports.statement = respond('statement');
