import {
  BarChart3,
  FileStack,
  FolderKanban,
  Hourglass,
  LayoutDashboard,
  ListChecks,
  Menu,
  Moon,
  Palette,
  Plus,
  Search,
  Sun,
  ShieldCheck,
  Target,
  Users,
  Zap
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NewTaskModal, NotificationsButton, QuickCapture, SearchPalette, ShortcutsHelp } from './components/Overlays';
import { AccountMenu } from './components/AccountMenu';
import { Personalize } from './components/Personalize';
import { Wallpaper } from './components/Wallpaper';
import { TaskDrawerHost } from './components/TaskDrawer';
import { Toasts } from './components/ui';
import { isAdmin, runtime } from './lib/runtime';
import { useApi, useStore } from './lib/store';

export const NAV = [
  { to: '/', label: 'Meu dia', icon: LayoutDashboard, section: 'Operação' },
  { to: '/foco', label: 'Prioridades', icon: Target },
  { to: '/pendencias', label: 'Minhas tarefas', icon: ListChecks, section: 'Gestão' },
  { to: '/projetos', label: 'Frentes de trabalho', icon: FolderKanban },
  { to: '/terceiros', label: 'Aguardando Terceiros', icon: Hourglass },
  { to: '/equipe', label: 'Atividades da equipe', icon: Users, section: 'Equipe' },
  { to: '/arquivos', label: 'Arquivos e Documentos', icon: FileStack, section: 'Registro' },
  { to: '/relatorios', label: 'Acompanhamento', icon: BarChart3 }
];

const ADMIN_NAV = { to: '/usuarios', label: 'Usuários', icon: ShieldCheck };

/** Marca AVANT: o "A" tem a perna direita transformada em sinal de concluído que avança para fora da letra. */
export function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="brand-mark">
      <defs>
        <linearGradient id="avant-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f6bff" />
          <stop offset="1" stopColor="#7b4dff" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="19" fill="url(#avant-g)" />
      <path d="M18 47 L30.6 17 Q32 14 33.4 17 L39.5 31.5" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 37 L28.5 43 L47 24.5" fill="none" stroke="#ffb23f" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="47.5" cy="45.5" r="3.4" fill="#fff" />
    </svg>
  );
}

export default function App() {
  const { setPrefs, busy, dark, prefs } = useStore();
  const [personalize, setPersonalize] = useState(false);
  const systemReduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    const open = () => setPersonalize(true);
    window.addEventListener('avant:personalize', open);
    return () => window.removeEventListener('avant:personalize', open);
  }, []);
  const [palette, setPalette] = useState(false);
  const [capture, setCapture] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const [help, setHelp] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { data: counts } = useApi<{ counts: Record<string, number>; confirmations: unknown[] }>('/api/dashboard');

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
      const modalOpen = !!document.querySelector('[aria-modal="true"]');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(true);
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const k = e.code;
        const map: Record<string, () => void> = {
          KeyC: () => setCapture(true),
          KeyN: () => setNewTask(true),
          KeyP: () => navigate('/pendencias?priority=critica'),
          KeyH: () => navigate('/foco')
        };
        if (map[k]) {
          e.preventDefault();
          map[k]();
          return;
        }
        const digit = /^Digit([1-9])$/.exec(k);
        if (digit) {
          e.preventDefault();
          navigate(NAV[Number(digit[1]) - 1].to);
        }
        return;
      }
      if (typing || modalOpen) return;
      if (e.key === '/') {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === '?') {
        setHelp(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const badge = (to: string) => {
    const c = counts?.counts;
    if (!c) return null;
    if (to === '/foco' && c.critical + c.overdue > 0) return <span className="nav-count alert">{c.critical + c.overdue}</span>;

    if (to === '/captura' && counts?.confirmations.length) return <span className="nav-count alert">{counts.confirmations.length}</span>;
    return null;
  };


  return (
    <div className={`shell shell-rail${mobileOpen ? ' mobile-open' : ''}`}>
      {createPortal(<Wallpaper kind={prefs.wallpaper} accent={prefs.accent} dark={dark} intensity={prefs.wallpaperIntensity} still={prefs.reduceMotion || systemReduce} />, document.body)}
      <Personalize open={personalize} onClose={() => setPersonalize(false)} />
      {busy > 0 && <div className="loading-bar" aria-hidden />}
      <div className="mobile-scrim" onClick={() => setMobileOpen(false)} />
      <aside className="rail" aria-label="Navegação principal">
        <NavLink to="/" end className="rail-brand" aria-label="AVANT — Meu dia" title="AVANT · Central Inteligente de Gestão">
          <BrandMark size={46} />
          <span className="rb-word">avant</span>
        </NavLink>
        <nav className="rail-nav">
          {(isAdmin() ? [...NAV, ADMIN_NAV] : NAV).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className="rail-item" aria-label={n.label} data-tip={n.label}>
              <n.icon aria-hidden />
              <span className="rail-label">{n.label}</span>
              {badge(n.to)}
            </NavLink>
          ))}
        </nav>
        <div className="rail-foot">{runtime.Status ? <runtime.Status /> : <>Dados locais</>}</div>
      </aside>

      <div className="main">
        <header className="header topbar">
          <button className="icon-btn mobile-only" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu />
          </button>
          <div className="greet" />
          <button className="search-pill" onClick={() => setPalette(true)} aria-label="Pesquisa global">
            <Search aria-hidden />
            <span>Buscar</span>
          </button>
          <div className="action-pill">
            <button className="icon-btn" onClick={() => setCapture(true)} aria-label="Captura rápida" title="Captura rápida">
              <Zap />
            </button>
            <button className="icon-btn" onClick={() => setNewTask(true)} aria-label="Nova tarefa" title="Nova tarefa">
              <Plus />
            </button>
            <button className="icon-btn" onClick={() => setPersonalize(true)} aria-label="Personalizar aparência" title="Personalizar">
              <Palette />
            </button>
            <NotificationsButton />
            <button className="icon-btn" onClick={() => setPrefs({ theme: dark ? 'claro' : 'escuro' })} aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'} title={dark ? 'Modo claro' : 'Modo escuro'}>
              {dark ? <Sun /> : <Moon />}
            </button>
            <AccountMenu />
          </div>
        </header>
        <main className="content" id="conteudo">
          <div className="page-enter" key={location.pathname}>
            <Outlet />
          </div>
        </main>
      </div>

      <button className="fab" onClick={() => setNewTask(true)} aria-label="Nova tarefa">
        <Plus />
      </button>
      <nav className="tabbar" aria-label="Navegação rápida">
        <NavLink to="/" end>
          <LayoutDashboard aria-hidden />
          Início
        </NavLink>
        <NavLink to="/pendencias">
          <ListChecks aria-hidden />
          Tarefas
        </NavLink>
        <button className="tab-main" onClick={() => setCapture(true)} aria-label="Captura rápida">
          <Zap aria-hidden />
          Capturar
        </button>
        <NavLink to="/projetos">
          <FolderKanban aria-hidden />
          Frentes
        </NavLink>
        <button onClick={() => setNewTask(true)} aria-label="Nova tarefa">
          <Plus aria-hidden />
          Tarefa
        </button>
      </nav>
      <SearchPalette open={palette} onClose={() => setPalette(false)} />
      <QuickCapture open={capture} onClose={() => setCapture(false)} />
      <NewTaskModal open={newTask} onClose={() => setNewTask(false)} />
      <ShortcutsHelp open={help} onClose={() => setHelp(false)} />
      <TaskDrawerHost />
      <Toasts />
    </div>
  );
}
