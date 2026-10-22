import { BarChart3, FolderKanban, Gauge, ShieldCheck, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ErrorBox, Panel, ProgressBar, Skeleton } from '../components/ui';
import { dateBr } from '../lib/format';
import { useApi } from '../lib/store';
import { CERTAINTY_LABEL, ORIGIN_LABEL, PRIORITY_LABEL, STATUS_LABEL } from '../lib/types';
import type { ProjectSummary } from '../lib/types';

interface Report {
  today: string;
  totals: { tasks: number; open: number; completed: number; cancelled: number };
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_category: Record<string, number>;
  by_responsible: Record<string, number>;
  by_origin: Record<string, number>;
  due_certainty: Record<string, number>;
  without_due: number;
  overdue: number;
  projects: ProjectSummary[];
  waits_by_party: Record<string, number>;
  weeks: { week: string; completed: number; created: number; captures: number }[];
  avg_lead_time_days: number | null;
}

function Bars({ data, labels, colors, onClick }: { data: Record<string, number>; labels?: Record<string, string>; colors?: Record<string, string>; onClick?: (k: string) => void }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <p className="small muted">Sem dados.</p>;
  return (
    <div className="bars">
      {entries.map(([k, v]) => (
        <div key={k} className="bar-row" onClick={() => onClick?.(k)} style={{ cursor: onClick ? 'pointer' : undefined }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={labels?.[k] ?? k}>
            {labels?.[k] ?? k}
          </span>
          <span className="track">
            <span className="fill" style={{ display: 'block', width: `${(v / max) * 100}%`, background: colors?.[k] }} />
          </span>
          <span className="mono" style={{ textAlign: 'right' }}>
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}

const PCOLORS = { critica: 'var(--critica)', alta: 'var(--alta)', normal: 'var(--normal)', baixa: 'var(--baixa)' };

export default function Reports() {
  const { data, error } = useApi<Report>('/api/reports');
  const navigate = useNavigate();
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Skeleton rows={8} />;
  const maxWeek = Math.max(1, ...data.weeks.flatMap((w) => [w.completed, w.created, w.captures]));
  const dated = Object.values(data.due_certainty).reduce((a, b) => a + b, 0);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Indicadores calculados do banco de dados</div>
          <h1>Relatórios</h1>
          <p>Todos os números vêm dos registros atuais — sem metas ou porcentagens estimadas.</p>
        </div>
        <a className="btn" href="/api/export">
          Exportar cópia de segurança (JSON)
        </a>
      </div>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))' }}>
        <div className="kpi">
          <div className="label">Tarefas registradas</div>
          <div className="value">{data.totals.tasks}</div>
          <div className="hint">{data.totals.open} abertas</div>
        </div>
        <div className="kpi">
          <div className="label">Concluídas</div>
          <div className="value">{data.totals.completed}</div>
          <div className="hint">{data.totals.cancelled} cancelada(s)</div>
        </div>
        <div className="kpi tone-critica">
          <div className="label">Atrasadas</div>
          <div className="value">{data.overdue}</div>
          <div className="hint">entre as abertas</div>
        </div>
        <div className="kpi">
          <div className="label">Sem prazo</div>
          <div className="value">{data.without_due}</div>
          <div className="hint">abertas sem data</div>
        </div>
        <div className="kpi">
          <div className="label">Tempo médio até concluir</div>
          <div className="value">{data.avg_lead_time_days ?? '—'}</div>
          <div className="hint">{data.avg_lead_time_days == null ? 'ainda sem conclusões' : 'dias corridos'}</div>
        </div>
      </div>
      <div className="grid cols-2">
        <Panel title="Ritmo das últimas 8 semanas" icon={<Gauge />}>
          <div className="legend" style={{ marginBottom: 6 }}>
            <span>
              <i style={{ background: 'var(--navy-600)' }} />
              Criadas
            </span>
            <span>
              <i style={{ background: 'var(--ok)' }} />
              Concluídas
            </span>
            <span>
              <i style={{ background: 'var(--gold-500)' }} />
              Capturas
            </span>
          </div>
          <div className="cols-chart" role="img" aria-label="Tarefas criadas, concluídas e capturas por semana">
            {data.weeks.map((w) => (
              <div className="c" key={w.week} title={`Semana de ${dateBr(w.week)}: ${w.created} criadas, ${w.completed} concluídas, ${w.captures} capturas`}>
                <div className="stack">
                  <span style={{ height: `${(w.created / maxWeek) * 100}%`, background: 'var(--navy-600)' }} />
                  <span style={{ height: `${(w.completed / maxWeek) * 100}%`, background: 'var(--ok)' }} />
                  <span style={{ height: `${(w.captures / maxWeek) * 100}%`, background: 'var(--gold-500)' }} />
                </div>
                <span className="mono">{dateBr(w.week).slice(0, 5)}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Abertas por prioridade" icon={<BarChart3 />}>
          <Bars data={data.by_priority} labels={PRIORITY_LABEL} colors={PCOLORS} onClick={(k) => navigate(`/pendencias?priority=${k}`)} />
          <h3 style={{ margin: '18px 0 8px' }} className="small muted">
            Todas por status
          </h3>
          <Bars data={data.by_status} labels={STATUS_LABEL} />
        </Panel>
        <Panel title="Projetos" icon={<FolderKanban />} flush>
          <table className="data">
            <thead>
              <tr>
                <th>Projeto</th>
                <th>Progresso real</th>
                <th>Abertas</th>
                <th>Atrasadas</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/projetos/${p.id}`)}>
                  <td>{p.name}</td>
                  <td style={{ minWidth: 140 }}>
                    <div className="small mono">
                      {p.progress.done}/{p.progress.total} · {p.progress.percent ?? 0}%
                    </div>
                    <ProgressBar value={p.progress.percent} />
                  </td>
                  <td className="mono">{p.open}</td>
                  <td className="mono">{p.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Qualidade da informação" icon={<ShieldCheck />}>
          <p className="small muted" style={{ marginBottom: 10 }}>
            Grau de certeza dos prazos das {dated} tarefas abertas com data.
          </p>
          <Bars data={data.due_certainty} labels={CERTAINTY_LABEL} onClick={(k) => k === 'inferida' && navigate('/pendencias?due=inferidas')} />
          <h3 style={{ margin: '18px 0 8px' }} className="small muted">
            Origem dos registros
          </h3>
          <Bars data={data.by_origin} labels={ORIGIN_LABEL} />
        </Panel>
        <Panel title="Abertas por responsável" icon={<Users />}>
          <Bars data={data.by_responsible} onClick={(k) => k !== 'Não informado' && navigate(`/pendencias?responsible=${encodeURIComponent(k)}`)} />
        </Panel>
        <Panel title="Abertas por categoria e terceiros">
          <Bars data={data.by_category} />
          <h3 style={{ margin: '18px 0 8px' }} className="small muted">
            Aguardando por pessoa
          </h3>
          <Bars data={data.waits_by_party} onClick={() => navigate('/terceiros')} />
        </Panel>
      </div>
    </>
  );
}
