// Tipos e rótulos compartilhados entre API e interface.

export const TASK_STATUSES = ['pendente', 'em_andamento', 'aguardando', 'bloqueada', 'concluida', 'cancelada'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ['critica', 'alta', 'normal', 'baixa'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CERTAINTIES = ['explicita', 'inferida', 'confirmada', 'desconhecida'] as const;
export type Certainty = (typeof CERTAINTIES)[number];

export const LEVELS = ['alto', 'medio', 'baixo'] as const;
export type Level = (typeof LEVELS)[number];

export const EVENT_TYPES = ['reuniao', 'curso', 'treinamento', 'evento_externo', 'atividade'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const WAIT_STATUSES = ['aguardando', 'recebido', 'cancelado'] as const;
export type WaitStatus = (typeof WAIT_STATUSES)[number];

export const ORIGINS = ['carga_inicial', 'manual', 'captura', 'arquivo'] as const;
export type Origin = (typeof ORIGINS)[number];

export const OPEN_STATUSES: TaskStatus[] = ['pendente', 'em_andamento', 'aguardando', 'bloqueada'];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  aguardando: 'Aguardando',
  bloqueada: 'Bloqueada',
  concluida: 'Concluída',
  cancelada: 'Cancelada'
};
export const PRIORITY_LABEL: Record<Priority, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  normal: 'Normal',
  baixa: 'Baixa'
};
export const CERTAINTY_LABEL: Record<Certainty, string> = {
  explicita: 'Explícita',
  inferida: 'Inferida',
  confirmada: 'Confirmada',
  desconhecida: 'Não informada'
};
export const LEVEL_LABEL: Record<Level, string> = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' };
export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  reuniao: 'Reunião',
  curso: 'Curso',
  treinamento: 'Treinamento',
  evento_externo: 'Evento externo',
  atividade: 'Atividade'
};
export const WAIT_STATUS_LABEL: Record<WaitStatus, string> = {
  aguardando: 'Aguardando',
  recebido: 'Recebido',
  cancelado: 'Cancelado'
};
export const ORIGIN_LABEL: Record<Origin, string> = {
  carga_inicial: 'Carga inicial',
  manual: 'Cadastro manual',
  captura: 'Captura inteligente',
  arquivo: 'Arquivo importado'
};

/** Campos cujo grau de certeza é rastreado individualmente. */
export type CertaintyMap = Partial<Record<'due_date' | 'responsible' | 'project' | 'category' | 'impact' | 'effort' | 'link', Certainty>>;

export interface PriorityReason {
  text: string;
  points: number;
}

export interface Task {
  id: number;
  project_id: number | null;
  parent_id: number | null;
  title: string;
  description: string | null;
  category: string | null;
  status: TaskStatus;
  impact: Level | null;
  effort: Level | null;
  due_date: string | null;
  due_time: string | null;
  due_note: string | null;
  responsible: string | null;
  involved: string[];
  next_action: string | null;
  certainty: CertaintyMap;
  requires_verification: boolean;
  verification_note: string | null;
  priority: Priority;
  priority_score: number;
  priority_reasons: PriorityReason[];
  priority_override: Priority | null;
  priority_override_reason: string | null;
  origin: Origin;
  capture_id: number | null;
  original_text: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TaskLink {
  id: number;
  blocker_id: number;
  blocked_id: number;
  certainty: Certainty;
  note: string | null;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  objective: string | null;
  description: string | null;
  owners: string[];
  keywords: string[];
  status: 'ativo' | 'pausado' | 'encerrado';
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: number;
  project_id: number;
  title: string;
  due_date: string | null;
  done: boolean;
  created_at: string;
}

export interface Wait {
  id: number;
  task_id: number | null;
  project_id: number | null;
  party: string;
  description: string;
  requested_at: string | null;
  expected_at: string | null;
  follow_up_at: string | null;
  status: WaitStatus;
  certainty: Certainty;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: number;
  title: string;
  type: EventType;
  start_at: string; // ISO UTC
  end_at: string | null; // ISO UTC; null = término não informado
  all_day: boolean;
  location: string | null;
  participants: string[];
  responsible: string | null;
  project_id: number | null;
  task_id: number | null;
  notes: string | null;
  origin: Origin;
  capture_id: number | null;
  original_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRecord {
  id: number;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
  parse_status: 'ok' | 'sem_texto' | 'nao_suportado' | 'erro';
  parse_error: string | null;
  text_excerpt: string | null;
  project_id: number | null;
  task_id: number | null;
  capture_id: number | null;
  created_at: string;
}

export interface HistoryEntry {
  id: number;
  entity_type: 'task' | 'project' | 'event' | 'wait' | 'link' | 'document' | 'milestone' | 'capture';
  entity_id: number;
  operation: string;
  summary: string;
  before: unknown;
  after: unknown;
  source: string;
  capture_id: number | null;
  undone: boolean;
  created_at: string;
}

export interface Recommendation {
  key: string;
  kind: string;
  severity: 'alta' | 'media' | 'baixa';
  message: string;
  reason: string;
  evidence: { type: 'task' | 'project' | 'event' | 'wait'; id: number; label: string }[];
}

export interface Confirmation {
  id: number;
  capture_id: number | null;
  kind: 'possivel_duplicidade' | 'data_ambigua' | 'conclusao' | 'cancelamento' | 'horario_ambiguo';
  question: string;
  payload: any;
  options: { value: string; label: string }[];
  status: 'pendente' | 'resolvida' | 'descartada';
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
}
