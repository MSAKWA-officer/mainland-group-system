// Feature switches. Hidden features are NOT deleted: the code, tables and permissions stay, only the routes / menu / dashboard cards are switched off.
// Sales orders + Order approvals : set ENABLE_SALES_ORDERS=true in backend/.env (and VITE_ENABLE_SALES_ORDERS=true in the frontend build) to bring them back.
// Discounts                      : set ENABLE_DISCOUNTS=true         in backend/.env (and VITE_ENABLE_DISCOUNTS=true in the frontend build) to bring it back.
// Restart the backend after changing .env.
const on = (v) => String(v || '').toLowerCase() === 'true';
module.exports = { SALES_ORDERS: on(process.env.ENABLE_SALES_ORDERS), DISCOUNTS: on(process.env.ENABLE_DISCOUNTS) };
