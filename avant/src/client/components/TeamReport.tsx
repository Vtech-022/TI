// Indicadores por colaborador, calculados a partir do quadro "Atividades da equipe".
import { Briefcase, CheckCircle2, Plane, Scale, Users } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { initials, labelColor } from '../lib/colors';
import { runtime, TeamMember } from '../lib/runtime';
import { useStore } from '../lib/store';
import { Load, LOAD_LABEL, MemberStats, teamStats } from '../lib/team';
import { Empty, Panel } from './ui';

type SortKey = 'open' | 'inProgress' | 'doneInPeriod' | 'overdue' | 'trips' | 'newProjects' | 'distinctProjects';
const COLS: { key: SortKey; label: string }[] = [
  { key: 'open', label: 'Em aberto' },
  { key: 'inProgress', label: 'Em andamento' },
  { key: 'doneInPeriod', label: 'Concluídas' },
  { key: 'overdue', label: 'Atrasadas' },
  { key: 'trips', label: 'Viagens' },
  { key: 'newProjects', label: 'Projetos novos' },
  { key: 'distinctProjects', label: 'Projetos/setores' }
];
const LOAD_CLASS: Record<Load, string> = { sobrecarregado: 'p-critica', equilibrado: 'p-normal', com_folga: 'p-baixa', sem_registro: 'p-baixa' };

function top(rows: MemberStats[], key: SortKey) {
  const best = [...rows].sort((a, b) => b[key] - a[key])[0];
  return best && best[key] > 0 ? best : null;
}

export function TeamReport() {
  const team = runtime.team;
  const { meta } = useStore();
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>('30');
  const [sort, setSort] = useState<SortKey>('open');
  const [openRow, setOpenRow] = useState<string | null>(null);

  useEffect(() => (team ? team.subscribe(setMembers, setError) : undefined), [team]);

  const { rows, avgOpen } = useMemo(
    () => teamStats(members ?? [], period === 'tudo' ? null : Number(period), meta?.today ?? new Date().toISOString().slice(0, 10)),
    [members, period, meta]
  );
  const sorted = useMemo(() => [...rows].sort((a, b) => b[sort] - a[sort] || a.name.localeCompare(b.name)), [rows, sort]);
  const maxOpen = Math.max(1, ...rows.map((r) => r.open));

  if (!team) {
    return (
      <Panel title="Indicadores da equipe" icon={<Users />}>
        <p className="small muted">Disponível na edição online, onde cada colaborador registra as próprias atividades.</p>
      </Panel>
    );
  }

  const highlights = [
    { icon: CheckCircle2, label: 'Mais concluiu', r: top(rows, 'doneInPeriod'), v: (r: MemberStats) => `${r.doneInPeriod} concluída(s)` },
    { icon: Plane, label: 'Mais viajou', r: top(rows, 'trips'), v: (r: MemberStats) => `${r.trips} viagem(ns)` },
    { icon: Briefcase, label: 'Mais projetos novos', r: top(rows, 'newProjects'), v: (r: MemberStats) => `${r.newProjects} projeto(s) novo(s)` },
    { icon: Scale, label: 'Maior carga atual', r: top(rows, 'open'), v: (r: MemberStats) => `${r.open} em aberto` }
  ];
  const overloaded = rows.filter((r) => r.load === 'sobrecarregado');
  const idle = rows.filter((r) => r.load === 'com_folga');

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="page-head" style={{ marginBottom: 0, marginTop: 10 }}>
        <div>
          <div className="eyebrow">Equipe</div>
          <h2 style={{ fontSize: 20 }}>Indicadores por colaborador</h2>
          <p>Calculados a partir do que cada pessoa registra no quadro de Atividades da equipe. Para medir viagens e projetos novos, informe o tipo da atividade no cartão.</p>
        </div>
        <select className="pill-select" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Período">
          <option value="30">Últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
          <option value="365">Últimos 12 meses</option>
          <option value="tudo">Todo o histórico</option>
        </select>
      </div>

      {error && <div className="error-box">{error}</div>}
      {members && rows.length === 0 && <Empty title="Ninguém registrou atividades ainda">Os indicadores aparecem quando os colaboradores começam a usar o quadro da equipe.</Empty>}

      {rows.length > 0 && (
        <>
          <div className="kpi-cards">
            {highlights.map((h) => (
              <div key={h.label} className="kpi-card" style={{ cursor: 'default' }}>
                <span className="kc-head">
                  <span className="kc-icon" style={{ color: 'var(--accent-fg)' }}>
                    <h.icon aria-hidden />
                  </span>
                  {h.label}
                </span>
                {h.r ? (
                  <span className="hl-person">
                    <span className="avatar" style={{ width: 30, height: 30, background: labelColor(h.r.id), fontSize: 12 }} aria-hidden>
                      {initials(h.r.name)}
                    </span>
                    <span>
                      <strong>{h.r.name}</strong>
                      <span className="small muted" style={{ display: 'block' }}>
                        {h.v(h.r)}
                      </span>
                    </span>
                  </span>
                ) : (
                  <span className="small muted">Sem registros no período</span>
                )}
              </div>
            ))}
          </div>

          {(overloaded.length > 0 || idle.length > 0) && (
            <div className="info-box" style={{ marginBottom: 0 }}>
              {overloaded.length > 0 && (
                <p>
                  <strong>Possível sobrecarga:</strong> {overloaded.map((r) => `${r.name} (${r.open} em aberto)`).join(', ')} — acima de 1,5× a média da equipe ({avgOpen.toFixed(1)}).
                </p>
              )}
              {idle.length > 0 && (
                <p style={{ marginTop: overloaded.length ? 6 : 0 }}>
                  <strong>Com folga:</strong> {idle.map((r) => `${r.name} (${r.open} em aberto)`).join(', ')} — podem absorver demandas.
                </p>
              )}
            </div>
          )}

          <Panel title="Carga atual por pessoa" icon={<Scale />}>
            <div className="load-bars" role="img" aria-label={`Atividades em aberto por pessoa; média da equipe ${avgOpen.toFixed(1)}`}>
              {[...rows].sort((a, b) => b.open - a.open).map((r) => (
                <div key={r.id} className="load-row" title={r.reasons.join(' ')}>
                  <span className="lr-name">{r.name}</span>
                  <span className="lr-track">
                    <span className={`lr-fill ${r.load}`} style={{ width: `${(r.open / maxOpen) * 100}%` }} />
                    <span className="lr-avg" style={{ left: `${(avgOpen / maxOpen) * 100}%` }} aria-hidden />
                  </span>
                  <span className="lr-val">{r.open}</span>
                </div>
              ))}
              <div className="small muted" style={{ marginTop: 6 }}>
                A linha vertical marca a média da equipe ({avgOpen.toFixed(1)} atividade(s) em aberto por pessoa).
              </div>
            </div>
          </Panel>

          <Panel title="Ranking da equipe" icon={<Users />} flush>
            <div className="table-wrap">
              <table className="data soft">
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    {COLS.map((c) => (
                      <th key={c.key}>
                        <button className={`th-sort${sort === c.key ? ' on' : ''}`} onClick={() => setSort(c.key)} aria-label={`Ordenar por ${c.label}`}>
                          {c.label}
                          {sort === c.key ? ' ↓' : ''}
                        </button>
                      </th>
                    ))}
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <Fragment key={r.id}>
                      <tr className="clickable" onClick={() => setOpenRow(openRow === r.id ? null : r.id)} aria-expanded={openRow === r.id}>
                        <td className="td-title">
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span className="avatar" style={{ width: 24, height: 24, background: labelColor(r.id), fontSize: 10 }} aria-hidden>
                              {initials(r.name)}
                            </span>
                            {r.name}
                          </span>
                        </td>
                        {COLS.map((c) => (
                          <td key={c.key} className="mono" style={{ fontWeight: sort === c.key ? 700 : 400 }}>
                            {r[c.key]}
                          </td>
                        ))}
                        <td>
                          <span className={`pill ${LOAD_CLASS[r.load]}`}>{LOAD_LABEL[r.load]}</span>
                        </td>
                      </tr>
                      {openRow === r.id && (
                        <tr>
                          <td colSpan={COLS.length + 2} className="why-cell">
                            <strong>Por quê:</strong> {r.reasons.join(' ')}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
