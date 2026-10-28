// Camada de armazenamento do AVANT.
//
// Em produção usa o Netlify Blobs (consistência forte, escrita condicional por ETag).
// Nos testes usa um armazenamento em memória com a MESMA semântica de escrita
// condicional (onlyIfNew / onlyIfMatch), para exercitar a lógica de concorrência.

import { getStore } from "@netlify/blobs";

const enc = new TextEncoder();
const dec = new TextDecoder();

function toBytes(body) {
  if (typeof body === "string") return enc.encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  throw new TypeError("Conteúdo inválido para gravação.");
}

/** Armazenamento em memória (testes e desenvolvimento sem rede). */
export function createMemoryStore() {
  const map = new Map(); // key -> { bytes, etag, metadata }
  let counter = 0;
  const nextEtag = () => `"m${++counter}-${Math.random().toString(36).slice(2, 8)}"`;

  return {
    kind: "memory",
    async get(key) {
      const e = map.get(key);
      if (!e) return null;
      return { bytes: new Uint8Array(e.bytes), etag: e.etag, metadata: { ...e.metadata } };
    },
    async getMeta(key) {
      const e = map.get(key);
      return e ? { etag: e.etag, metadata: { ...e.metadata } } : null;
    },
    async put(key, body, opts = {}) {
      const cur = map.get(key);
      if (opts.ifNew && cur) return { modified: false };
      if (opts.ifMatch !== undefined && (!cur || cur.etag !== opts.ifMatch)) return { modified: false };
      // cede o turno para que escritas concorrentes de verdade se intercalem nos testes
      await Promise.resolve();
      const again = map.get(key);
      if (opts.ifNew && again) return { modified: false };
      if (opts.ifMatch !== undefined && (!again || again.etag !== opts.ifMatch)) return { modified: false };
      const etag = nextEtag();
      map.set(key, { bytes: new Uint8Array(toBytes(body)), etag, metadata: { ...(opts.metadata ?? {}) } });
      return { modified: true, etag };
    },
    async del(key) {
      map.delete(key);
    },
    async list(prefix = "") {
      return [...map.keys()].filter((k) => k.startsWith(prefix));
    },
    _dump: () => map,
  };
}

// Sem ETag a gravação condicional viraria incondicional (perda silenciosa de dados): falha fechado.
function needEtag(etag, key) {
  if (!etag) throw new Error(`Armazenamento sem ETag para "${key}"; gravação segura impossível.`);
}

/** Armazenamento real: Netlify Blobs. */
export function createNetlifyStore(name = "avant", options = {}) {
  const store = getStore({ name, consistency: "strong", ...options });
  return {
    kind: "netlify",
    async get(key) {
      const r = await store.getWithMetadata(key, { type: "arrayBuffer" });
      if (!r) return null;
      needEtag(r.etag, key);
      return { bytes: new Uint8Array(r.data), etag: r.etag, metadata: r.metadata ?? {} };
    },
    async getMeta(key) {
      const r = await store.getMetadata(key);
      if (r) needEtag(r.etag, key);
      return r ? { etag: r.etag, metadata: r.metadata ?? {} } : null;
    },
    async put(key, body, opts = {}) {
      const o = { metadata: opts.metadata ?? {} };
      if (opts.ifNew) o.onlyIfNew = true;
      else if (opts.ifMatch !== undefined) o.onlyIfMatch = opts.ifMatch;
      const bytes = toBytes(body);
      // O Blobs aceita ArrayBuffer; copiamos para não depender do buffer compartilhado.
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const r = await store.set(key, ab, o);
      return { modified: r?.modified !== false, etag: r?.etag };
    },
    async del(key) {
      await store.delete(key);
    },
    async list(prefix = "") {
      const out = [];
      for await (const page of store.list({ prefix, paginate: true })) {
        for (const b of page.blobs) out.push(b.key);
      }
      return out;
    },
  };
}

// ---- Ajudantes de alto nível (JSON, atualização otimista com repetição) ----

export async function getJSON(store, key) {
  const r = await store.get(key);
  if (!r) return null;
  return { value: JSON.parse(dec.decode(r.bytes)), etag: r.etag, metadata: r.metadata };
}

export async function putJSON(store, key, value, opts = {}) {
  return store.put(key, JSON.stringify(value), opts);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Atualização otimista: lê, aplica `fn(valorAtual | null)` e grava somente se ninguém
 * alterou o registro nesse meio tempo. Se alguém alterou, refaz a operação sobre a
 * versão mais nova. `fn` pode devolver `undefined` para cancelar (nada é gravado).
 */
export async function updateJSON(store, key, fn, { retries = 25, metadata } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const cur = await getJSON(store, key);
    const next = await fn(cur ? structuredClone(cur.value) : null);
    if (next === undefined) return { cancelled: true, value: cur?.value ?? null };
    if (cur && !cur.etag) throw new Error("Leitura sem ETag; gravação cancelada por segurança.");
    const res = await putJSON(store, key, next, {
      metadata,
      ...(cur ? { ifMatch: cur.etag } : { ifNew: true }),
    });
    if (res.modified) return { value: next, etag: res.etag };
    await sleep(Math.min(400, 8 + Math.random() * 25 * (attempt + 1)));
  }
  const err = new Error("O sistema está muito ocupado. Tente novamente em instantes.");
  err.status = 503;
  err.code = "ocupado";
  throw err;
}
