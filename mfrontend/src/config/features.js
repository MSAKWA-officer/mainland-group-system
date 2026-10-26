// Frontend feature switches. Hidden features are NOT deleted: only the menu entries and routes are switched off.
// Sales orders + Order approvals + Sales register : build with VITE_ENABLE_SALES_ORDERS=true (mfrontend/.env), and ENABLE_SALES_ORDERS=true in backend/.env
// Discounts                                       : build with VITE_ENABLE_DISCOUNTS=true,     and ENABLE_DISCOUNTS=true in backend/.env
const on = (v) => String(v || '').toLowerCase() === 'true';
export const SALES_ORDERS = on(import.meta.env.VITE_ENABLE_SALES_ORDERS);
export const DISCOUNTS = on(import.meta.env.VITE_ENABLE_DISCOUNTS);
