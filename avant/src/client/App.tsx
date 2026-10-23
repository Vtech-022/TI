import {
  BarChart3,
  FileStack,
  FolderKanban,
  Hourglass,
  LayoutDashboard,
  ListChecks,
  Menu,
  Moon,
  Plus,
  Search,
  Sun,
  Target,
  Users,
  Zap
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NewTaskModal, NotificationsButton, QuickCapture, SearchPalette, ShortcutsHelp } from './components/Overlays';
import { TaskDrawerHost } from './components/TaskDrawer';
import { Toasts } from './components/ui';
import { runtime } from './lib/runtime';
import { longDate } from './lib/format';
import { useApi, useStore } from './lib/store';

export const NAV = [
  { to: '/', label: 'Visão Geral', icon: LayoutDashboard, section: 'Operação' },
  { to: '/foco', label: 'Foco de Hoje', icon: Target },
  { to: '/pendencias', label: 'Minhas Pendências', icon: ListChecks, section: 'Gestão' },
  { to: '/projetos', label: 'Projetos', icon: FolderKanban },
  { to: '/terceiros', label: 'Aguardando Terceiros', icon: Hourglass },
  { to: '/equipe', label: 'Atividades da equipe', icon: Users, section: 'Equipe' },
  { to: '/arquivos', label: 'Arquivos e Documentos', icon: FileStack, section: 'Registro' },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 }
];

export function Logo() {
  return (
    <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden>
      <rect x="0.5" y="0.5" width="39" height="39" rx="9" fill="rgba(255,255,255,0.04)" stroke="rgba(214,177,84,0.45)" />
      <path d="M11 30 20 9l9 21" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M14.5 23.5h11" stroke="#c49a2c" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function greeting(now: string, tz: string) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date(now)));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export default function App() {
  const { meta, setPrefs, busy, dark } = useStore();
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

  const home = location.pathname === '/';
  const greet = meta ? greeting(meta.now, meta.tz) : 'Olá';
  const done = counts?.counts?.done_last_7_days ?? 0;

  return (
    <div className={`shell shell-rail${mobileOpen ? ' mobile-open' : ''}`}>
      {busy > 0 && <div className="loading-bar" aria-hidden />}
      <div className="mobile-scrim" onClick={() => setMobileOpen(false)} />
      <aside className="rail" aria-label="Navegação principal">
        <NavLink to="/" end className="rail-brand" aria-label="AVANT — Visão geral" title="AVANT · Central Inteligente de Gestão">
          <span className="rb-letter">A</span>
          <svg viewBox="0 0 40 14" className="rb-pulse" aria-hidden>
            <path d="M0 7h10l3-6 4 12 4-9 3 3h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </NavLink>
        <nav className="rail-nav">
          {NAV.map((n) => (
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
          <div className="greet">
            {home ? (
              <>
                <h1>
                  {greet}, Victor
                </h1>
                <p>
                  {meta ? longDate(meta.today).replace(/^./, (ch) => ch.toUpperCase()) : ''} · {done === 1 ? '1 entrega concluída' : `${done} entregas concluídas`} nesta semana
                </p>
              </>
            ) : null}
          </div>
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
            <NotificationsButton />
            <button className="icon-btn" onClick={() => setPrefs({ theme: dark ? 'claro' : 'escuro' })} aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'} title={dark ? 'Modo claro' : 'Modo escuro'}>
              {dark ? <Sun /> : <Moon />}
            </button>
            <span className="avatar me" aria-label="Victor" title="Victor">
              V
            </span>
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
          Pendências
        </NavLink>
        <button className="tab-main" onClick={() => setCapture(true)} aria-label="Captura rápida">
          <Zap aria-hidden />
          Capturar
        </button>
        <NavLink to="/projetos">
          <FolderKanban aria-hidden />
          Projetos
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
