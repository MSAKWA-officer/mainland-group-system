import { useCallback, useEffect, useState } from 'react';
import { errMsg } from '../api/index.js';

// Runs an async loader on mount and whenever `deps` change; returns { data, error, loading, reload }.
export default function useLoad(fn, deps) {
  const [s, set] = useState({ data: null, error: null, loading: true });
  const run = useCallback(() => { set((p) => ({ ...p, loading: true })); return fn().then((d) => set({ data: d, error: null, loading: false }), (e) => set({ data: null, error: errMsg(e), loading: false })); }, deps); // eslint-disable-line
  useEffect(() => { run(); }, [run]);
  return { ...s, reload: run };
}
