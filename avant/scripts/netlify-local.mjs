// Simula a Netlify localmente: arquivos de dist/netlify + função /api/* com um armazenamento em
// pasta que segue as mesmas regras de gravação condicional do Netlify Blobs.
// Uso: npm run build:netlify && npm run netlify:local   (variáveis: PORT, AVANT_LOCAL_DIR, AVANT_ACCESS_CODE)
import { build } from 'esbuild';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT ?? 8888);
const DATA = path.resolve(process.env.AVANT_LOCAL_DIR ?? 'data/netlify-local');
const STATIC = path.resolve('dist/netlify');
const OUT = path.resolve('dist/netlify-local/handler.mjs');

await build({ entryPoints: ['src/netlify/handler.ts'], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: OUT, logLevel: 'warning' });
const { createHandler } = await import(pathToFileURL(OUT).href);

function kv(name) {
  const dir = path.join(DATA, name);
  const file = (key) => path.join(dir, encodeURIComponent(key));
  const tag = (bytes) => crypto.createHash('sha1').update(bytes).digest('hex');
  return {
    async get(key) {
      if (!fs.existsSync(file(key))) return null;
      const bytes = new Uint8Array(fs.readFileSync(file(key)));
      const metaFile = file(key) + '.meta';
      return { bytes, etag: tag(bytes), metadata: fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {} };
    },
    async etag(key) {
      return fs.existsSync(file(key)) ? tag(fs.readFileSync(file(key))) : null;
    },
    async put(key, bytes, opts = {}) {
      fs.mkdirSync(dir, { recursive: true });
      // Trava entre processos: a verificação e a gravação acontecem juntas, como no serviço real.
      const lock = file(key) + '.lock';
      for (let i = 0; ; i++) {
        try {
          fs.mkdirSync(lock);
          break;
        } catch {
          if (i > 500) throw new Error('trava presa: ' + lock);
          await new Promise((r) => setTimeout(r, 5));
        }
      }
      try {
        return write(key, bytes, opts);
      } finally {
        fs.rmdirSync(lock);
      }
    }
  };
  function write(key, bytes, opts) {
    {
      const exists = fs.existsSync(file(key));
      if (opts.ifNew && exists) return { modified: false };
      if (opts.ifMatch && (!exists || tag(fs.readFileSync(file(key))) !== opts.ifMatch)) return { modified: false };
      fs.writeFileSync(file(key), bytes);
      if (opts.metadata) fs.writeFileSync(file(key) + '.meta', JSON.stringify(opts.metadata));
      return { modified: true, etag: tag(bytes) };
    }
  }
}

const handle = createHandler({ kv: kv('avant-dados'), files: kv('avant-arquivos'), accessCode: process.env.AVANT_ACCESS_CODE || undefined });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.png': 'image/png' };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let f = path.join(STATIC, decodeURIComponent(url.pathname));
    if (!f.startsWith(STATIC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(STATIC, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  })
  .listen(PORT, () => console.log(`AVANT (simulação Netlify) em http://localhost:${PORT}`));
