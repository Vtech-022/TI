// Meu dia: a rotina do dia, anotações e um retrato de como o trabalho está andando.
import { CalendarClock, CalendarDays, Hourglass, NotebookPen, Plus, Sparkles, Sun, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart } from '../components/Charts';
import { ConfirmationCard } from '../components/CaptureResultView';
import { UpcomingList } from '../components/Insights';
import { CompleteButton, useOpenTask } from '../components/TaskRow';
import { Empty, ErrorBox, Panel, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { addDays, dateBr, localDate, localTime, longDate, weekdayName } from '../lib/format';
import { useApi, useMutation, useStore } from '../lib/store';
import type { Dashboard, TaskView } from '../lib/types';

interface Notes {
  date: string;
  text: string;
  updated_at: string | null;
  recent: { date: string; text: string; updated_at: string }[];
}

function greeting(now: string, tz: string) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date(now)));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function Ring({ done, total }: { done: number; total: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <div className="day-ring" role="img" aria-label={`${done} de ${total} itens do dia concluídos`}>
      <svg viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} className="ring-track" />
        {pct > 0 && <circle cx="42" cy="42" r={r} className="ring-fill" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 42 42)" />}
      </svg>
      <span>
        <strong>{total ? Math.round(pct * 100) : 0}%</strong>
        <small>do dia</small>
      </span>
    </div>
  );
}

function DayItem({ t, today }: { t: TaskView; today: string }) {
  const openTask = useOpenTask();
  const late = t.status !== 'concluida' && t.due_date && t.due_date < today;
  return (
    <li className={`day-item${t.status === 'concluida' ? ' is-done' : ''}`} onClick={() => openTask(t.id)}>
      <CompleteButton task={t} />
      <span className="di-body">
        <span className="di-title">{t.title}</span>
        <span className="di-meta">
          {t.project_name && <span className="di-proj">{t.project_name}</span>}
          {late && <span className="di-late">Atrasada desde {dateBr(t.due_date)}</span>}
          {t.status === 'em_andamento' && <span className="di-prog">Em andamento</span>}
          {t.due_time && t.status !== 'concluida' && <span>{t.due_time}</span>}
        </span>
      </span>
      {t.status !== 'concluida' && <span className={`di-dot p-${t.effective_priority}`} title={`Prioridade ${t.effective_priority}`} />}
    </li>
  );
}

function NotesCard({ today }: { today: string }) {
  const { data } = useApi<Notes>(`/api/notes?date=${today}`);
  const { fail } = useStore();
  const [text, setText] = useState<string | null>(null);
  const [state, setState] = useState<'salvo' | 'salvando' | 'digitando' | 'erro'>('salvo');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef('');

  useEffect(() => {
    if (data && text === null) setText(data.text);
  }, [data, text]);

  const save = async () => {
    setState('salvando');
    try {
      await api.post('/api/notes', { date: today, text: latest.current });
      setState('salvo');
    } catch (e) {
      setState('erro');
      fail(e);
    }
  };

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void api.post('/api/notes', { date: today, text: latest.current }).catch(() => {});
      }
    },
    [today]
  );

  return (
    <section className="notes-card" aria-labelledby="notes-h">
      <header>
        <h2 id="notes-h">
          <NotebookPen aria-hidden /> Anotações do dia
        </h2>
        <span className="small notes-state">{state === 'salvando' || state === 'digitando' ? 'Salvando…' : state === 'erro' ? 'Falha ao salvar' : data?.updated_at || text ? 'Salvo' : ''}</span>
      </header>
      {text === null ? (
        <Skeleton rows={3} />
      ) : (
        <textarea
          value={text}
          placeholder="Ideias, recados, o que ficou combinado em reunião…"
          aria-label="Anotações do dia"
          onChange={(e) => {
            setText(e.target.value);
            latest.current = e.target.value;
            setState('digitando');
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              timer.current = null;
              void save();
            }, 900);
          }}
        />
      )}
      {!!data?.recent.length && (
        <details className="notes-old">
          <summary>Anotações anteriores ({data.recent.length})</summary>
          <ul>
            {data.recent.map((n) => (
              <li key={n.date}>
                <strong>{dateBr(n.date)}</strong>
                <p>{n.text}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export default function Overview() {
  const { data, error } = useApi<Dashboard>('/api/dashboard');
  const all = useApi<TaskView[]>('/api/tasks?include_closed=1');
  const { meta } = useStore();
  const navigate = useNavigate();
  const mutate = useMutation();
  const [quick, setQuick] = useState('');

  const today = data?.today ?? meta?.today ?? '';
  const tasks = all.data ?? [];

  const day = useMemo(() => {
    if (!today) return { late: [], dueToday: [], doing: [], doneToday: [], week: [], waiting: 0 };
    const open = tasks.filter((t) => t.status !== 'concluida' && t.status !== 'cancelada');
    const late = open.filter((t) => t.due_date && t.due_date < today);
    const dueToday = open.filter((t) => t.due_date === today);
    const doing = open.filter((t) => t.status === 'em_andamento' && !(t.due_date && t.due_date <= today));
    const doneToday = tasks.filter((t) => t.status === 'concluida' && t.completed_at && localDate(t.completed_at) === today);
    const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => ({
      full: d,
      label: d === today ? 'Hoje' : weekdayName(d, true),
      value: tasks.filter((t) => t.status === 'concluida' && t.completed_at && localDate(t.completed_at) === d).length
    }));
    return { late, dueToday, doing, doneToday, week, waiting: open.filter((t) => t.waits.some((w) => w.status === 'aguardando')).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all.data, today]);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Skeleton rows={8} />;

  const planned = day.late.length + day.dueToday.length + day.doing.length;
  // Sem nada vencendo hoje: sugere as próximas prioridades (sem alterar prazos).
  const shown = new Set([...day.late, ...day.dueToday, ...day.doing].map((t) => t.id));
  const suggestions = planned >= 3 ? [] : data.focus.map((f) => f.task).filter((t) => !shown.has(t.id)).slice(0, 3 - planned);
  const total = planned + day.doneToday.length;
  const todayEvents = data.upcoming.events.filter((e) => localDate(e.start_at) === today);
  const weekDone = day.week.reduce((s, d) => s + d.value, 0);
  const projects = data.projects.filter((p) => p.status === 'ativo' && p.progress.total > 0).sort((a, b) => b.open - a.open).slice(0, 6);

  const addQuick = async () => {
    const title = quick.trim();
    if (title.length < 2) return;
    const r = await mutate(() => api.post('/api/tasks', { title, due_date: today, certainty: { due_date: 'confirmada' } }), `Adicionado ao seu dia: ${title}`);
    if (r !== undefined) setQuick('');
  };

  const message =
    total === 0
      ? suggestions.length
        ? 'Nada vence hoje. Separei abaixo as próximas prioridades para você começar.'
        : 'Nada marcado para hoje ainda. Que tal anotar as prioridades do dia?'
      : planned === 0
        ? 'Tudo o que estava no seu dia foi feito. Bom trabalho!'
        : `${planned === 1 ? 'Falta 1 item' : `Faltam ${planned} itens`} no seu dia${day.doneToday.length ? ` e ${day.doneToday.length === 1 ? '1 já foi feito' : `${day.doneToday.length} já foram feitos`}` : ''}.`;

  return (
    <div className="myday">
      <section className="day-hero">
        <div className="dh-text">
          <span className="dh-date">
            <Sun aria-hidden /> {longDate(today).replace(/^./, (ch) => ch.toUpperCase())}
          </span>
          <h1>
            {meta ? greeting(meta.now, meta.tz) : 'Olá'}, Victor
          </h1>
          <p>{message}</p>
          <div className="dh-chips">
            <button className="dh-chip" onClick={() => navigate('/pendencias?due=atrasadas')}>
              <CalendarClock aria-hidden /> <strong>{day.late.length}</strong> atrasada{day.late.length === 1 ? '' : 's'}
            </button>
            <button className="dh-chip" onClick={() => navigate('/terceiros')}>
              <Hourglass aria-hidden /> <strong>{day.waiting}</strong> esperando alguém
            </button>
            <button className="dh-chip" onClick={() => navigate('/relatorios')}>
              <TrendingUp aria-hidden /> <strong>{weekDone}</strong> feita{weekDone === 1 ? '' : 's'} nos últimos 7 dias
            </button>
          </div>
        </div>
        <Ring done={day.doneToday.length} total={total} />
      </section>

      {data.confirmations.length > 0 && (
        <Panel title="Aguardando sua confirmação" count={data.confirmations.length}>
          {data.confirmations.slice(0, 2).map((cf) => (
            <ConfirmationCard key={cf.id} c={cf} />
          ))}
        </Panel>
      )}

      <div className="day-grid">
        <section className="day-list-card" aria-labelledby="myday-h">
          <header>
            <h2 id="myday-h">Meu dia</h2>
            <span className="small muted">
              {day.doneToday.length} de {total} feitos
            </span>
          </header>
          <form
            className="quick-add"
            onSubmit={(e) => {
              e.preventDefault();
              void addQuick();
            }}
          >
            <Plus aria-hidden />
            <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="O que você precisa fazer hoje?" aria-label="Adicionar ao meu dia" maxLength={300} />
            {quick.trim().length >= 2 && (
              <button className="btn sm primary" type="submit">
                Adicionar
              </button>
            )}
          </form>
          {!all.data ? (
            <Skeleton rows={5} />
          ) : (
            <>
              {day.late.length > 0 && (
                <>
                  <h3 className="day-sec late">Ficou para trás</h3>
                  <ul className="day-items">
                    {day.late.map((t) => (
                      <DayItem key={t.id} t={t} today={today} />
                    ))}
                  </ul>
                </>
              )}
              {day.dueToday.length > 0 && (
                <>
                  <h3 className="day-sec">Para hoje</h3>
                  <ul className="day-items">
                    {day.dueToday.map((t) => (
                      <DayItem key={t.id} t={t} today={today} />
                    ))}
                  </ul>
                </>
              )}
              {day.doing.length > 0 && (
                <>
                  <h3 className="day-sec">Em andamento</h3>
                  <ul className="day-items">
                    {day.doing.map((t) => (
                      <DayItem key={t.id} t={t} today={today} />
                    ))}
                  </ul>
                </>
              )}
              {total === 0 && !suggestions.length && (
                <Empty icon={<Sparkles aria-hidden />} title="Seu dia está livre">
                  Escreva acima o que precisa fazer hoje.
                </Empty>
              )}
              {suggestions.length > 0 && (
                <>
                  <h3 className="day-sec suggest">
                    <Sparkles aria-hidden /> Sugestões para hoje
                  </h3>
                  <p className="small muted day-hint">Nada mais vence hoje. Estas são as próximas prioridades da sua lista.</p>
                  <ul className="day-items">
                    {suggestions.map((t) => (
                      <DayItem key={t.id} t={t} today={today} />
                    ))}
                  </ul>
                </>
              )}
              {day.doneToday.length > 0 && (
                <>
                  <h3 className="day-sec done">Feito hoje</h3>
                  <ul className="day-items">
                    {day.doneToday.map((t) => (
                      <DayItem key={t.id} t={t} today={today} />
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </section>

        <div className="day-side">
          <NotesCard today={today} />
          <Panel title="Agenda de hoje" icon={<CalendarDays />} flush>
            {todayEvents.length ? (
              <ul className="today-events">
                {todayEvents.map((e) => (
                  <li key={e.id} className="clickable" onClick={() => navigate(`/agenda?evento=${e.id}`)}>
                    <span className="te-time">{e.all_day ? 'Dia todo' : localTime(e.start_at)}</span>
                    <span>
                      <strong>{e.title}</strong>
                      {e.location && <small className="muted"> · {e.location}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted" style={{ padding: '4px 20px 16px' }}>
                Nenhum compromisso na agenda hoje.
              </p>
            )}
          </Panel>
        </div>
      </div>

      <div className="day-bottom">
        <Panel title="Ritmo da semana" icon={<TrendingUp />}>
          <p className="small muted" style={{ margin: '-4px 0 8px' }}>
            Entregas concluídas por dia nos últimos 7 dias.
          </p>
          <BarChart data={day.week} unit="concluída(s)" />
        </Panel>
        <Panel title="Frentes de trabalho" actions={<button className="btn sm ghost" onClick={() => navigate('/projetos')}>Ver todas</button>}>
          {projects.length ? (
            <ul className="fronts">
              {projects.map((p) => (
                <li key={p.id} className="clickable" onClick={() => navigate(`/projetos/${p.id}`)}>
                  <span className="fr-head">
                    <strong>{p.name}</strong>
                    <span className="small muted">
                      {p.progress.done}/{p.progress.total}
                      {p.overdue ? <span className="di-late"> · {p.overdue} atrasada(s)</span> : null}
                    </span>
                  </span>
                  <span className="fr-track">
                    <span className="fr-fill" style={{ width: `${p.progress.percent ?? 0}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Nenhuma frente ativa" />
          )}
        </Panel>
        <Panel title="Próximos dias" icon={<CalendarClock />} flush>
          <UpcomingList tasks={data.upcoming.tasks.filter((t) => t.due_date !== today).slice(0, 6)} events={data.upcoming.events.filter((e) => localDate(e.start_at) !== today).slice(0, 4)} today={data.today} />
        </Panel>
      </div>
    </div>
  );
}
