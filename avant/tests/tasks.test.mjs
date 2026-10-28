import { test, after } from "node:test";
import assert from "node:assert/strict";
import { makeCtx, makeClient, body, register, stopBlobs } from "./helpers.mjs";

after(() => stopBlobs());

async function team() {
  const ctx = makeCtx();
  const admin = await register(ctx, "Victor Andrade");
  const ana = await register(ctx, "Ana Souza");
  const beto = await register(ctx, "Beto Lima");
  return { ctx, admin, ana, beto };
}

test("diretório de pessoas: qualquer conta logada vê id e nome, e só isso", async () => {
  const { ana } = await team();
  const res = await ana.c.get("/directory");
  assert.equal(res.status, 200);
  const list = await body(res);
  assert.deepEqual(list.map((u) => u.name), ["Ana Souza", "Beto Lima", "Victor Andrade"]);
  assert.deepEqual(Object.keys(list[0]).sort(), ["id", "name"]);
  const anon = makeClient(makeCtx());
  assert.equal((await anon.get("/directory")).status, 401);
});

test("tarefa atribuída aparece para o responsável e não para quem não tem nada com ela", async () => {
  const { ana, beto } = await team();
  const created = await ana.c.post("/shared-tasks", {
    title: "Validar planilha das unidades", assignee: beto.data.user.id, visibility: "individual", kind: "validar", due_date: "2026-11-05",
  });
  assert.equal(created.status, 201);
  const t = await body(created);
  assert.equal(t.assignee_name, "Beto Lima");
  assert.equal(t.owner_name, "Ana Souza");
  assert.equal(t.kind, "validar");

  const seenByBeto = (await body(await beto.c.get("/shared-tasks"))).tasks;
  assert.equal(seenByBeto.length, 1);
  assert.equal(seenByBeto[0].title, "Validar planilha das unidades");
});

test("visibilidade: individual só para dono e responsável; equipe para todos; admin vê tudo", async () => {
  const { ctx, ana, beto, admin } = await team();
  const caio = await register(ctx, "Caio Reis");
  await ana.c.post("/shared-tasks", { title: "Só minha e do Beto", assignee: beto.data.user.id, visibility: "individual" });
  await ana.c.post("/shared-tasks", { title: "Para toda a equipe", visibility: "equipe" });
  const titles = async (c) => (await body(await c.get("/shared-tasks"))).tasks.map((t) => t.title).sort();
  assert.deepEqual(await titles(ana.c), ["Para toda a equipe", "Só minha e do Beto"]);
  assert.deepEqual(await titles(beto.c), ["Para toda a equipe", "Só minha e do Beto"]);
  assert.deepEqual(await titles(caio.c), ["Para toda a equipe"]);
  assert.deepEqual(await titles(admin.c), ["Para toda a equipe", "Só minha e do Beto"]);
});

test("permissões direto na API: responsável muda só a situação/subtarefas; estranho não edita nem exclui", async () => {
  const { ctx, ana, beto } = await team();
  const caio = await register(ctx, "Caio Reis");
  const t = await body(await ana.c.post("/shared-tasks", {
    title: "Relatório", assignee: beto.data.user.id, visibility: "equipe",
    subtasks: [{ id: "a", title: "Coletar dados" }, { id: "b", title: "Revisar" }],
  }));
  // responsável conclui
  let r = await beto.c.patch(`/shared-tasks/${t.id}`, { status: "concluida" });
  assert.equal(r.status, 200);
  const done = await body(r);
  assert.equal(done.status, "concluida");
  assert.equal(done.done_by, "Beto Lima");
  // responsável marca subtarefa
  r = await beto.c.patch(`/shared-tasks/${t.id}`, { subtasks: [{ id: "a", title: "Coletar dados", done: true }, { id: "b", title: "Revisar" }] });
  assert.equal(r.status, 200);
  // mas não muda título, prazo nem a lista de subtarefas
  assert.equal((await beto.c.patch(`/shared-tasks/${t.id}`, { title: "Outro" })).status, 403);
  assert.equal((await beto.c.patch(`/shared-tasks/${t.id}`, { assignee: null })).status, 403);
  assert.equal((await beto.c.patch(`/shared-tasks/${t.id}`, { subtasks: [{ id: "x", title: "Nova" }] })).status, 403);
  assert.equal((await beto.c.del(`/shared-tasks/${t.id}`)).status, 403);
  // pessoa de fora, mesmo vendo (equipe), não altera
  assert.equal((await caio.c.patch(`/shared-tasks/${t.id}`, { status: "pendente" })).status, 403);
  assert.equal((await caio.c.del(`/shared-tasks/${t.id}`)).status, 403);
  // dono edita e exclui
  assert.equal((await ana.c.patch(`/shared-tasks/${t.id}`, { title: "Relatório mensal" })).status, 200);
  assert.equal((await ana.c.del(`/shared-tasks/${t.id}`)).status, 200);
  assert.equal((await body(await ana.c.get("/shared-tasks"))).tasks.length, 0);
});

test("tarefa individual de outra pessoa é invisível (404) até para tentar mexer", async () => {
  const { ctx, ana } = await team();
  const caio = await register(ctx, "Caio Reis");
  const t = await body(await ana.c.post("/shared-tasks", { title: "Privada", visibility: "individual" }));
  assert.equal((await caio.c.patch(`/shared-tasks/${t.id}`, { status: "concluida" })).status, 404);
  assert.equal((await caio.c.del(`/shared-tasks/${t.id}`)).status, 404);
});

test("validações: título, data, responsável inexistente, subtarefas demais", async () => {
  const { ana } = await team();
  assert.equal((await ana.c.post("/shared-tasks", { title: "a" })).status, 400);
  assert.equal((await ana.c.post("/shared-tasks", { title: "Ok ok", due_date: "31/12/2026" })).status, 400);
  assert.equal((await ana.c.post("/shared-tasks", { title: "Ok ok", assignee: "0".repeat(24) })).status, 400);
  assert.equal((await ana.c.post("/shared-tasks", { title: "Ok ok", impact: "enorme" })).status, 400);
  const many = Array.from({ length: 41 }, (_, i) => ({ title: `s${i}` }));
  assert.equal((await ana.c.post("/shared-tasks", { title: "Ok ok", subtasks: many })).status, 400);
  const semSessao = makeClient((await team()).ctx);
  assert.equal((await semSessao.post("/shared-tasks", { title: "Ok ok" })).status, 401);
});

test("ETag da lista: 304 quando nada mudou e lista nova quando muda; ping avisa", async () => {
  const { ana, beto } = await team();
  const first = await ana.c.get("/shared-tasks");
  const tag = first.headers.get("etag");
  assert.equal((await ana.c.get("/shared-tasks", { "if-none-match": tag })).status, 304);
  const p1 = await body(await ana.c.get("/ping"));
  await beto.c.post("/shared-tasks", { title: "Nova da equipe", visibility: "equipe" });
  const p2 = await body(await ana.c.get("/ping"));
  assert.notEqual(p1.k, p2.k);
  const again = await ana.c.get("/shared-tasks", { "if-none-match": tag });
  assert.equal(again.status, 200);
  assert.equal((await body(again)).tasks.length, 1);
});

test("30 pessoas criando tarefas da equipe ao mesmo tempo: nenhuma se perde", async () => {
  const ctx = makeCtx();
  const people = [];
  for (let i = 0; i < 30; i++) people.push(await register(ctx, `Pessoa ${i + 1}`));
  const res = await Promise.all(people.map((p, i) => p.c.post("/shared-tasks", { title: `Tarefa ${i}`, visibility: "equipe" })));
  assert.ok(res.every((r) => r.status === 201), res.map((r) => r.status).join());
  const list = (await body(await people[0].c.get("/shared-tasks"))).tasks;
  assert.equal(list.length, 30);
});

test("excluir a conta do responsável deixa a tarefa sem responsável (e não some)", async () => {
  const { ana, beto, admin } = await team();
  const t = await body(await ana.c.post("/shared-tasks", { title: "Com o Beto", assignee: beto.data.user.id, visibility: "equipe" }));
  assert.equal((await admin.c.del(`/users/${beto.data.user.id}`)).status, 200);
  const after = (await body(await ana.c.get("/shared-tasks"))).tasks.find((x) => x.id === t.id);
  assert.equal(after.assignee, null);
});

// ---------------------------------------------------------------- recuperação de senha

test("cadastro devolve código de recuperação e o servidor não guarda o código em texto", async () => {
  const ctx = makeCtx();
  const { data } = await register(ctx, "Dora Alves");
  assert.match(data.recoveryCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const raw = [...ctx.store._dump?.().values?.() ?? []].map((e) => Buffer.from(e.bytes).toString("utf8")).join("\n");
  if (ctx.store._dump) assert.ok(!raw.includes(data.recoveryCode.replaceAll("-", "")));
});

test("recuperar senha com nome + código: troca a senha, derruba outros aparelhos e troca o código", async () => {
  const ctx = makeCtx();
  const { c, data } = await register(ctx, "Dora Alves", "Av@2026x");
  const other = makeClient(ctx);
  const outro = await other.post("/auth/login", { name: "Dora Alves", password: "Av@2026x" });
  assert.equal(outro.status, 200);

  const guest = makeClient(ctx);
  const ok = await guest.post("/auth/recover", { name: "dora alves", code: data.recoveryCode.toLowerCase(), next: "Nova#2027" });
  assert.equal(ok.status, 200);
  const res = await body(ok);
  assert.notEqual(res.recoveryCode, data.recoveryCode);
  assert.equal((await body(await guest.get("/auth/me"))).user.name, "Dora Alves");

  assert.equal((await other.get("/auth/me")).status, 200);
  assert.equal((await body(await other.get("/auth/me"))).user, null); // sessão antiga caiu
  assert.equal((await body(await c.get("/auth/me"))).user, null);

  const login = makeClient(ctx);
  assert.equal((await login.post("/auth/login", { name: "Dora Alves", password: "Av@2026x" })).status, 401);
  assert.equal((await login.post("/auth/login", { name: "Dora Alves", password: "Nova#2027" })).status, 200);

  // o código antigo não vale mais
  const reuse = await makeClient(ctx).post("/auth/recover", { name: "Dora Alves", code: data.recoveryCode, next: "Outra#2028" });
  assert.equal(reuse.status, 401);
});

test("recuperação: código errado, senha fraca, conta inexistente e bloqueio de 1 minuto", async () => {
  const ctx = makeCtx();
  const { data } = await register(ctx, "Dora Alves");
  const c = makeClient(ctx);
  assert.equal((await c.post("/auth/recover", { name: "Dora Alves", code: data.recoveryCode, next: "fraca" })).status, 400);
  assert.equal((await c.post("/auth/recover", { name: "Dora Alves", code: "ABCD-EFGH-JKLM", next: "Nova#2027" })).status, 401);
  assert.equal((await c.post("/auth/recover", { name: "Fulano Inexistente", code: "ABCD-EFGH-JKLM", next: "Nova#2027" })).status, 401);
  assert.equal((await c.post("/auth/recover", { name: "Dora Alves", code: "curto", next: "Nova#2027" })).status, 400);
  for (let i = 0; i < 4; i++) await c.post("/auth/recover", { name: "Dora Alves", code: "ABCD-EFGH-JKLM", next: "Nova#2027" });
  const blocked = await c.post("/auth/recover", { name: "Dora Alves", code: data.recoveryCode, next: "Nova#2027" });
  assert.equal(blocked.status, 429);
  ctx.advance(61_000);
  assert.equal((await c.post("/auth/recover", { name: "Dora Alves", code: data.recoveryCode, next: "Nova#2027" })).status, 200);
});

test("conta antiga (sem código) gera um código novo com a senha atual", async () => {
  const ctx = makeCtx();
  const { c } = await register(ctx, "Dora Alves", "Av@2026x");
  assert.equal((await c.post("/auth/recovery-code", { current: "errada#1" })).status, 400);
  const r = await body(await c.post("/auth/recovery-code", { current: "Av@2026x" }));
  assert.match(r.recoveryCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const guest = makeClient(ctx);
  assert.equal((await guest.post("/auth/recover", { name: "Dora Alves", code: r.recoveryCode, next: "Nova#2027" })).status, 200);
  assert.equal((await makeClient(ctx).post("/auth/recovery-code", { current: "x" })).status, 401);
});
