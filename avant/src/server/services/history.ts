// Histórico de alterações e desfazer.
import type { HistoryEntry } from '../../shared/types';
import { AppError, Ctx, nowIso, notFound } from '../context';
import { transaction } from '../db/tx';
import { toColumns, toHistory } from '../db/rows';

export type EntityType = HistoryEntry['entity_type'];

const TABLES: Record<string, string> = {
  task: 'tasks',
  project: 'projects',
  event: 'events',
  wait: 'waits',
  link: 'task_links',
  document: 'documents',
  milestone: 'milestones'
};

export interface Meta {
  source: string;
  capture_id?: number | null;
}

export function record(
  ctx: Ctx,
  entry: { entity_type: EntityType; entity_id: number; operation: string; summary: string; before?: unknown; after?: unknown },
  meta: Meta
): void {
  ctx.db
    .prepare('INSERT INTO history (entity_type, entity_id, operation, summary, before, after, source, capture_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(
      entry.entity_type,
      entry.entity_id,
      entry.operation,
      entry.summary,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      meta.source,
      meta.capture_id ?? null,
      nowIso(ctx)
    );
}

export interface HistoryQuery {
  entity_type?: string;
  entity_id?: number;
  capture_id?: number;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export function listHistory(ctx: Ctx, q: HistoryQuery = {}): HistoryEntry[] {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (q.entity_type) where.push('entity_type = ?') && args.push(q.entity_type);
  if (q.entity_id) where.push('entity_id = ?') && args.push(q.entity_id);
  if (q.capture_id) where.push('capture_id = ?') && args.push(q.capture_id);
  if (q.from) where.push('created_at >= ?') && args.push(q.from);
  if (q.to) where.push('created_at <= ?') && args.push(q.to);
  if (q.q) where.push('(summary LIKE ? OR operation LIKE ?)') && args.push(`%${q.q}%`, `%${q.q}%`);
  const sql = `SELECT * FROM history ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
  args.push(Math.min(q.limit ?? 200, 1000));
  return (ctx.db.prepare(sql).all(...args) as any[]).map(toHistory);
}

function currentRow(ctx: Ctx, table: string, id: number): Record<string, any> | undefined {
  return ctx.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as any;
}

function sameAs(row: Record<string, any> | undefined, snapshot: Record<string, any> | null): boolean {
  if (!row || !snapshot) return !row && !snapshot;
  const cols = toColumns(snapshot);
  return Object.keys(cols).every((k) => k === 'updated_at' || k === 'priority' || k === 'priority_score' || k === 'priority_reasons' || String(row[k] ?? '') === String(cols[k] ?? ''));
}

/** Reverte uma entrada do histórico, se o registro não tiver sido alterado depois dela. */
export function undoEntry(ctx: Ctx, id: number): HistoryEntry {
  const entry = ctx.db.prepare('SELECT * FROM history WHERE id = ?').get(id) as any;
  if (!entry) throw notFound('Registro de histórico');
  const h = toHistory(entry);
  if (h.undone) throw new AppError(409, 'ja_desfeito', 'Esta alteração já foi desfeita.');
  const table = TABLES[h.entity_type];
  if (!table) throw new AppError(400, 'nao_reversivel', 'Este tipo de alteração não pode ser desfeito.');
  const later = ctx.db
    .prepare("SELECT COUNT(*) n FROM history WHERE entity_type = ? AND entity_id = ? AND id > ? AND undone = 0 AND operation NOT IN ('prioridade_recalculada', 'desfeito')")
    .get(h.entity_type, h.entity_id, h.id) as { n: number };
  if (later.n > 0) {
    throw new AppError(409, 'alterado_depois', 'O registro foi alterado depois desta operação. Desfaça primeiro as alterações mais recentes.');
  }
  const before = h.before as Record<string, any> | null;
  const after = h.after as Record<string, any> | null;
  const row = currentRow(ctx, table, h.entity_id);
  if (after && !sameAs(row, after)) {
    throw new AppError(409, 'alterado_depois', 'O registro atual não corresponde ao estado registrado; a reversão foi bloqueada para evitar perda de dados.');
  }
  transaction(ctx.db, () => {
    if (!before) {
      ctx.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(h.entity_id);
    } else if (!row) {
      const cols = toColumns(before);
      const keys = Object.keys(cols);
      ctx.db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => cols[k]));
    } else {
      const cols = toColumns(before);
      const keys = Object.keys(cols).filter((k) => k !== 'id');
      ctx.db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => cols[k]), h.entity_id);
    }
    ctx.db.prepare('UPDATE history SET undone = 1 WHERE id = ?').run(h.id);
    record(ctx, { entity_type: h.entity_type, entity_id: h.entity_id, operation: 'desfeito', summary: `Desfeito: ${h.summary}` }, { source: 'usuario' });
  });
  return { ...h, undone: true };
}

/** Desfaz todas as alterações de uma captura, da mais recente para a mais antiga. */
export function undoCapture(ctx: Ctx, captureId: number): { undone: number } {
  const entries = ctx.db
    .prepare("SELECT id FROM history WHERE capture_id = ? AND undone = 0 AND operation <> 'desfeito' ORDER BY id DESC")
    .all(captureId) as { id: number }[];
  if (!entries.length) throw new AppError(409, 'nada_a_desfazer', 'Não há alterações desta captura para desfazer.');
  let n = 0;
  transaction(ctx.db, () => {
    for (const e of entries) {
      const h = ctx.db.prepare('SELECT * FROM history WHERE id = ?').get(e.id) as any;
      if (h.operation === 'prioridade_recalculada') {
        ctx.db.prepare('UPDATE history SET undone = 1 WHERE id = ?').run(e.id);
        continue;
      }
      undoEntry(ctx, e.id);
      n++;
    }
    ctx.db.prepare("UPDATE confirmations SET status = 'descartada', resolved_at = ? WHERE capture_id = ? AND status = 'pendente'").run(nowIso(ctx), captureId);
  });
  return { undone: n };
}
