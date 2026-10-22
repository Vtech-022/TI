// Armazenamento de originais em disco (Node): o arquivo nunca é alterado nem excluído automaticamente.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DocumentRecord } from '../../shared/types';
import { AppError, Ctx } from '../context';
import { extensionOf, extractFileText } from '../importers';
import { findBySha, getDocumentRow, registerDocument, safeFilename } from './documents-core';
import { Meta } from './history';

export * from './documents-core';

export function uploadsDir(ctx: Ctx): string {
  return path.join(ctx.dataDir, 'uploads');
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
  const existing = findBySha(ctx, sha256);
  const extracted = await extractFileText(filename, file.buffer);
  const dir = uploadsDir(ctx);
  fs.mkdirSync(dir, { recursive: true });
  const storage = path.join(dir, `${sha256}${extensionOf(filename)}`);
  // Conteúdo idêntico reutiliza o mesmo arquivo físico; o original nunca é sobrescrito.
  if (!fs.existsSync(storage)) fs.writeFileSync(storage, file.buffer, { flag: 'wx' });
  const document = registerDocument(ctx, { filename, size: file.buffer.length, sha256, storage_path: path.relative(ctx.dataDir, storage) }, extracted, links, meta);
  return { document, duplicate_of: existing };
}

export function documentPath(ctx: Ctx, id: number): string {
  const row = getDocumentRow(ctx, id);
  const full = path.resolve(ctx.dataDir, row.storage_path);
  if (!full.startsWith(path.resolve(ctx.dataDir))) throw new AppError(400, 'caminho_invalido', 'Caminho de arquivo inválido.');
  if (!fs.existsSync(full)) throw new AppError(410, 'arquivo_ausente', 'O arquivo original não foi encontrado no armazenamento.');
  return full;
}
