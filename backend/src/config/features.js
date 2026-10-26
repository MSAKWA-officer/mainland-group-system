// Feature switches. Sales orders and Order approvals are HIDDEN for now: nothing is deleted, the code, tables and permissions stay.
// To bring them back later set  ENABLE_SALES_ORDERS=true  in backend/.env  (and  VITE_ENABLE_SALES_ORDERS=true  in the frontend build), then restart.
module.exports = { SALES_ORDERS: String(process.env.ENABLE_SALES_ORDERS || '').toLowerCase() === 'true' };
