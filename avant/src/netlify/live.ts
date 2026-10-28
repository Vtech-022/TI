// "Ao vivo": consulta a versão dos dados a cada poucos segundos e avisa as telas quando alguém salva.
type What = 'db' | 'team';
type State = { ok: boolean; at: Date | null };

const listeners = new Set<(what: What) => void>();
const stateListeners = new Set<(s: State) => void>();
let state: State = { ok: true, at: null };
let last: { db: string | null; team: string | null } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

export const INTERVAL_MS = 3000;

export function onLive(fn: (what: What) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function onLiveState(fn: (s: State) => void): () => void {
  stateListeners.add(fn);
  fn(state);
  return () => stateListeners.delete(fn);
}

function setState(s: State) {
  state = s;
  stateListeners.forEach((f) => f(s));
}

async function poll() {
  if (running) return;
  running = true;
  try {
    const res = await fetch('/api/live', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) throw new Error(String(res.status));
    const v = (await res.json()) as { db: string | null; team: string | null };
    if (last) {
      if (v.db !== last.db) listeners.forEach((f) => f('db'));
      if (v.team !== last.team) listeners.forEach((f) => f('team'));
    }
    last = { db: v.db, team: v.team };
    setState({ ok: true, at: new Date() });
  } catch {
    setState({ ok: false, at: state.at });
  } finally {
    running = false;
  }
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!document.hidden) await poll();
    schedule();
  }, INTERVAL_MS);
}

export function startLive() {
  void poll();
  schedule();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void poll();
  });
  window.addEventListener('avant:live-poll', () => void poll());
  window.addEventListener('online', () => void poll());
}
