// Registro de documentos no banco (independente de onde o arquivo original é guardado).
import type { DocumentRecord } from '../../shared/types';
import { Ctx, notFound, nowIso } from '../context';
import { toDocument } from '../db/rows';
import type { ExtractedFile } from '../importers/core';
import { Meta, record } from './history';

export function safeFilename(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_').trim();
  return base.slice(0, 180) || 'arquivo';
}

export function findBySha(ctx: Ctx, sha256: string): DocumentRecord | null {
  const row = ctx.db.prepare('SELECT * FROM documents WHERE sha256 = ? ORDER BY id LIMIT 1').get(sha256) as any;
  return row ? toDocument(row) : null;
}

export function registerDocument(
  ctx: Ctx,
  file: { filename: string; size: number; sha256: string; storage_path: string },
  extracted: ExtractedFile,
  links: { project_id?: number | null; task_id?: number | null },
  meta: Meta
): DocumentRecord {
  const id = Number(
    ctx.db
      .prepare(
        'INSERT INTO documents (filename, mime, size, sha256, storage_path, extracted_text, parse_status, parse_error, project_id, task_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
      )
      .run(file.filename, extracted.mime, file.size, file.sha256, file.storage_path, extracted.text, extracted.status, extracted.error, links.project_id ?? null, links.task_id ?? null, nowIso(ctx))
      .lastInsertRowid
  );
  const row = ctx.db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
  record(ctx, { entity_type: 'document', entity_id: id, operation: 'importado', summary: `Arquivo importado: ${file.filename} (${extracted.status})`, before: null, after: row }, meta);
  return toDocument(row);
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

/** Remove o registro do AVANT. O arquivo original é mantido no armazenamento. */
export function removeDocument(ctx: Ctx, id: number, meta: Meta): void {
  const before = getDocumentRow(ctx, id);
  ctx.db.prepare('UPDATE captures SET document_id = NULL WHERE document_id = ?').run(id);
  ctx.db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  record(ctx, { entity_type: 'document', entity_id: id, operation: 'removido', summary: `Arquivo removido do AVANT (original mantido no armazenamento): ${before.filename}`, before, after: null }, meta);
}
