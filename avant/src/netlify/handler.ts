// AVANT compartilhado (Netlify): a mesma API do servidor Node, com o banco SQLite guardado em um
// armazenamento de objetos. Cada gravação só é aceita se ninguém salvou antes (controle por ETag);
// em caso de conflito, a operação é refeita sobre a versão mais recente.
import { z } from 'zod';
import { openBrowserDatabase, BrowserDB } from '../artifact/sqlite';
import { AppError, Ctx } from '../server/context';
import { extensionOf, extractFileText } from '../server/importers';
import { LocalRouter } from '../server/miniRouter';
import { errorResponse, registerRoutes } from '../server/routes';
import { processCapture } from '../server/services/captures';
import { documentText, findBySha, getDocumentRow, registerDocument, safeFilename } from '../server/services/documents-core';
import { recomputePriorities } from '../server/services/tasks';
import { hashPassword, nameKey, StoredUser, toPublic, validateName, validatePassword, verifyPassword } from '../shared/auth';
import { seed } from '../server/seed';

/** Armazenamento de objetos com gravação condicional (Netlify Blobs ou equivalente local). */
export interface BlobKV {
  get(key: string): Promise<{ bytes: Uint8Array; etag: string; metadata: Record<string, unknown> } | null>;
  etag(key: string): Promise<string | null>;
  put(key: string, bytes: Uint8Array, opts?: { ifMatch?: string; ifNew?: boolean; metadata?: Record<string, unknown> }): Promise<{ modified: boolean; etag?: string }>;
}

export interface HandlerEnv {
  kv: BlobKV;
  files: BlobKV;
  /** Código da equipe opcional (variável AVANT_ACCESS_CODE): exigido para criar conta, exceto a primeira (administrador). */
  accessCode?: string;
  now?: () => Date;
}

const DB_KEY = 'banco/avant.sqlite';
const TEAM_KEY = 'equipe/quadro.json';
const MAX_DOC = 4 * 1024 * 1024; // limite de corpo das funções da Netlify (~6 MB) com folga
const MAX_ATTACHMENT = 4 * 1024 * 1024;
const ATTEMPTS = 6;

const json = (status: number, data: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data ?? null), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const fail = (status: number, error: string, message: string) => json(status, { error, message });

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const teamItem = z.object({ id: z.string().min(1).max(80), title: z.string().max(500) }).passthrough();
const teamSave = z.object({
  memberId: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(80).optional(),
  items: z.array(teamItem).max(2000)
});
type TeamBoard = { members: Record<string, { name: string; items: unknown[]; updated_at: string }> };

export function createHandler(env: HandlerEnv) {
  const now = env.now ?? (() => new Date());
  let cache: { etag: string; ctx: Ctx; day: string } | null = null;
  // Uma alteração por vez neste processo (o banco aberto em memória é compartilhado entre requisições).
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => undefined);
    return next;
  };

  const newCtx = (db: BrowserDB): Ctx => ({ db, tz: 'America/Sao_Paulo', dataDir: '', maxUploadBytes: MAX_DOC, now });
  const totalChanges = (ctx: Ctx) => Number((ctx.db.prepare('SELECT total_changes() AS n').get() as { n: number }).n);
  const exportDb = (ctx: Ctx) => (ctx.db as BrowserDB).export();

  /** Banco na versão mais recente (reaproveita o já aberto se ninguém gravou desde então). */
  async function loadDb(): Promise<{ ctx: Ctx; etag: string }> {
    const etag = await env.kv.etag(DB_KEY);
    const day = now().toISOString().slice(0, 10);
    if (etag && cache && cache.etag === etag) {
      if (cache.day !== day) {
        recomputePriorities(cache.ctx);
        cache.day = day;
      }
      return { ctx: cache.ctx, etag };
    }
    const blob = etag ? await env.kv.get(DB_KEY) : null;
    if (!blob) {
      // Primeira execução: cria a carga inicial e grava somente se ainda não existir banco.
      const ctx = newCtx(await openBrowserDatabase(null));
      seed(ctx);
      recomputePriorities(ctx);
      const w = await env.kv.put(DB_KEY, exportDb(ctx), { ifNew: true });
      if (!w.modified || !w.etag) return loadDb();
      cache = { etag: w.etag, ctx, day };
      return { ctx, etag: w.etag };
    }
    const ctx = newCtx(await openBrowserDatabase(blob.bytes));
    recomputePriorities(ctx);
    cache = { etag: blob.etag, ctx, day };
    return { ctx, etag: blob.etag };
  }

  /** Rotas extras desta edição: documentos originais guardados no armazenamento de arquivos. */
  function buildRouter(ctx: Ctx) {
    const router = new LocalRouter();
    registerRoutes(router, ctx);
    const USER = { source: 'usuario' };
    const id = z.coerce.number().int().positive();
    router.post('/api/documents', async (req, reply) => {
      const form = req.body as FormData;
      if (!(form instanceof FormData)) throw new AppError(400, 'multipart', 'Envie os arquivos como formulário.');
      const files = form.getAll('file').filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f);
      if (!files.length) throw new AppError(400, 'sem_arquivo', 'Nenhum arquivo recebido.');
      const links = {
        project_id: form.get('project_id') ? id.parse(form.get('project_id')) : null,
        task_id: form.get('task_id') ? id.parse(form.get('task_id')) : null
      };
      const results = [];
      for (const f of files) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        if (!bytes.length) throw new AppError(400, 'arquivo_vazio', 'O arquivo está vazio.');
        if (bytes.length > MAX_DOC) throw new AppError(413, 'arquivo_grande', 'O arquivo excede o limite de 4 MB desta versão on-line.');
        const filename = safeFilename(f.name);
        const hash = await sha256Hex(bytes);
        const existing = findBySha(ctx, hash);
        const extracted = await extractFileText(filename, bytes);
        const key = `documentos/${hash}${extensionOf(filename)}`;
        if (!(await env.files.etag(key))) await env.files.put(key, bytes, { ifNew: true, metadata: { filename } });
        const document = registerDocument(ctx, { filename, size: bytes.length, sha256: hash, storage_path: `blob:${key}` }, extracted, links, USER);
        let capture = null;
        if (form.get('capture') === '1' && document.parse_status === 'ok') {
          capture = processCapture(ctx, { text: documentText(ctx, document.id)!, source_type: 'arquivo', document_id: document.id, dry_run: form.get('dry_run') === '1' });
          if (capture.capture_id) ctx.db.prepare('UPDATE documents SET capture_id = ? WHERE id = ?').run(capture.capture_id, document.id);
        }
        results.push({ document, duplicate_of: existing, capture });
      }
      return reply.status(201).send(results);
    });
    return router;
  }

  /** Executa uma rota da API. Retorna a resposta e se o banco foi alterado. */
  async function run(ctx: Ctx, method: string, url: URL, body: unknown): Promise<{ status: number; data: unknown; headers: Record<string, string>; changed: boolean }> {
    const router = buildRouter(ctx);
    const m = router.match(method, url.pathname);
    if (!m) return { status: 404, data: { error: 'nao_encontrado', message: 'Rota não encontrada.' }, headers: {}, changed: false };
    let status = 200;
    let sent: unknown;
    let didSend = false;
    const headers: Record<string, string> = {};
    const reply = {
      status(c: number) {
        status = c;
        return reply;
      },
      header(k: string, v: string) {
        headers[k] = v;
        return reply;
      },
      send(p: unknown) {
        sent = p;
        didSend = true;
        return p;
      }
    };
    const before = totalChanges(ctx);
    try {
      const result = await m.route.handler({ params: m.params, query: Object.fromEntries(url.searchParams), body }, reply);
      return { status, data: didSend ? sent : result, headers, changed: totalChanges(ctx) !== before };
    } catch (err) {
      const r = errorResponse(err, MAX_DOC);
      if (r.log) console.error(err);
      return { status: r.status, data: r.body, headers: {}, changed: totalChanges(ctx) !== before };
    }
  }

  async function api(req: Request, url: URL): Promise<Response> {
    const method = req.method.toUpperCase();
    let body: unknown = {};
    if (method !== 'GET') {
      const type = req.headers.get('content-type') ?? '';
      if (type.includes('multipart/form-data')) body = await req.formData();
      else {
        const text = await req.text();
        try {
          body = text ? JSON.parse(text) : {};
        } catch {
          return fail(400, 'json', 'Corpo da requisição inválido.');
        }
      }
    }

    // Arquivo original de um documento.
    const fileMatch = method === 'GET' && /^\/api\/documents\/(\d+)\/file$/.exec(url.pathname);
    if (fileMatch) {
      const { ctx } = await loadDb();
      try {
        const row = getDocumentRow(ctx, Number(fileMatch[1]));
        const key = String(row.storage_path ?? '').replace(/^blob:/, '');
        const file = key ? await env.files.get(key) : null;
        if (!file) return fail(410, 'arquivo_ausente', 'O arquivo original não está disponível nesta versão. O texto extraído continua no AVANT.');
        return new Response(file.bytes as BodyInit, {
          headers: {
            'Content-Type': row.mime || 'application/octet-stream',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
            'X-Content-Type-Options': 'nosniff'
          }
        });
      } catch (err) {
        const r = errorResponse(err, MAX_DOC);
        return json(r.status, r.body);
      }
    }

    if (method === 'GET') {
      return exclusive(async () => {
        const { ctx } = await loadDb();
        const r = await run(ctx, method, url, body);
        if (r.changed) cache = null; // leitura não deveria alterar; por segurança, descarta a cópia
        return json(r.status, r.data, r.headers);
      });
    }
    return exclusive(() => mutate(method, url, body));
  }

  /** Alteração: aplica sobre a versão mais recente e grava só se ninguém gravou antes. */
  async function mutate(method: string, url: URL, body: unknown): Promise<Response> {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const { ctx, etag } = await loadDb();
      const r = await run(ctx, method, url, body);
      if (!r.changed) return json(r.status, r.data, r.headers);
      if (r.status >= 400) {
        cache = null; // erro com alteração parcial: descarta sem gravar
        return json(r.status, r.data, r.headers);
      }
      const w = await env.kv.put(DB_KEY, exportDb(ctx), { ifMatch: etag });
      if (w.modified && w.etag) {
        cache = { etag: w.etag, ctx, day: now().toISOString().slice(0, 10) };
        return json(r.status, r.data, { ...r.headers, 'X-Avant-Version': w.etag });
      }
      cache = null; // outra pessoa gravou no meio: refaz sobre a versão nova
      await new Promise((res) => setTimeout(res, 40 + Math.random() * 120 * (attempt + 1)));
    }
    return fail(409, 'concorrencia', 'Muitas pessoas salvaram ao mesmo tempo. Tente novamente em instantes.');
  }

  // ------------------------------------------------------------------ Quadro da equipe
  async function loadTeam(): Promise<{ board: TeamBoard; etag: string | null }> {
    const blob = await env.kv.get(TEAM_KEY);
    if (!blob) return { board: { members: {} }, etag: null };
    return { board: JSON.parse(new TextDecoder().decode(blob.bytes)) as TeamBoard, etag: blob.etag };
  }

  /** Grava só a lista de uma pessoa, sobre a versão mais recente do quadro. */
  async function saveTeam(input: z.infer<typeof teamSave>): Promise<Response> {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const { board, etag } = await loadTeam();
      const prev = board.members[input.memberId];
      board.members[input.memberId] = { name: input.name ?? prev?.name ?? 'Colaborador', items: input.items, updated_at: now().toISOString() };
      const bytes = new TextEncoder().encode(JSON.stringify(board));
      if (bytes.length > 4.5 * 1024 * 1024) return fail(413, 'quadro_cheio', 'O quadro da equipe está muito grande. Restaure ou apague cartões antigos.');
      const w = await env.kv.put(TEAM_KEY, bytes, etag ? { ifMatch: etag } : { ifNew: true });
      if (w.modified) return json(200, { ok: true, etag: w.etag });
      await new Promise((res) => setTimeout(res, 40 + Math.random() * 120 * (attempt + 1)));
    }
    return fail(409, 'concorrencia', 'Muitas pessoas salvaram ao mesmo tempo. Tente novamente.');
  }

  async function team(req: Request, url: URL, user: StoredUser): Promise<Response> {
    const method = req.method.toUpperCase();
    if (method === 'GET' && url.pathname === '/api/team') {
      const { board, etag } = await loadTeam();
      return json(200, { etag, members: Object.entries(board.members).map(([id, m]) => ({ id, ...m })) });
    }
    if (method === 'POST' && url.pathname === '/api/team/save') {
      let input: z.infer<typeof teamSave>;
      try {
        input = teamSave.parse(await req.json());
      } catch {
        return fail(400, 'validacao', 'Dados das atividades inválidos.');
      }
      if (input.memberId !== user.id && user.role !== 'admin') return fail(403, 'somente_admin', 'Você só pode alterar os próprios cartões.');
      // O nome exibido vem da conta, não do navegador.
      return exclusive(() => saveTeam({ ...input, name: input.memberId === user.id ? user.name : undefined }));
    }
    if (method === 'POST' && url.pathname === '/api/team/files') {
      const name = decodeURIComponent(req.headers.get('x-file-name') ?? 'arquivo');
      const type = (req.headers.get('content-type') ?? 'application/octet-stream').split(';')[0];
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (!bytes.length) return fail(400, 'arquivo_vazio', 'O arquivo está vazio.');
      if (bytes.length > MAX_ATTACHMENT) return fail(413, 'arquivo_grande', `"${name}" passa de 4 MB, o limite desta versão on-line.`);
      const id = crypto.randomUUID().replace(/-/g, '');
      await env.files.put(`anexos/${id}`, bytes, { ifNew: true, metadata: { name, type, size: bytes.length } });
      return json(201, { id, name, type, size: bytes.length, uploaded_at: now().toISOString() });
    }
    const f = method === 'GET' && /^\/api\/team\/files\/([a-f0-9]{32})$/.exec(url.pathname);
    if (f) {
      const file = await env.files.get(`anexos/${f[1]}`);
      if (!file) return fail(404, 'nao_encontrado', 'Anexo não encontrado.');
      const name = String(file.metadata.name ?? 'arquivo');
      const type = String(file.metadata.type ?? 'application/octet-stream');
      const inline = /^(image|video)\/|^application\/pdf$|^text\/plain$/.test(type);
      return new Response(file.bytes as BodyInit, {
        headers: {
          'Content-Type': type,
          'Content-Disposition': `${inline && !url.searchParams.has('baixar') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, max-age=31536000, immutable'
        }
      });
    }
    return fail(404, 'nao_encontrado', 'Rota não encontrada.');
  }

  // ------------------------------------------------------------------ Contas e sessão
  const COOKIE = 'avant_sessao';
  const SESSION_DAYS = 30;
  const USERS_KEY = 'contas/usuarios.json';
  const SECRET_KEY = 'contas/segredo';
  type Accounts = { users: StoredUser[] };
  const enc = new TextEncoder();
  const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  let secret: CryptoKey | null = null;
  let accountsCache: { etag: string | null; data: Accounts; at: number } | null = null;
  const failures = new Map<string, { n: number; until: number }>();

  async function hmacKey(): Promise<CryptoKey> {
    if (secret) return secret;
    let blob = await env.kv.get(SECRET_KEY);
    if (!blob) {
      await env.kv.put(SECRET_KEY, crypto.getRandomValues(new Uint8Array(32)), { ifNew: true });
      blob = await env.kv.get(SECRET_KEY);
    }
    secret = await crypto.subtle.importKey('raw', blob!.bytes as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    return secret;
  }

  async function loadAccounts(fresh = false): Promise<{ data: Accounts; etag: string | null }> {
    if (!fresh && accountsCache && Date.now() - accountsCache.at < 15_000) return accountsCache;
    const blob = await env.kv.get(USERS_KEY);
    const data: Accounts = blob ? JSON.parse(new TextDecoder().decode(blob.bytes)) : { users: [] };
    accountsCache = { data, etag: blob?.etag ?? null, at: Date.now() };
    return accountsCache;
  }

  /** Altera as contas sobre a versão mais recente (com nova tentativa em caso de conflito). */
  async function changeAccounts<T>(fn: (a: Accounts) => T | Response): Promise<T | Response> {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const { data, etag } = await loadAccounts(true);
      const r = fn(data);
      if (r instanceof Response) return r;
      const w = await env.kv.put(USERS_KEY, enc.encode(JSON.stringify(data)), etag ? { ifMatch: etag } : { ifNew: true });
      if (w.modified) {
        accountsCache = { data, etag: w.etag ?? null, at: Date.now() };
        return r;
      }
      await new Promise((res) => setTimeout(res, 40 + Math.random() * 120 * (attempt + 1)));
    }
    return fail(409, 'concorrencia', 'Tente novamente em instantes.');
  }

  async function sessionCookie(user: StoredUser, url: URL): Promise<string> {
    const payload = b64url(enc.encode(JSON.stringify({ u: user.id, e: Date.now() + SESSION_DAYS * 86_400_000 })));
    const sig = b64url(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(payload))));
    return `${COOKIE}=${payload}.${sig}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; SameSite=Lax${url.protocol === 'https:' ? '; Secure' : ''}`;
  }

  async function currentUser(req: Request): Promise<StoredUser | null> {
    const raw = new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]+)\\.([A-Za-z0-9_-]+)`).exec(req.headers.get('cookie') ?? '');
    if (!raw) return null;
    const sig = Uint8Array.from(atob(raw[2].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(), sig as BufferSource, enc.encode(raw[1])))) return null;
    const { u, e } = JSON.parse(atob(raw[1].replace(/-/g, '+').replace(/_/g, '/'))) as { u: string; e: number };
    if (e < Date.now()) return null;
    return (await loadAccounts()).data.users.find((x) => x.id === u) ?? null;
  }

  const credentials = z.object({ name: z.string(), password: z.string(), code: z.string().optional() });

  async function auth(req: Request, url: URL, user: StoredUser | null): Promise<Response> {
    const method = req.method.toUpperCase();
    const path = url.pathname;
    if (method === 'GET' && path === '/api/auth/me') {
      const { data } = await loadAccounts();
      return json(200, { user: user ? toPublic(user) : null, hasUsers: data.users.length > 0, needCode: !!env.accessCode });
    }
    if (method === 'POST' && path === '/api/auth/logout') return json(200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` });

    if (method === 'POST' && (path === '/api/auth/login' || path === '/api/auth/register')) {
      const body = credentials.safeParse(await req.json().catch(() => null));
      if (!body.success) return fail(400, 'validacao', 'Informe nome e senha.');
      const { name, password, code } = body.data;
      const key = nameKey(name);
      if (path === '/api/auth/login') {
        const ip = req.headers.get('x-nf-client-connection-ip') ?? req.headers.get('x-forwarded-for') ?? 'local';
        const f = failures.get(`${ip}|${key}`);
        if (f && f.until > Date.now()) return fail(429, 'muitas_tentativas', 'Muitas tentativas erradas. Aguarde um minuto e tente de novo.');
        const found = (await loadAccounts(true)).data.users.find((x) => x.key === key);
        if (!found || !(await verifyPassword(password, found))) {
          const n = (f?.n ?? 0) + 1;
          failures.set(`${ip}|${key}`, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
          return fail(401, 'login_invalido', 'Nome ou senha incorretos.');
        }
        failures.delete(`${ip}|${key}`);
        return json(200, { user: toPublic(found) }, { 'Set-Cookie': await sessionCookie(found, url) });
      }
      const err = validateName(name) ?? validatePassword(password);
      if (err) return fail(400, 'validacao', err);
      const { salt, hash } = await hashPassword(password);
      const created = await changeAccounts((a) => {
        // Sem contas ainda: a primeira é do administrador e não precisa do código da equipe.
        if (a.users.length && env.accessCode && (code ?? '').trim() !== env.accessCode) return fail(401, 'codigo_invalido', 'Código da equipe incorreto.');
        if (a.users.some((x) => x.key === key)) return fail(409, 'nome_em_uso', 'Já existe uma conta com esse nome. Use "Entrar" ou escolha outro nome (ex.: com sobrenome).');
        const u: StoredUser = { id: crypto.randomUUID(), name: name.trim().replace(/\s+/g, ' '), key, salt, hash, role: a.users.length ? 'membro' : 'admin', created_at: now().toISOString() };
        a.users.push(u);
        return u;
      });
      if (created instanceof Response) return created;
      return json(201, { user: toPublic(created) }, { 'Set-Cookie': await sessionCookie(created, url) });
    }

    if (!user) return fail(401, 'sem_login', 'Entre com seu nome e senha.');
    if (method === 'POST' && path === '/api/auth/password') {
      const body = z.object({ current: z.string(), next: z.string() }).safeParse(await req.json().catch(() => null));
      if (!body.success) return fail(400, 'validacao', 'Dados inválidos.');
      if (!(await verifyPassword(body.data.current, user))) return fail(401, 'senha_atual', 'A senha atual está incorreta.');
      const err = validatePassword(body.data.next);
      if (err) return fail(400, 'validacao', err);
      const h = await hashPassword(body.data.next);
      const r = await changeAccounts((a) => {
        const u = a.users.find((x) => x.id === user.id);
        if (!u) return fail(404, 'nao_encontrado', 'Conta não encontrada.');
        Object.assign(u, h);
        return true;
      });
      return r instanceof Response ? r : json(200, { ok: true });
    }

    // Administração
    if (user.role !== 'admin') return fail(403, 'somente_admin', 'Somente o administrador pode gerenciar usuários.');
    if (method === 'GET' && path === '/api/auth/users') return json(200, (await loadAccounts(true)).data.users.map(toPublic));
    const m = /^\/api\/auth\/users\/([0-9a-f-]{36})$/.exec(path);
    if (m && method === 'POST') {
      const body = z.object({ role: z.enum(['admin', 'membro']).optional(), password: z.string().optional() }).safeParse(await req.json().catch(() => null));
      if (!body.success) return fail(400, 'validacao', 'Dados inválidos.');
      if (body.data.password !== undefined) {
        const err = validatePassword(body.data.password);
        if (err) return fail(400, 'validacao', err);
      }
      const h = body.data.password !== undefined ? await hashPassword(body.data.password) : null;
      const r = await changeAccounts((a) => {
        const u = a.users.find((x) => x.id === m[1]);
        if (!u) return fail(404, 'nao_encontrado', 'Conta não encontrada.');
        if (body.data.role === 'membro' && u.role === 'admin' && a.users.filter((x) => x.role === 'admin').length <= 1) return fail(409, 'ultimo_admin', 'É preciso ter pelo menos um administrador.');
        if (body.data.role) u.role = body.data.role;
        if (h) Object.assign(u, h);
        return true;
      });
      return r instanceof Response ? r : json(200, { ok: true });
    }
    if (m && method === 'DELETE') {
      if (m[1] === user.id) return fail(409, 'propria_conta', 'Você não pode excluir a própria conta.');
      const r = await changeAccounts((a) => {
        const u = a.users.find((x) => x.id === m[1]);
        if (!u) return fail(404, 'nao_encontrado', 'Conta não encontrada.');
        if (u.role === 'admin' && a.users.filter((x) => x.role === 'admin').length <= 1) return fail(409, 'ultimo_admin', 'É preciso ter pelo menos um administrador.');
        a.users = a.users.filter((x) => x.id !== u.id);
        return true;
      });
      return r instanceof Response ? r : json(200, { ok: true });
    }
    return fail(404, 'nao_encontrado', 'Rota não encontrada.');
  }

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    try {
      const user = await currentUser(req).catch(() => null);
      if (url.pathname.startsWith('/api/auth/')) return await auth(req, url, user);
      if (!user) return fail(401, 'sem_login', 'Entre com seu nome e senha.');
      if (url.pathname === '/api/live') {
        const [db, team] = await Promise.all([env.kv.etag(DB_KEY), env.kv.etag(TEAM_KEY)]);
        return json(200, { db, team, at: now().toISOString() });
      }
      if (url.pathname === '/api/team' || url.pathname.startsWith('/api/team/')) return await team(req, url, user);
      return await api(req, url);
    } catch (err) {
      console.error(err);
      return fail(500, 'interno', 'Erro interno. Nenhuma alteração parcial foi salva.');
    }
  };
}
