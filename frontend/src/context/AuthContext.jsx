import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { setToken, refreshOnce, authApi } from '../api/index.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const load = useCallback(async () => { const data = await authApi.me(); setUser(data); return data; }, []);
  useEffect(() => {
    refreshOnce().then(load).catch(() => setUser(null)).finally(() => setReady(true));
    const out = () => setUser(null);
    window.addEventListener('auth:expired', out); return () => window.removeEventListener('auth:expired', out);
  }, [load]);
  const login = async (username, password) => { const data = await authApi.login(username, password); setToken(data.accessToken); return load(); };
  const logout = async () => { await authApi.logout().catch(() => {}); setToken(null); setUser(null); };
  const can = (p) => !!user?.permissions.includes(p);
  return <Ctx.Provider value={{ user, ready, login, logout, can, reload: load }}>{children}</Ctx.Provider>;
}
