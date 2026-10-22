// Rotas da API do AVANT, independentes do servidor HTTP (Fastify no Node, roteador próprio no navegador).
import { z, ZodError } from 'zod';
import { CERTAINTIES, EVENT_TYPES, LEVELS, PRIORITIES, TASK_STATUSES, WAIT_STATUSES } from '../shared/types';
import { AppError, Ctx, today } from './context';
import { transaction } from './db/tx';
import { parseEventText } from './domain/agenda';
import { isValidIsoDate } from './domain/dates';
import { SUPPORTED } from './importers';
import { getCapture, listCaptures, listConfirmations, processCapture, resolveConfirmation } from './services/captures';
import { documentText, getDocumentRow, listDocuments, removeDocument, updateDocumentLinks } from './services/documents-core';
import { conflictsFor, createEvent, deleteEvent, getEvent, listEvents, updateEvent } from './services/events';
import { listHistory, Meta, undoCapture, undoEntry } from './services/history';
import { alerts, buildViews, categories, dashboard, dismissRecommendation, focusToday, people, queryTasks, recommendations, reports, search } from './services/insights';
import {
  createMilestone,
  createProject,
  deleteMilestone,
  deleteProject,
  getProject,
  listMilestones,
  listProjects,
  summarizeProject,
  updateMilestone,
  updateProject
} from './services/projects';
import {
  addLink,
  changeStatus,
  createTask,
  deleteTask,
  getTask,
  listLinks,
  listTasks,
  recomputePriorities,
  removeLink,
  setPriorityOverride,
  updateLinkCertainty,
  updateTask
} from './services/tasks';
import { createWait, deleteWait, listWaits, updateWait } from './services/waits';

const USER: Meta = { source: 'usuario' };

// ---------------------------------------------------------------------------
// Esquemas de validação

const isoDate = z.string().refine(isValidIsoDate, 'Data inválida (use AAAA-MM-DD).');
const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)) && /T/.test(s), 'Data e hora inválidas.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (use HH:MM).');
const id = z.coerce.number().int().positive();
const certaintyMap = z.record(z.string(), z.enum(CERTAINTIES));
const optText = (max: number) => z.string().trim().max(max).nullable().optional();

const taskBase = {
  title: z.string().trim().min(2, 'Informe um título com pelo menos 2 caracteres.').max(300),
  description: optText(5000),
  project_id: id.nullable().optional(),
  parent_id: id.nullable().optional(),
  category: optText(80),
  status: z.enum(TASK_STATUSES).optional(),
  impact: z.enum(LEVELS).nullable().optional(),
  effort: z.enum(LEVELS).nullable().optional(),
  due_date: isoDate.nullable().optional(),
  due_time: time.nullable().optional(),
  due_note: optText(1000),
  responsible: optText(120),
  involved: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  next_action: optText(500),
  certainty: certaintyMap.optional(),
  requires_verification: z.boolean().optional(),
  verification_note: optText(500)
};
const taskCreate = z.object(taskBase).strict();
const taskPatch = z.object({ ...taskBase, title: taskBase.title.optional() }).strict();

const projectBase = {
  name: z.string().trim().min(2).max(200),
  objective: optText(2000),
  description: optText(5000),
  owners: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  keywords: z.array(z.string().trim().min(2).max(80)).max(40).optional(),
  status: z.enum(['ativo', 'pausado', 'encerrado']).optional()
};

const waitBase = {
  task_id: id.nullable().optional(),
  project_id: id.nullable().optional(),
  party: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(500),
  requested_at: isoDate.nullable().optional(),
  expected_at: isoDate.nullable().optional(),
  follow_up_at: isoDate.nullable().optional(),
  status: z.enum(WAIT_STATUSES).optional(),
  certainty: z.enum(CERTAINTIES).optional(),
  note: optText(1000)
};

const eventBase = {
  title: z.string().trim().min(2).max(200),
  type: z.enum(EVENT_TYPES),
  start_at: isoDateTime,
  end_at: isoDateTime.nullable().optional(),
  all_day: z.boolean().optional(),
  location: optText(200),
  participants: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  responsible: optText(120),
  project_id: id.nullable().optional(),
  task_id: id.nullable().optional(),
  notes: optText(5000)
};

function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data ?? {});
}

// ---------------------------------------------------------------------------

export interface Req {
  params: unknown;
  query: unknown;
  body: unknown;
}
export interface Reply {
  status(code: number): Reply;
  send(payload: unknown): unknown;
  header(name: string, value: string): Reply;
}
type Handler = (req: any, reply: any) => Promise<unknown>;
export interface Router {
  get(path: string, handler: Handler): unknown;
  post(path: string, handler: Handler): unknown;
  patch(path: string, handler: Handler): unknown;
  delete(path: string, handler: Handler): unknown;
}

/** Converte qualquer erro em resposta HTTP com mensagem útil. */
export function errorResponse(err: any, maxUploadBytes: number): { status: number; body: { error: string; message: string; details?: unknown }; log: boolean } {
  if (err instanceof ZodError) {
    return { status: 400, log: false, body: { error: 'validacao', message: err.issues.map((i) => `${i.path.join('.') || 'dados'}: ${i.message}`).join('; '), details: err.issues } };
  }
  if (err instanceof AppError) return { status: err.status, log: false, body: { error: err.code, message: err.message, details: err.details } };
  if (err?.code === 'FST_REQ_FILE_TOO_LARGE') return { status: 413, log: false, body: { error: 'arquivo_grande', message: `O arquivo excede o limite de ${Math.round(maxUploadBytes / 1048576)} MB.` } };
  if (typeof err?.message === 'string' && /SQLITE|constraint/i.test(err.message)) {
    return { status: 409, log: true, body: { error: 'banco_de_dados', message: 'A operação violou uma regra do banco de dados e não foi aplicada.' } };
  }
  if (err?.statusCode && err.statusCode < 500) return { status: err.statusCode, log: false, body: { error: 'requisicao', message: err.message } };
  return { status: 500, log: true, body: { error: 'interno', message: 'Erro interno. Nenhuma alteração parcial foi salva.' } };
}

export function registerRoutes(app: Router, ctx: Ctx): void {
  /** Executa uma alteração de forma atômica e recalcula prioridades. */
  const mutate = <T>(fn: () => T): T =>
    transaction(ctx.db, () => {
      const r = fn();
      recomputePriorities(ctx);
      return r;
    });

  const P = (req: Req) => req.params as Record<string, string>;

  app.get('/api/health', async () => ({ ok: true, today: today(ctx), tz: ctx.tz }));

  app.get('/api/meta', async () => ({
    today: today(ctx),
    now: ctx.now().toISOString(),
    tz: ctx.tz,
    projects: listProjects(ctx).map((p) => ({ id: p.id, name: p.name, status: p.status })),
    people: people(ctx),
    categories: categories(ctx),
    pending_confirmations: listConfirmations(ctx).length,
    supported_formats: Object.entries(SUPPORTED).map(([ext, s]) => ({ ext, label: s.label })),
    max_upload_mb: Math.round(ctx.maxUploadBytes / 1048576),
    integrations: [
      { name: 'Outlook / Microsoft 365', status: 'nao_configurada' },
      { name: 'Google Calendar', status: 'nao_configurada' },
      { name: 'Modelo de IA externo', status: 'nao_configurada' },
      { name: 'WhatsApp / e-mail', status: 'nao_configurada' }
    ]
  }));

  app.get('/api/dashboard', async () => dashboard(ctx));
  app.get('/api/focus', async () => focusToday(ctx, undefined, 15));
  app.get('/api/alerts', async () => alerts(ctx));
  app.get('/api/recommendations', async () => recommendations(ctx));
  app.post('/api/recommendations/dismiss', async (req) => {
    const { key } = parse(z.object({ key: z.string().min(3).max(300) }), req.body);
    dismissRecommendation(ctx, key);
    return { ok: true };
  });
  app.get('/api/reports', async () => reports(ctx));
  app.get('/api/search', async (req) => search(ctx, String((req.query as any).q ?? '')));

  // Tarefas
  app.get('/api/tasks', async (req) => queryTasks(ctx, req.query as any));
  app.post('/api/tasks', async (req, reply) => {
    const body = parse(taskCreate, req.body);
    const task = mutate(() => createTask(ctx, { ...body, origin: 'manual' }, USER));
    return reply.status(201).send(getTask(ctx, task.id));
  });
  app.get('/api/tasks/:id', async (req) => {
    const tid = parse(id, P(req).id);
    getTask(ctx, tid);
    const view = buildViews({ tasks: listTasks(ctx), links: listLinks(ctx), waits: listWaits(ctx), projects: listProjects(ctx), events: [], today: today(ctx) }).find((t) => t.id === tid)!;
    const children = queryTasks(ctx, { include_closed: '1', sort: 'recomendada' }).filter((t) => t.parent_id === tid).sort((a, b) => a.position - b.position);
    return {
      task: view,
      children,
      history: listHistory(ctx, { entity_type: 'task', entity_id: tid }),
      documents: listDocuments(ctx).filter((d) => d.task_id === tid),
      events: listEvents(ctx).filter((e) => e.task_id === tid)
    };
  });
  app.patch('/api/tasks/:id', async (req) => {
    const tid = parse(id, P(req).id);
    const body = parse(taskPatch, req.body);
    if (body.status) throw new AppError(400, 'use_status', 'Use a ação de status para alterar o status da tarefa.');
    if (body.due_date !== undefined && !body.certainty) {
      const t = getTask(ctx, tid);
      if (body.due_date !== t.due_date) body.certainty = { ...t.certainty, due_date: body.due_date ? 'confirmada' : 'desconhecida' };
    }
    return mutate(() => updateTask(ctx, tid, body, USER));
  });
  app.post('/api/tasks/:id/status', async (req) => {
    const tid = parse(id, P(req).id);
    const body = parse(z.object({ status: z.enum(TASK_STATUSES), force: z.boolean().optional(), reason: z.string().max(500).optional(), verified: z.boolean().optional() }), req.body);
    return mutate(() => changeStatus(ctx, tid, body.status, body, USER));
  });
  app.post('/api/tasks/:id/priority', async (req) => {
    const tid = parse(id, P(req).id);
    const body = parse(z.object({ priority: z.enum(PRIORITIES).nullable(), reason: z.string().max(500).nullable().optional() }), req.body);
    return mutate(() => setPriorityOverride(ctx, tid, body.priority, body.reason ?? null, USER));
  });
  app.delete('/api/tasks/:id', async (req) => {
    const tid = parse(id, P(req).id);
    const { confirm } = parse(z.object({ confirm: z.literal(true, { message: 'Confirme a exclusão.' }) }), req.body);
    void confirm;
    mutate(() => deleteTask(ctx, tid, USER));
    return { ok: true };
  });

  // Dependências
  app.post('/api/links', async (req, reply) => {
    const body = parse(z.object({ blocker_id: id, blocked_id: id, certainty: z.enum(CERTAINTIES).optional(), note: z.string().max(500).nullable().optional() }), req.body);
    const link = mutate(() => addLink(ctx, body.blocker_id, body.blocked_id, body.certainty ?? 'explicita', body.note ?? null, USER));
    return reply.status(201).send(link);
  });
  app.patch('/api/links/:id', async (req) => {
    const body = parse(z.object({ certainty: z.enum(CERTAINTIES) }), req.body);
    return mutate(() => updateLinkCertainty(ctx, parse(id, P(req).id), body.certainty, USER));
  });
  app.delete('/api/links/:id', async (req) => {
    mutate(() => removeLink(ctx, parse(id, P(req).id), USER));
    return { ok: true };
  });

  // Projetos
  app.get('/api/projects', async () => {
    const tasks = listTasks(ctx);
    return listProjects(ctx).map((p) => summarizeProject(ctx, p, tasks));
  });
  app.post('/api/projects', async (req, reply) => {
    const body = parse(z.object(projectBase).strict(), req.body);
    return reply.status(201).send(mutate(() => createProject(ctx, body, USER)));
  });
  app.get('/api/projects/:id', async (req) => {
    const pid = parse(id, P(req).id);
    const project = getProject(ctx, pid);
    const tasks = queryTasks(ctx, { include_closed: '1', project_id: String(pid), sort: 'recomendada' });
    return {
      project: summarizeProject(ctx, project),
      tasks,
      milestones: listMilestones(ctx, pid),
      documents: listDocuments(ctx).filter((d) => d.project_id === pid),
      events: listEvents(ctx, { project_id: pid }),
      waits: listWaits(ctx).filter((w) => w.project_id === pid || tasks.some((t) => t.id === w.task_id)),
      history: listHistory(ctx, { entity_type: 'project', entity_id: pid })
    };
  });
  app.patch('/api/projects/:id', async (req) => {
    const body = parse(z.object({ ...projectBase, name: projectBase.name.optional() }).strict(), req.body);
    return mutate(() => updateProject(ctx, parse(id, P(req).id), body, USER));
  });
  app.delete('/api/projects/:id', async (req) => {
    mutate(() => deleteProject(ctx, parse(id, P(req).id), USER));
    return { ok: true };
  });
  app.post('/api/projects/:id/milestones', async (req, reply) => {
    const body = parse(z.object({ title: z.string().trim().min(2).max(200), due_date: isoDate.nullable().optional() }), req.body);
    return reply.status(201).send(mutate(() => createMilestone(ctx, parse(id, P(req).id), body, USER)));
  });
  app.patch('/api/milestones/:id', async (req) => {
    const body = parse(z.object({ title: z.string().trim().min(2).max(200).optional(), due_date: isoDate.nullable().optional(), done: z.boolean().optional() }), req.body);
    return mutate(() => updateMilestone(ctx, parse(id, P(req).id), body, USER));
  });
  app.delete('/api/milestones/:id', async (req) => {
    mutate(() => deleteMilestone(ctx, parse(id, P(req).id), USER));
    return { ok: true };
  });

  // Terceiros
  app.get('/api/waits', async () => {
    const tasks = new Map(listTasks(ctx).map((t) => [t.id, t]));
    const projects = new Map(listProjects(ctx).map((p) => [p.id, p.name]));
    return listWaits(ctx).map((w) => {
      const t = w.task_id ? tasks.get(w.task_id) : undefined;
      const pid = w.project_id ?? t?.project_id ?? null;
      return { ...w, task_title: t?.title ?? null, task_status: t?.status ?? null, project_name: pid ? (projects.get(pid) ?? null) : null };
    });
  });
  app.post('/api/waits', async (req, reply) => reply.status(201).send(mutate(() => createWait(ctx, parse(z.object(waitBase).strict(), req.body), USER))));
  app.patch('/api/waits/:id', async (req) => {
    const body = parse(z.object({ ...waitBase, party: waitBase.party.optional(), description: waitBase.description.optional() }).strict(), req.body);
    return mutate(() => updateWait(ctx, parse(id, P(req).id), body, USER));
  });
  app.delete('/api/waits/:id', async (req) => {
    mutate(() => deleteWait(ctx, parse(id, P(req).id), USER));
    return { ok: true };
  });

  // Agenda
  app.get('/api/events', async (req) => {
    const q = req.query as Record<string, string>;
    return listEvents(ctx, { from: q.from, to: q.to, q: q.q, type: q.type, project_id: q.project_id ? Number(q.project_id) : undefined });
  });
  app.post('/api/events/parse', async (req) => {
    const { text } = parse(z.object({ text: z.string().trim().min(3).max(1000) }), req.body);
    return parseEventText(text, today(ctx));
  });
  app.post('/api/events', async (req, reply) => {
    const body = parse(z.object({ ...eventBase, original_text: optText(1000) }).strict(), req.body);
    return reply.status(201).send(mutate(() => createEvent(ctx, { ...body, origin: body.original_text ? 'captura' : 'manual' }, USER)));
  });
  app.get('/api/events/:id', async (req) => {
    const eid = parse(id, P(req).id);
    const event = getEvent(ctx, eid);
    return { event, conflicts: conflictsFor(ctx, event), history: listHistory(ctx, { entity_type: 'event', entity_id: eid }) };
  });
  app.patch('/api/events/:id', async (req) => {
    const body = parse(z.object({ ...eventBase, title: eventBase.title.optional(), type: eventBase.type.optional(), start_at: eventBase.start_at.optional() }).strict(), req.body);
    return mutate(() => updateEvent(ctx, parse(id, P(req).id), body, USER));
  });
  app.delete('/api/events/:id', async (req) => {
    parse(z.object({ confirm: z.literal(true, { message: 'Confirme a exclusão.' }) }), req.body);
    mutate(() => deleteEvent(ctx, parse(id, P(req).id), USER));
    return { ok: true };
  });

  // Captura
  app.post('/api/captures', async (req) => {
    const body = parse(z.object({ text: z.string().max(200_000), dry_run: z.boolean().optional(), reference_date: isoDate.optional() }), req.body);
    return processCapture(ctx, body);
  });
  app.get('/api/captures', async () => listCaptures(ctx));
  app.get('/api/captures/:id', async (req) => {
    const cid = parse(id, P(req).id);
    return { capture: getCapture(ctx, cid), history: listHistory(ctx, { capture_id: cid }) };
  });
  app.post('/api/captures/:id/undo', async (req) => mutate(() => undoCapture(ctx, parse(id, P(req).id))));
  app.get('/api/confirmations', async (req) => listConfirmations(ctx, String((req.query as any).status ?? 'pendente')));
  app.post('/api/confirmations/:id', async (req) => {
    const { value } = parse(z.object({ value: z.string().min(1).max(100) }), req.body);
    return resolveConfirmation(ctx, parse(id, P(req).id), value);
  });

  // Documentos
  app.get('/api/documents', async () => listDocuments(ctx));
  app.get('/api/documents/:id', async (req) => {
    const did = parse(id, P(req).id);
    const row = getDocumentRow(ctx, did);
    return { document: listDocuments(ctx).find((d) => d.id === did), text: row.extracted_text, history: listHistory(ctx, { entity_type: 'document', entity_id: did }) };
  });
  app.post('/api/documents/:id/capture', async (req) => {
    const did = parse(id, P(req).id);
    const { dry_run } = parse(z.object({ dry_run: z.boolean().optional() }), req.body);
    const text = documentText(ctx, did);
    if (!text) throw new AppError(422, 'sem_texto', 'Este arquivo não possui texto interpretável.');
    const result = processCapture(ctx, { text, source_type: 'arquivo', document_id: did, dry_run });
    if (result.capture_id) ctx.db.prepare('UPDATE documents SET capture_id = ? WHERE id = ?').run(result.capture_id, did);
    return result;
  });
  app.patch('/api/documents/:id', async (req) => {
    const body = parse(z.object({ project_id: id.nullable().optional(), task_id: id.nullable().optional() }).strict(), req.body);
    return mutate(() => updateDocumentLinks(ctx, parse(id, P(req).id), body, USER));
  });
  app.delete('/api/documents/:id', async (req) => {
    parse(z.object({ confirm: z.literal(true, { message: 'Confirme a remoção.' }) }), req.body);
    mutate(() => removeDocument(ctx, parse(id, P(req).id), USER));
    return { ok: true };
  });

  // Histórico
  app.get('/api/history', async (req) => {
    const q = req.query as Record<string, string>;
    return listHistory(ctx, {
      entity_type: q.entity_type || undefined,
      entity_id: q.entity_id ? Number(q.entity_id) : undefined,
      capture_id: q.capture_id ? Number(q.capture_id) : undefined,
      q: q.q || undefined,
      from: q.from || undefined,
      to: q.to || undefined,
      limit: q.limit ? Number(q.limit) : 300
    });
  });
  app.post('/api/history/:id/undo', async (req) => mutate(() => undoEntry(ctx, parse(id, P(req).id))));

  // Exportação (cópia de segurança legível)
  app.get('/api/export', async (_req, reply) => {
    const dump: Record<string, unknown> = { exported_at: ctx.now().toISOString(), timezone: ctx.tz };
    for (const t of ['projects', 'milestones', 'tasks', 'task_links', 'waits', 'events', 'captures', 'documents', 'confirmations', 'history']) {
      dump[t] = ctx.db.prepare(`SELECT * FROM ${t}`).all();
    }
    reply.header('Content-Disposition', `attachment; filename="avant-backup-${today(ctx)}.json"`);
    return dump;
  });


}
