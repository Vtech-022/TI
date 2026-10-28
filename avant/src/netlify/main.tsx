// Versão compartilhada do AVANT (Netlify): todos veem e editam os mesmos dados, atualizados ao vivo.
import '../client/styles/app.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { BrandMark } from '../client/App';
import { runtime } from '../client/lib/runtime';
import { StoreProvider } from '../client/lib/store';
import { routes } from '../client/routes';
import { onLive, onLiveState, startLive } from './live';
import { createHttpTeamStore } from './team';

const KEY = 'avant.identidade';
type Identity = { id: string; name: string };

function readIdentity(): Identity | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && typeof v.id === 'string' && typeof v.name === 'string' && v.name.trim() ? v : null;
  } catch {
    return null;
  }
}

function LiveStatus() {
  const [s, setS] = useState<{ ok: boolean; at: Date | null }>({ ok: true, at: null });
  useEffect(() => onLiveState(setS), []);
  if (!s.ok) return <span style={{ color: '#e5484d' }} title="Sem conexão com o servidor; tentando novamente">Sem conexão</span>;
  return (
    <span className="live-status" title="As alterações de todos aparecem aqui automaticamente, em poucos segundos">
      <span className="live-dot" aria-hidden /> Ao vivo
    </span>
  );
}

function Gate({ needCode, initialName, onDone }: { needCode: boolean; initialName: string; onDone: (name: string) => void }) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Informe seu nome.');
    setBusy(true);
    setError(null);
    try {
      if (needCode) {
        const res = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'Código de acesso incorreto.');
      }
      onDone(name.trim());
    } catch (err: any) {
      setError(err?.message ?? 'Não foi possível entrar.');
      setBusy(false);
    }
  };
  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <BrandMark size={64} />
        <h1>Bem-vindo ao AVANT</h1>
        <p>Central de acompanhamento do trabalho da equipe. O que for registrado aqui aparece para todos, ao vivo.</p>
        <label className="field">
          <span>Seu nome</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ana Souza" autoFocus maxLength={80} />
        </label>
        {needCode && (
          <label className="field">
            <span>Código de acesso da equipe</span>
            <input className="input" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="current-password" />
          </label>
        )}
        {error && <p className="gate-error">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

function start(identity: Identity) {
  runtime.mode = 'compartilhado';
  runtime.userName = identity.name;
  runtime.Status = LiveStatus;
  runtime.team = createHttpTeamStore(identity);
  startLive();
  onLive((what) => what === 'db' && window.dispatchEvent(new Event('avant:refresh')));
  const router = createBrowserRouter(routes);
  root.render(
    <StrictMode>
      <StoreProvider>
        <RouterProvider router={router} />
      </StoreProvider>
    </StrictMode>
  );
}

const root = createRoot(document.getElementById('root')!);

async function boot() {
  const session = await fetch('/api/session', { credentials: 'same-origin' })
    .then((r) => r.json())
    .catch(() => ({ protected: false, ok: true }));
  const identity = readIdentity();
  if (identity && session.ok) return start(identity);
  root.render(
    <Gate
      needCode={!!session.protected && !session.ok}
      initialName={identity?.name ?? ''}
      onDone={(name) => {
        const id = identity?.id ?? crypto.randomUUID();
        const next = { id, name };
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          /* navegador sem armazenamento: vale só nesta visita */
        }
        start(next);
      }}
    />
  );
}

void boot();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
