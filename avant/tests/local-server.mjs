// Servidor local para testes/ensaios: serve public/ e a API (/api/*) com armazenamento em memória.
// Uso:  node tests/local-server.mjs [porta]
// (Em produção quem faz isso é o Netlify; este arquivo só serve para testar sem internet.)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handle } from "../netlify/functions/lib/app.mjs";
import { createMemoryStore } from "../netlify/functions/lib/store.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

export function startServer(port = 0, env = {}) {
  const ctx = { store: createMemoryStore(), env, now: () => Date.now() };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith("/api/")) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body }), ctx);
        const headers = {};
        r.headers.forEach((v, k) => { headers[k] = v; });
        res.writeHead(r.status, headers);
        res.end(Buffer.from(await r.arrayBuffer()));
        return;
      }
      let file = path.join(root, url.pathname === "/" ? "index.html" : url.pathname);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      res.writeHead(500); res.end(String(e));
    }
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, ctx, port: server.address().port })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { port } = await startServer(Number(process.argv[2] ?? 8888));
  console.log(`AVANT local em http://127.0.0.1:${port}`);
}
