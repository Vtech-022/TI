// Interpretação de eventos em linguagem natural e detecção de conflitos.
import type { CalendarEvent, EventType } from '../../shared/types';
import { parseDates, parseTimes } from './dates';
import { EVENT_NOUNS, eventTitle } from './extraction';
import { capitalize } from './text';

export interface EventDraft {
  title: string;
  type: EventType;
  type_inferred: boolean;
  date: string | null;
  start: string | null;
  end: string | null;
  participants: string[];
  location: string | null;
  ambiguities: { field: 'date' | 'start'; options: string[]; note: string }[];
  missing: string[];
  notes: string[];
}

/** "Treinamento na terça-feira às 14h com a equipe." → rascunho de evento. Nada é inventado. */
export function parseEventText(text: string, referenceDate: string): EventDraft {
  const dates = parseDates(text, referenceDate);
  const times = parseTimes(text);
  const typeEntry = EVENT_NOUNS.find(([re]) => re.test(text));
  const participants: string[] = [];
  const pm = text.match(/\bcom\s+(?:[ao]s?\s+)?([^,.;]+?)(?=\s+(?:n[ao]|em|às|as|dia|para|sobre|local)\b|[,.;]|$)/i);
  if (pm) {
    for (const p of pm[1].split(/\s+e\s+|,\s*/)) {
      const clean = p.trim().replace(/^(?:[ao]s?)\s+/i, '');
      if (clean && !/\d/.test(clean)) participants.push(capitalize(clean));
    }
  }
  const loc = text.match(/\b(?:local:?\s*|no |na |em )((?:sala|audit[oó]rio|anfiteatro|teams|zoom|google meet|meet|plen[aá]rio|laborat[oó]rio)\b[^,.;]*)/i);
  const date = dates[0] ?? null;
  const time = times[0] ?? null;
  const ambiguities: EventDraft['ambiguities'] = [];
  if (date?.alternatives) ambiguities.push({ field: 'date', options: date.alternatives, note: date.note });
  if (time?.alternatives) ambiguities.push({ field: 'start', options: time.alternatives, note: `"${time.raw}" pode indicar manhã ou tarde.` });
  if (dates.length > 1) ambiguities.push({ field: 'date', options: dates.map((d) => d.date), note: 'Mais de uma data encontrada no texto.' });
  const missing: string[] = [];
  if (!date) missing.push('data');
  if (!time) missing.push('horário de início');
  if (!time?.end) missing.push('horário de término');
  if (!loc) missing.push('local');
  const notes: string[] = [];
  if (date) notes.push(date.note);
  return {
    title: eventTitle(text, dates, times),
    type: typeEntry?.[1] ?? 'atividade',
    type_inferred: !typeEntry,
    date: date?.date ?? null,
    start: time?.start ?? null,
    end: time?.end ?? null,
    participants,
    location: loc ? capitalize(loc[1].trim()) : null,
    ambiguities,
    missing,
    notes
  };
}

export const ASSUMED_DURATION_MIN = 60;

export interface Conflict {
  a: number;
  b: number;
  assumed: boolean;
  overlapMinutes: number;
}

/** Pares de eventos com sobreposição de horário. Eventos sem término usam duração presumida de 60 min (sinalizada). */
export function findConflicts(events: Pick<CalendarEvent, 'id' | 'start_at' | 'end_at' | 'all_day'>[]): Conflict[] {
  const spans = events
    .filter((e) => !e.all_day)
    .map((e) => {
      const start = Date.parse(e.start_at);
      const end = e.end_at ? Date.parse(e.end_at) : start + ASSUMED_DURATION_MIN * 60000;
      return { id: e.id, start, end, assumed: !e.end_at };
    })
    .sort((x, y) => x.start - y.start);
  const out: Conflict[] = [];
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length && spans[j].start < spans[i].end; j++) {
      const overlap = Math.min(spans[i].end, spans[j].end) - spans[j].start;
      if (overlap > 0) out.push({ a: spans[i].id, b: spans[j].id, assumed: spans[i].assumed || spans[j].assumed, overlapMinutes: Math.round(overlap / 60000) });
    }
  }
  return out;
}
