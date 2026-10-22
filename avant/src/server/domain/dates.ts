// Datas determinísticas em pt-BR, sempre relativas a uma data de referência e a um fuso horário.
import type { Certainty } from '../../shared/types';
import { fold } from './text';

export const DEFAULT_TZ = 'America/Sao_Paulo';

/** Data civil (YYYY-MM-DD) de um instante em um fuso. */
export function dateInTz(instant: Date, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

export function timeInTz(instant: Date, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(instant);
}

function tzOffsetMinutes(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** Converte data e hora locais de um fuso em instante UTC (ISO). */
export function zonedToUtc(date: string, time: string, tz = DEFAULT_TZ): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let offset = tzOffsetMinutes(new Date(guess), tz);
  let utc = guess - offset * 60000;
  // Segunda passada cobre transições de horário de verão.
  offset = tzOffsetMinutes(new Date(utc), tz);
  utc = guess - offset * 60000;
  return new Date(utc).toISOString();
}

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
}
/** Dias corridos de `from` até `to` (positivo se `to` for posterior). */
export function diffDays(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86400000);
}
/** 0 = domingo … 6 = sábado. */
export function weekday(iso: string): number {
  return toDate(iso).getUTCDay();
}
export function lastDayOfMonth(iso: string): string {
  const d = toDate(iso);
  return fromDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}
export function startOfWeek(iso: string): string {
  // Semana de segunda a domingo.
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6
};
export const WEEKDAY_NAMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const MONTHS: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12
};

export function formatBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export interface DateMatch {
  date: string;
  certainty: Certainty;
  raw: string;
  index: number;
  /** Outras interpretações plausíveis; quando existir, a data exige confirmação. */
  alternatives?: string[];
  note: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Localiza expressões de data em um texto.
 * Datas com dia, mês e ano escritos são explícitas; expressões relativas são inferidas
 * a partir da data de referência (data da mensagem ou da captura).
 */
export function parseDates(text: string, ref: string): DateMatch[] {
  // Texto sem acentos e em minúsculas, com os mesmos índices do original.
  const t = fold(text);
  const out: DateMatch[] = [];
  const taken: [number, number][] = [];
  const free = (i: number, len: number) => !taken.some(([a, b]) => i < b && i + len > a);
  const push = (m: Omit<DateMatch, 'raw'> & { len: number }) => {
    if (!free(m.index, m.len)) return;
    taken.push([m.index, m.index + m.len]);
    const raw = text.slice(m.index, m.index + m.len);
    out.push({ date: m.date, certainty: m.certainty, index: m.index, alternatives: m.alternatives, note: m.note, raw });
  };
  const refYear = Number(ref.slice(0, 4));
  let m: RegExpExecArray | null;

  // dd/mm/aaaa ou dd/mm
  const reNum = /\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}|\d{2}))?\b/g;
  while ((m = reNum.exec(t))) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    let y = m[3] ? Number(m[3]) : refYear;
    if (m[3] && m[3].length === 2) y = 2000 + y;
    let iso = `${y}-${pad(mo)}-${pad(d)}`;
    if (!isValidIsoDate(iso)) continue;
    if (!m[3] && diffDays(ref, iso) < -60) iso = `${y + 1}-${pad(mo)}-${pad(d)}`;
    push({
      date: iso,
      certainty: 'explicita',
      index: m.index,
      len: m[0].length,
      note: m[3] ? 'Data escrita por extenso no texto.' : 'Dia e mês escritos no texto; ano deduzido.'
    });
  }

  // 28 de outubro (de 2026)
  const reExt = /\b(\d{1,2}) de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?: de (\d{4}))?\b/g;
  while ((m = reExt.exec(t))) {
    const d = Number(m[1]);
    const mo = MONTHS[m[2]];
    let y = m[3] ? Number(m[3]) : refYear;
    let iso = `${y}-${pad(mo)}-${pad(d)}`;
    if (!isValidIsoDate(iso)) continue;
    if (!m[3] && diffDays(ref, iso) < -60) iso = `${y + 1}-${pad(mo)}-${pad(d)}`;
    push({ date: iso, certainty: 'explicita', index: m.index, len: m[0].length, note: 'Data escrita no texto.' });
  }

  // depois de amanhã / amanhã / hoje
  const reRel = /\b(depois de amanha|amanha|hoje)\b/g;
  while ((m = reRel.exec(t))) {
    const n = m[1] === 'hoje' ? 0 : m[1] === 'amanha' ? 1 : 2;
    push({ date: addDays(ref, n), certainty: 'inferida', index: m.index, len: m[0].length, note: `"${text.slice(m.index, m.index + m[0].length)}" interpretado a partir de ${formatBr(ref)}.` });
  }

  // dia de semana com modificadores
  const reWd =
    /\b(?:(proxima|proximo|nesta|nessa|esta|essa)\s+)?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira| feira)?(\s+(?:que vem|da semana que vem|da proxima semana))?\b/g;
  while ((m = reWd.exec(t))) {
    const target = WEEKDAYS[m[2]];
    const cur = weekday(ref);
    let delta = (target - cur + 7) % 7;
    const mod = m[1] ?? '';
    const suffix = (m[3] ?? '').trim();
    let alternatives: string[] | undefined;
    let note = `"${text.slice(m.index, m.index + m[0].length).trim()}" interpretado a partir de ${formatBr(ref)} (${WEEKDAY_NAMES[cur]}).`;
    if (suffix.includes('semana')) {
      const nextMonday = addDays(startOfWeek(ref), 7);
      push({ date: addDays(nextMonday, target === 0 ? 6 : target - 1), certainty: 'inferida', index: m.index, len: m[0].length, note });
      continue;
    }
    const thisWeek = mod === 'nesta' || mod === 'nessa' || mod === 'esta' || mod === 'essa';
    if (!thisWeek && delta === 0) {
      if (mod.startsWith('proxim') || suffix === 'que vem') {
        delta = 7;
      } else {
        // Mesmo dia da semana da referência: pode ser hoje ou a próxima semana.
        delta = 7;
        alternatives = [ref, addDays(ref, 7)];
        note += ' Pode significar hoje ou a próxima semana.';
      }
    } else if (suffix === 'que vem' && delta <= 2) {
      // "sexta que vem" dito na quarta pode indicar a sexta da semana seguinte.
      alternatives = [addDays(ref, delta), addDays(ref, delta + 7)];
      note += ' "que vem" pode indicar esta ou a próxima semana.';
    }
    push({ date: addDays(ref, delta), certainty: 'inferida', index: m.index, len: m[0].length, alternatives, note });
  }

  // dia 28 (mês deduzido)
  const reDia = /\bdia (\d{1,2})\b/g;
  while ((m = reDia.exec(t))) {
    const d = Number(m[1]);
    if (d < 1 || d > 31) continue;
    let [y, mo] = [refYear, Number(ref.slice(5, 7))];
    let iso = `${y}-${pad(mo)}-${pad(d)}`;
    if (!isValidIsoDate(iso) || diffDays(ref, iso) < 0) {
      mo += 1;
      if (mo > 12) {
        mo = 1;
        y += 1;
      }
      iso = `${y}-${pad(mo)}-${pad(d)}`;
    }
    if (!isValidIsoDate(iso)) continue;
    push({ date: iso, certainty: 'inferida', index: m.index, len: m[0].length, note: `Mês deduzido para "dia ${d}" a partir de ${formatBr(ref)}.` });
  }

  // fim do mês / fim da semana / próxima semana / em N dias
  const reMisc = /\b(fim|final) do mes\b|\b(fim|final) da semana\b|\b(?:proxima semana|semana que vem)\b|\b(?:em|daqui a) (\d{1,2}) dias\b/g;
  while ((m = reMisc.exec(t))) {
    const s = m[0];
    if (s.includes('mes')) {
      push({ date: lastDayOfMonth(ref), certainty: 'inferida', index: m.index, len: s.length, note: '"fim do mês" interpretado como o último dia do mês.' });
    } else if (s.includes('da semana')) {
      const delta = (5 - weekday(ref) + 7) % 7;
      push({ date: addDays(ref, delta), certainty: 'inferida', index: m.index, len: s.length, note: '"fim da semana" interpretado como sexta-feira.' });
    } else if (s.includes('semana')) {
      const nextFriday = addDays(startOfWeek(ref), 11);
      push({ date: nextFriday, certainty: 'inferida', index: m.index, len: s.length, note: '"próxima semana" sem dia definido; considerada a sexta-feira da próxima semana como limite.' });
    } else {
      const n = Number(m[3]);
      push({ date: addDays(ref, n), certainty: 'inferida', index: m.index, len: s.length, note: `"${text.slice(m.index, m.index + s.length)}" contado a partir de ${formatBr(ref)}.` });
    }
  }

  return out.sort((a, b) => a.index - b.index);
}

export interface TimeMatch {
  start: string;
  end: string | null;
  raw: string;
  index: number;
  alternatives?: string[];
}

/** Horários: 14h, 14h30, 14:30, às 9, das 14h às 16h. */
export function parseTimes(text: string): TimeMatch[] {
  const t = fold(text);
  const out: TimeMatch[] = [];
  const fmt = (h: number, mi: number) => `${pad(h)}:${pad(mi)}`;
  const range = /\b(?:das\s+)?(\d{1,2})(?:h|:)(\d{2})?\s*(?:h\s*)?(?:as|a|ate|-)\s*(\d{1,2})(?:h|:)(\d{2})?h?\b/g;
  let m: RegExpExecArray | null;
    while ((m = range.exec(t))) {
    const h1 = Number(m[1]);
    const h2 = Number(m[3]);
    if (h1 > 23 || h2 > 23) continue;
    out.push({ start: fmt(h1, Number(m[2] ?? 0)), end: fmt(h2, Number(m[4] ?? 0)), raw: text.slice(m.index, m.index + m[0].length), index: m.index });
  }
  const single = /\b(?:as|a partir das|às)?\s*(\d{1,2})(?:h(\d{2})?|:(\d{2}))(?:min)?\b|\b(?:as|às)\s+(\d{1,2})\b(?!\s*(?:\/|de\s+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)))(\s+(?:da|de)\s+(manha|tarde|noite))?/g;
  while ((m = single.exec(t))) {
    if (out.some((o) => m!.index >= o.index && m!.index < o.index + o.raw.length)) continue;
    let h = Number(m[1] ?? m[4]);
    const mi = Number(m[2] ?? m[3] ?? 0);
    if (h > 23 || mi > 59) continue;
    let alternatives: string[] | undefined;
    const period = m[6];
    if (m[4] !== undefined) {
      if (period === 'tarde' || period === 'noite') {
        if (h < 12) h += 12;
      } else if (!period && h >= 1 && h <= 6) {
        alternatives = [fmt(h, 0), fmt(h + 12, 0)];
        h += 12; // Horário comercial é a leitura mais provável; a alternativa fica para confirmação.
      }
    }
    out.push({ start: fmt(h, mi), end: null, raw: text.slice(m.index, m.index + m[0].length).trim(), index: m.index, alternatives });
  }
  return out.sort((a, b) => a.index - b.index);
}
