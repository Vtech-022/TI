// Regras do quadro da equipe e indicadores por colaborador (cálculo puro, sem acesso a dados).
import type { TeamActivity, TeamMember } from './runtime';

export const RETENTION_DAYS = 15;

export const KINDS = [
  { key: 'rotina', label: 'Rotina' },
  { key: 'projeto_novo', label: 'Projeto novo' },
  { key: 'viagem', label: 'Viagem' },
  { key: 'reuniao', label: 'Reunião ou evento' },
  { key: 'treinamento', label: 'Treinamento' },
  { key: 'suporte', label: 'Suporte' },
  { key: 'outro', label: 'Outro' }
] as const;
export type Kind = (typeof KINDS)[number]['key'];
export const kindLabel = (k?: string | null) => KINDS.find((x) => x.key === k)?.label ?? 'Tipo não informado';

const DAY = 86_400_000;

/** Concluída há mais de 15 dias ou excluída manualmente: sai do quadro e vai para Excluídos. */
export function archiveReason(it: TeamActivity, now = Date.now()): string | null {
  if (it.deleted_at) return 'Excluída';
  if (it.status === 'concluida' && it.completed_at && now - Date.parse(it.completed_at) > RETENTION_DAYS * DAY) return `Concluída há mais de ${RETENTION_DAYS} dias`;
  return null;
}

export type Load = 'sobrecarregado' | 'equilibrado' | 'com_folga' | 'sem_registro';
export const LOAD_LABEL: Record<Load, string> = {
  sobrecarregado: 'Sobrecarregado',
  equilibrado: 'Equilibrado',
  com_folga: 'Com folga',
  sem_registro: 'Sem registros'
};

export interface MemberStats {
  id: string;
  name: string;
  open: number;
  inProgress: number;
  doneInPeriod: number;
  overdue: number;
  trips: number;
  newProjects: number;
  distinctProjects: number;
  total: number;
  load: Load;
  loadRatio: number | null;
  reasons: string[];
}

/**
 * Indicadores por pessoa no período (dias; null = todo o histórico).
 * Carga atual = atividades abertas (A fazer + Em andamento), comparada com a média da equipe.
 */
export function teamStats(members: TeamMember[], periodDays: number | null, today: string, now = Date.now()): { rows: MemberStats[]; avgOpen: number } {
  const since = periodDays == null ? 0 : now - periodDays * DAY;
  const inPeriod = (iso?: string | null) => !!iso && Date.parse(iso) >= since;
  const base = members.map((m) => {
    const items = m.items.filter((it) => !it.deleted_at);
    const open = items.filter((it) => it.status !== 'concluida');
    const created = (it: TeamActivity) => it.created_at ?? it.updated_at;
    const projects = new Set(items.filter((it) => inPeriod(created(it)) && it.project).map((it) => it.project!.trim().toLowerCase()));
    return {
      id: m.id,
      name: m.name,
      open: open.length,
      inProgress: open.filter((it) => it.status === 'em_andamento').length,
      doneInPeriod: items.filter((it) => it.status === 'concluida' && inPeriod(it.completed_at ?? it.updated_at)).length,
      overdue: open.filter((it) => it.due && it.due < today).length,
      trips: items.filter((it) => it.kind === 'viagem' && inPeriod(created(it))).length,
      newProjects: items.filter((it) => it.kind === 'projeto_novo' && inPeriod(created(it))).length,
      distinctProjects: projects.size,
      total: items.length
    };
  });
  const withData = base.filter((b) => b.total > 0);
  const avgOpen = withData.length ? withData.reduce((s, b) => s + b.open, 0) / withData.length : 0;
  const rows: MemberStats[] = base.map((b) => {
    const ratio = avgOpen > 0 ? b.open / avgOpen : null;
    let load: Load = 'equilibrado';
    if (b.total === 0) load = 'sem_registro';
    else if (ratio != null && ratio >= 1.5 && b.open >= 4) load = 'sobrecarregado';
    else if (ratio != null && ratio <= 0.5) load = 'com_folga';
    const reasons: string[] = [];
    if (b.total === 0) reasons.push('Nenhuma atividade registrada no quadro.');
    if (ratio != null && b.total > 0) reasons.push(`${b.open} atividade(s) em aberto — ${ratio >= 1 ? `${ratio.toFixed(1)}× a média` : `${Math.round(ratio * 100)}% da média`} da equipe (${avgOpen.toFixed(1)}).`);
    if (b.overdue) reasons.push(`${b.overdue} atividade(s) com prazo vencido.`);
    if (b.inProgress >= 3) reasons.push(`${b.inProgress} atividades em andamento ao mesmo tempo.`);
    if (b.trips) reasons.push(`${b.trips} viagem(ns) no período.`);
    if (b.doneInPeriod) reasons.push(`${b.doneInPeriod} concluída(s) no período.`);
    return { ...b, load, loadRatio: ratio, reasons };
  });
  return { rows, avgOpen };
}
