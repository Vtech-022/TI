// Estado global leve: metadados, versão de dados (recarregamento após alterações) e notificações.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { setTimezone } from './format';

export interface Meta {
  today: string;
  now: string;
  tz: string;
  projects: { id: number; name: string; status: string }[];
  people: string[];
  categories: string[];
  pending_confirmations: number;
  supported_formats: { ext: string; label: string }[];
  max_upload_mb: number;
  integrations: { name: string; status: string }[];
}

export interface Toast {
  id: number;
  kind: 'ok' | 'error';
  text: string;
  action?: { label: string; run: () => void };
}

interface Store {
  meta: Meta | null;
  version: number;
  refresh: () => void;
  toast: (text: string, kind?: Toast['kind'], action?: Toast['action']) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  fail: (err: unknown) => void;
  busy: number;
  track: <T>(p: Promise<T>) => Promise<T>;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
}

export interface Prefs {
  reduceMotion: boolean;
  sidebarCollapsed: boolean;
}

const Ctx = createContext<Store | null>(null);

function loadPrefs(): Prefs {
  try {
    return { reduceMotion: false, sidebarCollapsed: false, ...JSON.parse(localStorage.getItem('avant:prefs') ?? '{}') };
  } catch {
    return { reduceMotion: false, sidebarCollapsed: false };
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState(0);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const seq = useRef(0);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok', action?: Toast['action']) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, kind, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 9000 : 5000);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const fail = useCallback(
    (err: unknown) => {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Erro inesperado.';
      toast(msg, 'error');
    },
    [toast]
  );
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const track = useCallback(<T,>(p: Promise<T>) => {
    setBusy((b) => b + 1);
    return p.finally(() => setBusy((b) => b - 1));
  }, []);
  const setPrefs = useCallback((p: Partial<Prefs>) => {
    setPrefsState((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem('avant:prefs', JSON.stringify(next));
      } catch {
        /* armazenamento indisponível: preferência vale só nesta sessão */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    api
      .get<Meta>('/api/meta')
      .then((m) => {
        setTimezone(m.tz);
        setMeta(m);
      })
      .catch(fail);
  }, [version, fail]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', prefs.reduceMotion);
  }, [prefs.reduceMotion]);

  const value = useMemo(
    () => ({ meta, version, refresh, toast, toasts, dismissToast, fail, busy, track, prefs, setPrefs }),
    [meta, version, refresh, toast, toasts, dismissToast, fail, busy, track, prefs, setPrefs]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider ausente');
  return s;
}

/** Busca dados e recarrega automaticamente quando qualquer alteração é feita. */
export function useApi<T>(url: string | null) {
  const { version, track } = useStore();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [local, setLocal] = useState(0);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setLoading(true);
    track(api.get<T>(url))
      .then((d) => {
        if (alive) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [url, version, local, track]);
  return { data, error, loading, reload: () => setLocal((n) => n + 1) };
}

/** Executa uma alteração, recarrega a tela e mostra o resultado. */
export function useMutation() {
  const { refresh, toast, fail, track } = useStore();
  return useCallback(
    async <T,>(fn: () => Promise<T>, success?: string | ((r: T) => string), action?: Toast['action']): Promise<T | undefined> => {
      try {
        const r = await track(fn());
        refresh();
        if (success) toast(typeof success === 'function' ? success(r) : success, 'ok', action);
        return r;
      } catch (e) {
        fail(e);
        return undefined;
      }
    },
    [refresh, toast, fail, track]
  );
}
