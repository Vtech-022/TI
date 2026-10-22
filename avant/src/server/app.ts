// Servidor HTTP do AVANT (Node + Fastify).
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { FastifyInstance, FastifyReply } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AppError, Ctx } from './context';
import { errorResponse, registerRoutes } from './routes';
import { processCapture } from './services/captures';
import { documentPath, documentText, getDocumentRow, saveDocument } from './services/documents';
import { Meta } from './services/history';

const USER: Meta = { source: 'usuario' };
const id = z.coerce.number().int().positive();
const parse = <T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> => schema.parse(data ?? {});

export interface AppOptions {
  ctx: Ctx;
  staticDir?: string;
  logger?: boolean;
}

export async function buildApp({ ctx, staticDir, logger = false }: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger, bodyLimit: 2 * 1024 * 1024 });
  await app.register(multipart, { limits: { fileSize: ctx.maxUploadBytes, files: 10 } });

  app.setErrorHandler((err: any, _req, reply) => {
    const r = errorResponse(err, ctx.maxUploadBytes);
    if (r.log) app.log.error(err);
    return reply.status(r.status).send(r.body);
  });

  const P = (req: { params: unknown }) => req.params as Record<string, string>;
  registerRoutes(app, ctx);

  app.post('/api/documents', async (req, reply) => {
    if (!req.isMultipart()) throw new AppError(400, 'multipart', 'Envie os arquivos como multipart/form-data.');
    const fields: Record<string, string> = {};
    const files: { filename: string; buffer: Buffer }[] = [];
    for await (const part of req.parts()) {
      if (part.type === 'file') files.push({ filename: part.filename, buffer: await part.toBuffer() });
      else fields[part.fieldname] = String(part.value);
    }
    if (!files.length) throw new AppError(400, 'sem_arquivo', 'Nenhum arquivo recebido.');
    const links = {
      project_id: fields.project_id ? parse(id, fields.project_id) : null,
      task_id: fields.task_id ? parse(id, fields.task_id) : null
    };
    const results = [];
    for (const f of files) {
      const saved = await saveDocument(ctx, f, links, USER);
      let capture = null;
      if (fields.capture === '1' && saved.document.parse_status === 'ok') {
        capture = processCapture(ctx, { text: documentText(ctx, saved.document.id)!, source_type: 'arquivo', document_id: saved.document.id, dry_run: fields.dry_run === '1' });
        if (capture.capture_id) ctx.db.prepare('UPDATE documents SET capture_id = ? WHERE id = ?').run(capture.capture_id, saved.document.id);
      }
      results.push({ ...saved, capture });
    }
    return reply.status(201).send(results);
  });
  app.get('/api/documents/:id/file', async (req, reply: FastifyReply) => {
    const did = parse(id, P(req).id);
    const row = getDocumentRow(ctx, did);
    const file = documentPath(ctx, did);
    reply.header('Content-Type', row.mime);
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
    reply.header('X-Content-Type-Options', 'nosniff');
    return reply.send(fs.createReadStream(file));
  });

  if (staticDir && fs.existsSync(staticDir)) {
    await app.register(fastifyStatic, { root: path.resolve(staticDir), wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'nao_encontrado', message: 'Rota não encontrada.' });
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: 'nao_encontrado', message: 'Rota não encontrada.' }));
  }

  return app;
}
