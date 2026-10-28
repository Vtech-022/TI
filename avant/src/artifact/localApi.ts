// A API do AVANT executada dentro do navegador: mesmas rotas e regras do servidor Node.
import { z } from 'zod';
import type { Ctx } from '../server/context';
import { AppError } from '../server/context';
import { LocalRouter } from '../server/miniRouter';
import { errorResponse, registerRoutes } from '../server/routes';
import { processCapture } from '../server/services/captures';
import { documentText, findBySha, getDocumentRow, registerDocument, safeFilename } from '../server/services/documents-core';
import { extractFileText } from './importers';
import { idbGet, idbSet } from './persist';

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function createLocalApi(ctx: Ctx, onMutation: () => void) {
  const router = new LocalRouter();
  registerRoutes(router, ctx);
  const USER = { source: 'usuario' };
  const id = z.coerce.number().int().positive();

  // Upload: o original fica guardado neste navegador (IndexedDB); o texto extraído vai para o banco.
  router.post('/api/documents', async (req, reply) => {
    const form = req.body as FormData;
    if (!(form instanceof FormData)) throw new AppError(400, 'multipart', 'Envie os arquivos como formulário.');
    const files = form.getAll('file').filter((f): f is File => f instanceof File);
    if (!files.length) throw new AppError(400, 'sem_arquivo', 'Nenhum arquivo recebido.');
    const links = {
      project_id: form.get('project_id') ? id.parse(form.get('project_id')) : null,
      task_id: form.get('task_id') ? id.parse(form.get('task_id')) : null
    };
    const results = [];
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (!bytes.length) throw new AppError(400, 'arquivo_vazio', 'O arquivo está vazio.');
      if (bytes.length > ctx.maxUploadBytes) throw new AppError(413, 'arquivo_grande', `O arquivo excede o limite de ${Math.round(ctx.maxUploadBytes / 1048576)} MB.`);
      const filename = safeFilename(f.name);
      const hash = await sha256(bytes);
      const existing = findBySha(ctx, hash);
      const extracted = await extractFileText(filename, bytes);
      const stored = (await idbGet(`file:${hash}`)) ? true : await idbSet(`file:${hash}`, { filename, type: f.type, bytes });
      const document = registerDocument(ctx, { filename, size: bytes.length, sha256: hash, storage_path: stored ? `navegador:${hash}` : 'indisponivel' }, extracted, links, USER);
      let capture = null;
      if (form.get('capture') === '1' && document.parse_status === 'ok') {
        capture = processCapture(ctx, { text: documentText(ctx, document.id)!, source_type: 'arquivo', document_id: document.id, dry_run: form.get('dry_run') === '1' });
        if (capture.capture_id) ctx.db.prepare('UPDATE documents SET capture_id = ? WHERE id = ?').run(capture.capture_id, document.id);
      }
      results.push({ document, duplicate_of: existing, capture });
    }
    return reply.status(201).send(results);
  });

  router.get('/api/documents/:id/file', async (req) => {
    const row = getDocumentRow(ctx, id.parse(req.params.id));
    const file = await idbGet<{ filename: string; type: string; bytes: Uint8Array }>(`file:${row.sha256}`);
    if (!file) throw new AppError(410, 'arquivo_ausente', 'O arquivo original foi importado em outro navegador ou dispositivo e não está disponível aqui. O texto extraído continua no AVANT.');
    return { filename: row.filename, mime: row.mime, bytes: file.bytes };
  });

  return async function dispatch(method: string, url: string, body?: unknown): Promise<{ status: number; data: unknown }> {
    const u = new URL(url, 'http://avant.local');
    const m = router.match(method, u.pathname);
    if (!m) return { status: 404, data: { error: 'nao_encontrado', message: 'Rota não encontrada.' } };
    const query = Object.fromEntries(u.searchParams.entries());
    let status = 200;
    let sent: unknown = undefined;
    let didSend = false;
    const reply = {
      status(c: number) {
        status = c;
        return reply;
      },
      header() {
        return reply;
      },
      send(p: unknown) {
        sent = p;
        didSend = true;
        return p;
      }
    };
    try {
      const result = await m.route.handler({ params: m.params, query, body: body instanceof FormData ? body : body === undefined ? {} : JSON.parse(JSON.stringify(body)) }, reply);
      if (method !== 'GET' || u.pathname.endsWith('/undo')) onMutation();
      // Cópia profunda: as telas nunca recebem objetos ligados ao estado interno.
      const data = didSend ? sent : result;
      return { status, data: data instanceof Object && 'bytes' in (data as object) ? data : JSON.parse(JSON.stringify(data ?? null)) };
    } catch (err) {
      const r = errorResponse(err, ctx.maxUploadBytes);
      if (r.log) console.error(err);
      return { status: r.status, data: r.body };
    }
  };
}
