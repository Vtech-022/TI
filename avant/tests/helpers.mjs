import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handle } from "../netlify/functions/lib/app.mjs";
import { createMemoryStore, createNetlifyStore } from "../netlify/functions/lib/store.mjs";

// AVANT_TEST_STORE=blobs  -> roda tudo contra o cliente OFICIAL @netlify/blobs, falando com o
// servidor local de Blobs que acompanha o pacote (mesmo protocolo e mesmas condições If-Match).
export const STORE_KIND = process.env.AVANT_TEST_STORE === "blobs" ? "blobs" : "memory";
let blobsServer = null;
if (STORE_KIND === "blobs") {
  const { BlobsServer } = await import("@netlify/blobs/server");
  // O emulador local do pacote NÃO devolve ETag em GET/HEAD (o serviço real devolve) e não
  // serializa gravações. Este ajuste aproxima o emulador do serviço real: ETag = hash do
  // conteúdo, devolvido em GET/HEAD, e gravações da mesma chave em fila (compara-e-grava atômico).
  const { createHash } = await import("node:crypto");
  BlobsServer.generateETag = async (f) => {
    try { return `"${createHash("sha256").update(fs.readFileSync(f)).digest("hex")}"`; } catch { return ""; }
  };
  const withEtag = (orig, isGet) => async function (req) {
    const res = await orig.call(this, req);
    if (res.status !== 200) return res;
    let etag = "";
    let payload = null;
    if (isGet) {
      // ETag calculado sobre os MESMOS bytes devolvidos (evita corrida leitura x gravação)
      payload = Buffer.from(await res.arrayBuffer());
      etag = `"${createHash("sha256").update(payload).digest("hex")}"`;
    } else {
      const { dataPath } = this.getLocalPaths(new URL(req.url ?? "", this.address));
      etag = dataPath ? await BlobsServer.generateETag(dataPath) : "";
    }
    const h = new Headers(res.headers);
    if (etag) h.set("etag", etag);
    return new Response(payload, { status: 200, headers: h });
  };
  BlobsServer.prototype.get = withEtag(BlobsServer.prototype.get, true);
  BlobsServer.prototype.head = withEtag(BlobsServer.prototype.head, false);
  const locks = new Map();
  const origPut = BlobsServer.prototype.put;
  BlobsServer.prototype.put = async function (req) {
    const k = req.url;
    const prev = locks.get(k) ?? Promise.resolve();
    let release; const mine = new Promise((r) => { release = r; });
    locks.set(k, prev.then(() => mine));
    await prev;
    try { return await origPut.call(this, req); } finally { release(); if (locks.get(k) === undefined) locks.delete(k); }
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avant-blobs-"));
  blobsServer = new BlobsServer({ directory: dir, token: "teste", port: 0 });
  const addr = await blobsServer.start();
  globalThis.__blobsPort = addr.port;
  process.on("exit", () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
}
export const stopBlobs = () => blobsServer?.stop();

let seq = 0;
export function makeStore() {
  if (STORE_KIND === "memory") return createMemoryStore();
  return createNetlifyStore(`t${Date.now().toString(36)}${++seq}`, {
    siteID: "site-de-teste", token: "teste", edgeURL: `http://127.0.0.1:${globalThis.__blobsPort}`, uncachedEdgeURL: `http://127.0.0.1:${globalThis.__blobsPort}`,
    apiURL: `http://127.0.0.1:${globalThis.__blobsPort}`,
  });
}

/** Conteúdo completo do armazenamento (chave -> bytes), igual para qualquer implementação. */
export async function dump(ctx) {
  const out = new Map();
  for (const k of await ctx.store.list("")) out.set(k, (await ctx.store.get(k)).bytes);
  return out;
}

export function makeCtx(env = {}) {
  let t = 1_800_000_000_000;
  const ctx = { store: makeStore(), env, now: () => t };
  ctx.advance = (ms) => { t += ms; };
  return ctx;
}

/** Cliente de teste com "jar" de cookies, falando direto com o roteador. */
export function makeClient(ctx) {
  let cookie = "";
  async function call(method, path, body, headers = {}) {
    const h = { "x-avant": "1", ...headers };
    if (cookie) h.cookie = cookie;
    let payload;
    if (body instanceof Uint8Array) payload = body;
    else if (body !== undefined) { payload = JSON.stringify(body); h["content-type"] = "application/json"; }
    const res = await handle(new Request(`https://avant.test/api${path}`, { method, headers: h, body: payload }), ctx);
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.startsWith("avant_session=;") || /Max-Age=0/.test(set) ? "" : set.split(";")[0];
    return res;
  }
  const api = {
    call,
    get: (p, h) => call("GET", p, undefined, h),
    post: (p, b, h) => call("POST", p, b, h),
    put: (p, b, h) => call("PUT", p, b, h),
    patch: (p, b, h) => call("PATCH", p, b, h),
    del: (p) => call("DELETE", p),
    get cookie() { return cookie; },
    set cookie(v) { cookie = v; },
  };
  return api;
}

export async function body(res) {
  return res.headers.get("content-type")?.includes("json") ? res.json() : null;
}

export async function register(ctx, name, password = "Av@2026", extra = {}) {
  const c = makeClient(ctx);
  const res = await c.post("/auth/register", { name, password, ...extra });
  return { c, res, data: await body(res) };
}
