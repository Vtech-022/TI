import { AlertTriangle, CalendarDays, Flag, ChevronLeft, ChevronRight, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOpenTask } from '../components/TaskRow';
import { ConfirmDialog, Empty, ErrorBox, Field, Modal, Panel } from '../components/ui';
import { api, qs } from '../lib/api';
import { addDays, dateBr, localDate, localDateTime, localTime, longDate, monthName, startOfWeek, timeAgo, toUtc, weekdayName } from '../lib/format';
import { useApi, useMutation, useStore } from '../lib/store';
import { EVENT_TYPE_LABEL } from '../lib/types';
import type { CalendarEvent, EventType, HistoryEntry, TaskView } from '../lib/types';

type View = 'dia' | 'semana' | 'mes';

interface Draft {
  title: string;
  type: EventType;
  date: string;
  start: string;
  end: string;
  all_day: boolean;
  location: string;
  participants: string;
  responsible: string;
  project_id: string;
  task_id: string;
  notes: string;
  original_text?: string;
}

interface ParsedDraft {
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

const blank = (date: string): Draft => ({ title: '', type: 'reuniao', date, start: '09:00', end: '10:00', all_day: false, location: '', participants: '', responsible: '', project_id: '', task_id: '', notes: '' });

function fromEvent(e: CalendarEvent): Draft {
  return {
    title: e.title,
    type: e.type,
    date: localDate(e.start_at),
    start: e.all_day ? '' : localTime(e.start_at),
    end: e.end_at ? localTime(e.end_at) : '',
    all_day: e.all_day,
    location: e.location ?? '',
    participants: e.participants.join(', '),
    responsible: e.responsible ?? '',
    project_id: e.project_id ? String(e.project_id) : '',
    task_id: e.task_id ? String(e.task_id) : '',
    notes: e.notes ?? ''
  };
}

function toBody(d: Draft) {
  const allDay = d.all_day || !d.start;
  return {
    title: d.title.trim(),
    type: d.type,
    start_at: toUtc(d.date, allDay ? '00:00' : d.start),
    end_at: !allDay && d.end ? toUtc(d.date, d.end) : null,
    all_day: allDay,
    location: d.location.trim() || null,
    participants: d.participants.split(',').map((s) => s.trim()).filter(Boolean),
    responsible: d.responsible.trim() || null,
    project_id: d.project_id ? Number(d.project_id) : null,
    task_id: d.task_id ? Number(d.task_id) : null,
    notes: d.notes.trim() || null,
    ...(d.original_text ? { original_text: d.original_text } : {})
  };
}

function conflictsOf(events: CalendarEvent[]): Set<number> {
  const ids = new Set<number>();
  const spans = events.filter((e) => !e.all_day).map((e) => ({ id: e.id, s: Date.parse(e.start_at), f: e.end_at ? Date.parse(e.end_at) : Date.parse(e.start_at) + 3600000 }));
  for (const a of spans) for (const b of spans) if (a.id !== b.id && a.s < b.f && b.s < a.f) ids.add(a.id);
  return ids;
}

function EventForm({ d, onChange, tasks }: { d: Draft; onChange: (d: Draft) => void; tasks: TaskView[] }) {
  const { meta } = useStore();
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange({ ...d, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });
  return (
    <div className="form-grid">
      <Field label="Título" full>
        <input className="input" value={d.title} onChange={set('title')} data-autofocus />
      </Field>
      <Field label="Tipo">
        <select className="select" value={d.type} onChange={set('type')}>
          {Object.entries(EVENT_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Data">
        <input className="input" type="date" value={d.date} onChange={set('date')} required />
      </Field>
      <Field label="Início">
        <input className="input" type="time" value={d.start} onChange={set('start')} disabled={d.all_day} />
      </Field>
      <Field label="Término" hint={!d.all_day && d.start && !d.end ? 'Não informado — conflitos consideram 1 h.' : undefined}>
        <input className="input" type="time" value={d.end} onChange={set('end')} disabled={d.all_day || !d.start} />
      </Field>
      <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={d.all_day} onChange={set('all_day')} /> <span>Dia inteiro / horário não definido</span>
      </label>
      <Field label="Local">
        <input className="input" value={d.location} onChange={set('location')} placeholder="Não informado" />
      </Field>
      <Field label="Participantes (vírgula)">
        <input className="input" value={d.participants} onChange={set('participants')} list="avant-people-ev" placeholder="Não informados" />
      </Field>
      <Field label="Responsável">
        <input className="input" value={d.responsible} onChange={set('responsible')} list="avant-people-ev" placeholder="Não informado" />
      </Field>
      <datalist id="avant-people-ev">{meta?.people.map((p) => <option key={p} value={p} />)}</datalist>
      <Field label="Projeto">
        <select className="select" value={d.project_id} onChange={set('project_id')}>
          <option value="">Nenhum</option>
          {meta?.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tarefa relacionada">
        <select className="select" value={d.task_id} onChange={set('task_id')}>
          <option value="">Nenhuma</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Observações" full>
        <textarea className="textarea" rows={2} value={d.notes} onChange={set('notes')} />
      </Field>
    </div>
  );
}

export default function Agenda() {
  const { meta } = useStore();
  const mutate = useMutation();
  const openTask = useOpenTask();
  const [params, setParams] = useSearchParams();
  const today = meta?.today ?? localDate(new Date());
  const [view, setView] = useState<View>((params.get('v') as View) || 'semana');
  const [cursor, setCursor] = useState(params.get('d') ?? today);
  const [filter, setFilter] = useState({ q: '', type: '', project_id: '' });
  const [nl, setNl] = useState('');
  const [parsed, setParsed] = useState<ParsedDraft | null>(null);
  const [editing, setEditing] = useState<{ id: number | null; d: Draft } | null>(null);
  const [askDelete, setAskDelete] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    const next = new URLSearchParams(params);
    next.set('v', view);
    next.set('d', cursor);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cursor]);

  const range = useMemo(() => {
    if (view === 'dia') return { from: cursor, to: addDays(cursor, 1) };
    if (view === 'semana') {
      const s = startOfWeek(cursor);
      return { from: s, to: addDays(s, 7) };
    }
    const first = `${cursor.slice(0, 7)}-01`;
    const s = startOfWeek(first);
    return { from: s, to: addDays(s, 42) };
  }, [view, cursor]);

  const { data: events, error } = useApi<CalendarEvent[]>(`/api/events${qs({ from: toUtc(range.from, '00:00'), to: toUtc(range.to, '00:00'), ...filter })}`);
  const { data: tasks } = useApi<TaskView[]>('/api/tasks?sort=prazo');
  const detailId = params.get('evento');
  const detail = useApi<{ event: CalendarEvent; conflicts: CalendarEvent[]; history: HistoryEntry[] }>(detailId ? `/api/events/${detailId}` : null);

  const conflictIds = useMemo(() => conflictsOf(events ?? []), [events]);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events ?? []) m.set(localDate(e.start_at), [...(m.get(localDate(e.start_at)) ?? []), e]);
    return m;
  }, [events]);
  const dueByDay = useMemo(() => {
    const m = new Map<string, TaskView[]>();
    for (const t of tasks ?? []) if (t.due_date) m.set(t.due_date, [...(m.get(t.due_date) ?? []), t]);
    return m;
  }, [tasks]);

  const move = (n: number) => setCursor((c) => (view === 'dia' ? addDays(c, n) : view === 'semana' ? addDays(c, 7 * n) : (() => {
    const [y, m] = c.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return d.toISOString().slice(0, 10);
  })()));

  const title =
    view === 'dia'
      ? longDate(cursor)
      : view === 'semana'
        ? `${dateBr(range.from)} – ${dateBr(addDays(range.to, -1))}`
        : `${monthName(Number(cursor.slice(5, 7)))} de ${cursor.slice(0, 4)}`;

  const closeDetail = () => {
    const next = new URLSearchParams(params);
    next.delete('evento');
    setParams(next, { replace: true });
  };

  const interpret = async () => {
    try {
      const r = await api.post<ParsedDraft>('/api/events/parse', { text: nl });
      setParsed(r);
    } catch (e) {
      mutate(() => Promise.reject(e));
    }
  };

  const applyParsed = (choices: { date?: string; start?: string }) => {
    if (!parsed) return;
    const date = choices.date ?? parsed.date ?? '';
    const start = choices.start ?? parsed.start ?? '';
    setEditing({
      id: null,
      d: {
        ...blank(date),
        title: parsed.title,
        type: parsed.type,
        date,
        start,
        end: parsed.end ?? '',
        all_day: !start,
        location: parsed.location ?? '',
        participants: parsed.participants.join(', '),
        original_text: nl
      }
    });
  };

  const save = async () => {
    if (!editing) return;
    const body = toBody(editing.d);
    const r = await mutate(
      () => (editing.id ? api.patch<{ conflicts: CalendarEvent[] }>(`/api/events/${editing.id}`, body) : api.post<{ conflicts: CalendarEvent[] }>('/api/events', body)),
      (x) => (x.conflicts.length ? `Salvo — atenção: conflito com ${x.conflicts.map((c) => `"${c.title}"`).join(', ')}.` : editing.id ? 'Evento atualizado.' : 'Evento criado.')
    );
    if (r) {
      setEditing(null);
      setParsed(null);
      setNl('');
      setCursor(editing.d.date);
    }
  };

  const evButton = (e: CalendarEvent) => (
    <button
      key={e.id}
      className={`ev t-${e.type}${conflictIds.has(e.id) ? ' conflict' : ''}`}
      onClick={(ev) => {
        ev.stopPropagation();
        const next = new URLSearchParams(params);
        next.set('evento', String(e.id));
        setParams(next);
      }}
      title={`${e.title}${conflictIds.has(e.id) ? ' — conflito de horário' : ''}`}
    >
      {!e.all_day && <span className="mono">{localTime(e.start_at)} </span>}
      {e.title}
    </button>
  );

  const HOURS = Array.from({ length: 15 }, (_, i) => i + 7);
  const days = view === 'dia' ? [cursor] : Array.from({ length: 7 }, (_, i) => addDays(range.from, i));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Agenda interna · fuso {meta?.tz}</div>
          <h1>Agenda</h1>
          <p>Cursos, treinamentos, reuniões e eventos externos. Funciona sem integrações externas; nada de horário, local ou participante é inventado.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({ id: null, d: blank(cursor) })}>
          <Plus size={16} /> Novo evento
        </button>
      </div>

      <Panel title="Criar por linguagem natural" icon={<Sparkles />} accent>
        <form
          className="btn-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (nl.trim().length >= 3) interpret();
          }}
        >
          <input className="input" style={{ flex: 1, minWidth: 220 }} value={nl} onChange={(e) => setNl(e.target.value)} placeholder='Ex.: "Treinamento na terça-feira às 14h com a equipe."' aria-label="Descrição do evento" />
          <button className="btn gold" type="submit" disabled={nl.trim().length < 3}>
            Interpretar
          </button>
        </form>
        {parsed && (
          <div style={{ marginTop: 12 }} className="small">
            <div className="btn-row" style={{ marginBottom: 8 }}>
              <strong>{parsed.title}</strong>
              <span className="badge neutral">
                {EVENT_TYPE_LABEL[parsed.type]}
                {parsed.type_inferred ? ' (tipo não identificado)' : ''}
              </span>
              {parsed.date && <span className="mono">{dateBr(parsed.date)} ({weekdayName(parsed.date)})</span>}
              {parsed.start && <span className="mono">{parsed.start}</span>}
              {parsed.participants.length > 0 && <span>com {parsed.participants.join(', ')}</span>}
            </div>
            {parsed.notes.map((n, i) => (
              <div key={i} className="muted">
                {n}
              </div>
            ))}
            {parsed.missing.length > 0 && <div className="muted">Não informado: {parsed.missing.join(', ')}.</div>}
            {parsed.ambiguities.length > 0 ? (
              <div className="confirm-card" style={{ marginTop: 10 }}>
                <p>Há mais de uma interpretação possível. Escolha:</p>
                {parsed.ambiguities.map((a, i) => (
                  <div key={i} className="btn-row" style={{ marginBottom: 6 }}>
                    <span className="muted">{a.note}</span>
                    {a.options.map((o) => (
                      <button key={o} className="btn sm" onClick={() => applyParsed(a.field === 'date' ? { date: o } : { start: o })}>
                        {a.field === 'date' ? `${dateBr(o)} (${weekdayName(o, true)})` : o}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn sm primary" onClick={() => applyParsed({})}>
                  Revisar e salvar
                </button>
                <button className="btn sm ghost" onClick={() => setParsed(null)}>
                  Descartar
                </button>
              </div>
            )}
          </div>
        )}
      </Panel>

      <div className="toolbar" style={{ marginTop: 18 }}>
        <div className="btn-row">
          <button className="icon-btn" onClick={() => move(-1)} aria-label="Anterior">
            <ChevronLeft />
          </button>
          <button className="btn sm" onClick={() => setCursor(today)}>
            Hoje
          </button>
          <button className="icon-btn" onClick={() => move(1)} aria-label="Próximo">
            <ChevronRight />
          </button>
          <h2 style={{ fontSize: 16, marginLeft: 6, textTransform: 'capitalize' }}>{title}</h2>
        </div>
        <span style={{ flex: 1 }} />
        <input className="input" placeholder="Pesquisar eventos" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} aria-label="Pesquisar eventos" />
        <select className="select" value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })} aria-label="Tipo de evento">
          <option value="">Todos os tipos</option>
          {Object.entries(EVENT_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="select" value={filter.project_id} onChange={(e) => setFilter({ ...filter, project_id: e.target.value })} aria-label="Projeto">
          <option value="">Todos os projetos</option>
          {meta?.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="seg" role="group" aria-label="Visualização">
          {(['dia', 'semana', 'mes'] as View[]).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'dia' ? 'Dia' : v === 'semana' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>
      </div>
      <ErrorBox error={error} />
      {conflictIds.size > 0 && (
        <div className="error-box" style={{ marginBottom: 12 }}>
          <AlertTriangle size={14} style={{ verticalAlign: -2 }} /> {conflictIds.size} evento(s) com conflito de horário neste período (destacados em vermelho).
        </div>
      )}

      <section className="panel" style={{ overflow: 'hidden' }}>
        {view === 'mes' && (
          <div className="cal-month">
            {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => (
              <div key={d} className="dow">
                {d}
              </div>
            ))}
            {Array.from({ length: 42 }, (_, i) => addDays(range.from, i)).map((day) => {
              const evs = byDay.get(day) ?? [];
              const dues = dueByDay.get(day) ?? [];
              return (
                <div
                  key={day}
                  className={`cal-cell${day.slice(0, 7) !== cursor.slice(0, 7) ? ' other' : ''}${day === today ? ' today' : ''}`}
                  onClick={() => {
                    setCursor(day);
                    setView('dia');
                  }}
                >
                  <span className="num">{Number(day.slice(8))}</span>
                  {evs.slice(0, 3).map(evButton)}
                  {dues.slice(0, 2).map((t) => (
                    <button
                      key={`t${t.id}`}
                      className="ev due"
                      onClick={(e) => {
                        e.stopPropagation();
                        openTask(t.id);
                      }}
                      title={`Prazo: ${t.title}`}
                    >
                      <Flag size={11} aria-hidden style={{ verticalAlign: -1 }} /> {t.title}
                    </button>
                  ))}
                  {evs.length + dues.length > 5 && <div className="small muted">+{evs.length + dues.length - 5}</div>}
                </div>
              );
            })}
          </div>
        )}
        {view !== 'mes' && (
          <div className="cal-week" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))`, minWidth: view === 'semana' ? 720 : undefined }}>
            <div className="col-head" />
            {days.map((d) => (
              <div key={d} className={`col-head${d === today ? ' today' : ''}`}>
                <div style={{ textTransform: 'capitalize' }}>{weekdayName(d, true)}</div>
                <div className="mono">{dateBr(d).slice(0, 5)}</div>
                {[...(byDay.get(d) ?? []).filter((e) => e.all_day)].map(evButton)}
                {(dueByDay.get(d) ?? []).map((t) => (
                  <button key={`t${t.id}`} className="ev due" onClick={() => openTask(t.id)} title={`Prazo: ${t.title}`}>
                    <Flag size={11} aria-hidden style={{ verticalAlign: -1 }} /> {t.title}
                  </button>
                ))}
              </div>
            ))}
            <div className="cal-hours">
              {HOURS.map((h) => (
                <div key={h} className="cal-hour">
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>
            {days.map((d) => (
              <div key={d} className="cal-daycol">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="cal-slot"
                    onClick={() => setEditing({ id: null, d: { ...blank(d), start: `${String(h).padStart(2, '0')}:00`, end: `${String(h + 1).padStart(2, '0')}:00` } })}
                    title={`Criar evento em ${dateBr(d)} às ${h}h`}
                  />
                ))}
                {(byDay.get(d) ?? [])
                  .filter((e) => !e.all_day)
                  .map((e) => {
                    const start = localTime(e.start_at);
                    const [sh, sm] = start.split(':').map(Number);
                    const endMin = e.end_at ? (() => {
                      const [eh, em] = localTime(e.end_at).split(':').map(Number);
                      return eh * 60 + em;
                    })() : sh * 60 + sm + 60;
                    const top = ((sh * 60 + sm - 7 * 60) / 60) * 44;
                    const height = Math.max(((endMin - (sh * 60 + sm)) / 60) * 44 - 2, 20);
                    return (
                      <button
                        key={e.id}
                        className={`cal-block${!e.end_at ? ' assumed' : ''}${conflictIds.has(e.id) ? ' conflict' : ''}`}
                        style={{ top: Math.max(top, 0), height }}
                        onClick={() => {
                          const next = new URLSearchParams(params);
                          next.set('evento', String(e.id));
                          setParams(next);
                        }}
                        title={`${e.title} — ${start}${e.end_at ? `–${localTime(e.end_at)}` : ' (término não informado)'}`}
                      >
                        <strong className="mono">{start}</strong> {e.title}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        )}
        {events && events.length === 0 && view !== 'mes' && <Empty icon={<CalendarDays />} title="Nenhum evento neste período">Clique em um horário para criar ou descreva o evento acima.</Empty>}
      </section>

      <Modal
        open={!!editing}
        title={editing?.id ? 'Editar / reagendar evento' : 'Novo evento'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button className="btn" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button className="btn primary" onClick={save} disabled={!editing || editing.d.title.trim().length < 2 || !editing.d.date}>
              Salvar
            </button>
          </>
        }
      >
        {editing && <EventForm d={editing.d} onChange={(d) => setEditing({ ...editing, d })} tasks={tasks ?? []} />}
      </Modal>

      <Modal
        open={!!detailId && !editing}
        title={detail.data?.event.title ?? 'Evento'}
        onClose={closeDetail}
        footer={
          detail.data && (
            <>
              <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => setAskDelete(detail.data!.event)}>
                <Trash2 size={14} /> Excluir
              </button>
              <button className="btn primary" onClick={() => setEditing({ id: detail.data!.event.id, d: fromEvent(detail.data!.event) })}>
                Editar / reagendar
              </button>
            </>
          )
        }
      >
        <ErrorBox error={detail.error} />
        {detail.data && (
          <>
            <dl className="kv">
              <dt>Tipo</dt>
              <dd>{EVENT_TYPE_LABEL[detail.data.event.type]}</dd>
              <dt>Quando</dt>
              <dd>
                {detail.data.event.all_day ? `${dateBr(localDate(detail.data.event.start_at))} (dia inteiro / horário não definido)` : localDateTime(detail.data.event.start_at)}
                {detail.data.event.end_at ? ` até ${localTime(detail.data.event.end_at)}` : !detail.data.event.all_day ? ' · término não informado' : ''}
              </dd>
              <dt>Local</dt>
              <dd>{detail.data.event.location ?? <span className="muted">Não informado</span>}</dd>
              <dt>Participantes</dt>
              <dd>{detail.data.event.participants.length ? detail.data.event.participants.join(', ') : <span className="muted">Não informados</span>}</dd>
              <dt>Responsável</dt>
              <dd>{detail.data.event.responsible ?? <span className="muted">Não informado</span>}</dd>
              {detail.data.event.notes && (
                <>
                  <dt>Observações</dt>
                  <dd>{detail.data.event.notes}</dd>
                </>
              )}
              {detail.data.event.original_text && (
                <>
                  <dt>Texto original</dt>
                  <dd>
                    <span className="quote">{detail.data.event.original_text}</span>
                  </dd>
                </>
              )}
            </dl>
            {detail.data.conflicts.length > 0 && (
              <div className="error-box" style={{ marginTop: 14 }}>
                Conflito de horário com: {detail.data.conflicts.map((c) => `${c.title} (${localDateTime(c.start_at)})`).join('; ')}
              </div>
            )}
            <div className="section">
              <h3>Histórico</h3>
              <ul className="timeline">
                {detail.data.history.map((h) => (
                  <li key={h.id}>
                    {h.summary} <div className="small muted">{timeAgo(h.created_at)}</div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </Modal>
      <ConfirmDialog
        open={!!askDelete}
        title="Excluir evento?"
        message={`"${askDelete?.title}" será removido da agenda. A exclusão fica registrada e pode ser desfeita pelo Histórico.`}
        confirmLabel="Excluir"
        danger
        onCancel={() => setAskDelete(null)}
        onConfirm={async () => {
          const ev = askDelete!;
          setAskDelete(null);
          const r = await mutate(() => api.del(`/api/events/${ev.id}`, { confirm: true }), 'Evento excluído.');
          if (r) closeDetail();
        }}
      />
    </>
  );
}
