import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.jsx';
import { notificationApi } from '../api/index.js';
import { fmt } from '../utils/format';
import { currentLocale } from '../utils/locale';
import LanguageSwitcher from './LanguageSwitcher.jsx';

// Sidebar: top-level links, then one collapsible group per module with its sub-modules inside.
// Menu is built from the user's permissions (a group with nothing permitted is hidden). The API enforces the same rules; hiding is only convenience.
// Item: [path, label, permission]. A permission of null means everyone.
// NOTE: `label` haitumiki tena kuonyesha; maandishi yanatoka nav.json (key = path bila "/"). Imebaki kama rejea tu.
const TOP = [['/', 'Dashboard', null], ['/approvals', 'Approvals', 'approvals.read']];
const GROUPS = [
  { key: 'inventory', label: 'Inventory', items: [
    ['/categories', 'Categories', 'categories.read'], ['/items', 'Items', 'items.read'], ['/stock', 'Stock', 'stock.read'],
    ['/warehouses', 'Warehouses', 'warehouses.read'], ['/warehouse-transfers', 'Warehouse transfers', 'warehouse_transfers.read'],
    ['/physical-counts', 'Physical count', 'physical_counts.read'],
    ['/receiving', 'Receiving', 'receiving.read'], ['/adjustments', 'Adjustments', 'adjustments.read'],
    ['/reject-in', 'Reject in', 'reject_in.read'], ['/reject-out', 'Reject out', 'reject_out.read'],
    ['/expired', 'Expired', 'expired.read'], ['/damaged', 'Damaged', 'damaged.read'],
    ['/movements', 'Movements', 'movements.read'], ['/reports', 'Stock reports', ['stock_reports.read', 'stock_reports.statement']],
  ] },
  { key: 'sales', label: 'Sales & Customers', items: [
    ['/customers', 'Customers', 'customers.read'], ['/salespersons', 'Salespersons', 'salespersons.read'],
    ['/sales-orders', 'Sales orders', 'sales_orders.read'], ['/order-workflow', 'Order approvals', 'order_workflow.read'],
    ['/sales', 'Sales', 'sales.read'],
    ['/cash-sales', 'Cash sales', 'cash_sales.read'], ['/credit-sales', 'Credit sales', 'credit_sales.read'],
    ['/customer-balances', 'Customer balance', 'customer_balances.read'], ['/payment-history', 'Payment history', 'payment_history.read'],
    ['/credit-ageing', 'Credit ageing', 'credit_ageing.read'],
    ['/discounts', 'Discounts', 'discounts.read'], ['/efd-receipts', 'EFD numbers', 'efd_receipts.read'], ['/efd-z-reports', 'Z reports', 'efd_z_reports.read'], ['/efd-reconciliations', 'Daily reconciliation', 'efd_reconciliations.read'], ['/efd-differences', 'Difference detection', 'efd_differences.read'], ['/efd-reports', 'EFD reports', 'efd_reports.read'], ['/efd-devices', 'EFD devices', 'efd_devices.read'],
  ] },
  { key: 'banking', label: 'Banking & Payments', items: [
    ['/banks', 'Banks', 'banks.read'], ['/bank-accounts', 'Bank accounts', 'bank_accounts.read'],
    ['/bank-transactions', 'Bank transactions', 'bank_transactions.read'], ['/customer-payments', 'Customer payments', 'customer_payments.read'],
    ['/expenses', 'Expenses', 'expenses.read'], ['/payments', 'Payments', 'payments.read'],
    ['/transfers', 'Transfers', 'transfers.read'], ['/reconciliation', 'Reconciliation', 'bank_transactions.reconcile'],
  ] },
  { key: 'fuel', label: 'Fuel', items: [
    ['/drivers', 'Drivers', 'drivers.read'], ['/vehicles', 'Vehicles', 'vehicles.read'], ['/fuel-funding', 'Fuel funding', 'fuel_funding.read'],
    ['/fuel-usage', 'Fuel usage', 'fuel_usage.read'], ['/fuel-balances', 'Fuel balances', 'fuel_balances.read'], ['/fuel-reports', 'Fuel reports', 'fuel_reports.read'],
  ] },
  { key: 'admin', label: 'Administration', items: [
    ['/staff', 'Staff', 'staff.read'], ['/users', 'User management', 'users.read'], ['/roles', 'Roles & permissions', 'roles.read'], ['/audit', 'Audit log', 'audit.read'],
  ] },
];

const matches = (to, path) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`));
const inGroup = (g, path) => g.items.some(([to]) => matches(to, path));

// Key ya tafsiri ya kila kiungo cha menyu: path bila "/" ya mwanzo (Dashboard = 'dashboard').
const slug = (to) => (to === '/' ? 'dashboard' : to.slice(1));

// Finds the nav entry for the current URL (longest match wins), so detail pages like /items/12 still read "Items".
// Inarudisha `to` na `group` (key) tu; maandishi yanatafsiriwa ndani ya component.
function locate(path) {
  let best = null;
  const consider = (to, group) => { if (matches(to, path) && (!best || to.length > best.to.length)) best = { to, group }; };
  TOP.forEach(([to]) => consider(to, null));
  GROUPS.forEach((g) => g.items.forEach(([to]) => consider(to, g.key)));
  consider('/password', 'account');
  return best || { to: '/', group: null };
}

/* ---------- icons ---------- */
const P = {
  grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  badge: <><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>,
  box: <><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  cart: <><circle cx="9" cy="20" r="1.2" /><circle cx="18" cy="20" r="1.2" /><path d="M1 2h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></>,
  bank: <><path d="M3 21h18M5 21V10M9.5 21V10M14.5 21V10M19 21V10M2 10l10-7 10 7" /></>,
  fuel: <><path d="M3 22V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v18M2 22h12M5 8h6M13 10h2a2 2 0 0 1 2 2v3a1.5 1.5 0 0 0 3 0V8l-3-3" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.7 12.3L21 2M16 7l3 3" /></>,
  out: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9z" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
};
const Ico = ({ name, size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>{P[name]}</svg>
);
const GROUP_ICON = { inventory: 'box', sales: 'cart', banking: 'bank', fuel: 'fuel', admin: 'users' };

// Points left when closed and rotates to point down when open (same as the SIMS menu).
const Chevron = ({ open }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    className={`shrink-0 transition-transform ${open ? '-rotate-90' : ''}`}><path d="M15 18l-6-6 6-6" /></svg>
);
const MenuIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
);

// Closes a popup on outside click or Escape.
function useDismiss(ref, open, setOpen) {
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]); // eslint-disable-line
}

/* ---------- notification bell ---------- */
function Bell() {
  const { t } = useTranslation('nav');
  const [notes, setNotes] = useState({ data: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const load = () => notificationApi.list().then(setNotes).catch(() => {});
  useEffect(() => { load(); const timer = setInterval(load, 60000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (open) load(); }, [open]);
  useDismiss(ref, open, setOpen);
  const readAll = async () => { await notificationApi.readAll(); load(); };
  const latest = notes.data.slice(0, 6);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true"
        aria-label={notes.unread ? t('notifUnread', { count: notes.unread }) : t('notifications')}
        className="relative grid h-8 w-8 place-items-center text-mn-navy transition-colors hover:text-mn focus:outline-none focus-visible:ring-2 focus-visible:ring-mn">
        <Ico name="bell" size={18} />
        {notes.unread > 0 && <span className="absolute right-0 top-0 min-w-[16px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[16px] text-white">{notes.unread > 9 ? '9+' : notes.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 max-w-[calc(100vw-1.5rem)] border border-slate-200 bg-white shadow-[0_6px_16px_rgba(0,0,0,.18)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <span className="text-sm font-bold text-mn-text">{t('notifications')}</span>
            {notes.unread > 0 && <button type="button" onClick={readAll} className="text-xs text-mn-link hover:underline">{t('markAllRead')}</button>}
          </div>
          <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
            {latest.length === 0 && <p className="px-4 py-5 text-sm text-slate-500">{t('notifEmpty')}</p>}
            {latest.map((n) => (
              <div key={n.id} className="px-4 py-2.5 text-sm">
                <div className={n.readAt ? 'text-slate-700' : 'font-semibold text-slate-900'}>{n.title}</div>
                <div className="text-slate-600">{n.body}</div>
                <div className="mt-0.5 text-xs text-slate-400">{fmt(n.createdAt)}</div>
              </div>
            ))}
          </div>
          <Link to="/" onClick={() => setOpen(false)} className="block border-t border-slate-200 px-4 py-2 text-center text-sm text-mn-link hover:bg-slate-50">{t('viewAll')}</Link>
        </div>
      )}
    </div>
  );
}

/* ---------- user menu (avatar + name) ---------- */
function UserMenu({ user, logout }) {
  const { t } = useTranslation(['nav', 'common']);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(ref, open, setOpen);
  const initial = (user.fullName || user.username || '?').trim().charAt(0).toUpperCase();
  const first = (user.fullName || user.username || '').trim().split(/\s+/)[0];
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true"
        className="flex items-center gap-2 rounded px-1.5 py-0.5 text-[14px] text-mn-text hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-mn">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-mn text-xs font-bold text-white" aria-hidden="true">{initial}</span>
        <span className="hidden max-w-[140px] truncate sm:inline">{first}</span>
        <span className="hidden border-x-[4px] border-t-[4px] border-x-transparent border-t-mn-text sm:inline-block" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-56 border border-slate-200 bg-white py-1 shadow-[0_6px_16px_rgba(0,0,0,.18)]">
          <div className="border-b border-slate-100 px-4 py-2">
            <div className="truncate text-sm font-semibold text-slate-800">{user.fullName}</div>
            <div className="truncate text-xs text-slate-500">{user.roleName}</div>
          </div>
          <Link role="menuitem" to="/password" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-mn-text hover:bg-slate-50">{t('nav:password')}</Link>
          <button role="menuitem" type="button" onClick={logout} className="block w-full px-4 py-2 text-left text-sm text-mn-text hover:bg-slate-50">{t('common:logout')}</button>
        </div>
      )}
    </div>
  );
}

/* ---------- sidebar row styles ---------- */
const rowBase = 'flex w-full items-center gap-3 border-b border-slate-300 border-l-4 text-left text-[14.5px] text-mn-text transition-colors focus:outline-none focus-visible:bg-slate-100';
const topLink = ({ isActive }) => `${rowBase} min-h-[52px] pl-5 pr-4 ${isActive ? 'border-l-mn bg-[#efefef] font-bold text-slate-800' : 'border-l-transparent bg-white hover:bg-slate-50'}`;
const subLink = ({ isActive }) => `flex min-h-[42px] items-center border-b border-slate-200 py-2 pl-[56px] pr-3 text-[14px] transition-colors focus:outline-none focus-visible:bg-slate-100 ${isActive ? 'bg-white font-bold text-mn-dark' : 'text-mn-text hover:bg-white hover:text-slate-900'}`;

export default function Shell({ children }) {
  const { user, logout, can } = useAuth();
  const { t } = useTranslation(['nav', 'common']);
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);     // mobile slide-in menu
  const [collapsed, setCollapsed] = useState(false); // desktop: hide the sidebar
  // Groups the user has toggled by hand. A group is open if toggled open, or (when untouched) if the current page is inside it.
  const [toggled, setToggled] = useState({});
  const isOpen = (g) => (g.key in toggled ? toggled[g.key] : inGroup(g, pathname));
  const closeDrawer = () => setDrawer(false);
  const burger = () => (window.matchMedia('(min-width: 768px)').matches ? setCollapsed((c) => !c) : setDrawer((d) => !d));

  const itemLabel = (to) => (to === '/password' ? t('nav:password') : t(`nav:items.${slug(to)}`));
  const groupLabel = (key) => (key === 'account' ? t('nav:account') : t(`nav:groups.${key}`));

  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter(([, , p]) => !p || [].concat(p).some(can)) })).filter((g) => g.items.length);
  const page = locate(pathname);
  const trail = [{ label: t('nav:home'), to: '/' }, ...(page.group ? [{ label: groupLabel(page.group) }] : []), { label: itemLabel(page.to), current: true }];
  const today = new Date().toLocaleDateString(currentLocale(), { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-mn-bg font-ui">
      {/* ===== Header band ===== */}
      <header className="flex h-14 shrink-0 items-stretch bg-mn text-white md:h-[64px]">
        <div className="grid w-14 shrink-0 place-items-center bg-white md:w-[120px]" aria-hidden="true">
          <svg viewBox="0 0 64 64" className="h-9 w-9 md:h-12 md:w-12">
            <circle cx="32" cy="32" r="30" fill="#1c3f73" /><circle cx="32" cy="32" r="30" fill="none" stroke="#4f86c6" strokeWidth="3" />
            <text x="32" y="41" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="26" fill="#fff">MG</text>
          </svg>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center px-4 font-[Arial,Helvetica,sans-serif] md:px-3">
          <div className="truncate text-lg font-bold leading-tight md:text-[24px]">MAINLAND GROUP</div>
          <div className="truncate text-[11px] uppercase leading-tight md:mt-0.5 md:text-[15px]">{t('nav:systemName')}</div>
        </div>
        <button type="button" onClick={burger} aria-label={t('nav:toggleMenu')} aria-expanded={drawer || !collapsed}
          className="mr-3 grid w-11 shrink-0 place-items-center self-center rounded py-2 text-white hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:mr-8"><MenuIcon /></button>
      </header>
      <div className="h-[5px] shrink-0" style={{ background: 'linear-gradient(#4f86c6 0 55%, #1c3f73 55%)' }} aria-hidden="true" />

      <div className="relative flex min-h-0 flex-1">
        {drawer && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={closeDrawer} aria-hidden="true" />}

        {/* ===== Sidebar ===== */}
        <aside className={`${drawer ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'md:hidden' : 'md:translate-x-0'} fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-white shadow-xl transition-transform md:static md:z-auto md:w-[242px] md:shrink-0 md:shadow-none md:border-r md:border-slate-200`}>
          <div className="flex h-[46px] shrink-0 items-center px-6 text-[14px] uppercase tracking-wide text-white"
            style={{ background: 'linear-gradient(115deg, #12305a 0 78%, #0c2447 78% 100%)' }}>{t('nav:mainMenu')}</div>
          <nav aria-label={t('nav:mainNav')} className="flex-1 overflow-y-auto border-t border-slate-300">
            {TOP.filter(([, , p]) => !p || [].concat(p).some(can)).map(([to]) => (
              <NavLink key={to} to={to} end={to === '/'} className={topLink} onClick={closeDrawer}>
                <Ico name={to === '/' ? 'grid' : 'badge'} className="opacity-80" /><span>{itemLabel(to)}</span>
              </NavLink>
            ))}
            {groups.map((g) => {
              const o = isOpen(g); const active = inGroup(g, pathname);
              return (
                <div key={g.key}>
                  <button type="button" aria-expanded={o} onClick={() => setToggled({ ...toggled, [g.key]: !o })}
                    className={`${rowBase} min-h-[52px] pl-5 pr-4 ${active ? 'border-l-mn bg-[#efefef] font-bold text-slate-800' : 'border-l-transparent bg-white hover:bg-slate-50'}`}>
                    <Ico name={GROUP_ICON[g.key] || 'grid'} className="opacity-80" />
                    <span className="flex-1">{groupLabel(g.key)}</span><Chevron open={o} />
                  </button>
                  {o && <div className="bg-[#f7f7f7]">{g.items.map(([to]) => <NavLink key={to} to={to} className={subLink} onClick={closeDrawer}>{itemLabel(to)}</NavLink>)}</div>}
                </div>
              );
            })}
            <NavLink to="/password" className={topLink} onClick={closeDrawer}><Ico name="key" className="opacity-80" /><span>{t('nav:password')}</span></NavLink>
          </nav>
        </aside>

        {/* ===== Navbar + content ===== */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[46px] shrink-0 items-center justify-between gap-3 bg-white px-4 md:px-9">
            <nav aria-label={t('nav:breadcrumb')} className="min-w-0">
              <ol className="flex flex-wrap items-center gap-x-2 text-[14px]">
                {trail.map((c, i) => (
                  <li key={`${c.label}-${i}`} className="flex items-center gap-2">
                    {i > 0 && <span className="text-slate-400" aria-hidden="true">/</span>}
                    {c.current ? <span className="font-bold text-slate-700" aria-current="page">{c.label}</span>
                      : c.to ? <Link to={c.to} className="text-mn-text hover:text-mn-dark">{c.label}</Link>
                      : <span className="text-mn-text">{c.label}</span>}
                  </li>
                ))}
              </ol>
            </nav>
            <div className="flex shrink-0 items-center gap-1 sm:gap-3">
              <LanguageSwitcher />
              <UserMenu user={user} logout={logout} />
              {can('notifications.read') && <Bell />}
              <button type="button" onClick={logout}
                className="flex items-center gap-2 rounded px-2 py-1 text-[14px] text-mn-text hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-mn">
                <Ico name="out" size={17} /><span className="hidden sm:inline">{t('common:logout')}</span>
              </button>
            </div>
          </div>

          <div className="mx-4 flex shrink-0 flex-wrap items-center justify-between gap-x-6 border-b border-mn-navy bg-white px-1 py-1 text-[12.5px] font-bold md:mx-5">
            <span className="text-[#0000ee]">{t('nav:dateLabel')} : {today}</span>
            <span className="text-slate-700">{t('nav:roleLabel')} : {user.roleName}</span>
          </div>

          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}