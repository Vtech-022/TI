// Pendências que dependem de terceiros.
import type { Wait } from '../../shared/types';
import { Ctx, notFound, nowIso } from '../context';
import { toColumns, toWait } from '../db/rows';
import { Meta, record } from './history';

export interface WaitInput {
  task_id?: number | null;
  project_id?: number | null;
  party: string;
  description: string;
  requested_at?: string | null;
  expected_at?: string | null;
  follow_up_at?: string | null;
  status?: Wait['status'];
  certainty?: Wait['certainty'];
  note?: string | null;
}

export function listWaits(ctx: Ctx): Wait[] {
  return (ctx.db.prepare('SELECT * FROM waits ORDER BY status, follow_up_at IS NULL, follow_up_at, id').all() as any[]).map(toWait);
}

export function getWait(ctx: Ctx, id: number): Wait {
  const row = ctx.db.prepare('SELECT * FROM waits WHERE id = ?').get(id);
  if (!row) throw notFound('Pendência de terceiro');
  return toWait(row as any);
}

export function createWait(ctx: Ctx, input: WaitInput, meta: Meta): Wait {
  if (input.task_id != null && !ctx.db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(input.task_id)) throw notFound('Tarefa');
  const ts = nowIso(ctx);
  const cols = toColumns({
    task_id: input.task_id ?? null,
    project_id: input.project_id ?? null,
    party: input.party.trim(),
    description: input.description.trim(),
    requested_at: input.requested_at ?? null,
    expected_at: input.expected_at ?? null,
    follow_up_at: input.follow_up_at ?? null,
    status: input.status ?? 'aguardando',
    certainty: input.certainty ?? 'explicita',
    note: input.note ?? null,
    created_at: ts,
    updated_at: ts
  });
  const keys = Object.keys(cols);
  const id = Number(ctx.db.prepare(`INSERT INTO waits (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => cols[k])).lastInsertRowid);
  const row = ctx.db.prepare('SELECT * FROM waits WHERE id = ?').get(id);
  record(ctx, { entity_type: 'wait', entity_id: id, operation: 'criada', summary: `Aguardando ${input.party}: ${input.description}`, before: null, after: row }, meta);
  return toWait(row as any);
}

export function updateWait(ctx: Ctx, id: number, patch: Partial<WaitInput>, meta: Meta): Wait {
  const before = ctx.db.prepare('SELECT * FROM waits WHERE id = ?').get(id) as any;
  if (!before) throw notFound('Pendência de terceiro');
  const cols = toColumns({ ...patch, updated_at: nowIso(ctx) });
  const keys = Object.keys(cols);
  ctx.db.prepare(`UPDATE waits SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => cols[k]), id);
  const after = ctx.db.prepare('SELECT * FROM waits WHERE id = ?').get(id);
  record(ctx, { entity_type: 'wait', entity_id: id, operation: 'atualizada', summary: `Espera atualizada (${before.party}): ${before.description}`, before, after }, meta);
  return toWait(after as any);
}

export function deleteWait(ctx: Ctx, id: number, meta: Meta): void {
  const before = ctx.db.prepare('SELECT * FROM waits WHERE id = ?').get(id) as any;
  if (!before) throw notFound('Pendência de terceiro');
  ctx.db.prepare('DELETE FROM waits WHERE id = ?').run(id);
  record(ctx, { entity_type: 'wait', entity_id: id, operation: 'removida', summary: `Espera removida (${before.party}): ${before.description}`, before, after: null }, meta);
}
