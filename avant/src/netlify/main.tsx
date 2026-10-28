// Versão compartilhada do AVANT (Netlify): todos veem e editam os mesmos dados, atualizados ao vivo.
import '../client/styles/app.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Login } from '../client/components/Login';
import { runtime } from '../client/lib/runtime';
import { StoreProvider } from '../client/lib/store';
import { routes } from '../client/routes';
import { onLive, onLiveState, startLive } from './live';
import { createHttpTeamStore } from './team';

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

type Me = { id: string; name: string; role: 'admin' | 'membro' };

async function call<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique a internet.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message ?? `Erro ${res.status}`);
  return data as T;
}

function start(me: Me) {
  runtime.mode = 'compartilhado';
  runtime.userName = me.name;
  runtime.Status = LiveStatus;
  runtime.auth = {
    me,
    logout: () => call('/api/auth/logout', 'POST', {}).then(() => undefined),
    listUsers: () => call('/api/auth/users'),
    updateUser: (id, change) => call(`/api/auth/users/${id}`, 'POST', change).then(() => undefined),
    removeUser: (id) => call(`/api/auth/users/${id}`, 'DELETE', {}).then(() => undefined),
    changePassword: (current, next) => call('/api/auth/password', 'POST', { current, next }).then(() => undefined)
  };
  runtime.team = createHttpTeamStore(me);
  startLive();
  onLive((what) => what === 'db' && window.dispatchEvent(new Event('avant:refresh')));
  // Sessão expirada ou conta excluída: volta para o login.
  onLiveState((s) => s.unauthorized && location.reload());
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
  let info: { user: Me | null; hasUsers: boolean; needCode: boolean };
  try {
    info = await call('/api/auth/me');
  } catch (e: any) {
    root.render(<div className="boot error">Não foi possível conectar ao AVANT: {e?.message}. Recarregue a página.</div>);
    return;
  }
  if (info.user) return start(info.user);
  root.render(
    <Login
      firstAccount={!info.hasUsers}
      needCode={info.needCode}
      subtitle="Central de acompanhamento do trabalho da equipe. O que for registrado aqui aparece para todos, ao vivo."
      login={async (name, password) => start((await call<{ user: Me }>('/api/auth/login', 'POST', { name, password })).user)}
      register={async (name, password, code) => start((await call<{ user: Me }>('/api/auth/register', 'POST', { name, password, code })).user)}
    />
  );
}

void boot();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
