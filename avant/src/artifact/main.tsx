// Edição online do AVANT: a aplicação completa rodando no navegador, publicada como artifact.
import '../client/styles/app.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { runtime } from '../client/lib/runtime';
import { StoreProvider } from '../client/lib/store';
import { routes } from '../client/routes';
import type { Ctx } from '../server/context';
import { seed } from '../server/seed';
import { recomputePriorities } from '../server/services/tasks';
import { createLocalApi } from './localApi';
import { flush, hasPending, loadSnapshot, onSaveState, SaveState, scheduleSave, watchRemote } from './persist';
import { openBrowserDatabase } from './sqlite';
import { createTeamStore } from './team';
import { createLocalTeamStore } from './teamLocal';
import { Login } from '../client/components/Login';
import { hasAccounts, localAuthApi, localLogin, localRegister, sessionUser } from './localAuth';
import type { StoredUser } from '../shared/auth';

const rootEl = document.getElementById('root')!;
const toast = (text: string, kind: 'ok' | 'error' = 'ok') => window.dispatchEvent(new CustomEvent('avant:toast', { detail: { text, kind } }));

function SaveStatus() {
  const [s, setS] = useState<SaveState | null>(null);
  useEffect(() => onSaveState(setS), []);
  if (!s) return null;
  const time = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : null;
  if (s.pending) return <span title="Salvando alterações">Salvando…</span>;
  if (s.kind === 'nuvem') return <span title="Dados salvos na sua área privada do artifact">Salvo na nuvem{s.savedAt ? ` · ${time(s.savedAt)}` : ''}</span>;
  if (s.kind === 'local') return <span title={s.reason}>Salvo só neste navegador</span>;
  return (
    <span title={s.message} style={{ color: '#f3a59c' }}>
      Atenção: falha ao salvar na nuvem
    </span>
  );
}

async function download(href: string) {
  const local = window.__avantLocal!;
  const r = await local('GET', href);
  const d = r.data as any;
  if (r.status >= 400) return toast(d?.message ?? 'Não foi possível baixar o arquivo.', 'error');
  const dl = await window.claude?.use('downloads').catch(() => null);
  const file = href.startsWith('/api/export')
    ? { filename: `avant-copia-${new Date().toISOString().slice(0, 10)}.json`, data: JSON.stringify(d, null, 2) }
    : { filename: d.filename as string, data: d.bytes as Uint8Array };
  if (!dl) {
    // Arquivo HTML avulso: download comum do navegador.
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([file.data as BlobPart]));
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  try {
    await dl.save(file);
  } catch (e: any) {
    if (e?.code === 'declined') return;
    toast(e?.code === 'rejected_extension' ? 'Este tipo de arquivo não pode ser baixado aqui.' : `Download não concluído: ${e?.message ?? e}`, 'error');
  }
}

const root = createRoot(rootEl);
/** Arquivo HTML avulso: pede login (ou criação da conta) antes de abrir o sistema. */
function askLogin(): Promise<StoredUser> {
  const current = sessionUser();
  if (current) return Promise.resolve(current);
  return new Promise((resolve) =>
    root.render(
      <Login
        firstAccount={!hasAccounts()}
        subtitle="Seu sistema de rotina e acompanhamento do trabalho. Os dados ficam guardados neste navegador, neste computador."
        login={async (name, password) => resolve(await localLogin(name, password))}
        register={async (name, password) => resolve(await localRegister(name, password))}
      />
    )
  );
}

async function boot() {
  if (!window.claude) {
    const user = await askLogin();
    runtime.userName = user.name;
    runtime.auth = localAuthApi(user);
  }
  root.render(<div className="boot">Carregando o AVANT…</div>);
  const loaded = await loadSnapshot();
  const db = await openBrowserDatabase(loaded.bytes);
  const ctx: Ctx = { db, tz: 'America/Sao_Paulo', dataDir: '', maxUploadBytes: 15 * 1024 * 1024, now: () => new Date() };
  const save = () => scheduleSave(() => (ctx.db as typeof db).export());
  // A carga inicial só é criada quando não há banco salvo (seed() também verifica isso no próprio banco).
  const seeded = seed(ctx);
  recomputePriorities(ctx);
  window.__avantLocal = createLocalApi(ctx, save);
  if (seeded && loaded.confirmedEmpty) save();
  if (!loaded.cloudReady || !loaded.bytes) save();

  watchRemote(async () => {
    if (hasPending()) {
      toast('Outro dispositivo salvou alterações. Recarregue a página depois de salvar as suas para ver a versão mais recente.', 'error');
      return;
    }
    const fresh = await loadSnapshot();
    if (fresh.bytes) {
      ctx.db = await openBrowserDatabase(fresh.bytes);
      recomputePriorities(ctx);
      window.dispatchEvent(new Event('avant:refresh'));
      toast('Dados atualizados com as alterações feitas em outro dispositivo.');
    }
  });
  setInterval(() => {
    recomputePriorities(ctx);
    window.dispatchEvent(new Event('avant:refresh'));
  }, 60 * 60 * 1000);
  window.addEventListener('pagehide', () => void flush());

  runtime.mode = 'online';
  runtime.Status = SaveStatus;
  runtime.team = window.claude || !runtime.auth ? createTeamStore() : createLocalTeamStore(runtime.auth.me);
  const hash = location.hash.replace(/^#/, '');
  const known = ['equipe', 'foco', 'captura', 'pendencias', 'projetos', 'agenda', 'terceiros', 'arquivos', 'historico', 'relatorios', 'configuracoes'];
  const router = createMemoryRouter(routes, { initialEntries: [known.includes(hash) ? `/${hash}` : '/'] });

  // Links internos navegam pelo roteador; links da API viram downloads com confirmação.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
    const a = (e.target as Element | null)?.closest?.('a[href]');
    const href = a?.getAttribute('href');
    if (!href || !href.startsWith('/') || href.startsWith('/_blob/')) return;
    e.preventDefault();
    if (href.startsWith('/api/')) void download(href);
    else void router.navigate(href);
  });

  root.render(
    <StrictMode>
      <StoreProvider>
        <RouterProvider router={router} />
      </StoreProvider>
    </StrictMode>
  );
}

boot().catch((err) => {
  console.error(err);
  root.unmount();
  rootEl.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'boot error';
  box.textContent = `Não foi possível iniciar o AVANT: ${err?.message ?? err}. Recarregue a página.`;
  rootEl.appendChild(box);
});
