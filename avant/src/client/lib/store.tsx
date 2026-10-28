// Estado global leve: metadados, versão de dados (recarregamento após alterações) e notificações.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { setTimezone } from './format';
import { runtime } from './runtime';
import type { WallpaperKind } from '../components/Wallpaper';

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
  dark: boolean;
}

export interface Prefs {
  reduceMotion: boolean;
  sidebarCollapsed: boolean;
  theme: 'sistema' | 'claro' | 'escuro';
  /** Personalização de cada pessoa. */
  accent: string;
  font: FontKey;
  scale: number;
  wallpaper: WallpaperKind;
  wallpaperIntensity: number;
}

export const FONTS = [
  { key: 'padrao', label: 'Padrão (Segoe UI)', css: "'Segoe UI', 'Segoe UI Web', Arial, Helvetica, sans-serif" },
  { key: 'arial', label: 'Arial', css: 'Arial, Helvetica, sans-serif' },
  { key: 'verdana', label: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
  { key: 'trebuchet', label: 'Trebuchet', css: "'Trebuchet MS', 'Segoe UI', sans-serif" },
  { key: 'tahoma', label: 'Tahoma', css: 'Tahoma, Verdana, sans-serif' },
  { key: 'georgia', label: 'Georgia (serifada)', css: "Georgia, 'Times New Roman', serif" },
  { key: 'arredondada', label: 'Arredondada', css: "ui-rounded, 'SF Pro Rounded', 'Nunito', 'Varela Round', 'Segoe UI', sans-serif" }
] as const;
export type FontKey = (typeof FONTS)[number]['key'];
export const SCALES = [
  { value: 0.9, label: 'Pequeno' },
  { value: 1, label: 'Normal' },
  { value: 1.12, label: 'Grande' },
  { value: 1.25, label: 'Muito grande' }
];
export const DEFAULT_LOOK = { accent: '#2f6bff', font: 'padrao' as FontKey, scale: 1, wallpaper: 'aurora' as WallpaperKind, wallpaperIntensity: 0.7 };

const Ctx = createContext<Store | null>(null);

function systemPrefersDark(): boolean {
  const host = document.documentElement.getAttribute('data-theme');
  if (host === 'dark') return true;
  if (host === 'light') return false;
  return !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

/** Preferências por pessoa (quando há login) e por navegador. */
const prefsKey = () => (runtime.auth ? `avant:prefs:${runtime.auth.me.id}` : 'avant:prefs');

function loadPrefs(): Prefs {
  const base: Prefs = { reduceMotion: false, sidebarCollapsed: false, theme: 'sistema', ...DEFAULT_LOOK };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(prefsKey()) ?? '{}') };
  } catch {
    return base;
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
        localStorage.setItem(prefsKey(), JSON.stringify(next));
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

  // Outras partes da página (ex.: downloads da edição online) podem pedir notificações.
  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; kind?: Toast['kind'] }>).detail;
      toast(d.text, d.kind ?? 'ok');
    };
    const onRefresh = () => refresh();
    window.addEventListener('avant:toast', onToast);
    window.addEventListener('avant:refresh', onRefresh);
    return () => {
      window.removeEventListener('avant:toast', onToast);
      window.removeEventListener('avant:refresh', onRefresh);
    };
  }, [toast, refresh]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', prefs.reduceMotion);
  }, [prefs.reduceMotion]);

  // Tema: escolha do usuário ou, em "sistema", o tema do ambiente (claude.ai ou sistema operacional).
  const [systemDark, setSystemDark] = useState(() => systemPrefersDark());
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(systemPrefersDark());
    mq?.addEventListener?.('change', update);
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq?.removeEventListener?.('change', update);
      obs.disconnect();
    };
  }, []);
  const dark = prefs.theme === 'escuro' || (prefs.theme === 'sistema' && systemDark);
  useEffect(() => {
    document.documentElement.setAttribute('data-avant-theme', dark ? 'dark' : 'light');
    // Personalização: cor principal, fonte e tamanho do texto.
    const st = document.documentElement.style;
    const a = /^#[0-9a-f]{6}$/i.test(prefs.accent) ? prefs.accent : DEFAULT_LOOK.accent;
    const fg = dark ? `color-mix(in srgb, ${a} 72%, white)` : a;
    st.setProperty('--accent', a);
    st.setProperty('--accent-strong', `color-mix(in srgb, ${a} 78%, black)`);
    for (const v of ['--accent-fg', '--navy-600', '--blue-500', '--blue-400', '--chart-bar']) st.setProperty(v, fg);
    st.setProperty('--navy-700', `color-mix(in srgb, ${fg} 85%, ${dark ? 'white' : 'black'})`);
    st.setProperty('--blue-100', `color-mix(in srgb, ${a} ${dark ? 18 : 14}%, transparent)`);
    st.setProperty('--blue-50', `color-mix(in srgb, ${a} ${dark ? 9 : 7}%, transparent)`);
    const font = FONTS.find((f) => f.key === prefs.font) ?? FONTS[0];
    for (const v of ['--font', '--font-display', '--font-mono']) st.setProperty(v, font.css);
    st.setProperty('--ui-scale', String(SCALES.some((x) => x.value === prefs.scale) ? prefs.scale : 1));
    document.documentElement.classList.toggle('has-wallpaper', prefs.wallpaper !== 'nenhum');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }, [dark, prefs.accent, prefs.font, prefs.scale, prefs.wallpaper]);

  const value = useMemo(
    () => ({ meta, version, refresh, toast, toasts, dismissToast, fail, busy, track, prefs, setPrefs, dark }),
    [meta, version, refresh, toast, toasts, dismissToast, fail, busy, track, prefs, setPrefs, dark]
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
