// Arquivos e documentos: o original é armazenado sem alterações e nunca excluído automaticamente.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DocumentRecord } from '../../shared/types';
import { AppError, Ctx, notFound, nowIso } from '../context';
import { toDocument } from '../db/rows';
import { extensionOf, extractFileText } from '../importers';
import { Meta, record } from './history';

export function uploadsDir(ctx: Ctx): string {
  return path.join(ctx.dataDir, 'uploads');
}

export function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_').trim();
  return base.slice(0, 180) || 'arquivo';
}

export async function saveDocument(
  ctx: Ctx,
  file: { filename: string; buffer: Buffer },
  links: { project_id?: number | null; task_id?: number | null },
  meta: Meta
): Promise<{ document: DocumentRecord; duplicate_of: DocumentRecord | null }> {
  if (!file.buffer.length) throw new AppError(400, 'arquivo_vazio', 'O arquivo está vazio.');
  if (file.buffer.length > ctx.maxUploadBytes) throw new AppError(413, 'arquivo_grande', `O arquivo excede o limite de ${Math.round(ctx.maxUploadBytes / 1048576)} MB.`);
  const filename = safeFilename(file.filename);
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const existing = ctx.db.prepare('SELECT * FROM documents WHERE sha256 = ? ORDER BY id LIMIT 1').get(sha256) as any;
  const extracted = await extractFileText(filename, file.buffer);
  const dir = uploadsDir(ctx);
  fs.mkdirSync(dir, { recursive: true });
  const storage = path.join(dir, `${sha256}${extensionOf(filename)}`);
  // Conteúdo idêntico reutiliza o mesmo arquivo físico; o original nunca é sobrescrito.
  if (!fs.existsSync(storage)) fs.writeFileSync(storage, file.buffer, { flag: 'wx' });
  const id = Number(
    ctx.db
      .prepare(
        'INSERT INTO documents (filename, mime, size, sha256, storage_path, extracted_text, parse_status, parse_error, project_id, task_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
      )
      .run(filename, extracted.mime, file.buffer.length, sha256, path.relative(ctx.dataDir, storage), extracted.text, extracted.status, extracted.error, links.project_id ?? null, links.task_id ?? null, nowIso(ctx))
      .lastInsertRowid
  );
  const row = ctx.db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
  record(ctx, { entity_type: 'document', entity_id: id, operation: 'importado', summary: `Arquivo importado: ${filename} (${extracted.status})`, before: null, after: row }, meta);
  return { document: toDocument(row), duplicate_of: existing ? toDocument(existing) : null };
}

export function listDocuments(ctx: Ctx): DocumentRecord[] {
  return (ctx.db.prepare('SELECT * FROM documents ORDER BY id DESC').all() as any[]).map(toDocument);
}

export function getDocumentRow(ctx: Ctx, id: number): any {
  const row = ctx.db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!row) throw notFound('Documento');
  return row;
}

export function documentText(ctx: Ctx, id: number): string | null {
  return getDocumentRow(ctx, id).extracted_text ?? null;
}

export function documentPath(ctx: Ctx, id: number): string {
  const row = getDocumentRow(ctx, id);
  const full = path.resolve(ctx.dataDir, row.storage_path);
  if (!full.startsWith(path.resolve(ctx.dataDir))) throw new AppError(400, 'caminho_invalido', 'Caminho de arquivo inválido.');
  if (!fs.existsSync(full)) throw new AppError(410, 'arquivo_ausente', 'O arquivo original não foi encontrado no armazenamento.');
  return full;
}

export function updateDocumentLinks(ctx: Ctx, id: number, links: { project_id?: number | null; task_id?: number | null }, meta: Meta): DocumentRecord {
  const before = getDocumentRow(ctx, id);
  if (links.project_id != null && !ctx.db.prepare('SELECT 1 FROM projects WHERE id = ?').get(links.project_id)) throw notFound('Projeto');
  if (links.task_id != null && !ctx.db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(links.task_id)) throw notFound('Tarefa');
  ctx.db
    .prepare('UPDATE documents SET project_id = ?, task_id = ? WHERE id = ?')
    .run(links.project_id === undefined ? before.project_id : links.project_id, links.task_id === undefined ? before.task_id : links.task_id, id);
  const after = ctx.db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
  record(ctx, { entity_type: 'document', entity_id: id, operation: 'vinculado', summary: `Vínculos do arquivo atualizados: ${before.filename}`, before, after }, meta);
  return toDocument(after);
}

/** Remove o registro do AVANT. O arquivo físico é mantido em data/uploads para preservar o original. */
export function removeDocument(ctx: Ctx, id: number, meta: Meta): void {
  const before = getDocumentRow(ctx, id);
  ctx.db.prepare('UPDATE captures SET document_id = NULL WHERE document_id = ?').run(id);
  ctx.db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  record(ctx, { entity_type: 'document', entity_id: id, operation: 'removido', summary: `Arquivo removido do AVANT (original mantido no armazenamento): ${before.filename}`, before, after: null }, meta);
}
