import axios from 'axios';
import i18n from '../i18n';

let token = null;
export const setToken = (t) => { token = t; };

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

api.interceptors.request.use((c) => { if (token) c.headers.Authorization = `Bearer ${token}`; return c; });

// One refresh at a time: refresh tokens rotate, so parallel refreshes would look like token theft.
let inflight = null;
export const refreshOnce = () => (inflight ||= api.post('/auth/refresh').then((r) => { setToken(r.data.accessToken); return r.data.accessToken; }).finally(() => { inflight = null; }));

api.interceptors.response.use((r) => r, async (e) => {
  const o = e.config;
  if (e.response?.status === 401 && !o._retry && !o.url.startsWith('/auth/')) {
    o._retry = true;
    try { await refreshOnce(); return api(o); } catch { setToken(null); window.dispatchEvent(new Event('auth:expired')); }
  }
  return Promise.reject(e);
});

// Kiingereza: ujumbe wa backend kama ulivyo (una undani zaidi). Lugha nyingine: tafsiri kwa `code`, ukikosekana ujumbe wa backend.
export const errMsg = (e) => {
  const er = e.response?.data?.error;
  if (i18n.resolvedLanguage !== 'en' && er?.code && i18n.exists(`errors:${er.code}`)) return i18n.t(`errors:${er.code}`);
  if (er?.message) return er.message;
  if (e.request && !e.response) return i18n.t('errors:NETWORK_ERROR');
  return e.message || i18n.t('errors:UNKNOWN');
};
export const fieldErrs = (e) => Object.fromEntries((e.response?.data?.error?.details || []).map((d) => [d.field, d.message]));
