import { AlarmClock, CalendarClock, CheckCircle2, Hourglass, ListChecks, ListFilter, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, DonutChart, Slice } from '../components/Charts';
import { ConfirmationCard } from '../components/CaptureResultView';
import { UpcomingList } from '../components/Insights';
import { useOpenTask } from '../components/TaskRow';
import { Empty, ErrorBox, Panel, Skeleton } from '../components/ui';
import { dateBr } from '../lib/format';
import { useApi, useStore } from '../lib/store';
import { PRIORITY_LABEL } from '../lib/types';
import type { Dashboard, Priority, TaskView } from '../lib/types';

const PRIO_ORDER: Priority[] = ['critica', 'alta', 'normal', 'baixa'];
const PRIO_COLOR: Record<'light' | 'dark', Record<Priority, string>> = {
  light: { critica: '#e5484d', alta: '#f59e0b', normal: '#2f6bff', baixa: '#0fa3a3' },
  dark: { critica: '#e0434b', alta: '#c08a00', normal: '#4a78ff', baixa: '#0f9e9e' }
};

function shortName(name: string): string {
  const words = name.split(/\s+/);
  return words.length > 2 ? `${words.slice(0, 2).join(' ')}…` : name;
}

export default function Overview() {
  const { data, error } = useApi<Dashboard>('/api/dashboard');
  const all = useApi<TaskView[]>('/api/tasks?include_closed=1');
  const { dark } = useStore();
  const navigate = useNavigate();
  const openTask = useOpenTask();
  const [barMode, setBarMode] = useState<'abertas' | 'concluidas' | 'todas'>('abertas');
  const [donutMode, setDonutMode] = useState<'abertas' | 'com_prazo' | 'terceiros'>('abertas');

  const tasks = all.data ?? [];
  const open = tasks.filter((t) => t.status !== 'concluida' && t.status !== 'cancelada');

  const bars = useMemo(() => {
    const base = barMode === 'abertas' ? open : barMode === 'concluidas' ? tasks.filter((t) => t.status === 'concluida') : tasks.filter((t) => t.status !== 'cancelada');
    const m = new Map<string, number>();
    for (const t of base) m.set(t.project_name ?? 'Sem projeto', (m.get(t.project_name ?? 'Sem projeto') ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([full, value]) => ({ full, label: shortName(full), value }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all.data, barMode]);

  const slices: Slice[] = useMemo(() => {
    const base = donutMode === 'abertas' ? open : donutMode === 'com_prazo' ? open.filter((t) => t.due_date) : open.filter((t) => t.waits.some((w) => w.status === 'aguardando'));
    const pal = PRIO_COLOR[dark ? 'dark' : 'light'];
    return PRIO_ORDER.map((p) => ({ key: p, label: PRIORITY_LABEL[p], value: base.filter((t) => t.effective_priority === p).length, color: pal[p] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all.data, donutMode, dark]);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Skeleton rows={8} />;
  const c = data.counts;
  const urgent = c.critical + c.overdue;
  const table = [...open].sort((a, b) => (a.days_to_due ?? 999) - (b.days_to_due ?? 999) || PRIO_ORDER.indexOf(a.effective_priority) - PRIO_ORDER.indexOf(b.effective_priority)).slice(0, 8);

  const attention = [
    ...data.alerts.map((a) => ({ key: a.kind + a.message, sev: a.kind === 'conflito_agenda' || a.kind === 'atrasada' ? 'alta' : 'media', text: a.message, ref: a.refs[0] })),
    ...data.recommendations.filter((r) => r.severity !== 'baixa' && r.kind !== 'data_inferida').map((r) => ({ key: r.key, sev: r.severity, text: r.message, ref: r.evidence[0] as any }))
  ].slice(0, 5);

  const kpis = [
    { label: 'Pendências abertas', value: c.open, icon: ListChecks, to: '/pendencias', tone: 'blue' },
    { label: 'Críticas ou atrasadas', value: urgent, icon: ShieldAlert, to: c.overdue ? '/pendencias?due=atrasadas' : '/pendencias?priority=critica', tone: urgent ? 'red' : 'blue' },
    { label: 'Aguardando terceiros', value: c.waiting, icon: Hourglass, to: '/terceiros', tone: 'violet' },
    { label: 'Concluídas na semana', value: c.done_last_7_days, icon: CheckCircle2, to: '/relatorios', tone: 'green' }
  ];

  return (
    <div className="ov">
      <div className="kpi-cards">
        {kpis.map((k) => (
          <button key={k.label} className={`kpi-card tone-${k.tone}`} onClick={() => navigate(k.to)}>
            <span className="kc-head">
              <span className="kc-icon">
                <k.icon aria-hidden />
              </span>
              {k.label}
            </span>
            <span className="kc-value">{k.value}</span>
          </button>
        ))}
      </div>

      {data.confirmations.length > 0 && (
        <Panel title="Aguardando sua confirmação" count={data.confirmations.length}>
          {data.confirmations.slice(0, 2).map((cf) => (
            <ConfirmationCard key={cf.id} c={cf} />
          ))}
        </Panel>
      )}

      <div className="ov-charts">
        <Panel
          title="Pendências por projeto"
          actions={
            <select className="pill-select" value={barMode} onChange={(e) => setBarMode(e.target.value as typeof barMode)} aria-label="Conjunto do gráfico de barras">
              <option value="abertas">Abertas</option>
              <option value="concluidas">Concluídas</option>
              <option value="todas">Todas</option>
            </select>
          }
        >
          {all.data ? (
            bars.length ? (
              <BarChart data={bars} unit="tarefa(s)" onSelect={(full) => {
                const p = data.projects.find((x) => x.name === full);
                navigate(p ? `/projetos/${p.id}` : '/pendencias?project_id=none');
              }} />
            ) : (
              <Empty title="Nenhuma tarefa neste conjunto" />
            )
          ) : (
            <Skeleton rows={5} />
          )}
        </Panel>
        <Panel
          title="Distribuição por prioridade"
          actions={
            <select className="pill-select" value={donutMode} onChange={(e) => setDonutMode(e.target.value as typeof donutMode)} aria-label="Conjunto do gráfico de rosca">
              <option value="abertas">Abertas</option>
              <option value="com_prazo">Com prazo</option>
              <option value="terceiros">Com terceiros</option>
            </select>
          }
        >
          {all.data ? <DonutChart slices={slices} centerLabel="tarefas" onSelect={(p) => navigate(`/pendencias?priority=${p}`)} /> : <Skeleton rows={5} />}
        </Panel>
      </div>

      <Panel
        title="Minhas pendências"
        actions={
          <button className="icon-btn outline" onClick={() => navigate('/pendencias')} aria-label="Abrir todas as pendências com filtros" title="Filtrar">
            <ListFilter />
          </button>
        }
        flush
      >
        <div className="table-wrap">
          <table className="data soft">
            <thead>
              <tr>
                <th>Tarefa</th>
                <th>Projeto</th>
                <th>Responsável</th>
                <th>Prazo</th>
                <th>Prioridade</th>
              </tr>
            </thead>
            <tbody>
              {table.map((t) => (
                <tr key={t.id} className="clickable" onClick={() => openTask(t.id)}>
                  <td className="td-title">{t.title}</td>
                  <td className="muted">{t.project_name ?? 'Sem projeto'}</td>
                  <td className="muted">{t.responsible ?? '—'}</td>
                  <td className={t.days_to_due != null && t.days_to_due < 0 ? 'late' : 'muted'}>
                    {t.due_date ? dateBr(t.due_date) : '—'}
                    {t.certainty.due_date === 'inferida' && <span className="cert c-inferida" style={{ marginLeft: 6 }}>inferida</span>}
                  </td>
                  <td>
                    <span className={`pill p-${t.effective_priority}`}>{PRIORITY_LABEL[t.effective_priority]}</span>
                  </td>
                </tr>
              ))}
              {!table.length && (
                <tr>
                  <td colSpan={5}>
                    <Empty title="Nenhuma pendência aberta" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="ov-bottom">
        <Panel title="Precisa de atenção" icon={<AlarmClock />} flush>
          {attention.length ? (
            <ul className="list-simple attention">
              {attention.map((a) => (
                <li
                  key={a.key}
                  className="clickable small"
                  onClick={() => {
                    if (a.ref?.type === 'task') openTask(a.ref.id);
                    else if (a.ref?.type === 'event') navigate(`/agenda?evento=${a.ref.id}`);
                    else if (a.ref?.type === 'project') navigate(`/projetos/${a.ref.id}`);
                    else navigate('/pendencias');
                  }}
                >
                  <span className="dot" style={{ background: a.sev === 'alta' ? 'var(--critica)' : 'var(--gold-500)' }} />
                  <span>{a.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Tudo em ordem" />
          )}
        </Panel>
        <Panel title="Próximos 14 dias" icon={<CalendarClock />} flush>
          <UpcomingList tasks={data.upcoming.tasks.slice(0, 6)} events={data.upcoming.events.slice(0, 4)} today={data.today} />
        </Panel>
      </div>
    </div>
  );
}
