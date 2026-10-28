import { test, after } from "node:test";
import assert from "node:assert/strict";
import { makeCtx, makeClient, body, register, dump, stopBlobs } from "./helpers.mjs";

after(() => stopBlobs());
import { passwordError } from "../netlify/functions/lib/security.mjs";
import { mergeCards } from "../netlify/functions/lib/team-merge.mjs";
import { sha256 } from "../netlify/functions/lib/security.mjs";

// ------------------------------------------------------------------ regras de senha/e-mail

test("senha: no mínimo 7 caracteres, com 1 letra, 1 número e 1 especial, sem espaços", () => {
  const ok = ["Av@2026", "a1@xyzw", "Zé#9abcd", "Senha@123", "x".repeat(60) + "@1a"];
  for (const p of ok) assert.equal(passwordError(p), null, p);
  const bad = {
    "a1@": "mínimo 7", "Ab1!": "mínimo 7", "Av@202": "mínimo 7", "": "mínimo 7",
    "abcdef@@": "número", "1234567@": "letra",
    "Abc12345": "especial", "A 1@bcde": "espaços",
    ["x".repeat(63) + "@1a"]: "máximo 64",
  };
  for (const [p, frag] of Object.entries(bad)) {
    const e = passwordError(p);
    assert.ok(e && e.includes(frag), `${JSON.stringify(p)} -> ${e}`);
  }
});

// ------------------------------------------------------------------ contas e administrador

test("a primeira conta é administradora e as seguintes são membros", async () => {
  const ctx = makeCtx();
  const st = await body(await makeClient(ctx).get("/auth/status"));
  assert.equal(st.firstAccount, true);
  const a = await register(ctx, "Victor Andrade");
  assert.equal(a.res.status, 201);
  assert.equal(a.data.user.role, "admin");
  assert.equal(a.data.user.name, "Victor Andrade");
  const b = await register(ctx, "Ana Souza");
  assert.equal(b.data.user.role, "membro");
  const st2 = await body(await makeClient(ctx).get("/auth/status"));
  assert.equal(st2.firstAccount, false);
});

test("o nome é único, sem diferenciar maiúsculas, acentos e espaços extras", async () => {
  const ctx = makeCtx();
  await register(ctx, "José da Silva");
  for (const nome of ["jose da silva", "JOSÉ DA SILVA", "  José   da  Silva "]) {
    const dup = await register(ctx, nome);
    assert.equal(dup.res.status, 409, nome);
    assert.match(dup.data.message, /Já existe uma conta com esse nome/);
  }
  assert.equal((await register(ctx, "José da Silva Júnior")).res.status, 201);
});

test("cadastro recusa senha fora da regra e nome curto ou longo", async () => {
  const ctx = makeCtx();
  assert.equal((await register(ctx, "Ana", "abc")).res.status, 400);
  assert.equal((await register(ctx, "Ana", "Av@202")).res.status, 400); // 6 caracteres
  assert.equal((await register(ctx, "Ana", "abcdefg@")).res.status, 400); // sem número
  assert.equal((await register(ctx, "A")).res.status, 400);
  assert.equal((await register(ctx, "N".repeat(61))).res.status, 400);
  assert.equal((await register(ctx, "Ana Souza", "Av@2026")).res.status, 201);
});

test("cadastro não pede nem guarda e-mail", async () => {
  const ctx = makeCtx();
  const r = await register(ctx, "Ana Souza");
  assert.equal(r.res.status, 201);
  assert.equal("email" in r.data.user, false);
  for (const [, bytes] of await dump(ctx)) assert.ok(!new TextDecoder().decode(bytes).includes("@x.com"));
});

test("código de acesso (AVANT_ACCESS_CODE) é exigido quando definido", async () => {
  const ctx = makeCtx({ AVANT_ACCESS_CODE: "equipe26" });
  assert.equal((await makeClient(ctx).get("/auth/status").then(body)).needCode, true);
  assert.equal((await register(ctx, "Ana Souza")).res.status, 403);
  assert.equal((await register(ctx, "Ana Souza", "Av@2026", { code: "errado" })).res.status, 403);
  assert.equal((await register(ctx, "Ana Souza", "Av@2026", { code: "equipe26" })).res.status, 201);
});

test("a senha nunca é guardada em texto", async () => {
  const ctx = makeCtx();
  await register(ctx, "Ana Souza", "Av@2026");
  const todos = await dump(ctx);
  for (const [, bytes] of todos) {
    assert.ok(!new TextDecoder().decode(bytes).includes("Av@2026"));
  }
  const user = JSON.parse(new TextDecoder().decode([...todos].find(([k]) => k.startsWith("users/"))[1]));
  assert.match(user.hash, /^[0-9a-f]{64}$/);
  assert.match(user.salt, /^[0-9a-f]{32}$/);
  assert.ok(user.iter >= 100000);
});

test("login, sessão e logout", async () => {
  const ctx = makeCtx();
  await register(ctx, "Ana Souza");
  const c = makeClient(ctx);
  assert.equal((await body(await c.get("/auth/me"))).user, null);
  assert.equal((await c.post("/auth/login", { name: "ana souza", password: "Av@2026" })).status, 200);
  const me = await body(await c.get("/auth/me"));
  assert.equal(me.user.name, "Ana Souza");
  assert.match(c.cookie, /^avant_session=/);
  await c.post("/auth/logout", {});
  assert.equal((await body(await c.get("/auth/me"))).user, null);
});

test("o cookie de sessão é HttpOnly, SameSite e dura 30 dias", async () => {
  const ctx = makeCtx();
  const c = makeClient(ctx);
  const res = await c.post("/auth/register", { name: "Ana Souza", password: "Av@2026" });
  const set = res.headers.get("set-cookie");
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Lax/);
  assert.match(set, /Secure/);
  assert.match(set, new RegExp(`Max-Age=${30 * 86400}`));
});

test("a sessão expira depois de 30 dias", async () => {
  const ctx = makeCtx();
  const { c } = await register(ctx, "Ana Souza");
  const vivo = async () => (await body(await c.get("/auth/me"))).user !== null;
  assert.equal(await vivo(), true);
  ctx.advance(29 * 86400_000);
  assert.equal(await vivo(), true);
  ctx.advance(2 * 86400_000);
  assert.equal(await vivo(), false);
});

test("bloqueio de 1 minuto após 5 tentativas erradas", async () => {
  const ctx = makeCtx();
  await register(ctx, "Ana Souza");
  const c = makeClient(ctx);
  for (let i = 1; i <= 4; i++) {
    const r = await c.post("/auth/login", { name: "Ana Souza", password: "Errada1!" });
    assert.equal(r.status, 401, `tentativa ${i}`);
  }
  const fifth = await c.post("/auth/login", { name: "Ana Souza", password: "Errada1!" });
  assert.equal(fifth.status, 429);
  // mesmo a senha certa é recusada durante o bloqueio
  assert.equal((await c.post("/auth/login", { name: "Ana Souza", password: "Av@2026" })).status, 429);
  ctx.advance(61_000);
  assert.equal((await c.post("/auth/login", { name: "Ana Souza", password: "Av@2026" })).status, 200);
});

test("nome inexistente dá a mesma mensagem que senha errada", async () => {
  const ctx = makeCtx();
  const c = makeClient(ctx);
  const r = await c.post("/auth/login", { name: "Ninguém Aqui", password: "Av@2026" });
  assert.equal(r.status, 401);
  assert.equal((await body(r)).message, "Nome ou senha incorretos.");
});

test("pedidos que alteram dados exigem o cabeçalho anti-CSRF", async () => {
  const ctx = makeCtx();
  const res = await (await import("../netlify/functions/lib/app.mjs")).handle(
    new Request("https://avant.test/api/auth/register", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ana Souza", password: "Av@2026" }),
    }), ctx);
  assert.equal(res.status, 403);
});

test("trocar a própria senha pede a senha atual e derruba os outros aparelhos", async () => {
  const ctx = makeCtx();
  const { c } = await register(ctx, "Ana Souza");
  const outro = makeClient(ctx);
  await outro.post("/auth/login", { name: "Ana Souza", password: "Av@2026" });
  assert.equal((await c.post("/auth/password", { current: "Errada1!", next: "Nova@12" })).status, 400);
  assert.equal((await c.post("/auth/password", { current: "Av@2026", next: "fraca" })).status, 400);
  assert.equal((await c.post("/auth/password", { current: "Av@2026", next: "Nova@12" })).status, 200);
  assert.notEqual((await body(await c.get("/auth/me"))).user, null); // este aparelho continua
  assert.equal((await body(await outro.get("/auth/me"))).user, null); // o outro cai
  const novo = makeClient(ctx);
  assert.equal((await novo.post("/auth/login", { name: "Ana Souza", password: "Nova@12" })).status, 200);
});

// ------------------------------------------------------------------ permissões (direto na API)

async function setup() {
  const ctx = makeCtx();
  const admin = await register(ctx, "Victor Andrade");
  const ana = await register(ctx, "Ana Souza");
  const bia = await register(ctx, "Bia Lima");
  return { ctx, admin, ana, bia };
}

test("membro não acessa a lista de usuários; administrador acessa", async () => {
  const { admin, ana } = await setup();
  assert.equal((await ana.c.get("/users")).status, 403);
  const res = await admin.c.get("/users");
  assert.equal(res.status, 200);
  const list = await body(res);
  assert.equal(list.length, 3);
  assert.deepEqual(Object.keys(list[0]).sort(), ["created_at", "id", "name", "role"]);
  assert.ok(!JSON.stringify(list).includes("hash"));
});

test("membro não altera perfis, senhas nem exclui contas", async () => {
  const { ana, bia } = await setup();
  assert.equal((await ana.c.patch(`/users/${bia.data.user.id}`, { role: "admin" })).status, 403);
  assert.equal((await ana.c.patch(`/users/${bia.data.user.id}`, { password: "Nova@12" })).status, 403);
  assert.equal((await ana.c.del(`/users/${bia.data.user.id}`)).status, 403);
  assert.equal((await ana.c.patch(`/users/${ana.data.user.id}`, { role: "admin" })).status, 403);
});

test("membro só altera os próprios cartões; administrador altera os de qualquer pessoa", async () => {
  const { admin, ana, bia } = await setup();
  const card = (id, title) => ({ id, title, status: "a_fazer" });
  const own = await ana.c.put(`/team/${ana.data.user.id}`, { base: [], items: [card("c1", "Minha tarefa")] });
  assert.equal(own.status, 200);
  const other = await ana.c.put(`/team/${bia.data.user.id}`, { base: [], items: [card("x1", "Invasão")] });
  assert.equal(other.status, 403);
  const adm = await admin.c.put(`/team/${bia.data.user.id}`, { base: [], items: [card("b1", "Pelo admin")] });
  assert.equal(adm.status, 200);
  const team = await body(await bia.c.get("/team"));
  const byName = Object.fromEntries(team.people.map((p) => [p.name, p.items.map((i) => i.title)]));
  assert.deepEqual(byName["Ana Souza"], ["Minha tarefa"]);
  assert.deepEqual(byName["Bia Lima"], ["Pelo admin"]);
});

test("sem sessão nada é acessível", async () => {
  const { ana } = await setup();
  const anon = makeClient(makeCtx());
  for (const p of ["/team", "/data", "/ping", "/users"]) assert.equal((await anon.get(p)).status, 401, p);
  assert.equal((await body(await anon.get("/auth/me"))).user, null);
  assert.equal((await anon.put(`/team/${ana.data.user.id}`, { items: [] })).status, 401);
});

test("não é possível excluir a própria conta nem o último administrador", async () => {
  const { admin, ana } = await setup();
  assert.equal((await admin.c.del(`/users/${admin.data.user.id}`)).status, 400);
  assert.equal((await admin.c.patch(`/users/${admin.data.user.id}`, { role: "membro" })).status, 400);
  // com um segundo admin, o primeiro pode ser rebaixado
  assert.equal((await admin.c.patch(`/users/${ana.data.user.id}`, { role: "admin" })).status, 200);
  assert.equal((await admin.c.patch(`/users/${admin.data.user.id}`, { role: "membro" })).status, 200);
  // agora Ana é a única administradora
  assert.equal((await ana.c.patch(`/users/${ana.data.user.id}`, { role: "membro" })).status, 400);
});

test("administrador redefine senha (sessão antiga cai) e exclui conta (cartões ficam)", async () => {
  const { ctx, admin, ana, bia } = await setup();
  await ana.c.put(`/team/${ana.data.user.id}`, { base: [], items: [{ id: "c1", title: "Fica no quadro" }] });
  assert.equal((await admin.c.patch(`/users/${ana.data.user.id}`, { password: "fraca" })).status, 400);
  assert.equal((await admin.c.patch(`/users/${ana.data.user.id}`, { password: "Nova@12" })).status, 200);
  assert.equal((await body(await ana.c.get("/auth/me"))).user, null);
  assert.equal((await makeClient(ctx).post("/auth/login", { name: "Ana Souza", password: "Nova@12" })).status, 200);

  assert.equal((await admin.c.del(`/users/${ana.data.user.id}`)).status, 200);
  assert.equal((await makeClient(ctx).post("/auth/login", { name: "Ana Souza", password: "Nova@12" })).status, 401);
  const team = await body(await bia.c.get("/team"));
  const a = team.people.find((p) => p.id === ana.data.user.id);
  assert.equal(a.removed, true);
  assert.equal(a.items[0].title, "Fica no quadro");
  // o nome volta a ficar livre
  assert.equal((await register(ctx, "Ana Souza")).res.status, 201);
});

// ------------------------------------------------------------------ quadro da equipe

test("mesclagem: alterações de duas pessoas no mesmo quadro não se perdem", () => {
  const base = [{ id: "a", t: 1 }, { id: "b", t: 1 }];
  // servidor: outra pessoa adicionou "c" e alterou "b"
  const current = [{ id: "a", t: 1 }, { id: "b", t: 2 }, { id: "c", t: 1 }];
  // cliente: alterou "a" e criou "d"
  const next = [{ id: "a", t: 9 }, { id: "b", t: 1 }, { id: "d", t: 1 }];
  const out = mergeCards(current, base, next);
  const m = Object.fromEntries(out.map((c) => [c.id, c.t]));
  assert.deepEqual(m, { a: 9, b: 2, c: 1, d: 1 });
});

test("mesclagem: remoção pelo cliente vale; remoção pelo servidor também", () => {
  const base = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const current = [{ id: "a" }, { id: "b" }]; // servidor removeu "c"
  const next = [{ id: "a" }, { id: "c" }]; // cliente removeu "b", não mexeu em "c"
  assert.deepEqual(mergeCards(current, base, next).map((c) => c.id), ["a"]);
});

test("30 pessoas gravando no quadro ao mesmo tempo: nenhum cartão se perde", async () => {
  const ctx = makeCtx();
  const people = [];
  for (let i = 0; i < 30; i++) {
    people.push(await register(ctx, `Pessoa ${i + 1}`));
  }
  const results = await Promise.all(
    people.map((p, i) => p.c.put(`/team/${p.data.user.id}`, {
      base: [], items: [{ id: `card-${i}`, title: `Cartão ${i}` }],
    })),
  );
  assert.ok(results.every((r) => r.status === 200), results.map((r) => r.status).join());
  const team = await body(await people[0].c.get("/team"));
  const total = team.people.reduce((n, p) => n + p.items.length, 0);
  assert.equal(total, 30);
  for (const p of team.people) assert.equal(p.items.length, 1);
});

test("30 gravações simultâneas no MESMO quadro (admin + membro editando) mantêm todos os cartões", async () => {
  const { ctx, admin, ana } = await setup();
  const target = ana.data.user.id;
  const writers = [admin.c, ana.c];
  const ops = [];
  for (let i = 0; i < 30; i++) {
    const c = writers[i % 2];
    ops.push(c.put(`/team/${target}`, { base: [], items: [{ id: `k${i}`, title: `Cartão ${i}` }] }));
  }
  const res = await Promise.all(ops);
  assert.ok(res.every((r) => r.status === 200));
  // Cada requisição partiu de base vazia e só adicionou o seu cartão: nenhum pode ter sumido,
  // porque a mesclagem preserva cartões criados por outras gravações.
  const team = await body(await ana.c.get("/team"));
  const ids = team.people.find((p) => p.id === target).items.map((i) => i.id).sort();
  assert.equal(ids.length, 30);
  assert.equal(new Set(ids).size, 30);
});

test("cartões inválidos são recusados", async () => {
  const { ana } = await setup();
  const id = ana.data.user.id;
  assert.equal((await ana.c.put(`/team/${id}`, { items: "x" })).status, 400);
  assert.equal((await ana.c.put(`/team/${id}`, { items: [{ title: "sem id" }] })).status, 400);
  assert.equal((await ana.c.put(`/team/${id}`, { items: [{ id: "a" }, { id: "a" }] })).status, 400);
});

test("GET /team responde 304 quando nada mudou (ETag)", async () => {
  const { ana } = await setup();
  const r1 = await ana.c.get("/team");
  const tag = r1.headers.get("etag");
  assert.ok(tag);
  assert.equal((await ana.c.get("/team", { "if-none-match": tag })).status, 304);
  await ana.c.put(`/team/${ana.data.user.id}`, { base: [], items: [{ id: "n" }] });
  assert.equal((await ana.c.get("/team", { "if-none-match": tag })).status, 200);
});

// ------------------------------------------------------------------ dados pessoais

test("dados pessoais: gravar, ler e detectar conflito entre aparelhos", async () => {
  const { ana } = await setup();
  const snap = (s) => new TextEncoder().encode(s);
  assert.equal((await ana.c.get("/data")).status, 204);
  const p1 = await ana.c.put("/data", snap("v1"), { "x-gz": "1" });
  assert.equal(p1.status, 200);
  const { gen: g1 } = await body(p1);
  const got = await ana.c.get("/data");
  assert.equal(await got.text(), "v1");
  assert.equal(got.headers.get("x-gen"), g1);
  const p2 = await ana.c.put("/data", snap("v2"), { "x-base-gen": g1 });
  assert.equal(p2.status, 200);
  // aparelho que ainda parte da versão antiga
  const stale = await ana.c.put("/data", snap("v3-velho"), { "x-base-gen": g1 });
  assert.equal(stale.status, 409);
  assert.equal(await (await ana.c.get("/data")).text(), "v2");
  // com force (decisão consciente), grava
  assert.equal((await ana.c.put("/data", snap("v3"), { "x-base-gen": g1, "x-force": "1" })).status, 200);
  assert.equal(await (await ana.c.get("/data")).text(), "v3");
});

test("dados pessoais de uma pessoa não são visíveis para outra", async () => {
  const { ana, bia } = await setup();
  await ana.c.put("/data", new TextEncoder().encode("segredo da ana"));
  assert.equal((await bia.c.get("/data")).status, 204);
});

test("ping informa mudanças do quadro e dos dados", async () => {
  const { ana } = await setup();
  const a = await body(await ana.c.get("/ping"));
  await ana.c.put(`/team/${ana.data.user.id}`, { base: [], items: [{ id: "z" }] });
  await ana.c.put("/data", new TextEncoder().encode("x"));
  const b = await body(await ana.c.get("/ping"));
  assert.notEqual(a.t, b.t);
  assert.notEqual(a.d, b.d);
});

// ------------------------------------------------------------------ arquivos

test("anexos: aceita formatos permitidos até 4 MB e recusa o resto", async () => {
  const { ana, bia } = await setup();
  const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const up = await ana.c.post("/files?name=foto.PNG", png);
  assert.equal(up.status, 201);
  const meta = await body(up);
  assert.equal(meta.type, "image/png");
  // qualquer pessoa logada consegue ver (o quadro é compartilhado)
  const got = await bia.c.get(`/files/${meta.id}`);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get("content-type"), "image/png");
  assert.equal(got.headers.get("x-content-type-options"), "nosniff");
  assert.match(got.headers.get("content-security-policy"), /sandbox/);
  assert.equal((await makeClient(makeCtx()).get(`/files/${meta.id}`)).status, 401);

  assert.equal((await ana.c.post("/files?name=planilha.xlsx", png)).status, 415);
  assert.equal((await ana.c.post("/files?name=pagina.html", png)).status, 415);
  assert.equal((await ana.c.post("/files?name=imagem.svg", png)).status, 415);
  assert.equal((await ana.c.post("/files?name=grande.pdf", new Uint8Array(4 * 1024 * 1024 + 1))).status, 413);
  assert.equal((await ana.c.post("/files?name=limite.pdf", new Uint8Array(4 * 1024 * 1024))).status, 201);
});

test("originais de documentos: só o dono lê e o conteúdo precisa bater com o hash", async () => {
  const { ana, bia } = await setup();
  const bytes = new TextEncoder().encode("conteúdo do documento");
  const sha = sha256(bytes);
  assert.equal((await ana.c.put(`/docfiles/${"0".repeat(64)}`, bytes)).status, 400);
  assert.equal((await ana.c.put(`/docfiles/${sha}`, bytes, { "x-filename": encodeURIComponent("Relatório.pdf"), "x-mime": "application/pdf" })).status, 200);
  const got = await ana.c.get(`/docfiles/${sha}`);
  assert.equal(got.status, 200);
  assert.equal(decodeURIComponent(got.headers.get("x-filename")), "Relatório.pdf");
  assert.equal((await bia.c.get(`/docfiles/${sha}`)).status, 404);
});

test("proteção da primeira conta: duas inscrições simultâneas geram só um administrador", async () => {
  const ctx = makeCtx();
  const rs = await Promise.all(
    Array.from({ length: 8 }, (_, i) => register(ctx, `Pessoa ${i}`)),
  );
  assert.ok(rs.every((r) => r.res.status === 201));
  assert.equal(rs.filter((r) => r.data.user.role === "admin").length, 1);
});

// ------------------------------------------------------------------ preferências, carga inicial

test("preferências (Personalizar) ficam salvas na conta de cada pessoa", async () => {
  const { ana, bia } = await setup();
  assert.deepEqual(await body(await ana.c.get("/prefs")), { prefs: null });
  const prefs = { theme: "escuro", accent: "#7b4dff", wallpaper: "aurora", fontSize: "grande" };
  assert.equal((await ana.c.put("/prefs", prefs)).status, 200);
  assert.deepEqual((await body(await ana.c.get("/prefs"))).prefs, prefs);
  assert.equal((await body(await bia.c.get("/prefs"))).prefs, null);
  assert.equal((await ana.c.put("/prefs", [1, 2])).status, 400);
  assert.equal((await ana.c.put("/prefs", new TextEncoder().encode(JSON.stringify({ x: "y".repeat(20000) })))).status, 413);
});

test("só a primeira conta recebe a marca de carga inicial", async () => {
  const { ctx, admin, ana } = await setup();
  assert.equal((await body(await admin.c.get("/auth/me"))).user.is_first_admin, true);
  assert.equal((await body(await ana.c.get("/auth/me"))).user.is_first_admin, false);
  // continua verdadeira depois de um novo login (em outro aparelho)
  const outro = makeClient(ctx);
  const login = await body(await outro.post("/auth/login", { name: "Victor Andrade", password: "Av@2026" }));
  assert.equal(login.user.is_first_admin, true);
});

test("existência do original de um documento pode ser checada sem baixar o arquivo", async () => {
  const { ana } = await setup();
  const bytes = new TextEncoder().encode("abc");
  const sha = sha256(bytes);
  assert.equal((await ana.c.get(`/docfiles/${sha}?head=1`)).status, 404);
  await ana.c.put(`/docfiles/${sha}`, bytes);
  const h = await ana.c.get(`/docfiles/${sha}?head=1`);
  assert.equal(h.status, 200);
  assert.equal(h.headers.get("content-type").includes("json"), true);
});
