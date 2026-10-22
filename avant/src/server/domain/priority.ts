// Motor de priorização determinístico e transparente.
import type { Level, Priority, PriorityReason, Task, TaskLink, Wait } from '../../shared/types';
import { OPEN_STATUSES } from '../../shared/types';
import { diffDays, formatBr } from './dates';

export const THRESHOLDS = { critica: 70, alta: 35, normal: 15 } as const;

export interface PriorityContext {
  tasks: Map<number, Task>;
  links: TaskLink[];
  waits: Wait[];
  today: string;
}

export interface PriorityResult {
  level: Priority;
  score: number;
  reasons: PriorityReason[];
}

export function levelFromScore(score: number): Priority {
  if (score >= THRESHOLDS.critica) return 'critica';
  if (score >= THRESHOLDS.alta) return 'alta';
  if (score >= THRESHOLDS.normal) return 'normal';
  return 'baixa';
}

export const isOpen = (t: Task) => OPEN_STATUSES.includes(t.status);

export function effectiveImpact(task: Task, tasks: Map<number, Task>): { impact: Level | null; inherited: boolean } {
  if (task.impact) return { impact: task.impact, inherited: false };
  let parent = task.parent_id ? tasks.get(task.parent_id) : undefined;
  for (let guard = 0; parent && guard < 10; guard++) {
    if (parent.impact) return { impact: parent.impact, inherited: true };
    parent = parent.parent_id ? tasks.get(parent.parent_id) : undefined;
  }
  return { impact: null, inherited: false };
}

function dueBand(days: number): { points: number; text: string } {
  if (days < 0) {
    const late = -days;
    return { points: 50 + Math.min(late * 3, 25), text: `Atrasada há ${late} dia${late > 1 ? 's' : ''}.` };
  }
  if (days === 0) return { points: 42, text: 'Vence hoje.' };
  if (days === 1) return { points: 35, text: 'Vence amanhã.' };
  if (days <= 3) return { points: 26, text: `Vence em ${days} dias.` };
  if (days <= 7) return { points: 16, text: `Prazo em ${days} dias.` };
  if (days <= 14) return { points: 8, text: `Prazo em ${days} dias.` };
  return { points: 2, text: `Prazo distante (${days} dias).` };
}

/** Calcula prioridade, pontuação e justificativas de uma tarefa. */
export function computePriority(task: Task, ctx: PriorityContext): PriorityResult {
  const reasons: PriorityReason[] = [];
  const add = (points: number, text: string) => reasons.push({ points, text });

  // Impacto (próprio ou herdado da tarefa principal)
  const { impact, inherited } = effectiveImpact(task, ctx.tasks);
  const impactInferred = task.certainty.impact === 'inferida';
  const suffix = inherited ? ' (herdado da tarefa principal)' : impactInferred ? ' (impacto inferido, a confirmar)' : '';
  if (impact === 'alto') add(38, `Entrega de alto impacto${suffix}.`);
  else if (impact === 'medio') add(20, `Impacto moderado${suffix}.`);
  else if (impact === 'baixo') add(5, `Impacto baixo${suffix}.`);
  else add(15, 'Impacto ainda não informado.');

  // Prazo
  if (task.due_date) {
    const days = diffDays(ctx.today, task.due_date);
    const band = dueBand(days);
    const cert = task.certainty.due_date ?? 'explicita';
    if (cert === 'inferida' || cert === 'desconhecida') {
      add(Math.round(band.points * 0.75), `${band.text} Data inferida (${formatBr(task.due_date)}) — precisa de confirmação.`);
    } else {
      add(band.points, days >= 0 && days <= 7 ? `Prazo confirmado próximo: ${band.text.toLowerCase()}` : band.text);
    }
  } else {
    add(0, 'Sem prazo definido.');
  }

  // Tarefas que dependem desta
  const dependents = ctx.links
    .filter((l) => l.blocker_id === task.id)
    .map((l) => ({ link: l, t: ctx.tasks.get(l.blocked_id) }))
    .filter((d): d is { link: TaskLink; t: Task } => !!d.t && isOpen(d.t));
  if (dependents.length) {
    const inferredLink = dependents.some((d) => d.link.certainty === 'inferida');
    add(
      8 * Math.min(dependents.length, 3),
      `Tarefa necessária para concluir ${dependents.length === 1 ? `"${dependents[0].t.title}"` : `${dependents.length} outras tarefas`}${inferredLink ? ' (dependência inferida)' : ''}.`
    );
    const highImpact = dependents.find((d) => effectiveImpact(d.t, ctx.tasks).impact === 'alto');
    if (highImpact) add(10, `Libera uma entrega de alto impacto: "${highImpact.t.title}".`);
    const nearDue = dependents
      .filter((d) => d.t.due_date)
      .map((d) => ({ ...d, days: diffDays(ctx.today, d.t.due_date!) }))
      .filter((d) => d.days <= 7)
      .sort((a, b) => a.days - b.days)[0];
    if (nearDue) add(10, `A tarefa dependente "${nearDue.t.title}" vence em ${Math.max(nearDue.days, 0)} dia(s).`);
  }

  // Bloqueios internos
  const blockers = ctx.links
    .filter((l) => l.blocked_id === task.id)
    .map((l) => ctx.tasks.get(l.blocker_id))
    .filter((t): t is Task => !!t && isOpen(t));
  if (blockers.length) {
    add(-8, `Bloqueada por ${blockers.length === 1 ? `"${blockers[0].title}"` : `${blockers.length} tarefas abertas`}.`);
  }

  // Espera por terceiros
  const waits = ctx.waits.filter((w) => w.task_id === task.id && w.status === 'aguardando');
  if (waits.length) {
    const parties = [...new Set(waits.map((w) => w.party))].join(', ');
    add(0, `Entrega depende de terceiros: ${parties}.`);
    const overdueFollowUp = waits.find((w) => (w.follow_up_at && w.follow_up_at <= ctx.today) || (w.expected_at && w.expected_at < ctx.today));
    if (overdueFollowUp) add(10, `Acompanhamento com ${overdueFollowUp.party} está vencido.`);
  }

  // Esforço
  if (task.effort === 'baixo') add(3, 'Baixo esforço — pode ser concluída rapidamente.');
  if (task.effort === 'alto' && task.due_date && diffDays(ctx.today, task.due_date) <= 7) add(8, 'Alto esforço com prazo próximo.');
  if (task.status === 'em_andamento') add(3, 'Já está em andamento.');

  const score = reasons.reduce((s, r) => s + r.points, 0);
  let level = levelFromScore(score);
  if (!dependents.length && !task.due_date && level === 'critica') level = 'alta'; // urgência exige prazo ou dependência
  return { level, score, reasons };
}

export function summarizeReasons(r: PriorityResult): string {
  return r.reasons
    .filter((x) => x.points !== 0 || /depende|Sem prazo/.test(x.text))
    .map((x) => x.text)
    .join(' ');
}
