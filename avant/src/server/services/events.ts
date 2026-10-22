// Agenda interna.
import type { CalendarEvent } from '../../shared/types';
import { AppError, Ctx, notFound, nowIso } from '../context';
import { toColumns, toEvent } from '../db/rows';
import { findConflicts } from '../domain/agenda';
import { Meta, record } from './history';

export interface EventInput {
  title: string;
  type: CalendarEvent['type'];
  start_at: string;
  end_at?: string | null;
  all_day?: boolean;
  location?: string | null;
  participants?: string[];
  responsible?: string | null;
  project_id?: number | null;
  task_id?: number | null;
  notes?: string | null;
  origin?: CalendarEvent['origin'];
  capture_id?: number | null;
  original_text?: string | null;
}

export interface EventQuery {
  from?: string;
  to?: string;
  q?: string;
  type?: string;
  project_id?: number;
}

export function listEvents(ctx: Ctx, q: EventQuery = {}): CalendarEvent[] {
  const where = ['deleted_at IS NULL'];
  const args: (string | number)[] = [];
  if (q.from) where.push('COALESCE(end_at, start_at) >= ?') && args.push(q.from);
  if (q.to) where.push('start_at < ?') && args.push(q.to);
  if (q.type) where.push('type = ?') && args.push(q.type);
  if (q.project_id) where.push('project_id = ?') && args.push(q.project_id);
  let events = (ctx.db.prepare(`SELECT * FROM events WHERE ${where.join(' AND ')} ORDER BY start_at`).all(...args) as any[]).map(toEvent);
  if (q.q) {
    const needle = q.q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    events = events.filter((e) =>
      [e.title, e.location, e.notes, e.responsible, ...e.participants].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(needle)
    );
  }
  return events;
}

export function getEvent(ctx: Ctx, id: number): CalendarEvent {
  const row = ctx.db.prepare('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!row) throw notFound('Evento');
  return toEvent(row as any);
}

function validate(input: Partial<EventInput>) {
  if (input.start_at && input.end_at && Date.parse(input.end_at) <= Date.parse(input.start_at)) {
    throw new AppError(400, 'horario_invalido', 'O término deve ser posterior ao início.');
  }
}

export function createEvent(ctx: Ctx, input: EventInput, meta: Meta): { event: CalendarEvent; conflicts: CalendarEvent[] } {
  validate(input);
  const ts = nowIso(ctx);
  const cols = toColumns({
    title: input.title.trim(),
    type: input.type,
    start_at: input.start_at,
    end_at: input.end_at ?? null,
    all_day: input.all_day ?? false,
    location: input.location ?? null,
    participants: input.participants ?? [],
    responsible: input.responsible ?? null,
    project_id: input.project_id ?? null,
    task_id: input.task_id ?? null,
    notes: input.notes ?? null,
    origin: input.origin ?? 'manual',
    capture_id: input.capture_id ?? null,
    original_text: input.original_text ?? null,
    created_at: ts,
    updated_at: ts
  });
  const keys = Object.keys(cols);
  const id = Number(ctx.db.prepare(`INSERT INTO events (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => cols[k])).lastInsertRowid);
  const row = ctx.db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  record(ctx, { entity_type: 'event', entity_id: id, operation: 'criado', summary: `Evento criado: "${input.title}"`, before: null, after: row }, meta);
  const event = toEvent(row as any);
  return { event, conflicts: conflictsFor(ctx, event) };
}

export function updateEvent(ctx: Ctx, id: number, patch: Partial<EventInput>, meta: Meta): { event: CalendarEvent; conflicts: CalendarEvent[] } {
  const before = ctx.db.prepare('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL').get(id) as any;
  if (!before) throw notFound('Evento');
  validate({ start_at: patch.start_at ?? before.start_at, end_at: patch.end_at === undefined ? before.end_at : patch.end_at });
  const cols = toColumns({ ...patch, updated_at: nowIso(ctx) });
  const keys = Object.keys(cols);
  ctx.db.prepare(`UPDATE events SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => cols[k]), id);
  const after = ctx.db.prepare('SELECT * FROM events WHERE id = ?').get(id) as any;
  const rescheduled = before.start_at !== after.start_at || before.end_at !== after.end_at;
  record(
    ctx,
    { entity_type: 'event', entity_id: id, operation: rescheduled ? 'reagendado' : 'atualizado', summary: `${rescheduled ? 'Evento reagendado' : 'Evento atualizado'}: "${before.title}"`, before, after },
    meta
  );
  const event = toEvent(after);
  return { event, conflicts: conflictsFor(ctx, event) };
}

export function deleteEvent(ctx: Ctx, id: number, meta: Meta): void {
  const before = ctx.db.prepare('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL').get(id) as any;
  if (!before) throw notFound('Evento');
  ctx.db.prepare('UPDATE events SET deleted_at = ? WHERE id = ?').run(nowIso(ctx), id);
  const after = ctx.db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  record(ctx, { entity_type: 'event', entity_id: id, operation: 'excluido', summary: `Evento excluído: "${before.title}"`, before, after }, meta);
}

export function conflictsFor(ctx: Ctx, event: CalendarEvent): CalendarEvent[] {
  const all = listEvents(ctx);
  const ids = findConflicts(all)
    .filter((c) => c.a === event.id || c.b === event.id)
    .map((c) => (c.a === event.id ? c.b : c.a));
  return all.filter((e) => ids.includes(e.id));
}
