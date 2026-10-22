// Tipos de resposta da API usados pela interface.
import type { CalendarEvent, Confirmation, DocumentRecord, HistoryEntry, Milestone, Project, Recommendation, Task, Wait } from '../../shared/types';
export * from '../../shared/types';

export interface TaskView extends Task {
  effective_priority: Task['priority'];
  project_name: string | null;
  parent_title: string | null;
  blockers: { id: number; title: string; status: string; certainty: string; link_id: number }[];
  dependents: { id: number; title: string; status: string; certainty: string; link_id: number }[];
  children: { total: number; open: number; progress: number | null };
  waits: Wait[];
  is_blocked: boolean;
  days_to_due: number | null;
}

export interface ProjectSummary extends Project {
  progress: { total: number; done: number; percent: number | null };
  open: number;
  critical: number;
  overdue: number;
  blocked: number;
  next_action: { task_id: number; text: string } | null;
  next_due: { task_id: number; title: string; date: string; certainty: string } | null;
  risks: string[];
}

export interface Alert {
  kind: string;
  message: string;
  refs: { type: 'task' | 'event' | 'wait' | 'confirmation'; id: number }[];
}

export interface Dashboard {
  today: string;
  counts: Record<'open' | 'critical' | 'high' | 'overdue' | 'due_today' | 'waiting' | 'blocked' | 'inferred_dates' | 'done_last_7_days' | 'events_next_14_days', number>;
  focus: { task: TaskView; why: string[] }[];
  critical: TaskView[];
  overdue: TaskView[];
  due_today: TaskView[];
  waiting: (Wait & { task_title: string | null })[];
  upcoming: { tasks: TaskView[]; events: CalendarEvent[] };
  projects: ProjectSummary[];
  quick_wins: TaskView[];
  alerts: Alert[];
  recommendations: Recommendation[];
  confirmations: Confirmation[];
}

export interface CaptureOperation {
  kind: 'nova_tarefa' | 'atualizacao' | 'ja_registrada' | 'novo_evento' | 'nova_espera' | 'novo_projeto' | 'dependencia' | 'confirmacao';
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
  stats: Record<string, number>;
}

export interface TaskDetail {
  task: TaskView;
  children: TaskView[];
  history: HistoryEntry[];
  documents: DocumentRecord[];
  events: CalendarEvent[];
}

export interface ProjectDetail {
  project: ProjectSummary;
  tasks: TaskView[];
  milestones: Milestone[];
  documents: DocumentRecord[];
  events: CalendarEvent[];
  waits: Wait[];
  history: HistoryEntry[];
}
