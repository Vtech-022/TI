// Regras de negócio de tarefas, dependências e prioridades.
import type { CertaintyMap, Priority, Task, TaskLink, TaskStatus } from '../../shared/types';
import { OPEN_STATUSES, PRIORITY_LABEL, STATUS_LABEL } from '../../shared/types';
import { AppError, Ctx, notFound, nowIso, today } from '../context';
import { transaction } from '../db/tx';
import { toColumns, toLink, toTask, toWait } from '../db/rows';
import { computePriority } from '../domain/priority';
import { Meta, record } from './history';

export interface TaskInput {
  title: string;
  description?: string | null;
  project_id?: number | null;
  parent_id?: number | null;
  category?: string | null;
  status?: TaskStatus;
  impact?: Task['impact'];
  effort?: Task['effort'];
  due_date?: string | null;
  due_time?: string | null;
  due_note?: string | null;
  responsible?: string | null;
  involved?: string[];
  next_action?: string | null;
  certainty?: CertaintyMap;
  requires_verification?: boolean;
  verification_note?: string | null;
  origin?: Task['origin'];
  capture_id?: number | null;
  original_text?: string | null;
  position?: number;
}

const FIELD_LABEL: Record<string, string> = {
  title: 'título',
  description: 'descrição',
  project_id: 'projeto',
  parent_id: 'tarefa principal',
  category: 'categoria',
  status: 'status',
  impact: 'impacto',
  effort: 'esforço',
  due_date: 'prazo',
  due_time: 'horário',
  due_note: 'anotação do prazo',
  responsible: 'responsável',
  involved: 'envolvidos',
  next_action: 'próxima ação',
  certainty: 'grau de certeza',
  requires_verification: 'exigência de verificação',
  verification_note: 'nota de verificação'
};

export function listTasks(ctx: Ctx): Task[] {
  return (ctx.db.prepare('SELECT * FROM tasks ORDER BY position, id').all() as any[]).map(toTask);
}

export function getTask(ctx: Ctx, id: number): Task {
  const row = ctx.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!row) throw notFound('Tarefa');
  return toTask(row as any);
}

function assertRefs(ctx: Ctx, input: Partial<TaskInput>, selfId?: number) {
  if (input.project_id != null && !ctx.db.prepare('SELECT 1 FROM projects WHERE id = ?').get(input.project_id)) throw notFound('Projeto');
  if (input.parent_id != null) {
    if (!ctx.db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(input.parent_id)) throw notFound('Tarefa principal');
    // Impede ciclos na hierarquia.
    let cur: number | null = input.parent_id;
    for (let guard = 0; cur != null && guard < 50; guard++) {
      if (cur === selfId) throw new AppError(400, 'ciclo', 'Uma tarefa não pode ser subtarefa dela mesma.');
      cur = (ctx.db.prepare('SELECT parent_id FROM tasks WHERE id = ?').get(cur) as { parent_id: number | null } | undefined)?.parent_id ?? null;
    }
  }
}

export function createTask(ctx: Ctx, input: TaskInput, meta: Meta): Task {
  assertRefs(ctx, input);
  const ts = nowIso(ctx);
  const cols = toColumns({
    title: input.title.trim(),
    description: input.description ?? null,
    project_id: input.project_id ?? null,
    parent_id: input.parent_id ?? null,
    category: input.category ?? null,
    status: input.status ?? 'pendente',
    impact: input.impact ?? null,
    effort: input.effort ?? null,
    due_date: input.due_date ?? null,
    due_time: input.due_time ?? null,
    due_note: input.due_note ?? null,
    responsible: input.responsible ?? null,
    involved: input.involved ?? [],
    next_action: input.next_action ?? null,
    certainty: input.certainty ?? {},
    requires_verification: input.requires_verification ?? false,
    verification_note: input.verification_note ?? null,
    origin: input.origin ?? 'manual',
    capture_id: input.capture_id ?? null,
    original_text: input.original_text ?? null,
    position: input.position ?? 0,
    created_at: ts,
    updated_at: ts,
    completed_at: input.status === 'concluida' ? ts : null
  });
  const keys = Object.keys(cols);
  const res = ctx.db.prepare(`INSERT INTO tasks (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => cols[k]));
  const id = Number(res.lastInsertRowid);
  const task = getTask(ctx, id);
  record(ctx, { entity_type: 'task', entity_id: id, operation: 'criada', summary: `Tarefa criada: "${task.title}"`, before: null, after: rawTask(ctx, id) }, meta);
  return task;
}

function rawTask(ctx: Ctx, id: number): Record<string, unknown> {
  return ctx.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>;
}

export function updateTask(ctx: Ctx, id: number, patch: Partial<TaskInput>, meta: Meta, summaryPrefix?: string): Task {
  const current = getTask(ctx, id);
  assertRefs(ctx, patch, id);
  const changed: string[] = [];
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || !(k in FIELD_LABEL)) continue;
    const old = (current as any)[k];
    if (JSON.stringify(old ?? null) === JSON.stringify(v ?? null)) continue;
    next[k] = v;
    changed.push(k);
  }
  if (!changed.length) return current;
  if ('status' in next) {
    next.completed_at = next.status === 'concluida' ? nowIso(ctx) : null;
  }
  const before = rawTask(ctx, id);
  const cols = toColumns({ ...next, updated_at: nowIso(ctx) });
  const keys = Object.keys(cols);
  ctx.db.prepare(`UPDATE tasks SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => cols[k]), id);
  const fields = changed.filter((k) => k !== 'certainty').map((k) => FIELD_LABEL[k]);
  const summary = `${summaryPrefix ?? 'Tarefa atualizada'}: "${current.title}" — ${fields.length ? fields.join(', ') : 'grau de certeza'}`;
  record(ctx, { entity_type: 'task', entity_id: id, operation: 'atualizada', summary, before, after: rawTask(ctx, id) }, meta);
  return getTask(ctx, id);
}

export interface StatusOptions {
  force?: boolean;
  reason?: string;
  verified?: boolean;
}

/** Pendências que impedem a conclusão de uma tarefa. */
export function openConditions(ctx: Ctx, id: number): { blockers: Task[]; children: Task[] } {
  const placeholders = OPEN_STATUSES.map(() => '?').join(',');
  const blockers = (
    ctx.db
      .prepare(`SELECT t.* FROM task_links l JOIN tasks t ON t.id = l.blocker_id WHERE l.blocked_id = ? AND t.status IN (${placeholders})`)
      .all(id, ...OPEN_STATUSES) as any[]
  ).map(toTask);
  const children = (ctx.db.prepare(`SELECT * FROM tasks WHERE parent_id = ? AND status IN (${placeholders})`).all(id, ...OPEN_STATUSES) as any[]).map(toTask);
  return { blockers, children };
}

export function changeStatus(ctx: Ctx, id: number, status: TaskStatus, opts: StatusOptions, meta: Meta): Task {
  const task = getTask(ctx, id);
  if (task.status === status) return task;
  let prefix = `Status alterado para ${STATUS_LABEL[status]}`;
  if (status === 'concluida') {
    const { blockers, children } = openConditions(ctx, id);
    if ((blockers.length || children.length) && !opts.force) {
      throw new AppError(409, 'pendencias_abertas', 'A tarefa possui dependências ou subtarefas em aberto.', {
        blockers: blockers.map((t) => ({ id: t.id, title: t.title })),
        children: children.map((t) => ({ id: t.id, title: t.title }))
      });
    }
    if ((blockers.length || children.length) && opts.force && !opts.reason?.trim()) {
      throw new AppError(400, 'motivo_obrigatorio', 'Informe o motivo para concluir com pendências em aberto.');
    }
    if (task.requires_verification && !opts.verified) {
      throw new AppError(409, 'verificacao_necessaria', task.verification_note ?? 'Esta tarefa exige verificação antes da conclusão.');
    }
    if (opts.force && (blockers.length || children.length)) prefix = `Concluída como exceção (${opts.reason!.trim()})`;
    else if (task.requires_verification) prefix = 'Concluída após verificação confirmada';
    else prefix = 'Concluída';
  }
  return updateTask(ctx, id, { status }, meta, prefix);
}

export function deleteTask(ctx: Ctx, id: number, meta: Meta): void {
  const task = getTask(ctx, id);
  const children = ctx.db.prepare('SELECT COUNT(*) n FROM tasks WHERE parent_id = ?').get(id) as { n: number };
  if (children.n > 0) throw new AppError(409, 'possui_subtarefas', 'Exclua ou mova as subtarefas antes de excluir esta tarefa.');
  transaction(ctx.db, () => {
    for (const l of ctx.db.prepare('SELECT * FROM task_links WHERE blocker_id = ? OR blocked_id = ?').all(id, id) as any[]) {
      ctx.db.prepare('DELETE FROM task_links WHERE id = ?').run(l.id);
      record(ctx, { entity_type: 'link', entity_id: l.id, operation: 'removida', summary: `Dependência removida com a exclusão de "${task.title}"`, before: l, after: null }, meta);
    }
    for (const w of ctx.db.prepare('SELECT * FROM waits WHERE task_id = ?').all(id) as any[]) {
      ctx.db.prepare('DELETE FROM waits WHERE id = ?').run(w.id);
      record(ctx, { entity_type: 'wait', entity_id: w.id, operation: 'removida', summary: `Espera removida com a exclusão de "${task.title}"`, before: w, after: null }, meta);
    }
    const before = rawTask(ctx, id);
    ctx.db.prepare('UPDATE events SET task_id = NULL WHERE task_id = ?').run(id);
    ctx.db.prepare('UPDATE documents SET task_id = NULL WHERE task_id = ?').run(id);
    ctx.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    record(ctx, { entity_type: 'task', entity_id: id, operation: 'excluida', summary: `Tarefa excluída: "${task.title}"`, before, after: null }, meta);
  });
}

export function setPriorityOverride(ctx: Ctx, id: number, priority: Priority | null, reason: string | null, meta: Meta): Task {
  const task = getTask(ctx, id);
  if (priority && !reason?.trim()) throw new AppError(400, 'motivo_obrigatorio', 'Informe o motivo do ajuste manual de prioridade.');
  const before = rawTask(ctx, id);
  ctx.db
    .prepare('UPDATE tasks SET priority_override = ?, priority_override_reason = ?, updated_at = ? WHERE id = ?')
    .run(priority, priority ? reason!.trim() : null, nowIso(ctx), id);
  record(
    ctx,
    {
      entity_type: 'task',
      entity_id: id,
      operation: 'prioridade_ajustada',
      summary: priority ? `Prioridade de "${task.title}" ajustada manualmente para ${PRIORITY_LABEL[priority]}: ${reason}` : `Ajuste manual de prioridade removido de "${task.title}"`,
      before,
      after: rawTask(ctx, id)
    },
    meta
  );
  return getTask(ctx, id);
}

// ---------------------------------------------------------------------------
// Dependências

export function listLinks(ctx: Ctx): TaskLink[] {
  return (ctx.db.prepare('SELECT * FROM task_links ORDER BY id').all() as any[]).map(toLink);
}

function reaches(ctx: Ctx, from: number, target: number): boolean {
  const seen = new Set<number>();
  const stack = [from];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === target) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const r of ctx.db.prepare('SELECT blocked_id FROM task_links WHERE blocker_id = ?').all(cur) as { blocked_id: number }[]) stack.push(r.blocked_id);
  }
  return false;
}

export function addLink(ctx: Ctx, blockerId: number, blockedId: number, certainty: TaskLink['certainty'], note: string | null, meta: Meta): TaskLink {
  if (blockerId === blockedId) throw new AppError(400, 'dependencia_invalida', 'Uma tarefa não pode depender dela mesma.');
  const blocker = getTask(ctx, blockerId);
  const blocked = getTask(ctx, blockedId);
  const existing = ctx.db.prepare('SELECT * FROM task_links WHERE blocker_id = ? AND blocked_id = ?').get(blockerId, blockedId);
  if (existing) return toLink(existing as any);
  if (reaches(ctx, blockedId, blockerId)) throw new AppError(400, 'ciclo', 'Essa dependência criaria um ciclo entre tarefas.');
  const res = ctx.db
    .prepare('INSERT INTO task_links (blocker_id, blocked_id, certainty, note, created_at) VALUES (?,?,?,?,?)')
    .run(blockerId, blockedId, certainty, note, nowIso(ctx));
  const id = Number(res.lastInsertRowid);
  const row = ctx.db.prepare('SELECT * FROM task_links WHERE id = ?').get(id) as any;
  record(
    ctx,
    { entity_type: 'link', entity_id: id, operation: 'criada', summary: `Dependência: "${blocked.title}" depende de "${blocker.title}"${certainty === 'inferida' ? ' (inferida)' : ''}`, before: null, after: row },
    meta
  );
  return toLink(row);
}

export function updateLinkCertainty(ctx: Ctx, linkId: number, certainty: TaskLink['certainty'], meta: Meta): TaskLink {
  const row = ctx.db.prepare('SELECT * FROM task_links WHERE id = ?').get(linkId) as any;
  if (!row) throw notFound('Dependência');
  ctx.db.prepare('UPDATE task_links SET certainty = ? WHERE id = ?').run(certainty, linkId);
  const after = ctx.db.prepare('SELECT * FROM task_links WHERE id = ?').get(linkId) as any;
  record(ctx, { entity_type: 'link', entity_id: linkId, operation: 'atualizada', summary: `Dependência #${linkId} marcada como ${certainty}`, before: row, after }, meta);
  return toLink(after);
}

export function removeLink(ctx: Ctx, linkId: number, meta: Meta): void {
  const row = ctx.db.prepare('SELECT * FROM task_links WHERE id = ?').get(linkId) as any;
  if (!row) throw notFound('Dependência');
  ctx.db.prepare('DELETE FROM task_links WHERE id = ?').run(linkId);
  record(ctx, { entity_type: 'link', entity_id: linkId, operation: 'removida', summary: `Dependência removida (#${row.blocker_id} → #${row.blocked_id})`, before: row, after: null }, meta);
}

// ---------------------------------------------------------------------------
// Prioridades

/** Recalcula prioridades das tarefas abertas e registra mudanças de nível. */
export function recomputePriorities(ctx: Ctx): number {
  const tasks = listTasks(ctx);
  const map = new Map(tasks.map((t) => [t.id, t]));
  const links = listLinks(ctx);
  const waits = (ctx.db.prepare('SELECT * FROM waits').all() as any[]).map(toWait);
  const day = today(ctx);
  let changes = 0;
  const upd = ctx.db.prepare('UPDATE tasks SET priority = ?, priority_score = ?, priority_reasons = ? WHERE id = ?');
  transaction(ctx.db, () => {
    for (const t of tasks) {
      if (!OPEN_STATUSES.includes(t.status)) continue;
      const r = computePriority(t, { tasks: map, links, waits, today: day });
      const reasonsJson = JSON.stringify(r.reasons);
      if (r.level === t.priority && r.score === t.priority_score && reasonsJson === JSON.stringify(t.priority_reasons)) continue;
      upd.run(r.level, r.score, reasonsJson, t.id);
      if (r.level !== t.priority && t.priority_reasons.length > 0) {
        changes++;
        record(
          ctx,
          {
            entity_type: 'task',
            entity_id: t.id,
            operation: 'prioridade_recalculada',
            summary: `Prioridade de "${t.title}" recalculada: ${PRIORITY_LABEL[t.priority]} → ${PRIORITY_LABEL[r.level]}`
          },
          { source: 'motor de prioridade' }
        );
      }
    }
  });
  return changes;
}

export const effectivePriority = (t: Task): Priority => t.priority_override ?? t.priority;
