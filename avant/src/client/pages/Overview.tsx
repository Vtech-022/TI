import { AlarmClock, Bell, CalendarClock, FolderKanban, Gauge, HelpCircle, Hourglass, Lightbulb, ListChecks, Rocket, ShieldAlert, Target, Zap } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmationCard } from '../components/CaptureResultView';
import { AlertList, RecommendationList, UpcomingList } from '../components/Insights';
import { TaskRow, useOpenTask } from '../components/TaskRow';
import { Cert, Empty, ErrorBox, Panel, ProgressBar, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { dateBr, longDate, timeAgo } from '../lib/format';
import { useApi, useStore } from '../lib/store';
import type { CaptureResult, Dashboard } from '../lib/types';

function greeting(now: string, tz: string) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date(now)));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function InlineCapture() {
  const [text, setText] = useState('');
  const [last, setLast] = useState<CaptureResult | null>(null);
  const { track, refresh, fail, toast } = useStore();
  const navigate = useNavigate();
  const submit = async () => {
    if (!text.trim()) return;
    try {
      const r = await track(api.post<CaptureResult>('/api/captures', { text }));
      setLast(r);
      setText('');
      refresh();
      toast(`Captura #${r.capture_id}: ${r.stats.nova_tarefa} nova(s), ${r.stats.atualizacao} atualização(ões), ${r.stats.confirmacao} a confirmar.`);
    } catch (e) {
      fail(e);
    }
  };
  return (
    <div>
      <textarea
        className="textarea"
        rows={4}
        placeholder="Cole uma nova demanda, mensagem ou lista…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && submit()}
        aria-label="Captura rápida"
      />
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn gold sm" onClick={submit} disabled={!text.trim()}>
          <Zap size={14} /> Analisar e salvar
        </button>
        <button className="btn sm ghost" onClick={() => navigate('/captura')}>
          Abrir captura completa
        </button>
      </div>
      {last && (
        <p className="small muted" style={{ marginTop: 8 }}>
          Última captura: {last.stats.nova_tarefa} nova(s) · {last.stats.atualizacao} atualização(ões) · {last.stats.ja_registrada} já registrada(s) ·{' '}
          <a href="/captura" onClick={(e) => (e.preventDefault(), navigate('/captura'))}>
            ver detalhes
          </a>
        </p>
      )}
    </div>
  );
}

export default function Overview() {
  const { data, error, loading } = useApi<Dashboard>('/api/dashboard');
  const { meta } = useStore();
  const navigate = useNavigate();
  const openTask = useOpenTask();
  if (error) return <ErrorBox error={error} />;
  if (!data || !meta) return <Skeleton rows={8} />;
  const c = data.counts;
  const kpis = [
    { label: 'Pendências abertas', value: c.open, to: '/pendencias', icon: ListChecks, hint: `${c.blocked} bloqueada(s)` },
    { label: 'Críticas', value: c.critical, to: '/pendencias?priority=critica', icon: ShieldAlert, tone: c.critical ? 'critica' : '', hint: `${c.high} alta(s)` },
    { label: 'Atrasadas', value: c.overdue, to: '/pendencias?due=atrasadas', icon: AlarmClock, tone: c.overdue ? 'critica' : '', hint: `${c.due_today} vence(m) hoje` },
    { label: 'Aguardando terceiros', value: c.waiting, to: '/terceiros', icon: Hourglass, hint: 'pendências externas' },
    { label: 'Datas a confirmar', value: c.inferred_dates, to: '/pendencias?due=inferidas', icon: HelpCircle, tone: c.inferred_dates ? 'alta' : '', hint: 'prazos inferidos' },
    { label: 'Concluídas em 7 dias', value: c.done_last_7_days, to: '/relatorios', icon: Gauge, hint: `${c.events_next_14_days} evento(s) em 14 dias` }
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{longDate(data.today)}</div>
          <h1>
            {greeting(meta.now, meta.tz)}, Victor.
          </h1>
          <p>
            {c.overdue > 0
              ? `${c.overdue} pendência(s) atrasada(s) exigem decisão. `
              : c.critical > 0
                ? `${c.critical} prioridade(s) crítica(s) em aberto. `
                : 'Nenhuma pendência atrasada ou crítica no momento. '}
            {data.focus[0] ? `Comece por “${data.focus[0].task.title}”.` : ''}
          </p>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => navigate('/foco')}>
            <Target size={16} /> Ver foco completo
          </button>
        </div>
      </div>

      <div className="kpis">
        {kpis.map((k) => (
          <button key={k.label} className={`kpi${k.tone ? ` tone-${k.tone}` : ''}`} onClick={() => navigate(k.to)}>
            <div className="label">
              <k.icon size={14} aria-hidden /> {k.label}
            </div>
            <div className="value">{k.value}</div>
            <div className="hint">{k.hint}</div>
          </button>
        ))}
      </div>

      {data.confirmations.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <Panel title="Informações aguardando sua confirmação" icon={<HelpCircle />} count={data.confirmations.length} accent>
            {data.confirmations.slice(0, 3).map((cf) => (
              <ConfirmationCard key={cf.id} c={cf} />
            ))}
            {data.confirmations.length > 3 && (
              <button className="btn sm" onClick={() => navigate('/captura')}>
                Ver todas ({data.confirmations.length})
              </button>
            )}
          </Panel>
        </div>
      )}

      <div className="grid main-side">
        <div className="grid">
          <Panel title="Foco de hoje" icon={<Target />} count={data.focus.length} flush accent actions={<button className="btn sm ghost" onClick={() => navigate('/foco')}>Abrir</button>}>
            {data.focus.length ? (
              <ul className="task-list">
                {data.focus.map((f, i) => (
                  <TaskRow key={f.task.id} task={f.task} rank={i + 1} why={f.why} />
                ))}
              </ul>
            ) : (
              <Empty title="Nenhuma tarefa livre para execução">Todas as pendências abertas estão bloqueadas ou concluídas.</Empty>
            )}
          </Panel>

          <div className="grid cols-2">
            <Panel title="Prioridades críticas" icon={<ShieldAlert />} count={data.critical.length} flush>
              {data.critical.length ? (
                <ul className="task-list">
                  {data.critical.map((t) => (
                    <TaskRow key={t.id} task={t} why={t.priority_reasons.filter((r) => r.points > 0).slice(0, 2).map((r) => r.text)} />
                  ))}
                </ul>
              ) : (
                <Empty title="Nenhuma prioridade crítica">Críticas exigem prazo próximo, atraso ou bloqueio relevante.</Empty>
              )}
            </Panel>
            <Panel title="Atrasadas" icon={<AlarmClock />} count={data.overdue.length} flush>
              {data.overdue.length ? (
                <ul className="task-list">
                  {data.overdue.map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                </ul>
              ) : (
                <Empty title="Nada atrasado">Nenhuma pendência com prazo vencido.</Empty>
              )}
            </Panel>
          </div>

          <Panel title="Projetos em andamento" icon={<FolderKanban />} count={data.projects.length} flush actions={<button className="btn sm ghost" onClick={() => navigate('/projetos')}>Todos</button>}>
            {data.projects.length === 0 && <Empty title="Nenhum projeto ativo" />}
            <ul className="list-simple">
              {data.projects.map((p) => (
                <li key={p.id} className="clickable" onClick={() => navigate(`/projetos/${p.id}`)}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <strong style={{ fontWeight: 600 }}>{p.name}</strong>
                    <span className="small muted mono">
                      {p.progress.done}/{p.progress.total} concluídas · {p.open} abertas
                    </span>
                    <span style={{ flex: 1 }} />
                    <span className="mono small">{p.progress.percent ?? 0}%</span>
                  </div>
                  <div style={{ margin: '8px 0 6px' }}>
                    <ProgressBar value={p.progress.percent} label={`Progresso de ${p.name}`} />
                  </div>
                  <div className="small" style={{ color: 'var(--text-2)' }}>
                    <strong style={{ fontWeight: 500 }}>Próxima ação:</strong> {p.next_action?.text ?? 'não definida'}
                    {p.next_due && (
                      <>
                        {' '}
                        · <strong style={{ fontWeight: 500 }}>Próxima entrega:</strong> {dateBr(p.next_due.date)} {p.next_due.certainty === 'inferida' && <Cert c="inferida" />}
                      </>
                    )}
                  </div>
                  {p.risks.length > 0 && <div className="small" style={{ color: 'var(--critica)', marginTop: 4 }}>{p.risks.join(' ')}</div>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <Panel title="Captura rápida" icon={<Zap />}>
            <InlineCapture />
          </Panel>
          <Panel title="Alertas operacionais" icon={<Bell />} count={data.alerts.length} flush>
            <AlertList alerts={data.alerts} />
          </Panel>
          <Panel title="Recomendações" icon={<Lightbulb />} count={data.recommendations.length} flush>
            <RecommendationList recs={data.recommendations} limit={6} />
          </Panel>
          <Panel title="Aguardando terceiros" icon={<Hourglass />} count={data.waiting.length} flush actions={<button className="btn sm ghost" onClick={() => navigate('/terceiros')}>Abrir</button>}>
            {data.waiting.length === 0 && <Empty title="Nada aguardando terceiros" />}
            <ul className="list-simple">
              {data.waiting.map((w) => (
                <li key={w.id} className="clickable small" onClick={() => (w.task_id ? openTask(w.task_id) : navigate('/terceiros'))}>
                  <strong>{w.party}</strong> — {w.description}
                  <div className="muted">
                    {w.follow_up_at ? `Acompanhar em ${dateBr(w.follow_up_at)}` : 'Sem data de acompanhamento'} · {timeAgo(w.created_at)}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Próximas entregas e compromissos" icon={<CalendarClock />} flush>
            <UpcomingList tasks={data.upcoming.tasks} events={data.upcoming.events} today={data.today} />
          </Panel>
          <Panel title="Pode ser concluído rapidamente" icon={<Rocket />} count={data.quick_wins.length} flush>
            {data.quick_wins.length ? (
              <ul className="task-list">
                {data.quick_wins.map((t) => (
                  <TaskRow key={t.id} task={t} compact />
                ))}
              </ul>
            ) : (
              <Empty title="Nenhuma tarefa marcada como de baixo esforço">Informe o esforço nas tarefas para receber sugestões rápidas.</Empty>
            )}
          </Panel>
        </div>
      </div>
      {loading && null}
    </>
  );
}
