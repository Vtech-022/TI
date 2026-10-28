// API do AVANT (rotas /api/*). Independente da plataforma: recebe um Request padrão e
// devolve um Response padrão, usando o armazenamento passado em `ctx.store`.

import {
  getJSON, putJSON, updateJSON,
} from "./store.mjs";
import { randomBytes } from "node:crypto";
import {
  passwordError, nameError, nameKey, normalizeName,
  hashPassword, verifyPassword, sha256, newToken, newId,
  cookieHeader, clearCookieHeader, readCookie,
  SESSION_DAYS, MAX_ATTEMPTS, LOCK_SECONDS,
} from "./security.mjs";
import { mergeCards } from "./team-merge.mjs";
import {
  cleanTaskInput, canSee, canManage, assigneeCanApply, TASK_LIMITS,
} from "./shared-tasks.mjs";

export const LIMITS = {
  json: 2 * 1024 * 1024, // corpo JSON
  file: 4 * 1024 * 1024, // anexos: 4 MB cada
  data: 5.5 * 1024 * 1024, // cópia do banco pessoal (limite de 6 MB das funções Netlify)
  cards: 3000,
};

const BOARD_KEY = "team/board";
const TASKS_KEY = "team/tasks";
const FIRST_ADMIN_KEY = "meta/first-admin";

const FILE_TYPES = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  mp4: "video/mp4", webm: "video/webm", pdf: "application/pdf",
  csv: "text/csv; charset=utf-8", md: "text/markdown; charset=utf-8",
  json: "application/json", txt: "text/plain; charset=utf-8",
};

export class ApiError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const noStore = { "cache-control": "no-store" };

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...noStore, ...headers },
  });
}

const publicUser = (u) => ({ id: u.id, name: u.name, role: u.role, created_at: u.created_at });

/** Dono da "carga inicial" (as frentes de trabalho do Victor): só a primeira conta criada. */
async function withFirst(ctx, u) {
  const flag = await getJSON(ctx.store, FIRST_ADMIN_KEY);
  return { ...publicUser(u), is_first_admin: !!flag && flag.value.id === u.id };
}

async function readJson(request, max = LIMITS.json) {
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.length > max) throw new ApiError(413, "grande_demais", "O conteúdo enviado é grande demais.");
  try {
    const v = JSON.parse(new TextDecoder().decode(buf));
    if (v === null || typeof v !== "object") throw new Error("x");
    return v;
  } catch {
    throw new ApiError(400, "json_invalido", "Pedido inválido.");
  }
}

async function readBytes(request, max) {
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.length > max) {
    throw new ApiError(413, "grande_demais", `O conteúdo passa do limite de ${(max / 1048576).toFixed(max % 1048576 ? 1 : 0)} MB.`);
  }
  return buf;
}

// ---------------------------------------------------------------- sessões e contas

async function loadUser(ctx, id) {
  const r = await getJSON(ctx.store, `users/${id}`);
  return r ? r.value : null;
}

async function authenticate(request, ctx) {
  const token = readCookie(request, "avant_session");
  if (!token) return null;
  const key = `sessions/${sha256(token)}`;
  const s = await getJSON(ctx.store, key);
  if (!s) return null;
  if (s.value.exp < ctx.now()) {
    await ctx.store.del(key);
    return null;
  }
  const user = await loadUser(ctx, s.value.uid);
  if (!user || user.pwv !== s.value.pwv) return null; // conta excluída ou senha trocada
  return { user, token };
}

async function requireUser(request, ctx) {
  const a = await authenticate(request, ctx);
  if (!a) throw new ApiError(401, "nao_autenticado", "Entre com a sua conta para continuar.");
  return a.user;
}

async function requireAdmin(request, ctx) {
  const u = await requireUser(request, ctx);
  if (u.role !== "admin") throw new ApiError(403, "somente_admin", "Somente o administrador pode fazer isso.");
  return u;
}

async function createSession(ctx, user) {
  const token = newToken();
  await putJSON(ctx.store, `sessions/${sha256(token)}`, {
    uid: user.id, pwv: user.pwv, exp: ctx.now() + SESSION_DAYS * 86400_000,
  });
  return token;
}

const cookieFor = (request, token) =>
  cookieHeader(token, { secure: new URL(request.url).protocol === "https:" });

async function allUsers(ctx) {
  const keys = await ctx.store.list("users/");
  const out = [];
  for (const k of keys) {
    const r = await getJSON(ctx.store, k);
    if (r) out.push(r.value);
  }
  return out;
}

/** A primeira conta criada é a do administrador (com proteção contra corrida e recuperação de órfã). */
async function claimAdmin(ctx, id) {
  const stamp = { id, at: ctx.now() };
  const first = await putJSON(ctx.store, FIRST_ADMIN_KEY, stamp, { ifNew: true });
  if (first.modified) return "admin";
  const flag = await getJSON(ctx.store, FIRST_ADMIN_KEY);
  if (!flag) return "membro";
  const owner = await loadUser(ctx, flag.value.id);
  const old = ctx.now() - flag.value.at > 60_000;
  if (!owner && old) {
    // a primeira conta nunca chegou a existir; só assume se NÃO houver nenhum administrador
    const admins = (await allUsers(ctx)).filter((u) => u.role === "admin");
    if (!admins.length) {
      const r = await putJSON(ctx.store, FIRST_ADMIN_KEY, stamp, { ifMatch: flag.etag });
      if (r.modified) return "admin";
    }
  }
  return "membro";
}

async function handleStatus(ctx) {
  const flag = await ctx.store.getMeta(FIRST_ADMIN_KEY);
  return json(200, { firstAccount: !flag, needCode: !!ctx.env.AVANT_ACCESS_CODE });
}

// ---------------------------------------------------------------- código de recuperação de senha

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem I, O, 0 e 1 (evita confusão)

function newRecoveryCode() {
  const bytes = randomBytes(12);
  let raw = "";
  for (const b of bytes) raw += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

const normalizeCode = (c) => String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function makeRecovery() {
  const code = newRecoveryCode();
  const rec = await hashPassword(normalizeCode(code));
  return { code, rec: { salt: rec.salt, hash: rec.hash, iter: rec.iter } };
}

async function handleRegister(request, ctx) {
  const body = await readJson(request);
  const nErr = nameError(body.name);
  if (nErr) throw new ApiError(400, "nome", nErr);
  const pErr = passwordError(body.password);
  if (pErr) throw new ApiError(400, "senha", pErr);
  const required = ctx.env.AVANT_ACCESS_CODE;
  if (required && String(body.code ?? "") !== required) {
    throw new ApiError(403, "codigo", "O código da equipe está incorreto.");
  }

  const name = normalizeName(body.name);
  const key = nameKey(name);
  const id = newId();
  const pw = await hashPassword(body.password);

  const reserve = await putJSON(ctx.store, `names/${key}`, { id }, { ifNew: true });
  if (!reserve.modified) {
    throw new ApiError(409, "nome_em_uso", 'Já existe uma conta com esse nome. Use "Entrar" ou escolha outro nome.');
  }
  try {
    const role = await claimAdmin(ctx, id);
    const recovery = await makeRecovery();
    const user = {
      id, name, key, role, ...pw, pwv: 1, created_at: new Date(ctx.now()).toISOString(),
      recovery: recovery.rec,
    };
    await putJSON(ctx.store, `users/${id}`, user, { ifNew: true });
    await updateJSON(ctx.store, BOARD_KEY, (board) => {
      board ??= { version: 0, docs: {} };
      board.docs[id] = { name, items: [], updated_at: user.created_at };
      board.version++;
      return board;
    });
    const token = await createSession(ctx, user);
    return json(201, { user: await withFirst(ctx, user), firstAccount: role === "admin", recoveryCode: recovery.code }, {
      "set-cookie": cookieFor(request, token),
    });
  } catch (e) {
    await ctx.store.del(`names/${key}`).catch(() => {});
    throw e;
  }
}

async function handleLogin(request, ctx) {
  const body = await readJson(request);
  const nErr = nameError(body.name);
  if (nErr) throw new ApiError(400, "nome", nErr);
  if (typeof body.password !== "string" || !body.password) throw new ApiError(400, "senha", "Informe sua senha.");

  const key = nameKey(body.name);
  const attemptsKey = `attempts/${sha256(key)}`;
  const now = ctx.now();
  const att = await getJSON(ctx.store, attemptsKey);
  if (att && att.value.until && att.value.until > now) {
    const s = Math.ceil((att.value.until - now) / 1000);
    throw new ApiError(429, "bloqueado", `Muitas tentativas erradas. Tente de novo em ${s} segundo${s === 1 ? "" : "s"}.`, { retry_after: s });
  }

  const idRec = await getJSON(ctx.store, `names/${key}`);
  const user = idRec ? await loadUser(ctx, idRec.value.id) : null;
  let ok = false;
  if (user) ok = await verifyPassword(body.password, user);
  else await hashPassword(body.password); // custo igual, para não revelar se o nome existe

  if (!ok) {
    let locked = 0;
    await updateJSON(ctx.store, attemptsKey, (cur) => {
      const fresh = cur && now - (cur.last ?? 0) < 15 * 60_000 ? cur : { count: 0 };
      const count = (fresh.count ?? 0) + 1;
      const next = { count, last: now };
      if (count >= MAX_ATTEMPTS) {
        next.until = now + LOCK_SECONDS * 1000;
        next.count = 0;
        locked = LOCK_SECONDS;
      }
      return next;
    });
    if (locked) {
      throw new ApiError(429, "bloqueado", `Muitas tentativas erradas. Tente de novo em ${locked} segundos.`, { retry_after: locked });
    }
    throw new ApiError(401, "credenciais", "Nome ou senha incorretos.");
  }
  if (att) await ctx.store.del(attemptsKey).catch(() => {});
  const token = await createSession(ctx, user);
  return json(200, { user: await withFirst(ctx, user) }, { "set-cookie": cookieFor(request, token) });
}

async function handleLogout(request, ctx) {
  const token = readCookie(request, "avant_session");
  if (token) await ctx.store.del(`sessions/${sha256(token)}`).catch(() => {});
  return json(200, { ok: true }, {
    "set-cookie": clearCookieHeader({ secure: new URL(request.url).protocol === "https:" }),
  });
}

/** Sem sessão devolve { user: null } (200), para a tela de entrada não gerar erro de rede. */
async function handleMe(request, ctx) {
  const a = await authenticate(request, ctx);
  return json(200, { user: a ? await withFirst(ctx, a.user) : null });
}

async function handleChangePassword(request, ctx) {
  const user = await requireUser(request, ctx);
  const body = await readJson(request);
  if (!(await verifyPassword(String(body.current ?? ""), user))) {
    throw new ApiError(400, "senha_atual", "A senha atual está incorreta.");
  }
  const err = passwordError(body.next);
  if (err) throw new ApiError(400, "senha", err);
  const pw = await hashPassword(body.next);
  let updated;
  await updateJSON(ctx.store, `users/${user.id}`, (cur) => {
    if (!cur) throw new ApiError(404, "conta", "Conta não encontrada.");
    updated = { ...cur, ...pw, pwv: (cur.pwv ?? 1) + 1 };
    return updated;
  });
  const token = await createSession(ctx, updated); // mantém este aparelho conectado; os outros caem
  return json(200, { ok: true }, { "set-cookie": cookieFor(request, token) });
}


// ---------------------------------------------------------------- recuperar senha

/** Controle de tentativas (bloqueio de 1 minuto após 5 erros), compartilhado por entrar e recuperar. */
async function checkLock(ctx, attemptsKey) {
  const now = ctx.now();
  const att = await getJSON(ctx.store, attemptsKey);
  if (att && att.value.until && att.value.until > now) {
    const s = Math.ceil((att.value.until - now) / 1000);
    throw new ApiError(429, "bloqueado", `Muitas tentativas erradas. Tente de novo em ${s} segundo${s === 1 ? "" : "s"}.`, { retry_after: s });
  }
  return att;
}

async function registerFailure(ctx, attemptsKey) {
  const now = ctx.now();
  let locked = 0;
  await updateJSON(ctx.store, attemptsKey, (cur) => {
    const fresh = cur && now - (cur.last ?? 0) < 15 * 60_000 ? cur : { count: 0 };
    const count = (fresh.count ?? 0) + 1;
    const next = { count, last: now };
    if (count >= MAX_ATTEMPTS) {
      next.until = now + LOCK_SECONDS * 1000;
      next.count = 0;
      locked = LOCK_SECONDS;
    }
    return next;
  });
  if (locked) {
    throw new ApiError(429, "bloqueado", `Muitas tentativas erradas. Tente de novo em ${locked} segundos.`, { retry_after: locked });
  }
}

/** Nome + código de recuperação -> define nova senha. O código usado deixa de valer e um novo é entregue. */
async function handleRecover(request, ctx) {
  const body = await readJson(request);
  const nErr = nameError(body.name);
  if (nErr) throw new ApiError(400, "nome", nErr);
  const code = normalizeCode(body.code);
  if (code.length !== 12) throw new ApiError(400, "codigo", "Informe o código de recuperação (12 letras e números).");
  const pErr = passwordError(body.next);
  if (pErr) throw new ApiError(400, "senha", pErr);

  const key = nameKey(body.name);
  const attemptsKey = `attempts/rec-${sha256(key)}`;
  const att = await checkLock(ctx, attemptsKey);

  const idRec = await getJSON(ctx.store, `names/${key}`);
  const user = idRec ? await loadUser(ctx, idRec.value.id) : null;
  let ok = false;
  if (user?.recovery) ok = await verifyPassword(code, user.recovery);
  else await hashPassword(code); // custo igual, para não revelar se a conta existe

  if (!ok) {
    await registerFailure(ctx, attemptsKey);
    throw new ApiError(401, "recuperacao", "Nome ou código de recuperação incorretos. Se você perdeu o código, peça ao administrador para definir uma nova senha.");
  }
  if (att) await ctx.store.del(attemptsKey).catch(() => {});

  const pw = await hashPassword(body.next);
  const fresh = await makeRecovery();
  let updated;
  await updateJSON(ctx.store, `users/${user.id}`, (cur) => {
    if (!cur) throw new ApiError(404, "conta", "Conta não encontrada.");
    updated = { ...cur, ...pw, pwv: (cur.pwv ?? 1) + 1, recovery: fresh.rec };
    return updated;
  });
  const token = await createSession(ctx, updated);
  return json(200, { user: await withFirst(ctx, updated), recoveryCode: fresh.code }, { "set-cookie": cookieFor(request, token) });
}

/** Gera (ou troca) o código de recuperação de quem já tem conta; exige a senha atual. */
async function handleNewRecoveryCode(request, ctx) {
  const user = await requireUser(request, ctx);
  const body = await readJson(request);
  if (!(await verifyPassword(String(body.current ?? ""), user))) {
    throw new ApiError(400, "senha_atual", "A senha atual está incorreta.");
  }
  const fresh = await makeRecovery();
  await updateJSON(ctx.store, `users/${user.id}`, (cur) => {
    if (!cur) throw new ApiError(404, "conta", "Conta não encontrada.");
    return { ...cur, recovery: fresh.rec };
  });
  return json(200, { recoveryCode: fresh.code });
}

// ---------------------------------------------------------------- pessoas (para atribuir tarefas)

/** Lista simples (id e nome) das contas, para escolher a quem atribuir. Qualquer pessoa logada vê. */
async function handleDirectory(request, ctx) {
  await requireUser(request, ctx);
  const users = (await allUsers(ctx)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return json(200, users.map((u) => ({ id: u.id, name: u.name })));
}

// ---------------------------------------------------------------- tarefas da equipe

const emptyTasks = () => ({ version: 0, tasks: {} });

function visibleTasks(doc, user) {
  return Object.values(doc.tasks)
    .filter((t) => canSee(t, user))
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.created_at.localeCompare(b.created_at));
}

async function handleListTasks(request, ctx) {
  const user = await requireUser(request, ctx);
  const cur = await getJSON(ctx.store, TASKS_KEY);
  const base = cur?.etag ?? "0";
  // a etiqueta inclui o usuário: duas pessoas veem listas diferentes e não podem trocar o "304"
  const tag = `"${sha256(`${base}|${user.id}|${user.role}`).slice(0, 24)}"`;
  if (request.headers.get("if-none-match") === tag) {
    return new Response(null, { status: 304, headers: { etag: tag, ...noStore } });
  }
  const tasks = cur ? visibleTasks(cur.value, user) : [];
  return json(200, { tag, me: user.id, tasks }, { etag: tag });
}

async function resolveAssignee(ctx, id) {
  if (!id) return { assignee: null, assignee_name: null };
  const u = await loadUser(ctx, id);
  if (!u) throw new ApiError(400, "responsavel", "A pessoa escolhida não tem conta no sistema.");
  return { assignee: u.id, assignee_name: u.name };
}

async function handleCreateTask(request, ctx) {
  const user = await requireUser(request, ctx);
  const body = await readJson(request);
  let input;
  try { input = cleanTaskInput(body); } catch (e) { throw new ApiError(e.status ?? 400, e.code ?? "tarefa", e.message); }
  const who = await resolveAssignee(ctx, input.assignee);
  const nowIso = new Date(ctx.now()).toISOString();
  const task = {
    id: newId(),
    title: input.title,
    description: input.description ?? "",
    visibility: input.visibility ?? "individual",
    kind: input.kind ?? "fazer",
    status: input.status ?? "pendente",
    impact: input.impact ?? null,
    due_date: input.due_date ?? null,
    due_time: input.due_time ?? null,
    note: input.note ?? "",
    origin: input.origin ?? "tarefa",
    subtasks: input.subtasks ?? [],
    ...who,
    owner: user.id,
    owner_name: user.name,
    created_at: nowIso,
    updated_at: nowIso,
    done_at: null,
    done_by: null,
  };
  if (task.status === "concluida") { task.done_at = nowIso; task.done_by = user.name; }
  await updateJSON(ctx.store, TASKS_KEY, (doc) => {
    doc ??= emptyTasks();
    if (Object.keys(doc.tasks).length >= TASK_LIMITS.tasks) {
      throw new ApiError(413, "tarefas_demais", "O limite de tarefas da equipe foi atingido.");
    }
    doc.tasks[task.id] = task;
    doc.version++;
    return doc;
  });
  return json(201, task);
}

async function handleUpdateTask(request, ctx, id) {
  const user = await requireUser(request, ctx);
  const body = await readJson(request);
  let patch;
  try { patch = cleanTaskInput(body, { partial: true }); } catch (e) { throw new ApiError(e.status ?? 400, e.code ?? "tarefa", e.message); }
  const who = patch.assignee !== undefined ? await resolveAssignee(ctx, patch.assignee) : null;
  const nowIso = new Date(ctx.now()).toISOString();
  let result;
  await updateJSON(ctx.store, TASKS_KEY, (doc) => {
    const task = doc?.tasks[id];
    if (!task || !canSee(task, user)) throw new ApiError(404, "tarefa", "Tarefa não encontrada.");
    if (!canManage(task, user)) {
      if (task.assignee !== user.id || !assigneeCanApply(task, patch)) {
        throw new ApiError(403, "sem_permissao", "Você só pode alterar as tarefas que criou. Quem recebe a tarefa pode mudar a situação e marcar as subtarefas.");
      }
    }
    const next = { ...task, ...patch, ...(who ?? {}), updated_at: nowIso };
    if (patch.status && patch.status !== task.status) {
      next.done_at = patch.status === "concluida" ? nowIso : null;
      next.done_by = patch.status === "concluida" ? user.name : null;
    }
    doc.tasks[id] = next;
    doc.version++;
    result = next;
    return doc;
  });
  return json(200, result);
}

async function handleDeleteTask(request, ctx, id) {
  const user = await requireUser(request, ctx);
  await updateJSON(ctx.store, TASKS_KEY, (doc) => {
    const task = doc?.tasks[id];
    if (!task || !canSee(task, user)) throw new ApiError(404, "tarefa", "Tarefa não encontrada.");
    if (!canManage(task, user)) throw new ApiError(403, "sem_permissao", "Só quem criou a tarefa (ou o administrador) pode excluí-la.");
    delete doc.tasks[id];
    doc.version++;
    return doc;
  });
  return json(200, { ok: true });
}

// ---------------------------------------------------------------- administração

async function handleListUsers(request, ctx) {
  await requireAdmin(request, ctx);
  const users = (await allUsers(ctx)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return json(200, users.map(publicUser));
}

async function handleUpdateUser(request, ctx, id) {
  await requireAdmin(request, ctx);
  const body = await readJson(request);
  if (body.role !== undefined && body.role !== "admin" && body.role !== "membro") {
    throw new ApiError(400, "perfil", "Perfil inválido.");
  }
  let pw = null;
  if (body.password !== undefined) {
    const err = passwordError(body.password);
    if (err) throw new ApiError(400, "senha", err);
    pw = await hashPassword(body.password);
  }
  const target = await loadUser(ctx, id);
  if (!target) throw new ApiError(404, "conta", "Conta não encontrada.");
  if (body.role === "membro" && target.role === "admin") {
    const admins = (await allUsers(ctx)).filter((u) => u.role === "admin");
    if (admins.length <= 1) throw new ApiError(400, "ultimo_admin", "É preciso ter pelo menos um administrador.");
  }
  await updateJSON(ctx.store, `users/${id}`, (cur) => {
    if (!cur) throw new ApiError(404, "conta", "Conta não encontrada.");
    const next = { ...cur };
    if (body.role) next.role = body.role;
    if (pw) Object.assign(next, pw, { pwv: (cur.pwv ?? 1) + 1 });
    return next;
  });
  return json(200, { ok: true });
}

async function handleDeleteUser(request, ctx, id) {
  const admin = await requireAdmin(request, ctx);
  if (admin.id === id) throw new ApiError(400, "propria_conta", "Você não pode excluir a própria conta.");
  const target = await loadUser(ctx, id);
  if (!target) throw new ApiError(404, "conta", "Conta não encontrada.");
  if (target.role === "admin") {
    const admins = (await allUsers(ctx)).filter((u) => u.role === "admin");
    if (admins.length <= 1) throw new ApiError(400, "ultimo_admin", "É preciso ter pelo menos um administrador.");
  }
  await ctx.store.del(`users/${id}`);
  await ctx.store.del(`names/${target.key ?? nameKey(target.name)}`);
  await ctx.store.del(`data/${id}`).catch(() => {});
  await ctx.store.del(`prefs/${id}`).catch(() => {});
  for (const k of await ctx.store.list(`docfiles/${id}/`)) await ctx.store.del(k).catch(() => {});
  // tarefas que estavam com ela voltam a ficar sem responsável
  await updateJSON(ctx.store, TASKS_KEY, (doc) => {
    if (!doc) return undefined;
    let changed = false;
    for (const t of Object.values(doc.tasks)) {
      if (t.assignee === id) { t.assignee = null; t.assignee_name = null; changed = true; }
    }
    if (!changed) return undefined;
    doc.version++;
    return doc;
  });
  // os cartões dela continuam no quadro, marcados como de conta removida
  await updateJSON(ctx.store, BOARD_KEY, (board) => {
    if (!board?.docs[id]) return undefined;
    board.docs[id].removed = true;
    board.version++;
    return board;
  });
  return json(200, { ok: true });
}

// ---------------------------------------------------------------- quadro da equipe

function validateCards(list, label) {
  if (!Array.isArray(list)) throw new ApiError(400, "cartoes", `Lista de cartões inválida (${label}).`);
  if (list.length > LIMITS.cards) throw new ApiError(413, "muitos_cartoes", "Há cartões demais.");
  const seen = new Set();
  for (const c of list) {
    if (!c || typeof c !== "object" || Array.isArray(c) || typeof c.id !== "string" || !c.id || c.id.length > 80) {
      throw new ApiError(400, "cartoes", `Cartão inválido (${label}).`);
    }
    if (seen.has(c.id)) throw new ApiError(400, "cartoes", `Cartão repetido (${label}).`);
    seen.add(c.id);
  }
}

async function handleGetTeam(request, ctx) {
  await requireUser(request, ctx);
  const board = await getJSON(ctx.store, BOARD_KEY);
  const tag = board ? board.etag : "0";
  if (request.headers.get("if-none-match") === tag) {
    return new Response(null, { status: 304, headers: { etag: tag, ...noStore } });
  }
  const people = board
    ? Object.entries(board.value.docs).map(([id, d]) => ({
        id, name: d.name, items: d.items ?? [], removed: !!d.removed, updated_at: d.updated_at,
      }))
    : [];
  return json(200, { tag, people }, { etag: tag });
}

async function handlePutTeam(request, ctx, uid) {
  const user = await requireUser(request, ctx);
  if (user.id !== uid && user.role !== "admin") {
    throw new ApiError(403, "sem_permissao", "Você só pode alterar os seus próprios cartões.");
  }
  const body = await readJson(request);
  validateCards(body.items, "novos");
  const hasBase = body.base !== undefined;
  if (hasBase) validateCards(body.base, "base");

  let merged;
  const res = await updateJSON(ctx.store, BOARD_KEY, (board) => {
    board ??= { version: 0, docs: {} };
    const doc = board.docs[uid];
    if (!doc) throw new ApiError(404, "pessoa", "Essa pessoa não está no quadro.");
    if (doc.removed && user.role !== "admin") throw new ApiError(403, "sem_permissao", "Conta removida.");
    merged = hasBase ? mergeCards(doc.items ?? [], body.base, body.items) : body.items;
    if (merged.length > LIMITS.cards) throw new ApiError(413, "muitos_cartoes", "Há cartões demais.");
    doc.items = merged;
    doc.updated_at = new Date(ctx.now()).toISOString();
    board.version++;
    if (JSON.stringify(board).length > 5 * 1024 * 1024) {
      throw new ApiError(413, "quadro_cheio", "O quadro da equipe atingiu o limite de tamanho.");
    }
    return board;
  });
  return json(200, { items: merged, tag: res.etag });
}

// ---------------------------------------------------------------- dados pessoais (banco do usuário)

const dataKey = (uid) => `data/${uid}`;

async function handleGetData(request, ctx) {
  const user = await requireUser(request, ctx);
  const r = await ctx.store.get(dataKey(user.id));
  if (!r) return new Response(null, { status: 204, headers: noStore }); // conta nova: ainda sem dados
  return new Response(r.bytes, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "x-gen": String(r.metadata.gen ?? ""),
      "x-saved-at": String(r.metadata.savedAt ?? ""),
      "x-gz": r.metadata.gz ? "1" : "0",
      ...noStore,
    },
  });
}

async function handlePutData(request, ctx) {
  const user = await requireUser(request, ctx);
  const bytes = await readBytes(request, LIMITS.data);
  if (!bytes.length) throw new ApiError(400, "vazio", "Conteúdo vazio.");
  const baseGen = request.headers.get("x-base-gen") || null;
  const force = request.headers.get("x-force") === "1";
  const gz = request.headers.get("x-gz") === "1";
  const key = dataKey(user.id);
  for (let attempt = 0; attempt < 6; attempt++) {
    const meta = await ctx.store.getMeta(key);
    const curGen = meta?.metadata?.gen ?? null;
    if (!force && curGen !== baseGen) {
      throw new ApiError(409, "versao", "Outro aparelho salvou alterações antes.", {
        gen: curGen, saved_at: meta?.metadata?.savedAt ?? null,
      });
    }
    const gen = `${ctx.now().toString(36)}-${newId().slice(0, 6)}`;
    const savedAt = new Date(ctx.now()).toISOString();
    const res = await ctx.store.put(key, bytes, {
      metadata: { gen, savedAt, gz },
      ...(meta ? { ifMatch: meta.etag } : { ifNew: true }),
    });
    if (res.modified) return json(200, { gen, savedAt });
    if (!force) {
      const again = await ctx.store.getMeta(key);
      throw new ApiError(409, "versao", "Outro aparelho salvou alterações antes.", {
        gen: again?.metadata?.gen ?? null, saved_at: again?.metadata?.savedAt ?? null,
      });
    }
  }
  throw new ApiError(503, "ocupado", "O sistema está ocupado. Tente novamente.");
}

async function handlePing(request, ctx) {
  const user = await requireUser(request, ctx);
  const [board, data, tasks] = await Promise.all([
    ctx.store.getMeta(BOARD_KEY),
    ctx.store.getMeta(dataKey(user.id)),
    ctx.store.getMeta(TASKS_KEY),
  ]);
  return json(200, {
    t: board?.etag ?? "0",
    k: tasks?.etag ?? "0",
    d: data?.metadata?.gen ?? null,
    role: user.role,
    now: new Date(ctx.now()).toISOString(),
  });
}

// ---------------------------------------------------------------- preferências (Personalizar), por conta

async function handleGetPrefs(request, ctx) {
  const user = await requireUser(request, ctx);
  const r = await getJSON(ctx.store, `prefs/${user.id}`);
  return json(200, { prefs: r ? r.value : null });
}

async function handlePutPrefs(request, ctx) {
  const user = await requireUser(request, ctx);
  const body = await readJson(request, 16 * 1024);
  if (Array.isArray(body)) throw new ApiError(400, "prefs", "Preferências inválidas.");
  await putJSON(ctx.store, `prefs/${user.id}`, body);
  return json(200, { ok: true });
}

// ---------------------------------------------------------------- arquivos

const extOf = (name) => (String(name).split(".").pop() ?? "").toLowerCase();

function safeName(name) {
  return String(name ?? "arquivo").replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 160) || "arquivo";
}

function contentDisposition(name, inline) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

async function handleUploadFile(request, ctx) {
  const user = await requireUser(request, ctx);
  const url = new URL(request.url);
  const name = safeName(url.searchParams.get("name"));
  const ext = extOf(name);
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)) {
    throw new ApiError(415, "office", `"${name}": arquivos do Office não são aceitos como anexo. Salve como PDF e envie novamente.`);
  }
  const type = FILE_TYPES[ext];
  if (!type) {
    throw new ApiError(415, "formato", `"${name}": formato não aceito. Use foto (PNG, JPG, GIF, WEBP), vídeo (MP4, WEBM), PDF ou texto (TXT, CSV, MD, JSON).`);
  }
  const bytes = await readBytes(request, LIMITS.file).catch((e) => {
    if (e.status === 413) throw new ApiError(413, "grande_demais", `"${name}" passa de 4 MB.`);
    throw e;
  });
  if (!bytes.length) throw new ApiError(400, "vazio", `"${name}" está vazio.`);
  const id = newId() + newId().slice(0, 8);
  const uploadedAt = new Date(ctx.now()).toISOString();
  await ctx.store.put(`files/${id}`, bytes, { metadata: { name, type, size: bytes.length, uid: user.id } });
  return json(201, { id, name, type, size: bytes.length, uploaded_at: uploadedAt });
}

async function handleGetFile(request, ctx, id) {
  await requireUser(request, ctx);
  if (!/^[0-9a-f]{20,40}$/.test(id)) throw new ApiError(404, "arquivo", "Arquivo não encontrado.");
  const r = await ctx.store.get(`files/${id}`);
  if (!r) throw new ApiError(404, "arquivo", "Arquivo não encontrado.");
  const dl = new URL(request.url).searchParams.get("download") === "1";
  return new Response(r.bytes, {
    status: 200,
    headers: {
      "content-type": r.metadata.type ?? "application/octet-stream",
      "content-disposition": contentDisposition(r.metadata.name ?? "arquivo", !dl),
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, max-age=3600",
    },
  });
}

async function handlePutDocFile(request, ctx, sha) {
  const user = await requireUser(request, ctx);
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new ApiError(400, "hash", "Identificador inválido.");
  const bytes = await readBytes(request, LIMITS.file).catch((e) => {
    if (e.status === 413) throw new ApiError(413, "grande_demais", "O arquivo passa de 4 MB.");
    throw e;
  });
  if (sha256(bytes) !== sha) throw new ApiError(400, "hash", "O arquivo não confere com o identificador.");
  const filename = safeName(decodeURIComponent(request.headers.get("x-filename") ?? "arquivo"));
  const mime = (request.headers.get("x-mime") ?? "application/octet-stream").slice(0, 100);
  await ctx.store.put(`docfiles/${user.id}/${sha}`, bytes, { metadata: { filename, mime } });
  return json(200, { ok: true });
}

async function handleGetDocFile(request, ctx, sha) {
  const user = await requireUser(request, ctx);
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new ApiError(400, "hash", "Identificador inválido.");
  if (new URL(request.url).searchParams.get("head") === "1") {
    const m = await ctx.store.getMeta(`docfiles/${user.id}/${sha}`);
    if (!m) throw new ApiError(404, "arquivo", "Arquivo não encontrado.");
    return json(200, { ok: true });
  }
  const r = await ctx.store.get(`docfiles/${user.id}/${sha}`);
  if (!r) throw new ApiError(404, "arquivo", "Arquivo não encontrado.");
  return new Response(r.bytes, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "x-filename": encodeURIComponent(r.metadata.filename ?? "arquivo"),
      "x-mime": r.metadata.mime ?? "application/octet-stream",
      "x-content-type-options": "nosniff",
      ...noStore,
    },
  });
}

// ---------------------------------------------------------------- roteador

export async function handle(request, ctx) {
  ctx.now ??= () => Date.now();
  ctx.env ??= {};
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method !== "GET" && method !== "HEAD" && request.headers.get("x-avant") !== "1") {
      throw new ApiError(403, "csrf", "Pedido não autorizado.");
    }

    let m;
    if (method === "GET" && path === "/health") return json(200, { ok: true, store: ctx.store.kind });
    if (method === "GET" && path === "/auth/status") return await handleStatus(ctx);
    if (method === "POST" && path === "/auth/register") return await handleRegister(request, ctx);
    if (method === "POST" && path === "/auth/login") return await handleLogin(request, ctx);
    if (method === "POST" && path === "/auth/logout") return await handleLogout(request, ctx);
    if (method === "GET" && path === "/auth/me") return await handleMe(request, ctx);
    if (method === "POST" && path === "/auth/password") return await handleChangePassword(request, ctx);
    if (method === "POST" && path === "/auth/recover") return await handleRecover(request, ctx);
    if (method === "POST" && path === "/auth/recovery-code") return await handleNewRecoveryCode(request, ctx);
    if (method === "GET" && path === "/directory") return await handleDirectory(request, ctx);

    if (method === "GET" && path === "/shared-tasks") return await handleListTasks(request, ctx);
    if (method === "POST" && path === "/shared-tasks") return await handleCreateTask(request, ctx);
    if ((m = path.match(/^\/shared-tasks\/([0-9a-f]{24})$/))) {
      if (method === "PATCH") return await handleUpdateTask(request, ctx, m[1]);
      if (method === "DELETE") return await handleDeleteTask(request, ctx, m[1]);
    }

    if (method === "GET" && path === "/users") return await handleListUsers(request, ctx);
    if ((m = path.match(/^\/users\/([0-9a-f]{24})$/))) {
      if (method === "PATCH") return await handleUpdateUser(request, ctx, m[1]);
      if (method === "DELETE") return await handleDeleteUser(request, ctx, m[1]);
    }

    if (method === "GET" && path === "/team") return await handleGetTeam(request, ctx);
    if (method === "PUT" && (m = path.match(/^\/team\/([0-9a-f]{24})$/))) return await handlePutTeam(request, ctx, m[1]);

    if (method === "GET" && path === "/data") return await handleGetData(request, ctx);
    if (method === "PUT" && path === "/data") return await handlePutData(request, ctx);
    if (method === "GET" && path === "/ping") return await handlePing(request, ctx);
    if (method === "GET" && path === "/prefs") return await handleGetPrefs(request, ctx);
    if (method === "PUT" && path === "/prefs") return await handlePutPrefs(request, ctx);

    if (method === "POST" && path === "/files") return await handleUploadFile(request, ctx);
    if (method === "GET" && (m = path.match(/^\/files\/([^/]+)$/))) return await handleGetFile(request, ctx, m[1]);
    if (method === "PUT" && (m = path.match(/^\/docfiles\/([^/]+)$/))) return await handlePutDocFile(request, ctx, m[1]);
    if (method === "GET" && (m = path.match(/^\/docfiles\/([^/]+)$/))) return await handleGetDocFile(request, ctx, m[1]);

    throw new ApiError(404, "rota", "Rota não encontrada.");
  } catch (e) {
    if (e instanceof ApiError) {
      return json(e.status, { code: e.code, message: e.message, ...(e.extra ?? {}) });
    }
    console.error("avant: erro inesperado", e);
    return json(500, { code: "erro", message: "Algo deu errado no servidor. Tente novamente." });
  }
}
