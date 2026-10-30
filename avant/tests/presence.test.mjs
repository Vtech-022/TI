import { test, after } from "node:test";
import assert from "node:assert/strict";
import { makeCtx, body, register, stopBlobs } from "./helpers.mjs";

after(() => stopBlobs());

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const row = async (c, id) => (await body(await c.get("/presence"))).people.find((p) => p.id === id);

test("quem dá sinal aparece online; quem some deixa de aparecer", async () => {
  const ctx = makeCtx();
  const ana = await register(ctx, "Ana Souza");
  const beto = await register(ctx, "Beto Lima");
  await ana.c.get("/ping");
  assert.equal((await row(beto.c, ana.data.user.id)).online, true);
  assert.equal((await row(beto.c, beto.data.user.id)).online, false); // Beto ainda não deu sinal
  ctx.advance(120_000);
  assert.equal((await row(beto.c, ana.data.user.id)).online, false);
});

test("cronômetro do dia: soma o tempo ligado e pausa sozinho se a pessoa some", async () => {
  const ctx = makeCtx();
  const ana = await register(ctx, "Ana Souza");
  const id = ana.data.user.id;
  await ana.c.get("/ping");
  let r = await body(await ana.c.post("/presence/work", { action: "start" }));
  assert.equal(r.working, true);
  for (let i = 0; i < 4; i++) { ctx.advance(30_000); await ana.c.get("/ping"); } // 2 min com a tela aberta
  r = await row(ana.c, id);
  assert.equal(r.worked_ms, 120_000);
  assert.equal(r.working, true);
  ctx.advance(10 * 60_000); // fechou a aba e foi embora
  r = await row(ana.c, id);
  assert.equal(r.working, false);
  assert.equal(r.worked_ms, 120_000 + 150_000); // conta só até a tolerância depois do último sinal
  // ao voltar o cronômetro continua pausado e o tempo guardado
  await ana.c.get("/ping");
  r = await row(ana.c, id);
  assert.equal(r.working, false);
  assert.equal(r.worked_ms, 270_000);
  r = await body(await ana.c.post("/presence/work", { action: "start" }));
  ctx.advance(60_000);
  r = await body(await ana.c.post("/presence/work", { action: "stop" }));
  assert.equal(r.worked_ms, 330_000);
  assert.equal((await ana.c.post("/presence/work", { action: "x" })).status, 400);
});

test("as horas zeram quando o dia vira", async () => {
  const ctx = makeCtx();
  const ana = await register(ctx, "Ana Souza");
  await ana.c.post("/presence/work", { action: "start" });
  ctx.advance(30_000);
  await ana.c.post("/presence/work", { action: "stop" });
  assert.equal((await row(ana.c, ana.data.user.id)).worked_ms, 30_000);
  ctx.advance(26 * 3600_000);
  assert.equal((await row(ana.c, ana.data.user.id)).worked_ms, 0);
});

test("foto de perfil: só imagem pequena; outros colegas conseguem ver; dá para remover", async () => {
  const ctx = makeCtx();
  const ana = await register(ctx, "Ana Souza");
  const beto = await register(ctx, "Beto Lima");
  assert.equal((await ana.c.put("/avatar", new TextEncoder().encode("isto não é imagem"))).status, 400);
  assert.equal((await ana.c.put("/avatar", new Uint8Array(90 * 1024).fill(0xff))).status, 413);
  const ok = await ana.c.put("/avatar", JPEG);
  assert.equal(ok.status, 200);
  const got = await beto.c.get(`/avatar/${ana.data.user.id}`);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get("content-type"), "image/jpeg");
  assert.ok((await row(beto.c, ana.data.user.id)).av > 0);
  assert.equal((await ana.c.del("/avatar")).status, 200);
  assert.equal((await beto.c.get(`/avatar/${ana.data.user.id}`)).status, 404);
  assert.equal((await row(beto.c, ana.data.user.id)).av, 0);
});

test("sem login não vê presença nem fotos; excluir a conta apaga foto e horas", async () => {
  const ctx = makeCtx();
  const admin = await register(ctx, "Victor Andrade");
  const ana = await register(ctx, "Ana Souza");
  await ana.c.put("/avatar", JPEG);
  await ana.c.post("/presence/work", { action: "start" });
  const { makeClient } = await import("./helpers.mjs");
  const anon = makeClient(ctx);
  assert.equal((await anon.get("/presence")).status, 401);
  assert.equal((await anon.get(`/avatar/${ana.data.user.id}`)).status, 401);
  assert.equal((await admin.c.del(`/users/${ana.data.user.id}`)).status, 200);
  assert.equal((await admin.c.get(`/avatar/${ana.data.user.id}`)).status, 404);
  assert.ok(!(await body(await admin.c.get("/presence"))).people.some((p) => p.id === ana.data.user.id));
});

test("cada pessoa troca o próprio nome; o login passa a usar o nome novo e não repete nomes", async () => {
  const ctx = makeCtx();
  const ana = await register(ctx, "Ana Souza");
  await register(ctx, "Beto Lima");
  assert.equal((await ana.c.post("/auth/name", { name: "Beto Lima" })).status, 409);
  const r = await ana.c.post("/auth/name", { name: "Ana Paula Souza" });
  assert.equal(r.status, 200);
  assert.equal((await body(r)).user.name, "Ana Paula Souza");
  const { makeClient } = await import("./helpers.mjs");
  const c2 = makeClient(ctx);
  assert.equal((await c2.post("/auth/login", { name: "Ana Paula Souza", password: "Av@2026" })).status, 200);
  const c3 = makeClient(ctx);
  assert.notEqual((await c3.post("/auth/login", { name: "Ana Souza", password: "Av@2026" })).status, 200);
  // o nome antigo fica livre
  assert.equal((await register(ctx, "Ana Souza")).res.status, 201);
});
