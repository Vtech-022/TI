// Progresso real calculado a partir das tarefas folha (sem filhos) de um conjunto.
import type { Task } from '../../shared/types';

export interface Progress {
  total: number;
  done: number;
  percent: number | null;
}

export function computeProgress(tasks: Task[]): Progress {
  const withChildren = new Set(tasks.filter((t) => t.parent_id != null).map((t) => t.parent_id));
  const leaves = tasks.filter((t) => !withChildren.has(t.id) && t.status !== 'cancelada');
  const done = leaves.filter((t) => t.status === 'concluida').length;
  return { total: leaves.length, done, percent: leaves.length ? Math.round((done / leaves.length) * 100) : null };
}

/** Todas as tarefas descendentes (inclusive) de uma tarefa. */
export function subtree(rootId: number, tasks: Task[]): Task[] {
  const out: Task[] = [];
  const byParent = new Map<number, Task[]>();
  for (const t of tasks) if (t.parent_id != null) byParent.set(t.parent_id, [...(byParent.get(t.parent_id) ?? []), t]);
  const root = tasks.find((t) => t.id === rootId);
  if (!root) return out;
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop()!;
    out.push(cur);
    stack.push(...(byParent.get(cur.id) ?? []));
  }
  return out;
}
