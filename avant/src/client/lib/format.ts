// Formatação de datas sempre no fuso configurado (padrão America/Sao_Paulo).
export let TZ = 'America/Sao_Paulo';
export function setTimezone(tz: string) {
  TZ = tz;
}

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function dateBr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function parts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function weekdayOf(iso: string): number {
  return parts(iso).getUTCDay();
}
export function weekdayName(iso: string, short = false): string {
  return (short ? WEEKDAYS_SHORT : WEEKDAYS)[weekdayOf(iso)];
}
export function monthName(m: number): string {
  return MONTHS[m - 1];
}
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${weekdayName(iso)}, ${d} de ${MONTHS[m - 1]} de ${y}`;
}
export function addDays(iso: string, n: number): string {
  const d = parts(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function diffDays(a: string, b: string): number {
  return Math.round((parts(b).getTime() - parts(a).getTime()) / 86400000);
}
export function startOfWeek(iso: string): string {
  const wd = weekdayOf(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

/** Data civil de um instante no fuso. */
export function localDate(instant: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
}
export function localTime(instant: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(instant));
}
export function localDateTime(instant: string): string {
  return `${dateBr(localDate(instant))} ${localTime(instant)}`;
}

/** Converte data + hora locais do fuso em ISO UTC. */
export function toUtc(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = (instant: number) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(instant));
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
    return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - instant) / 60000;
  };
  let utc = guess - offset(guess) * 60000;
  utc = guess - offset(utc) * 60000;
  return new Date(utc).toISOString();
}

export function relativeDue(days: number | null): string {
  if (days == null) return 'Sem prazo';
  if (days < 0) return `Atrasada ${-days} dia${days < -1 ? 's' : ''}`;
  if (days === 0) return 'Vence hoje';
  if (days === 1) return 'Vence amanhã';
  return `Em ${days} dias`;
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return localDateTime(iso);
}
