// Função da Netlify que atende /api/* com o banco compartilhado no Netlify Blobs.
import { getStore } from '@netlify/blobs';
import { BlobKV, createHandler } from '../../src/netlify/handler';

function kv(name: string): BlobKV {
  const store = () => getStore({ name, consistency: 'strong' });
  return {
    async get(key) {
      const r = await store().getWithMetadata(key, { type: 'arrayBuffer' });
      return r ? { bytes: new Uint8Array(r.data), etag: r.etag ?? '', metadata: (r.metadata ?? {}) as Record<string, unknown> } : null;
    },
    async etag(key) {
      return (await store().getMetadata(key))?.etag ?? null;
    },
    async put(key, bytes, opts = {}) {
      const data = new Blob([bytes as BlobPart]);
      const base = { metadata: opts.metadata };
      const r = opts.ifMatch
        ? await store().set(key, data, { ...base, onlyIfMatch: opts.ifMatch })
        : opts.ifNew
          ? await store().set(key, data, { ...base, onlyIfNew: true })
          : await store().set(key, data, base);
      return { modified: r.modified, etag: r.etag };
    }
  };
}

const handle = createHandler({ kv: kv('avant-dados'), files: kv('avant-arquivos'), accessCode: process.env.AVANT_ACCESS_CODE?.trim() || undefined });

export default (req: Request) => handle(req);

export const config = { path: '/api/*' };
