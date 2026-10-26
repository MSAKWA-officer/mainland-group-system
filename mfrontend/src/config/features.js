// Frontend feature switch. Sales orders and Order approvals are HIDDEN for now (menu + routes); nothing is deleted.
// To bring them back build the frontend with  VITE_ENABLE_SALES_ORDERS=true  (mfrontend/.env), and set ENABLE_SALES_ORDERS=true in backend/.env.
export const SALES_ORDERS = String(import.meta.env.VITE_ENABLE_SALES_ORDERS || '').toLowerCase() === 'true';
