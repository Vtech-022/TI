// Projetos, marcos e indicadores de projeto.
import type { Milestone, Project, Task } from '../../shared/types';
import { AppError, Ctx, notFound, nowIso, today } from '../context';
import { toColumns, toMilestone, toProject } from '../db/rows';
import { diffDays } from '../domain/dates';
import { isOpen } from '../domain/priority';
import { computeProgress } from '../domain/progress';
import { Meta, record } from './history';
import { effectivePriority, listLinks, listTasks } from './tasks';

export interface ProjectInput {
  name: string;
  objective?: string | null;
  description?: string | null;
  owners?: string[];
  keywords?: string[];
  status?: Project['status'];
}

const RANK = { critica: 0, alta: 1, normal: 2, baixa: 3 } as const;

export function listProjects(ctx: Ctx): Project[] {
  return (ctx.db.prepare('SELECT * FROM projects ORDER BY name').all() as any[]).map(toProject);
}

export function getProject(ctx: Ctx, id: number): Project {
  const row = ctx.db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!row) throw notFound('Projeto');
  return toProject(row as any);
}

export function createProject(ctx: Ctx, input: ProjectInput, meta: Meta): Project {
  const name = input.name.trim();
  const dup = listProjects(ctx).find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (dup) throw new AppError(409, 'projeto_existente', `Já existe um projeto chamado "${dup.name}".`);
  const ts = nowIso(ctx);
  const cols = toColumns({
    name,
    objective: input.objective ?? null,
    description: input.description ?? null,
    owners: input.owners ?? [],
    keywords: input.keywords ?? [],
    status: input.status ?? 'ativo',
    created_at: ts,
    updated_at: ts
  });
  const keys = Object.keys(cols);
  const id = Number(ctx.db.prepare(`INSERT INTO projects (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => cols[k])).lastInsertRowid);
  const row = ctx.db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  record(ctx, { entity_type: 'project', entity_id: id, operation: 'criado', summary: `Projeto criado: "${name}"`, before: null, after: row }, meta);
  return toProject(row as any);
}

export function updateProject(ctx: Ctx, id: number, patch: Partial<ProjectInput>, meta: Meta): Project {
  const before = ctx.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
  if (!before) throw notFound('Projeto');
  const cols = toColumns({ ...patch, updated_at: nowIso(ctx) });
  const keys = Object.keys(cols);
  ctx.db.prepare(`UPDATE projects SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => cols[k]), id);
  const after = ctx.db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  record(ctx, { entity_type: 'project', entity_id: id, operation: 'atualizado', summary: `Projeto atualizado: "${before.name}"`, before, after }, meta);
  return toProject(after as any);
}

export function deleteProject(ctx: Ctx, id: number, meta: Meta): void {
  const before = ctx.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
  if (!before) throw notFound('Projeto');
  const n = ctx.db.prepare('SELECT COUNT(*) n FROM tasks WHERE project_id = ?').get(id) as { n: number };
  if (n.n > 0) throw new AppError(409, 'projeto_com_tarefas', 'O projeto possui tarefas. Mova-as ou encerre o projeto em vez de excluí-lo.');
  ctx.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  record(ctx, { entity_type: 'project', entity_id: id, operation: 'excluido', summary: `Projeto excluído: "${before.name}"`, before, after: null }, meta);
}

export function listMilestones(ctx: Ctx, projectId?: number): Milestone[] {
  const rows = projectId
    ? ctx.db.prepare('SELECT * FROM milestones WHERE project_id = ? ORDER BY due_date IS NULL, due_date').all(projectId)
    : ctx.db.prepare('SELECT * FROM milestones ORDER BY due_date IS NULL, due_date').all();
  return (rows as any[]).map(toMilestone);
}

export function createMilestone(ctx: Ctx, projectId: number, input: { title: string; due_date?: string | null }, meta: Meta): Milestone {
  getProject(ctx, projectId);
  const id = Number(
    ctx.db.prepare('INSERT INTO milestones (project_id, title, due_date, done, created_at) VALUES (?,?,?,0,?)').run(projectId, input.title.trim(), input.due_date ?? null, nowIso(ctx)).lastInsertRowid
  );
  const row = ctx.db.prepare('SELECT * FROM milestones WHERE id = ?').get(id);
  record(ctx, { entity_type: 'milestone', entity_id: id, operation: 'criado', summary: `Marco criado: "${input.title}"`, before: null, after: row }, meta);
  return toMilestone(row as any);
}

export function updateMilestone(ctx: Ctx, id: number, patch: { title?: string; due_date?: string | null; done?: boolean }, meta: Meta): Milestone {
  const before = ctx.db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as any;
  if (!before) throw notFound('Marco');
  const cols = toColumns(patch);
  const keys = Object.keys(cols);
  if (keys.length) ctx.db.prepare(`UPDATE milestones SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => cols[k]), id);
  const after = ctx.db.prepare('SELECT * FROM milestones WHERE id = ?').get(id);
  record(ctx, { entity_type: 'milestone', entity_id: id, operation: 'atualizado', summary: `Marco atualizado: "${before.title}"`, before, after }, meta);
  return toMilestone(after as any);
}

export function deleteMilestone(ctx: Ctx, id: number, meta: Meta): void {
  const before = ctx.db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as any;
  if (!before) throw notFound('Marco');
  ctx.db.prepare('DELETE FROM milestones WHERE id = ?').run(id);
  record(ctx, { entity_type: 'milestone', entity_id: id, operation: 'excluido', summary: `Marco excluído: "${before.title}"`, before, after: null }, meta);
}

export interface ProjectSummary extends Project {
  progress: ReturnType<typeof computeProgress>;
  open: number;
  critical: number;
  overdue: number;
  blocked: number;
  next_action: { task_id: number; text: string } | null;
  next_due: { task_id: number; title: string; date: string; certainty: string } | null;
  risks: string[];
}

export function summarizeProject(ctx: Ctx, project: Project, all?: Task[]): ProjectSummary {
  const tasks = (all ?? listTasks(ctx)).filter((t) => t.project_id === project.id);
  const links = listLinks(ctx);
  const day = today(ctx);
  const open = tasks.filter(isOpen);
  const openIds = new Set(open.map((t) => t.id));
  const blockedIds = new Set(links.filter((l) => openIds.has(l.blocked_id) && (all ?? tasks).some((t) => t.id === l.blocker_id && isOpen(t))).map((l) => l.blocked_id));
  const parents = new Set(tasks.map((t) => t.parent_id).filter((x) => x != null));
  const actionable = open
    .filter((t) => !blockedIds.has(t.id) && !parents.has(t.id))
    .sort((a, b) => RANK[effectivePriority(a)] - RANK[effectivePriority(b)] || b.priority_score - a.priority_score);
  const nextTask = actionable[0];
  const dated = open.filter((t) => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const overdue = open.filter((t) => t.due_date && t.due_date < day);
  const risks: string[] = [];
  if (overdue.length) risks.push(`${overdue.length} tarefa(s) atrasada(s).`);
  if (blockedIds.size) risks.push(`${blockedIds.size} tarefa(s) bloqueada(s) por dependências.`);
  const soon = dated.find((t) => diffDays(day, t.due_date!) >= 0 && diffDays(day, t.due_date!) <= 7);
  if (soon) {
    const deps = links.filter((l) => l.blocked_id === soon.id && openIds.has(l.blocker_id)).length;
    if (deps) risks.push(`"${soon.title}" vence em ${diffDays(day, soon.due_date!)} dia(s) e depende de ${deps} tarefa(s).`);
  }
  if (open.length && !nextTask) risks.push('Nenhuma tarefa está livre para execução imediata.');
  return {
    ...project,
    progress: computeProgress(tasks),
    open: open.length,
    critical: open.filter((t) => effectivePriority(t) === 'critica').length,
    overdue: overdue.length,
    blocked: blockedIds.size,
    next_action: nextTask ? { task_id: nextTask.id, text: nextTask.next_action ?? nextTask.title } : null,
    next_due: dated[0] ? { task_id: dated[0].id, title: dated[0].title, date: dated[0].due_date!, certainty: dated[0].certainty.due_date ?? 'explicita' } : null,
    risks
  };
}
