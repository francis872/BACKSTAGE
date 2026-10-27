import { useEffect, useRef, useState } from 'react';
import { apiRequest } from './api';

export function useLiveResource(path, intervalMs = 30000) {
  const [state, setState] = useState({ data: null, loading: false, error: '', updatedAt: null });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    let running = false;
    let controller;
    setState({ data: null, loading: Boolean(path), error: '', updatedAt: null });
    const refresh = async () => {
      if (!path || !alive || running || document.hidden) return;
      running = true;
      controller = new AbortController();
      try {
        const response = await apiRequest(path, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'La consulta no está disponible.');
        if (alive) setState({ data, loading: false, error: '', updatedAt: new Date().toISOString() });
      } catch (error) {
        if (alive && error.name !== 'AbortError') setState((old) => ({ ...old, loading: false, error: error.message }));
      } finally { running = false; }
    };
    refresh();
    const timer = window.setInterval(refresh, intervalMs);
    window.addEventListener('focus', refresh);
    window.addEventListener('backstage:data-changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('backstage:data-changed', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [path, intervalMs, version]);
  return { ...state, refresh: () => setVersion((n) => n + 1) };
}

export function useLiveRefresh(callback, intervalMs = 30000) {
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    let running = false;
    const refresh = async () => {
      if (document.hidden || running) return;
      running = true;
      try { await latest.current(); } finally { running = false; }
    };
    const timer = window.setInterval(refresh, intervalMs);
    window.addEventListener('focus', refresh);
    window.addEventListener('backstage:data-changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('backstage:data-changed', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [intervalMs]);
}
