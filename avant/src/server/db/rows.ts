// Conversão entre linhas SQLite e objetos de domínio.
import type { CalendarEvent, Confirmation, DocumentRecord, HistoryEntry, Milestone, Project, Task, TaskLink, Wait } from '../../shared/types';

const json = <T>(v: unknown, fallback: T): T => {
  if (v === null || v === undefined || v === '') return fallback;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return fallback;
  }
};

type Row = Record<string, any>;

export function toTask(r: Row): Task {
  return {
    ...(r as any),
    involved: json(r.involved, []),
    certainty: json(r.certainty, {}),
    priority_reasons: json(r.priority_reasons, []),
    requires_verification: Boolean(r.requires_verification)
  };
}
export function toProject(r: Row): Project {
  return { ...(r as any), owners: json(r.owners, []), keywords: json(r.keywords, []) };
}
export function toMilestone(r: Row): Milestone {
  return { ...(r as any), done: Boolean(r.done) };
}
export function toLink(r: Row): TaskLink {
  return { ...(r as any) };
}
export function toWait(r: Row): Wait {
  return { ...(r as any) };
}
export function toEvent(r: Row): CalendarEvent {
  const { deleted_at: _d, ...rest } = r;
  return { ...(rest as any), participants: json(r.participants, []), all_day: Boolean(r.all_day) };
}
export function toDocument(r: Row): DocumentRecord {
  const { extracted_text, storage_path: _s, ...rest } = r;
  return { ...(rest as any), text_excerpt: extracted_text ? String(extracted_text).slice(0, 600) : null };
}
export function toHistory(r: Row): HistoryEntry {
  return { ...(r as any), before: json(r.before, null), after: json(r.after, null), undone: Boolean(r.undone) };
}
export function toConfirmation(r: Row): Confirmation {
  return { ...(r as any), payload: json(r.payload, {}), options: json(r.options, []) };
}

/** Serializa campos de objeto para colunas SQLite. */
export function toColumns(obj: Record<string, unknown>): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v === null) out[k] = null;
    else if (typeof v === 'boolean') out[k] = v ? 1 : 0;
    else if (typeof v === 'object') out[k] = JSON.stringify(v);
    else out[k] = v as string | number;
  }
  return out;
}
