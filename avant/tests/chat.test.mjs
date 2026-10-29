import { test, after } from "node:test";
import assert from "node:assert/strict";
import { makeCtx, body, register, stopBlobs } from "./helpers.mjs";

after(() => stopBlobs());

test("conversa entre duas pessoas: envio, leitura, não lidas e privacidade", async () => {
  const ctx = makeCtx();
  const ana = await register(ctx, "Ana Souza");
  const beto = await register(ctx, "Beto Lima");
  const cris = await register(ctx, "Cris Dias");
  const A = ana.data.user.id, B = beto.data.user.id, C = cris.data.user.id;
  assert.equal((await ana.c.post(`/chat/${B}`, { text: "Oi, Beto!" })).status, 201);
  ctx.advance(1000);
  await ana.c.post(`/chat/${B}`, { text: "Viu a revista?" });
  let s = await body(await beto.c.get("/chat"));
  assert.equal(s.peers[A].unread, 2);
  const t = await body(await beto.c.get(`/chat/${A}?read=1`));
  assert.deepEqual(t.msgs.map((m) => m.text), ["Oi, Beto!", "Viu a revista?"]);
  s = await body(await beto.c.get("/chat"));
  assert.equal(s.peers[A].unread, 0);
  // Cris não enxerga a conversa dos dois
  const c = await body(await cris.c.get(`/chat/${A}`));
  assert.deepEqual(c.msgs, []);
  assert.equal((await ana.c.post(`/chat/${A}`, { text: "eu mesma" })).status, 400);
  assert.equal((await ana.c.post(`/chat/${B}`, { text: "  " })).status, 400);
  const novas = await body(await ana.c.get(`/chat/${B}?after=${t.msgs[0].at}`));
  assert.equal(novas.msgs.length, 1);
  assert.ok(C);
});

test("arquivos grandes em pedaços: envia, baixa inteiro e só os dois acessam", async () => {
  const ctx = makeCtx();
  const ana = await register(ctx, "Ana Souza");
  const beto = await register(ctx, "Beto Lima");
  const cris = await register(ctx, "Cris Dias");
  const B = beto.data.user.id;
  const p1 = new Uint8Array(4 * 1024 * 1024).fill(1);
  const p2 = new Uint8Array(1500).fill(2);
  const st = await body(await ana.c.post("/chat/upload", { peer: B, name: "Relatório final.xlsx", type: "application/vnd.ms-excel", size: p1.length + p2.length, chunks: 2 }));
  // mensagem antes de terminar o envio é recusada
  assert.equal((await ana.c.post(`/chat/${B}`, { file: { id: st.id } })).status, 400);
  assert.equal((await ana.c.put(`/chat/upload/${st.id}/0`, p1)).status, 200);
  assert.equal((await ana.c.put(`/chat/upload/${st.id}/1`, p2)).status, 200);
  const sent = await ana.c.post(`/chat/${B}`, { text: "segue", file: { id: st.id } });
  assert.equal(sent.status, 201);
  const f = await beto.c.get(`/chat/file/${st.id}?download=1`);
  assert.equal(f.status, 200);
  const buf = new Uint8Array(await f.arrayBuffer());
  assert.equal(buf.length, p1.length + p2.length);
  assert.equal(buf[0], 1); assert.equal(buf[buf.length - 1], 2);
  assert.match(f.headers.get("content-disposition"), /attachment/);
  assert.equal((await cris.c.get(`/chat/file/${st.id}`)).status, 404);
  const th = await body(await beto.c.get(`/chat/${ana.data.user.id}`));
  assert.equal(th.msgs[0].file.name, "Relatório final.xlsx");
});

test("editar e apagar só as próprias mensagens (apagar também remove o arquivo)", async () => {
  const ctx = makeCtx();
  const ana = await register(ctx, "Ana Souza");
  const beto = await register(ctx, "Beto Lima");
  const A = ana.data.user.id, B = beto.data.user.id;
  const m1 = (await body(await ana.c.post(`/chat/${B}`, { text: "erro de digitaçao" }))).msg;
  const ed = await ana.c.patch(`/chat/${B}/${m1.id}`, { text: "erro de digitação" });
  assert.equal(ed.status, 200);
  assert.equal((await body(await beto.c.get(`/chat/${A}`))).msgs[0].text, "erro de digitação");
  assert.ok((await body(await beto.c.get(`/chat/${A}`))).msgs[0].edited);
  assert.equal((await beto.c.patch(`/chat/${A}/${m1.id}`, { text: "invadido" })).status, 404);
  assert.equal((await beto.c.del(`/chat/${A}/${m1.id}`)).status, 404);
  const st = await body(await ana.c.post("/chat/upload", { peer: B, name: "a.txt", type: "text/plain", size: 3, chunks: 1 }));
  await ana.c.put(`/chat/upload/${st.id}/0`, new Uint8Array([1, 2, 3]));
  await ana.c.post(`/chat/${B}`, { file: { id: st.id } });
  assert.equal((await ana.c.del(`/chat/${B}/${m1.id}`)).status, 200);
  const th = await body(await beto.c.get(`/chat/${A}`));
  assert.equal(th.msgs.length, 1);
  assert.equal((await ana.c.del(`/chat/${B}/${th.msgs[0].id}`)).status, 200);
  assert.equal((await beto.c.get(`/chat/file/${st.id}`)).status, 404);
  assert.deepEqual((await body(await beto.c.get(`/chat/${A}`))).msgs, []);
});
