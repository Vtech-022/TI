// Correspondência entre itens capturados e tarefas existentes; duplicidades.
import type { Task } from '../../shared/types';
import { normalize, similarity } from './text';

export interface MatchInput {
  title: string;
  project_id: number | null;
  people: string[];
}

export interface Match {
  task: Task;
  score: number;
}

export const MATCH_CLEAR = 0.72;
export const MATCH_GAP = 0.12;
export const MATCH_POSSIBLE = 0.5;

export function rankMatches(input: MatchInput, tasks: Task[]): Match[] {
  const people = new Set(input.people.map(normalize));
  return tasks
    .filter((t) => t.status !== 'cancelada')
    .map((t) => {
      let score = Math.max(similarity(input.title, t.title), 0.8 * similarity(input.title, `${t.title} ${t.description ?? ''}`));
      if (score > 0.3) {
        if (input.project_id != null && t.project_id === input.project_id) score += 0.08;
        const tp = [t.responsible, ...t.involved].filter(Boolean).map((p) => normalize(p!));
        if (tp.some((p) => people.has(p))) score += 0.05;
      }
      if (t.status === 'concluida') score *= 0.9;
      return { task: t, score: Math.min(1, Number(score.toFixed(3))) };
    })
    .filter((m) => m.score >= 0.3)
    .sort((a, b) => b.score - a.score);
}

export type MatchDecision = { kind: 'clear'; match: Match } | { kind: 'ambiguous'; options: Match[] } | { kind: 'none' };

export function decide(matches: Match[]): MatchDecision {
  const [best, second] = matches;
  if (!best || best.score < MATCH_POSSIBLE) return { kind: 'none' };
  if (best.score >= MATCH_CLEAR && (!second || best.score - second.score >= MATCH_GAP)) return { kind: 'clear', match: best };
  return { kind: 'ambiguous', options: matches.filter((m) => m.score >= MATCH_POSSIBLE).slice(0, 3) };
}

/** Pares de tarefas abertas que parecem representar a mesma entrega. */
export function findDuplicatePairs(tasks: Task[], threshold = 0.55): { a: Task; b: Task; score: number }[] {
  const out: { a: Task; b: Task; score: number }[] = [];
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const a = tasks[i];
      const b = tasks[j];
      if (a.parent_id === b.id || b.parent_id === a.id) continue;
      if (a.parent_id != null && a.parent_id === b.parent_id) continue; // itens irmãos foram separados deliberadamente
      const score = Math.max(similarity(a.title, b.title), similarity(`${a.title} ${a.description ?? ''}`, `${b.title} ${b.description ?? ''}`));
      if (score >= threshold) out.push({ a, b, score: Number(score.toFixed(2)) });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}
