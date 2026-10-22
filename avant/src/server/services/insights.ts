// Inteligência operacional: visão enriquecida, foco do dia, recomendações, alertas, relatórios e pesquisa.
import type { CalendarEvent, Priority, Recommendation, Task, TaskLink, Wait } from '../../shared/types';
import { OPEN_STATUSES, PRIORITY_LABEL } from '../../shared/types';
import { Ctx, today } from '../context';
import { addDays, dateInTz, diffDays, formatBr, startOfWeek } from '../domain/dates';
import { findConflicts } from '../domain/agenda';
import { findDuplicatePairs } from '../domain/matching';
import { isOpen } from '../domain/priority';
import { computeProgress, subtree } from '../domain/progress';
import { normalize } from '../domain/text';
import { listConfirmations } from './captures';
import { listDocuments } from './documents-core';
import { listEvents } from './events';
import { listProjects, summarizeProject } from './projects';
import { effectivePriority, listLinks, listTasks } from './tasks';
import { listWaits } from './waits';

const RANK: Record<Priority, number> = { critica: 0, alta: 1, normal: 2, baixa: 3 };

export interface TaskView extends Task {
  effective_priority: Priority;
  project_name: string | null;
  parent_title: string | null;
  blockers: { id: number; title: string; status: string; certainty: string; link_id: number }[];
  dependents: { id: number; title: string; status: string; certainty: string; link_id: number }[];
  children: { total: number; open: number; progress: number | null };
  waits: Wait[];
  is_blocked: boolean;
  days_to_due: number | null;
}

interface Snapshot {
  tasks: Task[];
  links: TaskLink[];
  waits: Wait[];
  projects: ReturnType<typeof listProjects>;
  events: CalendarEvent[];
  today: string;
}

function snapshot(ctx: Ctx): Snapshot {
  return { tasks: listTasks(ctx), links: listLinks(ctx), waits: listWaits(ctx), projects: listProjects(ctx), events: listEvents(ctx), today: today(ctx) };
}

export function buildViews(s: Snapshot): TaskView[] {
  const byId = new Map(s.tasks.map((t) => [t.id, t]));
  const projectName = new Map(s.projects.map((p) => [p.id, p.name]));
  return s.tasks.map((t) => {
    const blockers = s.links
      .filter((l) => l.blocked_id === t.id)
      .map((l) => ({ link: l, t: byId.get(l.blocker_id)! }))
      .filter((x) => x.t)
      .map(({ link, t: b }) => ({ id: b.id, title: b.title, status: b.status, certainty: link.certainty, link_id: link.id }));
    const dependents = s.links
      .filter((l) => l.blocker_id === t.id)
      .map((l) => ({ link: l, t: byId.get(l.blocked_id)! }))
      .filter((x) => x.t)
      .map(({ link, t: d }) => ({ id: d.id, title: d.title, status: d.status, certainty: link.certainty, link_id: link.id }));
    const kids = s.tasks.filter((c) => c.parent_id === t.id);
    const tree = subtree(t.id, s.tasks).filter((x) => x.id !== t.id);
    return {
      ...t,
      effective_priority: effectivePriority(t),
      project_name: t.project_id ? (projectName.get(t.project_id) ?? null) : null,
      parent_title: t.parent_id ? (byId.get(t.parent_id)?.title ?? null) : null,
      blockers,
      dependents,
      children: { total: kids.length, open: kids.filter(isOpen).length, progress: tree.length ? computeProgress(tree).percent : null },
      waits: s.waits.filter((w) => w.task_id === t.id),
      is_blocked: blockers.some((b) => OPEN_STATUSES.includes(b.status as any)),
      days_to_due: t.due_date ? diffDays(s.today, t.due_date) : null
    };
  });
}

export function sortByRecommendation(a: TaskView, b: TaskView): number {
  return Number(a.is_blocked) - Number(b.is_blocked) || RANK[a.effective_priority] - RANK[b.effective_priority] || b.priority_score - a.priority_score || a.id - b.id;
}

export interface TaskQuery {
  q?: string;
  priority?: string;
  status?: string;
  project_id?: string;
  responsible?: string;
  category?: string;
  origin?: string;
  due?: 'atrasadas' | 'hoje' | 'semana' | 'sem_prazo' | 'inferidas';
  deps?: 'bloqueadas' | 'bloqueiam' | 'terceiros' | 'sem';
  from?: string;
  to?: string;
  sort?: 'recomendada' | 'prioridade' | 'prazo' | 'impacto' | 'recentes';
  include_closed?: string;
}

export function queryTasks(ctx: Ctx, q: TaskQuery): TaskView[] {
  const s = snapshot(ctx);
  let views = buildViews(s);
  const list = (v?: string) => (v ? v.split(',').filter(Boolean) : []);
  const statuses = list(q.status);
  if (statuses.length) views = views.filter((t) => statuses.includes(t.status));
  else if (q.include_closed !== '1') views = views.filter((t) => isOpen(t));
  const prios = list(q.priority);
  if (prios.length) views = views.filter((t) => prios.includes(t.effective_priority));
  const projects = list(q.project_id);
  if (projects.length) views = views.filter((t) => projects.includes(t.project_id == null ? 'none' : String(t.project_id)));
  if (q.responsible) {
    const r = normalize(q.responsible);
    views = views.filter((t) => [t.responsible, ...t.involved].some((p) => p && normalize(p).includes(r)));
  }
  if (q.category) views = views.filter((t) => t.category === q.category);
  if (q.origin) views = views.filter((t) => t.origin === q.origin);
  if (q.due === 'atrasadas') views = views.filter((t) => t.days_to_due != null && t.days_to_due < 0);
  if (q.due === 'hoje') views = views.filter((t) => t.days_to_due === 0);
  if (q.due === 'semana') views = views.filter((t) => t.days_to_due != null && t.days_to_due >= 0 && t.days_to_due <= 7);
  if (q.due === 'sem_prazo') views = views.filter((t) => !t.due_date);
  if (q.due === 'inferidas') views = views.filter((t) => t.due_date && t.certainty.due_date === 'inferida');
  if (q.from) views = views.filter((t) => t.due_date && t.due_date >= q.from!);
  if (q.to) views = views.filter((t) => t.due_date && t.due_date <= q.to!);
  if (q.deps === 'bloqueadas') views = views.filter((t) => t.is_blocked);
  if (q.deps === 'bloqueiam') views = views.filter((t) => t.dependents.some((d) => OPEN_STATUSES.includes(d.status as any)));
  if (q.deps === 'terceiros') views = views.filter((t) => t.waits.some((w) => w.status === 'aguardando'));
  if (q.deps === 'sem') views = views.filter((t) => !t.blockers.length && !t.dependents.length && !t.waits.length);
  if (q.q) {
    const needle = normalize(q.q);
    views = views.filter((t) =>
      normalize([t.title, t.description, t.responsible, ...t.involved, t.category, t.project_name, t.original_text, t.next_action].filter(Boolean).join(' ')).includes(needle)
    );
  }
  const impactRank = { alto: 0, medio: 1, baixo: 2 } as const;
  switch (q.sort ?? 'recomendada') {
    case 'prioridade':
      views.sort((a, b) => RANK[a.effective_priority] - RANK[b.effective_priority] || b.priority_score - a.priority_score);
      break;
    case 'prazo':
      views.sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || RANK[a.effective_priority] - RANK[b.effective_priority]);
      break;
    case 'impacto':
      views.sort((a, b) => (a.impact ? impactRank[a.impact] : 3) - (b.impact ? impactRank[b.impact] : 3) || b.priority_score - a.priority_score);
      break;
    case 'recentes':
      views.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      break;
    default:
      views.sort(sortByRecommendation);
  }
  return views;
}

// ---------------------------------------------------------------------------
// Foco de hoje

export interface FocusItem {
  task: TaskView;
  why: string[];
}

export function focusToday(ctx: Ctx, s: Snapshot = snapshot(ctx), limit = 7): FocusItem[] {
  const views = buildViews(s).filter((t) => isOpen(t));
  const parents = new Set(views.filter((t) => t.parent_id != null && isOpen(t)).map((t) => t.parent_id));
  return views
    .filter((t) => !t.is_blocked && !parents.has(t.id))
    .sort(sortByRecommendation)
    .slice(0, limit)
    .map((t) => ({
      task: t,
      why: t.priority_reasons
        .filter((r) => r.points > 0)
        .sort((a, b) => b.points - a.points)
        .slice(0, 3)
        .map((r) => r.text)
    }));
}

// ---------------------------------------------------------------------------
// Recomendações

export function recommendations(ctx: Ctx, s: Snapshot = snapshot(ctx)): Recommendation[] {
  const recs: Recommendation[] = [];
  const views = buildViews(s);
  const open = views.filter((t) => isOpen(t));
  const ev = (t: { id: number; title: string }) => ({ type: 'task' as const, id: t.id, label: t.title });

  for (const t of open) {
    if (t.days_to_due != null && t.days_to_due < 0) {
      recs.push({
        key: `atrasada:${t.id}:${t.due_date}`,
        kind: 'atrasada',
        severity: 'alta',
        message: `"${t.title}" está atrasada há ${-t.days_to_due} dia(s).`,
        reason: `Prazo ${t.certainty.due_date === 'inferida' ? 'inferido' : 'registrado'} em ${formatBr(t.due_date!)}. Conclua, renegocie ou confirme a data.`,
        evidence: [ev(t)]
      });
    }
    if (t.days_to_due != null && t.days_to_due >= 0 && t.days_to_due <= 5) {
      const pend = [...t.blockers.filter((b) => OPEN_STATUSES.includes(b.status as any)), ...(t.children.open ? views.filter((c) => c.parent_id === t.id && isOpen(c)) : [])];
      if (pend.length) {
        recs.push({
          key: `prazo_dependencias:${t.id}:${pend.length}`,
          kind: 'prazo_com_dependencias',
          severity: 'alta',
          message: `Esta entrega possui prazo próximo e ainda depende de ${pend.length} tarefa(s): "${t.title}".`,
          reason: `Vence em ${t.days_to_due} dia(s) (${formatBr(t.due_date!)}) e há dependências ou subtarefas em aberto.`,
          evidence: [ev(t), ...pend.map((p) => ev(p))]
        });
      }
    }
    if (t.due_date && t.certainty.due_date === 'inferida') {
      recs.push({
        key: `data_inferida:${t.id}:${t.due_date}`,
        kind: 'data_inferida',
        severity: t.days_to_due != null && t.days_to_due <= 3 ? 'alta' : 'media',
        message: `A data registrada para "${t.title}" foi inferida e precisa de confirmação.`,
        reason: t.due_note ? (/^anota/i.test(t.due_note) ? t.due_note : `Anotação original: ${t.due_note}`) : `Data interpretada: ${formatBr(t.due_date)}.`,
        evidence: [ev(t)]
      });
    }
  }

  // Várias pendências aguardando a mesma pessoa
  const byParty = new Map<string, Wait[]>();
  for (const w of s.waits.filter((w) => w.status === 'aguardando')) byParty.set(normalize(w.party), [...(byParty.get(normalize(w.party)) ?? []), w]);
  for (const ws of byParty.values()) {
    if (ws.length >= 2) {
      recs.push({
        key: `mesma_pessoa:${normalize(ws[0].party)}:${ws.map((w) => w.id).join('-')}`,
        kind: 'mesma_pessoa',
        severity: 'media',
        message: `Existem ${ws.length} pendências aguardando ${ws[0].party}.`,
        reason: 'Um único contato pode resolver vários itens de uma vez.',
        evidence: ws.map((w) => ({ type: 'wait' as const, id: w.id, label: w.description }))
      });
    }
  }
  for (const w of s.waits.filter((w) => w.status === 'aguardando')) {
    const due = (w.follow_up_at && w.follow_up_at <= s.today) || (w.expected_at && w.expected_at < s.today);
    if (due) {
      recs.push({
        key: `acompanhamento:${w.id}:${w.follow_up_at ?? w.expected_at}`,
        kind: 'acompanhamento_vencido',
        severity: 'alta',
        message: `O acompanhamento com ${w.party} está vencido.`,
        reason: `${w.description}${w.follow_up_at ? ` — acompanhamento previsto para ${formatBr(w.follow_up_at)}` : ''}${w.expected_at ? ` — retorno esperado em ${formatBr(w.expected_at)}` : ''}.`,
        evidence: [{ type: 'wait', id: w.id, label: w.description }]
      });
    } else if (!w.follow_up_at && !w.expected_at) {
      const t = w.task_id ? views.find((v) => v.id === w.task_id) : null;
      recs.push({
        key: `sem_acompanhamento:${w.id}`,
        kind: 'sem_data_acompanhamento',
        severity: 'baixa',
        message: `Defina quando acompanhar ${w.party}.`,
        reason: `"${w.description}" não tem prazo esperado nem data de acompanhamento.${t && t.dependents.length ? ` Esta entrega depende dessa liberação.` : ''}`,
        evidence: [{ type: 'wait', id: w.id, label: w.description }]
      });
    }
  }

  // Duplicidades
  for (const d of findDuplicatePairs(open)) {
    recs.push({
      key: `duplicidade:${Math.min(d.a.id, d.b.id)}-${Math.max(d.a.id, d.b.id)}`,
      kind: 'possivel_duplicidade',
      severity: 'media',
      message: 'Duas tarefas parecem representar a mesma entrega.',
      reason: `"${d.a.title}" e "${d.b.title}" têm ${Math.round(d.score * 100)}% de semelhança. Avalie se devem ser unificadas ou relacionadas.`,
      evidence: [ev(d.a), ev(d.b)]
    });
  }

  // Projetos sem próxima ação
  for (const p of s.projects.filter((p) => p.status === 'ativo')) {
    const sum = summarizeProjectFromSnapshot(ctx, p, s);
    if (!sum.next_action) {
      recs.push({
        key: `projeto_sem_acao:${p.id}:${sum.open}`,
        kind: 'projeto_sem_proxima_acao',
        severity: 'media',
        message: `O projeto "${p.name}" não possui próxima ação definida.`,
        reason: sum.open ? 'Todas as tarefas abertas estão bloqueadas.' : 'Não há tarefas abertas no projeto.',
        evidence: [{ type: 'project', id: p.id, label: p.name }]
      });
    }
  }

  // Tarefa rápida antes do próximo compromisso
  const now = ctx.now().getTime();
  const nextEvent = s.events.find((e) => !e.all_day && Date.parse(e.start_at) > now && Date.parse(e.start_at) - now < 24 * 3600000);
  const quick = open.find((t) => t.effort === 'baixo' && !t.is_blocked);
  if (nextEvent && quick) {
    recs.push({
      key: `rapida_antes:${quick.id}:${nextEvent.id}`,
      kind: 'tarefa_rapida',
      severity: 'baixa',
      message: 'Uma tarefa de baixo esforço pode ser concluída antes do próximo compromisso.',
      reason: `"${quick.title}" tem esforço baixo e o próximo compromisso é "${nextEvent.title}".`,
      evidence: [ev(quick), { type: 'event', id: nextEvent.id, label: nextEvent.title }]
    });
  }

  // Dependências inferidas
  for (const l of s.links.filter((l) => l.certainty === 'inferida')) {
    const a = views.find((t) => t.id === l.blocker_id);
    const b = views.find((t) => t.id === l.blocked_id);
    if (!a || !b || !isOpen(b)) continue;
    recs.push({
      key: `dependencia_inferida:${l.id}`,
      kind: 'dependencia_inferida',
      severity: 'baixa',
      message: `Confirme se "${b.title}" depende de "${a.title}".`,
      reason: l.note ?? 'A dependência foi inferida e ainda não foi confirmada.',
      evidence: [ev(a), ev(b)]
    });
  }

  // Tarefas sem próxima ação ou sem projeto
  const noAction = open.filter((t) => !t.next_action && !t.children.total);
  if (noAction.length) {
    recs.push({
      key: `sem_proxima_acao:${noAction.map((t) => t.id).join('-')}`,
      kind: 'sem_proxima_acao',
      severity: 'baixa',
      message: `${noAction.length} tarefa(s) sem próxima ação definida.`,
      reason: 'Definir o próximo passo concreto facilita a execução.',
      evidence: noAction.slice(0, 8).map(ev)
    });
  }

  const dismissed = new Set((ctx.db.prepare('SELECT key FROM dismissed_recommendations').all() as { key: string }[]).map((r) => r.key));
  const sevRank = { alta: 0, media: 1, baixa: 2 };
  return recs.filter((r) => !dismissed.has(r.key)).sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
}

function summarizeProjectFromSnapshot(ctx: Ctx, p: Snapshot['projects'][number], s: Snapshot) {
  return summarizeProject(ctx, p, s.tasks);
}

export function dismissRecommendation(ctx: Ctx, key: string): void {
  ctx.db.prepare('INSERT OR IGNORE INTO dismissed_recommendations (key, created_at) VALUES (?, ?)').run(key, ctx.now().toISOString());
}

// ---------------------------------------------------------------------------
// Alertas operacionais

export interface Alert {
  kind: 'conflito_agenda' | 'dependencia_terceiro' | 'data_ambigua' | 'sem_proxima_acao' | 'confirmacao_pendente' | 'atrasada';
  message: string;
  refs: { type: 'task' | 'event' | 'wait' | 'confirmation'; id: number }[];
}

export function alerts(ctx: Ctx, s: Snapshot = snapshot(ctx)): Alert[] {
  const out: Alert[] = [];
  const views = buildViews(s);
  const eventsById = new Map(s.events.map((e) => [e.id, e]));
  const upcoming = s.events.filter((e) => Date.parse(e.end_at ?? e.start_at) >= ctx.now().getTime() - 3600000);
  for (const c of findConflicts(upcoming)) {
    const a = eventsById.get(c.a)!;
    const b = eventsById.get(c.b)!;
    out.push({
      kind: 'conflito_agenda',
      message: `Conflito de horário entre "${a.title}" e "${b.title}"${c.assumed ? ' (término não informado; considerada 1 h)' : ''}.`,
      refs: [
        { type: 'event', id: a.id },
        { type: 'event', id: b.id }
      ]
    });
  }
  for (const t of views.filter((t) => isOpen(t) && t.is_blocked)) {
    const blockersWaiting = t.blockers
      .map((b) => views.find((v) => v.id === b.id)!)
      .filter((b) => b && b.waits.some((w) => w.status === 'aguardando'));
    if (blockersWaiting.length) {
      const parties = [...new Set(blockersWaiting.flatMap((b) => b.waits.filter((w) => w.status === 'aguardando').map((w) => w.party)))];
      out.push({
        kind: 'dependencia_terceiro',
        message: `"${t.title}" depende de uma liberação de terceiros (${parties.join(', ')}).`,
        refs: [{ type: 'task', id: t.id }, ...blockersWaiting.map((b) => ({ type: 'task' as const, id: b.id }))]
      });
    }
  }
  const overdue = views.filter((t) => isOpen(t) && t.days_to_due != null && t.days_to_due < 0);
  if (overdue.length) out.push({ kind: 'atrasada', message: `${overdue.length} tarefa(s) atrasada(s).`, refs: overdue.map((t) => ({ type: 'task' as const, id: t.id })) });
  const inferred = views.filter((t) => isOpen(t) && t.due_date && t.certainty.due_date === 'inferida');
  if (inferred.length) out.push({ kind: 'data_ambigua', message: `${inferred.length} prazo(s) inferido(s) aguardando confirmação.`, refs: inferred.map((t) => ({ type: 'task' as const, id: t.id })) });
  const noAction = views.filter((t) => isOpen(t) && !t.next_action && !t.children.total);
  if (noAction.length) out.push({ kind: 'sem_proxima_acao', message: `${noAction.length} tarefa(s) sem próxima ação.`, refs: noAction.map((t) => ({ type: 'task' as const, id: t.id })) });
  const pending = listConfirmations(ctx);
  if (pending.length) out.push({ kind: 'confirmacao_pendente', message: `${pending.length} confirmação(ões) da captura aguardando resposta.`, refs: pending.map((c) => ({ type: 'confirmation' as const, id: c.id })) });
  return out;
}

// ---------------------------------------------------------------------------
// Painel principal

export function dashboard(ctx: Ctx) {
  const s = snapshot(ctx);
  const views = buildViews(s);
  const open = views.filter((t) => isOpen(t));
  const horizon = addDays(s.today, 14);
  const nowMs = ctx.now().getTime();
  const upcomingEvents = s.events.filter((e) => Date.parse(e.end_at ?? e.start_at) >= nowMs && dateInTz(new Date(e.start_at), ctx.tz) <= horizon);
  const upcomingTasks = open.filter((t) => t.due_date && t.due_date >= s.today && t.due_date <= horizon).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const doneLast7 = views.filter((t) => t.status === 'concluida' && t.completed_at && dateInTz(new Date(t.completed_at), ctx.tz) >= addDays(s.today, -6)).length;
  const parents = new Set(open.filter((t) => t.parent_id != null).map((t) => t.parent_id));
  return {
    today: s.today,
    counts: {
      open: open.length,
      critical: open.filter((t) => t.effective_priority === 'critica').length,
      high: open.filter((t) => t.effective_priority === 'alta').length,
      overdue: open.filter((t) => t.days_to_due != null && t.days_to_due < 0).length,
      due_today: open.filter((t) => t.days_to_due === 0).length,
      waiting: s.waits.filter((w) => w.status === 'aguardando').length,
      blocked: open.filter((t) => t.is_blocked).length,
      inferred_dates: open.filter((t) => t.due_date && t.certainty.due_date === 'inferida').length,
      done_last_7_days: doneLast7,
      events_next_14_days: upcomingEvents.length
    },
    focus: focusToday(ctx, s),
    critical: open.filter((t) => t.effective_priority === 'critica').sort(sortByRecommendation),
    overdue: open.filter((t) => t.days_to_due != null && t.days_to_due < 0).sort((a, b) => a.days_to_due! - b.days_to_due!),
    due_today: open.filter((t) => t.days_to_due === 0),
    waiting: s.waits
      .filter((w) => w.status === 'aguardando')
      .map((w) => ({ ...w, task_title: w.task_id ? (views.find((t) => t.id === w.task_id)?.title ?? null) : null })),
    upcoming: { tasks: upcomingTasks, events: upcomingEvents },
    projects: s.projects.filter((p) => p.status === 'ativo').map((p) => summarizeProject(ctx, p, s.tasks)),
    quick_wins: open.filter((t) => t.effort === 'baixo' && !t.is_blocked && !parents.has(t.id)).sort(sortByRecommendation).slice(0, 5),
    alerts: alerts(ctx, s),
    recommendations: recommendations(ctx, s).slice(0, 12),
    confirmations: listConfirmations(ctx)
  };
}

// ---------------------------------------------------------------------------
// Relatórios

export function reports(ctx: Ctx) {
  const s = snapshot(ctx);
  const views = buildViews(s);
  const open = views.filter((t) => isOpen(t));
  const count = <T extends string>(items: T[]) => items.reduce<Record<string, number>>((acc, k) => ((acc[k] = (acc[k] ?? 0) + 1), acc), {});
  const weeks: { week: string; completed: number; created: number; captures: number }[] = [];
  const thisWeek = startOfWeek(s.today);
  const captures = ctx.db.prepare('SELECT created_at FROM captures').all() as { created_at: string }[];
  for (let i = 7; i >= 0; i--) {
    const start = addDays(thisWeek, -7 * i);
    const end = addDays(start, 7);
    const inWeek = (iso: string | null) => {
      if (!iso) return false;
      const d = dateInTz(new Date(iso), ctx.tz);
      return d >= start && d < end;
    };
    weeks.push({
      week: start,
      completed: views.filter((t) => t.status === 'concluida' && inWeek(t.completed_at)).length,
      created: views.filter((t) => inWeek(t.created_at)).length,
      captures: captures.filter((c) => inWeek(c.created_at)).length
    });
  }
  const completed = views.filter((t) => t.status === 'concluida' && t.completed_at);
  const leadTimes = completed.map((t) => diffDays(dateInTz(new Date(t.created_at), ctx.tz), dateInTz(new Date(t.completed_at!), ctx.tz)));
  return {
    today: s.today,
    totals: { tasks: views.length, open: open.length, completed: completed.length, cancelled: views.filter((t) => t.status === 'cancelada').length },
    by_status: count(views.map((t) => t.status)),
    by_priority: count(open.map((t) => t.effective_priority)),
    by_category: count(open.map((t) => t.category ?? 'Não informada')),
    by_responsible: count(open.map((t) => t.responsible ?? 'Não informado')),
    by_origin: count(views.map((t) => t.origin)),
    due_certainty: count(open.filter((t) => t.due_date).map((t) => t.certainty.due_date ?? 'explicita')),
    without_due: open.filter((t) => !t.due_date).length,
    overdue: open.filter((t) => t.days_to_due != null && t.days_to_due < 0).length,
    projects: s.projects.map((p) => summarizeProject(ctx, p, s.tasks)),
    waits_by_party: count(s.waits.filter((w) => w.status === 'aguardando').map((w) => w.party)),
    weeks,
    avg_lead_time_days: leadTimes.length ? Number((leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length).toFixed(1)) : null,
    priority_labels: PRIORITY_LABEL
  };
}

// ---------------------------------------------------------------------------
// Pesquisa global

export interface SearchHit {
  type: 'task' | 'project' | 'event' | 'document' | 'wait' | 'person';
  id: number | string;
  title: string;
  subtitle: string;
}

function snippet(text: string, needle: string): string {
  const n = normalize(text);
  const i = n.indexOf(needle);
  if (i < 0) return text.slice(0, 100);
  const start = Math.max(0, i - 40);
  return (start > 0 ? '…' : '') + text.slice(start, i + needle.length + 60).replace(/\s+/g, ' ') + (i + needle.length + 60 < text.length ? '…' : '');
}

export function search(ctx: Ctx, q: string, limit = 30): SearchHit[] {
  const needle = normalize(q);
  if (needle.length < 2) return [];
  const hits: SearchHit[] = [];
  const s = snapshot(ctx);
  const projectName = new Map(s.projects.map((p) => [p.id, p.name]));
  for (const t of s.tasks) {
    const text = [t.title, t.description, t.responsible, ...t.involved, t.category, t.original_text].filter(Boolean).join(' — ');
    if (normalize(text).includes(needle) || (t.project_id && normalize(projectName.get(t.project_id) ?? '').includes(needle))) {
      hits.push({ type: 'task', id: t.id, title: t.title, subtitle: [t.project_id ? projectName.get(t.project_id) : null, t.responsible, snippet(text, needle)].filter(Boolean).join(' · ') });
    }
  }
  for (const p of s.projects) {
    const text = [p.name, p.objective, p.description, ...p.owners].filter(Boolean).join(' — ');
    if (normalize(text).includes(needle)) hits.push({ type: 'project', id: p.id, title: p.name, subtitle: snippet(text, needle) });
  }
  for (const e of s.events) {
    const text = [e.title, e.location, e.notes, ...e.participants].filter(Boolean).join(' — ');
    if (normalize(text).includes(needle)) hits.push({ type: 'event', id: e.id, title: e.title, subtitle: `${formatBr(dateInTz(new Date(e.start_at), ctx.tz))} · ${snippet(text, needle)}` });
  }
  for (const w of s.waits) {
    const text = `${w.party} — ${w.description}`;
    if (normalize(text).includes(needle)) hits.push({ type: 'wait', id: w.id, title: `Aguardando ${w.party}`, subtitle: w.description });
  }
  const docs = ctx.db.prepare('SELECT id, filename, extracted_text FROM documents').all() as { id: number; filename: string; extracted_text: string | null }[];
  for (const d of docs) {
    const text = `${d.filename} ${d.extracted_text ?? ''}`;
    if (normalize(text).includes(needle)) hits.push({ type: 'document', id: d.id, title: d.filename, subtitle: snippet(d.extracted_text ?? d.filename, needle) });
  }
  const people = new Map<string, string>();
  for (const t of s.tasks) for (const p of [t.responsible, ...t.involved]) if (p && normalize(p).includes(needle)) people.set(normalize(p), p);
  for (const w of s.waits) if (normalize(w.party).includes(needle)) people.set(normalize(w.party), w.party);
  for (const p of people.values()) hits.unshift({ type: 'person', id: p, title: p, subtitle: 'Pessoa ou equipe' });
  return hits.slice(0, limit);
}

export function people(ctx: Ctx): string[] {
  const s = snapshot(ctx);
  const m = new Map<string, string>();
  for (const t of s.tasks) for (const p of [t.responsible, ...t.involved]) if (p) m.set(normalize(p), p);
  for (const w of s.waits) m.set(normalize(w.party), w.party);
  return [...m.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function categories(ctx: Ctx): string[] {
  return [...new Set(listTasks(ctx).map((t) => t.category).filter(Boolean) as string[])].sort();
}

export { listDocuments };
