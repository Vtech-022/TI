import { CalendarClock, FolderKanban, HelpCircle, ShieldAlert, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConfirmationCard } from '../components/CaptureResultView';
import { UpcomingList } from '../components/Insights';
import { TaskRow, useOpenTask } from '../components/TaskRow';
import { Empty, ErrorBox, Panel, ProgressBar, Skeleton } from '../components/ui';
import { longDate } from '../lib/format';
import { useApi, useStore } from '../lib/store';
import type { Dashboard } from '../lib/types';

function greeting(now: string, tz: string) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date(now)));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export default function Overview() {
  const { data, error } = useApi<Dashboard>('/api/dashboard');
  const { meta } = useStore();
  const navigate = useNavigate();
  const openTask = useOpenTask();
  if (error) return <ErrorBox error={error} />;
  if (!data || !meta) return <Skeleton rows={8} />;
  const c = data.counts;
  const urgent = c.critical + c.overdue;

  // Um único bloco de atenção: alertas operacionais e as recomendações mais relevantes.
  const attention = [
    ...data.alerts.map((a) => ({
      key: a.kind + a.message,
      sev: a.kind === 'conflito_agenda' || a.kind === 'atrasada' ? 'alta' : 'media',
      text: a.message,
      go: () => {
        const r = a.refs[0];
        if (a.kind === 'atrasada') navigate('/pendencias?due=atrasadas');
        else if (a.kind === 'data_ambigua') navigate('/pendencias?due=inferidas');
        else if (a.kind === 'confirmacao_pendente') navigate('/captura');
        else if (r?.type === 'event') navigate(`/agenda?evento=${r.id}`);
        else if (r?.type === 'task') openTask(r.id);
        else navigate('/pendencias');
      }
    })),
    ...data.recommendations
      .filter((r) => r.severity !== 'baixa' && r.kind !== 'data_inferida')
      .map((r) => ({
        key: r.key,
        sev: r.severity,
        text: r.message,
        go: () => {
          const e = r.evidence[0];
          if (e?.type === 'task') openTask(e.id);
          else if (e?.type === 'project') navigate(`/projetos/${e.id}`);
          else navigate('/terceiros');
        }
      }))
  ].slice(0, 6);

  const stats = [
    { n: c.open, l: 'Pendências abertas', to: '/pendencias' },
    { n: urgent, l: urgent === 1 ? 'Crítica ou atrasada' : 'Críticas ou atrasadas', to: c.overdue ? '/pendencias?due=atrasadas' : '/pendencias?priority=critica', warn: urgent > 0 },
    { n: c.waiting, l: 'Aguardando terceiros', to: '/terceiros' },
    { n: c.done_last_7_days, l: 'Concluídas na semana', to: '/relatorios' }
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{longDate(data.today)}</div>
          <h1>
            {greeting(meta.now, meta.tz)}, Victor
          </h1>
          <p>{data.focus[0] ? `Próximo passo recomendado: ${data.focus[0].task.title}.` : 'Nenhuma tarefa livre para execução agora.'}</p>
        </div>
      </div>

      <div className="stat-strip">
        {stats.map((s) => (
          <button key={s.l} className="stat" onClick={() => navigate(s.to)}>
            <div className={`n${s.warn ? ' warn' : ''}`}>{s.n}</div>
            <div className="l">{s.l}</div>
          </button>
        ))}
      </div>

      {data.confirmations.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <Panel title="Aguardando sua confirmação" icon={<HelpCircle />} count={data.confirmations.length} accent>
            {data.confirmations.slice(0, 2).map((cf) => (
              <ConfirmationCard key={cf.id} c={cf} />
            ))}
          </Panel>
        </div>
      )}

      <div className="overview-grid">
        <Panel title="Foco de hoje" icon={<Target />} flush accent actions={<button className="btn sm ghost" onClick={() => navigate('/foco')}>Ver tudo</button>}>
          {data.focus.length ? (
            <ul className="task-list">
              {data.focus.slice(0, 5).map((f, i) => (
                <TaskRow key={f.task.id} task={f.task} rank={i + 1} why={f.why.slice(0, 1)} />
              ))}
            </ul>
          ) : (
            <Empty title="Nenhuma tarefa livre para execução">Todas as pendências abertas estão bloqueadas ou concluídas.</Empty>
          )}
        </Panel>

        <div className="grid">
          <Panel title="Precisa de atenção" icon={<ShieldAlert />} count={attention.length || undefined} flush>
            {attention.length ? (
              <ul className="list-simple attention">
                {attention.map((a) => (
                  <li key={a.key} className="clickable small" onClick={a.go}>
                    <span className="dot" style={{ background: a.sev === 'alta' ? 'var(--critica)' : 'var(--gold-500)' }} />
                    <span>{a.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="Tudo em ordem">Sem conflitos, bloqueios ou datas a confirmar.</Empty>
            )}
          </Panel>
          <Panel title="Próximos 14 dias" icon={<CalendarClock />} flush>
            <UpcomingList tasks={data.upcoming.tasks.slice(0, 6)} events={data.upcoming.events.slice(0, 4)} today={data.today} />
          </Panel>
          <Panel title="Projetos" icon={<FolderKanban />} flush actions={<button className="btn sm ghost" onClick={() => navigate('/projetos')}>Ver todos</button>}>
            {data.projects.length === 0 && <Empty title="Nenhum projeto ativo" />}
            <ul className="list-simple">
              {data.projects.map((p) => (
                <li key={p.id} className="clickable" onClick={() => navigate(`/projetos/${p.id}`)}>
                  <div className="project-line">
                    <span className="project-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15 }} title={p.name}>
                      {p.name}
                    </span>
                    <ProgressBar value={p.progress.percent} label={`Progresso de ${p.name}`} />
                    <span className="mono small" style={{ textAlign: 'right' }}>
                      {p.progress.percent ?? 0}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
