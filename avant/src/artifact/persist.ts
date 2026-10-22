// Persistência da edição online: o banco SQLite inteiro é salvo compactado na área privada
// do usuário no armazenamento do artifact (capability `db`), com cópia no IndexedDB do navegador.

const CHUNK = 180_000; // caracteres base64 por documento (limite do documento: 256 KiB)
const SESSION = Math.random().toString(36).slice(2);

export type SaveState =
  | { kind: 'nuvem'; savedAt: string | null; pending: boolean }
  | { kind: 'local'; reason: string; pending: boolean }
  | { kind: 'erro'; message: string; pending: boolean };

let state: SaveState = { kind: 'local', reason: 'Conectando ao armazenamento…', pending: false };
const listeners = new Set<(s: SaveState) => void>();
export function onSaveState(fn: (s: SaveState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}
function setState(s: SaveState) {
  state = s;
  for (const l of listeners) l(s);
}

// ---------------------------------------------------------------- compactação

async function gzip(bytes: Uint8Array): Promise<{ data: Uint8Array; gz: boolean }> {
  if (typeof CompressionStream === 'undefined') return { data: bytes, gz: false };
  const out = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return { data: new Uint8Array(out), gz: true };
}
async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const out = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return new Uint8Array(out);
}
function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------- IndexedDB local

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('avant', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await idb();
    return await new Promise((resolve, reject) => {
      const r = db.transaction('kv').objectStore('kv').get(key);
      r.onsuccess = () => resolve(r.result as T);
      r.onerror = () => reject(r.error);
    });
  } catch {
    return undefined;
  }
}
export async function idbSet(key: string, value: unknown): Promise<boolean> {
  try {
    const db = await idb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- nuvem (capability db)

interface Cloud {
  base: string; // data/users/<id>
  db: any;
}
let cloud: Cloud | null = null;
let lastGen: string | null = null;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    if (e?.code !== 'unavailable') throw e;
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 800));
    return fn();
  }
}

export interface Loaded {
  bytes: Uint8Array | null;
  /** true quando foi possível confirmar que ainda não há dados salvos (permite criar a carga inicial). */
  confirmedEmpty: boolean;
  cloudReady: boolean;
}

/** Carrega o banco salvo. Nunca declara "vazio" se a leitura falhou — evita sobrescrever dados. */
export async function loadSnapshot(): Promise<Loaded> {
  const local = await idbGet<{ savedAt: string; b64: string; gz: boolean }>('snapshot');
  const localBytes = local ? (local.gz ? await gunzip(fromB64(local.b64)) : fromB64(local.b64)) : null;
  const claude = window.claude;
  const [db, user] = claude ? await Promise.all([claude.use('db').catch(() => null), claude.use('user').catch(() => null)]) : [null, null];
  const uid = user ? await user.id().catch(() => null) : null;
  if (!db || !uid) {
    setState({ kind: 'local', reason: 'Armazenamento na nuvem indisponível nesta visualização: os dados ficam salvos somente neste navegador.', pending: false });
    return { bytes: localBytes, confirmedEmpty: !localBytes, cloudReady: false };
  }
  cloud = { base: `data/users/${uid}`, db };
  try {
    const meta = await withRetry<any>(() => db.doc(`${cloud!.base}/meta`).get());
    if (!meta.exists) {
      setState({ kind: 'nuvem', savedAt: null, pending: false });
      // Sem dados na nuvem: aproveita a cópia local, se houver, e a envia no próximo salvamento.
      return { bytes: localBytes, confirmedEmpty: !localBytes, cloudReady: true };
    }
    const m = meta.data() as { gen: string; chunks: number; gz: boolean; savedAt: string };
    const parts: string[] = [];
    for (let i = 0; i < m.chunks; i++) {
      const c = await withRetry<any>(() => db.doc(`${cloud!.base}/chunk-${i}`).get());
      const d = c.data() as { gen: string; data: string } | undefined;
      if (!c.exists || !d || d.gen !== m.gen) throw new Error('cópia na nuvem incompleta');
      parts.push(d.data);
    }
    const raw = fromB64(parts.join(''));
    lastGen = m.gen;
    const cloudBytes = m.gz ? await gunzip(raw) : raw;
    // Uma cópia local mais recente (ex.: salvamento interrompido) prevalece.
    const useLocal = local && localBytes && local.savedAt > m.savedAt;
    setState({ kind: 'nuvem', savedAt: m.savedAt, pending: !!useLocal });
    return { bytes: useLocal ? localBytes : cloudBytes, confirmedEmpty: false, cloudReady: true };
  } catch (e: any) {
    cloud = null;
    setState({ kind: 'erro', message: `Não foi possível ler os dados da nuvem (${e?.message ?? e}). Para não sobrescrever nada, as alterações desta sessão ficam só neste navegador.`, pending: false });
    return { bytes: localBytes, confirmedEmpty: false, cloudReady: false };
  }
}

/** Avisa quando outro dispositivo salvar uma versão nova. */
export function watchRemote(onChange: () => void): void {
  if (!cloud) return;
  cloud.db.doc(`${cloud.base}/meta`).onSnapshot(
    (snap: any) => {
      const d = snap.data?.() as { gen: string; session: string } | undefined;
      if (!d || snap.metadata?.hasPendingWrites) return;
      if (d.session !== SESSION && d.gen !== lastGen) {
        lastGen = d.gen;
        onChange();
      }
    },
    () => {}
  );
}

let timer: ReturnType<typeof setTimeout> | null = null;
let saving = false;
let again = false;
let exporter: (() => Uint8Array) | null = null;

export function scheduleSave(exportFn: () => Uint8Array): void {
  exporter = exportFn;
  setState({ ...state, pending: true } as SaveState);
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 1200);
}

export function hasPending(): boolean {
  return state.pending;
}

export async function flush(): Promise<void> {
  if (!exporter) return;
  if (saving) {
    again = true;
    return;
  }
  saving = true;
  try {
    const savedAt = new Date().toISOString();
    const { data, gz } = await gzip(exporter());
    const b64 = toB64(data);
    await idbSet('snapshot', { savedAt, b64, gz });
    if (!cloud) {
      setState(state.kind === 'erro' ? { ...state, pending: false } : { kind: 'local', reason: state.kind === 'local' ? state.reason : 'Salvo neste navegador.', pending: false });
      return;
    }
    const gen = `${Date.now().toString(36)}-${SESSION}`;
    const chunks = Math.max(1, Math.ceil(b64.length / CHUNK));
    for (let i = 0; i < chunks; i++) {
      await withRetry(() => cloud!.db.doc(`${cloud!.base}/chunk-${i}`).set({ gen, data: b64.slice(i * CHUNK, (i + 1) * CHUNK) }));
    }
    await withRetry(() => cloud!.db.doc(`${cloud!.base}/meta`).set({ gen, chunks, gz, savedAt, session: SESSION, bytes: data.length }));
    lastGen = gen;
    setState({ kind: 'nuvem', savedAt, pending: false });
  } catch (e: any) {
    setState({
      kind: 'erro',
      message: e?.code === 'quota_exceeded' ? 'O armazenamento na nuvem está cheio. Os dados continuam salvos neste navegador.' : `Falha ao salvar na nuvem (${e?.message ?? e}). Os dados estão salvos neste navegador e serão reenviados na próxima alteração.`,
      pending: false
    });
  } finally {
    saving = false;
    if (again) {
      again = false;
      void flush();
    }
  }
}
