const respond = require('../utils/reportRespond')({ svc: require('../services/paymentReports'), file: 'payments', entityType: 'PaymentReport', action: 'PAYMENT_REPORT_EXPORTED' });
exports.detail = respond('detail');
exports.summary = respond('summary');
exports.methods = respond('methods');
exports.customers = respond('customers');
exports.accounts = respond('accounts');
exports.paidOut = respond('paidOut');
