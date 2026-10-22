// Captura inteligente: texto livre → tarefas, atualizações, esperas, eventos e confirmações.
import type { CertaintyMap, Confirmation, Task } from '../../shared/types';
import { CERTAINTY_LABEL, EVENT_TYPE_LABEL } from '../../shared/types';
import { AppError, Ctx, notFound, nowIso, today } from '../context';
import { dryRun, transaction } from '../db/database';
import { toConfirmation } from '../db/rows';
import { formatBr, zonedToUtc } from '../domain/dates';
import { Candidate, extract } from '../domain/extraction';
import { decide, rankMatches } from '../domain/matching';
import { normalize, similarity } from '../domain/text';
import { createEvent, listEvents } from './events';
import { Meta } from './history';
import { createProject, listProjects } from './projects';
import { addLink, changeStatus, createTask, getTask, listTasks, recomputePriorities, TaskInput, updateTask } from './tasks';
import { createWait, listWaits } from './waits';

export type OperationKind = 'nova_tarefa' | 'atualizacao' | 'ja_registrada' | 'novo_evento' | 'nova_espera' | 'novo_projeto' | 'dependencia' | 'confirmacao';

export interface CaptureOperation {
  kind: OperationKind;
  title: string;
  excerpt: string | null;
  details: string[];
  task_id?: number;
  event_id?: number;
  project_id?: number;
  confirmation_id?: number;
}

export interface CaptureResult {
  capture_id: number | null;
  dry_run: boolean;
  reference_date: string;
  operations: CaptureOperation[];
  ignored: { text: string; reason: string }[];
  confirmations: Confirmation[];
  stats: Record<OperationKind, number> & { candidatos: number; mensagens: number };
}

export interface CaptureInput {
  text: string;
  dry_run?: boolean;
  source_type?: 'texto' | 'arquivo';
  document_id?: number | null;
  reference_date?: string;
}

function knownPeople(ctx: Ctx): string[] {
  const set = new Map<string, string>();
  for (const t of listTasks(ctx)) for (const p of [t.responsible, ...t.involved]) if (p) set.set(normalize(p), p);
  for (const w of listWaits(ctx)) set.set(normalize(w.party), w.party);
  return [...set.values()];
}

function fmtDue(c: Candidate): string {
  if (!c.due) return 'Prazo: não informado';
  return `Prazo: ${formatBr(c.due.date)}${c.due.time ? ` ${c.due.time}` : ''} (${CERTAINTY_LABEL[c.due.certainty].toLowerCase()} — "${c.due.raw}")`;
}

function insertConfirmation(ctx: Ctx, captureId: number | null, kind: Confirmation['kind'], question: string, payload: unknown, options: Confirmation['options']): Confirmation {
  const id = Number(
    ctx.db
      .prepare('INSERT INTO confirmations (capture_id, kind, question, payload, options, created_at) VALUES (?,?,?,?,?,?)')
      .run(captureId, kind, question, JSON.stringify(payload), JSON.stringify(options), nowIso(ctx)).lastInsertRowid
  );
  return toConfirmation(ctx.db.prepare('SELECT * FROM confirmations WHERE id = ?').get(id) as any);
}

class CaptureRun {
  ops: CaptureOperation[] = [];
  confirmations: Confirmation[] = [];
  refToTask = new Map<number, number>();
  createdTaskIds = new Set<number>();
  newProjects = new Map<string, number>();
  constructor(
    private ctx: Ctx,
    private meta: Meta,
    private captureId: number | null,
    private origin: Task['origin']
  ) {}

  resolveProject(c: Candidate): number | null {
    if (!c.project) return null;
    if (c.project.id != null) return c.project.id;
    const key = normalize(c.project.name);
    if (this.newProjects.has(key)) return this.newProjects.get(key)!;
    const p = createProject(this.ctx, { name: c.project.name, keywords: [c.project.name] }, this.meta);
    this.newProjects.set(key, p.id);
    this.ops.push({ kind: 'novo_projeto', title: p.name, excerpt: c.excerpt, details: ['Projeto citado explicitamente no texto.'], project_id: p.id });
    return p.id;
  }

  certaintyOf(c: Candidate): CertaintyMap {
    const m: CertaintyMap = {};
    if (c.due) m.due_date = c.due.certainty;
    if (c.responsible) m.responsible = c.responsible.certainty;
    if (c.project) m.project = c.project.certainty;
    if (c.category) m.category = c.category.certainty;
    if (c.impact) m.impact = c.impact.certainty;
    if (c.effort) m.effort = c.effort.certainty;
    return m;
  }

  createTaskFrom(c: Candidate, titleOverride?: string): Task {
    const projectId = this.resolveProject(c);
    const parentId = c.parentRef != null ? (this.refToTask.get(c.parentRef) ?? null) : null;
    const input: TaskInput = {
      title: titleOverride ?? c.title,
      description: c.description,
      project_id: projectId ?? (parentId ? getTask(this.ctx, parentId).project_id : null),
      parent_id: parentId,
      category: c.category?.value ?? null,
      impact: c.impact?.value ?? null,
      effort: c.effort?.value ?? null,
      due_date: c.due?.date ?? null,
      due_time: c.due?.time ?? null,
      due_note: c.due ? `"${c.due.raw}" — ${c.due.note}` : null,
      responsible: c.responsible?.value ?? null,
      involved: c.involved,
      next_action: c.nextAction,
      certainty: this.certaintyOf(c),
      origin: this.origin,
      capture_id: this.captureId,
      original_text: c.excerpt
    };
    const task = createTask(this.ctx, input, this.meta);
    this.refToTask.set(c.ref, task.id);
    this.createdTaskIds.add(task.id);
    const details = [
      fmtDue(c),
      `Projeto: ${c.project ? `${c.project.name} (${CERTAINTY_LABEL[c.project.certainty].toLowerCase()})` : 'não informado'}`,
      `Responsável: ${c.responsible ? `${c.responsible.value} (${CERTAINTY_LABEL[c.responsible.certainty].toLowerCase()})` : 'não informado'}`
    ];
    if (c.involved.length) details.push(`Envolvidos: ${c.involved.join(', ')}`);
    if (c.category) details.push(`Categoria: ${c.category.value} (inferida)`);
    if (c.impact) details.push(`Impacto: ${c.impact.value} (${CERTAINTY_LABEL[c.impact.certainty].toLowerCase()})`);
    if (parentId) details.push(`Subtarefa de: ${getTask(this.ctx, parentId).title}`);
    this.ops.push({ kind: 'nova_tarefa', title: task.title, excerpt: c.excerpt, details, task_id: task.id });
    this.afterTask(task, c);
    return task;
  }

  /** Esperas e confirmações de data comuns a criação e atualização. */
  afterTask(task: Task, c: Candidate) {
    if (c.waitingOn) {
      const open = listWaits(this.ctx).find((w) => w.task_id === task.id && w.status === 'aguardando' && normalize(w.party) === normalize(c.waitingOn!.party));
      if (!open) {
        const w = createWait(
          this.ctx,
          { task_id: task.id, project_id: task.project_id, party: c.waitingOn.party, description: c.waitingOn.what, certainty: c.waitingOn.certainty, requested_at: c.sentAt, note: `Origem: "${c.excerpt}"` },
          this.meta
        );
        this.ops.push({
          kind: 'nova_espera',
          title: `Aguardando ${w.party}`,
          excerpt: c.excerpt,
          details: [w.description, `Certeza: ${CERTAINTY_LABEL[w.certainty].toLowerCase()}`],
          task_id: task.id
        });
      }
    }
    if (c.due?.alternatives && c.due.alternatives.length > 1) {
      const conf = insertConfirmation(
        this.ctx,
        this.captureId,
        'data_ambigua',
        `Qual é o prazo de "${task.title}"? ${c.due.note}`,
        { task_id: task.id },
        c.due.alternatives.map((d) => ({ value: d, label: formatBr(d) }))
      );
      this.confirmations.push(conf);
      this.ops.push({ kind: 'confirmacao', title: conf.question, excerpt: c.excerpt, details: [`Registrado provisoriamente: ${formatBr(c.due.date)} (inferida).`], confirmation_id: conf.id, task_id: task.id });
    }
  }

  applyUpdate(task: Task, c: Candidate, score: number) {
    const patch: Partial<TaskInput> = {};
    const details: string[] = [];
    const cert: CertaintyMap = { ...task.certainty };
    if (c.due && c.due.date !== task.due_date) {
      if (task.due_date && task.certainty.due_date === 'confirmada') {
        const conf = insertConfirmation(
          this.ctx,
          this.captureId,
          'data_ambigua',
          `"${task.title}" tem prazo confirmado em ${formatBr(task.due_date)}, mas o texto indica ${formatBr(c.due.date)}. Qual vale?`,
          { task_id: task.id },
          [
            { value: task.due_date, label: `Manter ${formatBr(task.due_date)}` },
            { value: c.due.date, label: `Alterar para ${formatBr(c.due.date)}` }
          ]
        );
        this.confirmations.push(conf);
        this.ops.push({ kind: 'confirmacao', title: conf.question, excerpt: c.excerpt, details: [], confirmation_id: conf.id, task_id: task.id });
      } else {
        patch.due_date = c.due.date;
        patch.due_time = c.due.time;
        patch.due_note = `"${c.due.raw}" — ${c.due.note}`;
        cert.due_date = c.due.certainty;
        details.push(`${task.due_date ? `Prazo alterado de ${formatBr(task.due_date)} para` : 'Prazo definido:'} ${formatBr(c.due.date)} (${CERTAINTY_LABEL[c.due.certainty].toLowerCase()})`);
      }
    }
    if (c.responsible && !task.responsible) {
      patch.responsible = c.responsible.value;
      cert.responsible = c.responsible.certainty;
      details.push(`Responsável: ${c.responsible.value}`);
    }
    const newPeople = c.involved.filter((p) => !task.involved.some((i) => normalize(i) === normalize(p)) && normalize(p) !== normalize(task.responsible ?? ''));
    if (newPeople.length) {
      patch.involved = [...task.involved, ...newPeople];
      details.push(`Envolvidos adicionados: ${newPeople.join(', ')}`);
    }
    if (c.project?.id != null && task.project_id == null) {
      patch.project_id = c.project.id;
      cert.project = c.project.certainty;
      details.push(`Projeto: ${c.project.name}`);
    }
    if (c.impact && c.impact.certainty === 'explicita' && task.impact !== c.impact.value && task.certainty.impact !== 'explicita') {
      patch.impact = c.impact.value;
      cert.impact = 'explicita';
      details.push(`Impacto: ${c.impact.value}`);
    }
    if (c.statusCue === 'em_andamento' && task.status === 'pendente') {
      patch.status = 'em_andamento';
      details.push('Status: em andamento');
    }
    if (Object.keys(patch).length) {
      patch.certainty = cert;
      updateTask(this.ctx, task.id, patch, this.meta, `Atualizada pela captura${this.captureId ? ` #${this.captureId}` : ''}`);
    }
    this.refToTask.set(c.ref, task.id);
    if ((c.statusCue === 'concluida' || c.statusCue === 'cancelada') && task.status !== c.statusCue && task.status !== 'concluida') {
      const done = c.statusCue === 'concluida';
      const conf = insertConfirmation(
        this.ctx,
        this.captureId,
        done ? 'conclusao' : 'cancelamento',
        done ? `O texto indica que "${task.title}" foi concluída. Confirmar conclusão?` : `O texto indica que "${task.title}" foi cancelada. Confirmar cancelamento?`,
        { task_id: task.id, excerpt: c.excerpt },
        done
          ? [
              { value: 'concluir', label: 'Confirmar conclusão' },
              { value: 'manter', label: 'Manter em aberto' }
            ]
          : [
              { value: 'cancelar', label: 'Confirmar cancelamento' },
              { value: 'manter', label: 'Manter em aberto' }
            ]
      );
      this.confirmations.push(conf);
      this.ops.push({ kind: 'confirmacao', title: conf.question, excerpt: c.excerpt, details: [`Trecho: "${c.excerpt}"`], confirmation_id: conf.id, task_id: task.id });
    }
    const updated = getTask(this.ctx, task.id);
    const beforeOps = this.ops.length;
    this.afterTask(updated, { ...c, due: Object.keys(patch).includes('due_date') ? c.due : null });
    const extra = this.ops.length > beforeOps;
    if (details.length) {
      this.ops.push({ kind: 'atualizacao', title: task.title, excerpt: c.excerpt, details: [...details, `Correspondência: ${Math.round(score * 100)}%`], task_id: task.id });
    } else if (!extra && !this.confirmations.some((x) => x.payload?.task_id === task.id)) {
      this.ops.push({
        kind: 'ja_registrada',
        title: task.title,
        excerpt: c.excerpt,
        details: [task.status === 'concluida' ? 'Corresponde a uma tarefa já concluída; nada foi alterado.' : 'Nenhuma informação nova; nada foi alterado.', `Correspondência: ${Math.round(score * 100)}%`],
        task_id: task.id
      });
    }
  }

  handleEvent(c: Candidate) {
    const ev = c.event!;
    const dateOptions = ev.dateAlternatives ?? (ev.date ? [ev.date] : []);
    const timeOptions = ev.timeAlternatives ?? [ev.start];
    if (!ev.date || (ev.dateAlternatives?.length ?? 0) > 1 || (ev.timeAlternatives?.length ?? 0) > 1) {
      const options: Confirmation['options'] = [];
      for (const d of dateOptions) for (const t of timeOptions) options.push({ value: `${d}|${t ?? ''}`, label: `${formatBr(d)}${t ? ` às ${t}` : ' (dia inteiro)'}` });
      options.push({ value: 'ignorar', label: 'Não criar evento' });
      const conf = insertConfirmation(
        this.ctx,
        this.captureId,
        (ev.timeAlternatives?.length ?? 0) > 1 ? 'horario_ambiguo' : 'data_ambigua',
        ev.date ? `Quando acontece "${c.title}"?` : `"${c.title}" não tem data no texto. Informe a data para registrar o evento.`,
        { event: { ...ev, title: c.title, participants: ev.participants, original_text: c.excerpt, project_id: c.project?.id ?? null }, allow_custom_date: !ev.date },
        options
      );
      this.confirmations.push(conf);
      this.ops.push({ kind: 'confirmacao', title: conf.question, excerpt: c.excerpt, details: ['O evento será criado após a confirmação.'], confirmation_id: conf.id });
      return;
    }
    const dup = listEvents(this.ctx).find((e) => similarity(e.title, c.title) >= 0.8 && e.start_at.slice(0, 10) === zonedToUtc(ev.date!, ev.start ?? '12:00', this.ctx.tz).slice(0, 10));
    if (dup) {
      this.ops.push({ kind: 'ja_registrada', title: dup.title, excerpt: c.excerpt, details: ['Evento já existe na agenda nesta data.'], event_id: dup.id });
      return;
    }
    this.ops.push(createEventFromDraft(this.ctx, { ...ev, title: c.title, original_text: c.excerpt, project_id: c.project?.id ?? null }, ev.date, ev.start, this.meta, this.captureId, this.origin));
  }
}

export function createEventFromDraft(
  ctx: Ctx,
  ev: { type: any; title: string; end: string | null; participants: string[]; location: string | null; original_text: string; project_id: number | null },
  date: string,
  start: string | null,
  meta: Meta,
  captureId: number | null,
  origin: Task['origin']
): CaptureOperation {
  const startAt = start ? zonedToUtc(date, start, ctx.tz) : zonedToUtc(date, '00:00', ctx.tz);
  const endAt = start && ev.end ? zonedToUtc(date, ev.end, ctx.tz) : null;
  const { event, conflicts } = createEvent(
    ctx,
    {
      title: ev.title,
      type: ev.type,
      start_at: startAt,
      end_at: endAt,
      all_day: !start,
      location: ev.location,
      participants: ev.participants,
      project_id: ev.project_id,
      origin,
      capture_id: captureId,
      original_text: ev.original_text
    },
    meta
  );
  const details = [
    `Tipo: ${EVENT_TYPE_LABEL[event.type]}`,
    `Data: ${formatBr(date)}${start ? ` às ${start}` : ' (horário não informado — registrado como dia inteiro)'}`,
    `Término: ${ev.end ?? 'não informado'}`,
    `Participantes: ${ev.participants.length ? ev.participants.join(', ') : 'não informados'}`,
    `Local: ${ev.location ?? 'não informado'}`
  ];
  for (const c of conflicts) details.push(`Conflito de horário com "${c.title}".`);
  return { kind: 'novo_evento', title: event.title, excerpt: ev.original_text, details, event_id: event.id };
}

function emptyStats(): CaptureResult['stats'] {
  return { nova_tarefa: 0, atualizacao: 0, ja_registrada: 0, novo_evento: 0, nova_espera: 0, novo_projeto: 0, dependencia: 0, confirmacao: 0, candidatos: 0, mensagens: 0 };
}

export function processCapture(ctx: Ctx, input: CaptureInput): CaptureResult {
  const text = input.text.trim();
  if (!text) throw new AppError(400, 'texto_vazio', 'Cole um texto ou importe um arquivo para analisar.');
  if (text.length > 200_000) throw new AppError(413, 'texto_grande', 'O texto excede 200.000 caracteres. Divida a captura em partes.');
  const referenceDate = input.reference_date ?? today(ctx);
  const run = (): CaptureResult => {
    const projects = listProjects(ctx).map((p) => ({ id: p.id, name: p.name, keywords: p.keywords }));
    const extraction = extract(text, { referenceDate, projects, people: knownPeople(ctx) });
    let captureId: number | null = null;
    captureId = Number(
      ctx.db
        .prepare('INSERT INTO captures (raw_text, source_type, document_id, reference_date, created_at) VALUES (?,?,?,?,?)')
        .run(text, input.source_type ?? 'texto', input.document_id ?? null, referenceDate, nowIso(ctx)).lastInsertRowid
    );
    const meta: Meta = { source: input.source_type === 'arquivo' ? 'arquivo importado' : 'captura inteligente', capture_id: captureId };
    const r = new CaptureRun(ctx, meta, captureId, input.source_type === 'arquivo' ? 'arquivo' : 'captura');
    const ignored = [...extraction.ignored];

    for (const c of extraction.candidates) {
      if (c.kind === 'event') {
        r.handleEvent(c);
        continue;
      }
      // Itens criados nesta mesma captura já foram deduplicados na extração.
      const tasks = listTasks(ctx).filter((t) => !r.createdTaskIds.has(t.id));
      const decision = decide(
        rankMatches({ title: c.title, project_id: c.project?.id ?? null, people: [c.responsible?.value, ...c.involved].filter(Boolean) as string[] }, tasks)
      );
      if (decision.kind === 'clear') {
        r.applyUpdate(decision.match.task, c, decision.match.score);
        continue;
      }
      if (c.kind === 'info') {
        if (decision.kind === 'ambiguous') {
          ignored.push({ text: c.excerpt, reason: `Parece se referir a "${decision.options[0].task.title}", mas a correspondência não é segura; nada foi alterado.` });
        } else if (c.waitingOn) {
          const what = c.title
            .replace(/^(?:ainda\s+)?(?:aguardando|esperando|depende d[eao]s?|dependendo d[eao]s?)\s+/i, '')
            .replace(new RegExp(`^(?:[ao]\\s+)?${c.waitingOn.party}\\s*`, 'i'), '')
            .trim();
          r.createTaskFrom({ ...c, nextAction: `Acompanhar retorno de ${c.waitingOn.party}` }, `Acompanhar ${c.waitingOn.party}: ${what || c.title}`);
        } else {
          ignored.push({ text: c.excerpt, reason: 'Informação sem correspondência com tarefas existentes.' });
        }
        continue;
      }
      if (decision.kind === 'ambiguous') {
        const conf = insertConfirmation(
          ctx,
          captureId,
          'possivel_duplicidade',
          `"${c.title}" parece corresponder a uma tarefa existente. Como registrar?`,
          { candidate: c, project_id: c.project?.id ?? null, parent_task_id: c.parentRef != null ? (r.refToTask.get(c.parentRef) ?? null) : null, reference_date: referenceDate },
          [
            ...decision.options.map((m) => ({ value: `match:${m.task.id}`, label: `Atualizar "${m.task.title}" (${Math.round(m.score * 100)}%)` })),
            { value: 'nova', label: 'Criar como nova tarefa' },
            { value: 'ignorar', label: 'Ignorar este item' }
          ]
        );
        r.confirmations.push(conf);
        r.ops.push({ kind: 'confirmacao', title: conf.question, excerpt: c.excerpt, details: decision.options.map((m) => `Possível correspondência: "${m.task.title}"`), confirmation_id: conf.id });
        continue;
      }
      r.createTaskFrom(c);
    }

    // Sequência de execução identificada na mesma frase.
    for (const c of extraction.candidates) {
      const blockedId = r.refToTask.get(c.ref);
      if (!blockedId) continue;
      for (const dep of c.dependsOnRefs) {
        const blockerId = r.refToTask.get(dep);
        if (!blockerId || blockerId === blockedId) continue;
        const exists = ctx.db.prepare('SELECT 1 FROM task_links WHERE blocker_id = ? AND blocked_id = ?').get(blockerId, blockedId);
        const reverse = ctx.db.prepare('SELECT 1 FROM tasks WHERE id = ? AND parent_id = ?').get(blockerId, blockedId);
        if (exists || reverse) continue;
        try {
          addLink(ctx, blockerId, blockedId, 'inferida', 'Sequência identificada na mesma frase da captura.', meta);
          r.ops.push({
            kind: 'dependencia',
            title: `"${getTask(ctx, blockedId).title}" depende de "${getTask(ctx, blockerId).title}"`,
            excerpt: c.excerpt,
            details: ['Dependência inferida pela ordem das ações na frase.'],
            task_id: blockedId
          });
        } catch (err) {
          if (!(err instanceof AppError)) throw err;
        }
      }
    }

    recomputePriorities(ctx);
    const stats = emptyStats();
    for (const op of r.ops) stats[op.kind]++;
    stats.candidatos = extraction.candidates.length;
    stats.mensagens = extraction.messages;
    const result: CaptureResult = {
      capture_id: captureId,
      dry_run: !!input.dry_run,
      reference_date: referenceDate,
      operations: r.ops,
      ignored,
      confirmations: r.confirmations,
      stats
    };
    ctx.db.prepare('UPDATE captures SET summary = ? WHERE id = ?').run(JSON.stringify({ stats, operations: r.ops.length }), captureId);
    return result;
  };
  if (input.dry_run) {
    const res = dryRun(ctx.db, run);
    return { ...res, capture_id: null, confirmations: res.confirmations.map((c) => ({ ...c, id: 0 })) };
  }
  return transaction(ctx.db, run);
}

export function listCaptures(ctx: Ctx, limit = 50) {
  return (ctx.db.prepare('SELECT id, source_type, document_id, reference_date, summary, created_at, substr(raw_text, 1, 280) AS preview, length(raw_text) AS length FROM captures ORDER BY id DESC LIMIT ?').all(limit) as any[]).map(
    (r) => ({ ...r, summary: JSON.parse(r.summary) })
  );
}

export function getCapture(ctx: Ctx, id: number) {
  const row = ctx.db.prepare('SELECT * FROM captures WHERE id = ?').get(id) as any;
  if (!row) throw notFound('Captura');
  return { ...row, summary: JSON.parse(row.summary) };
}

export function listConfirmations(ctx: Ctx, status = 'pendente'): Confirmation[] {
  return (ctx.db.prepare('SELECT * FROM confirmations WHERE status = ? ORDER BY id DESC').all(status) as any[]).map(toConfirmation);
}

/** Aplica a resposta do usuário a uma confirmação pendente. */
export function resolveConfirmation(ctx: Ctx, id: number, value: string): { confirmation: Confirmation; operations: CaptureOperation[] } {
  const row = ctx.db.prepare('SELECT * FROM confirmations WHERE id = ?').get(id);
  if (!row) throw notFound('Confirmação');
  const conf = toConfirmation(row as any);
  if (conf.status !== 'pendente') throw new AppError(409, 'ja_resolvida', 'Esta confirmação já foi respondida.');
  const custom = value.startsWith('data:') && conf.payload?.allow_custom_date;
  if (!custom && !conf.options.some((o) => o.value === value)) throw new AppError(400, 'opcao_invalida', 'Opção inválida para esta confirmação.');
  const meta: Meta = { source: 'confirmação do usuário', capture_id: conf.capture_id };
  const r = new CaptureRun(ctx, meta, conf.capture_id, 'captura');
  return transaction(ctx.db, () => {
    if (value !== 'ignorar' && value !== 'manter') {
      if (conf.kind === 'possivel_duplicidade') {
        const c = conf.payload.candidate as Candidate;
        if (conf.payload.parent_task_id != null && c.parentRef != null) r.refToTask.set(c.parentRef, conf.payload.parent_task_id);
        if (value === 'nova') r.createTaskFrom(c);
        else r.applyUpdate(getTask(ctx, Number(value.split(':')[1])), c, 1);
      } else if (conf.kind === 'data_ambigua' && conf.payload.task_id) {
        const task = getTask(ctx, conf.payload.task_id);
        updateTask(ctx, task.id, { due_date: value, certainty: { ...task.certainty, due_date: 'confirmada' } }, meta, 'Prazo confirmado pelo usuário');
        r.ops.push({ kind: 'atualizacao', title: task.title, excerpt: null, details: [`Prazo confirmado: ${formatBr(value)}`], task_id: task.id });
      } else if (conf.payload.event) {
        let date: string;
        let start: string | null;
        if (custom) {
          date = value.slice(5, 15);
          start = conf.payload.event.start ?? null;
        } else {
          const [d, t] = value.split('|');
          date = d;
          start = t || null;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError(400, 'data_invalida', 'Data inválida.');
        r.ops.push(createEventFromDraft(ctx, conf.payload.event, date, start, meta, conf.capture_id, 'captura'));
      } else if (conf.kind === 'conclusao') {
        changeStatus(ctx, conf.payload.task_id, 'concluida', {}, meta);
        r.ops.push({ kind: 'atualizacao', title: getTask(ctx, conf.payload.task_id).title, excerpt: null, details: ['Conclusão confirmada pelo usuário.'], task_id: conf.payload.task_id });
      } else if (conf.kind === 'cancelamento') {
        changeStatus(ctx, conf.payload.task_id, 'cancelada', {}, meta);
        r.ops.push({ kind: 'atualizacao', title: getTask(ctx, conf.payload.task_id).title, excerpt: null, details: ['Cancelamento confirmado pelo usuário.'], task_id: conf.payload.task_id });
      }
    }
    ctx.db.prepare("UPDATE confirmations SET status = 'resolvida', resolution = ?, resolved_at = ? WHERE id = ?").run(value, nowIso(ctx), id);
    recomputePriorities(ctx);
    return { confirmation: toConfirmation(ctx.db.prepare('SELECT * FROM confirmations WHERE id = ?').get(id) as any), operations: r.ops };
  });
}
