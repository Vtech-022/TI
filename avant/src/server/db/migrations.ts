export const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: 'estrutura inicial',
    sql: `
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  objective TEXT,
  description TEXT,
  owners TEXT NOT NULL DEFAULT '[]',
  keywords TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','pausado','encerrado')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE captures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_text TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('texto','arquivo')),
  document_id INTEGER,
  reference_date TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  parent_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','aguardando','bloqueada','concluida','cancelada')),
  impact TEXT CHECK (impact IN ('alto','medio','baixo')),
  effort TEXT CHECK (effort IN ('alto','medio','baixo')),
  due_date TEXT,
  due_time TEXT,
  due_note TEXT,
  responsible TEXT,
  involved TEXT NOT NULL DEFAULT '[]',
  next_action TEXT,
  certainty TEXT NOT NULL DEFAULT '{}',
  requires_verification INTEGER NOT NULL DEFAULT 0,
  verification_note TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('critica','alta','normal','baixa')),
  priority_score REAL NOT NULL DEFAULT 0,
  priority_reasons TEXT NOT NULL DEFAULT '[]',
  priority_override TEXT CHECK (priority_override IN ('critica','alta','normal','baixa')),
  priority_override_reason TEXT,
  origin TEXT NOT NULL DEFAULT 'manual',
  capture_id INTEGER REFERENCES captures(id) ON DELETE SET NULL,
  original_text TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_id);
CREATE INDEX idx_tasks_status ON tasks(status);

CREATE TABLE task_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blocker_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  certainty TEXT NOT NULL DEFAULT 'explicita',
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE waits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  party TEXT NOT NULL,
  description TEXT NOT NULL,
  requested_at TEXT,
  expected_at TEXT,
  follow_up_at TEXT,
  status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','recebido','cancelado')),
  certainty TEXT NOT NULL DEFAULT 'explicita',
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('reuniao','curso','treinamento','evento_externo','atividade')),
  start_at TEXT NOT NULL,
  end_at TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  participants TEXT NOT NULL DEFAULT '[]',
  responsible TEXT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  notes TEXT,
  origin TEXT NOT NULL DEFAULT 'manual',
  capture_id INTEGER REFERENCES captures(id) ON DELETE SET NULL,
  original_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_events_start ON events(start_at);

CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  extracted_text TEXT,
  parse_status TEXT NOT NULL,
  parse_error TEXT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  capture_id INTEGER REFERENCES captures(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  operation TEXT NOT NULL,
  summary TEXT NOT NULL,
  before TEXT,
  after TEXT,
  source TEXT NOT NULL,
  capture_id INTEGER,
  undone INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_history_entity ON history(entity_type, entity_id);
CREATE INDEX idx_history_capture ON history(capture_id);

CREATE TABLE confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  capture_id INTEGER REFERENCES captures(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  question TEXT NOT NULL,
  payload TEXT NOT NULL,
  options TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  resolution TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE dismissed_recommendations (key TEXT PRIMARY KEY, created_at TEXT NOT NULL);
`
  }
];
