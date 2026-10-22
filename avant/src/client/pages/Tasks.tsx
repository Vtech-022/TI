import { Filter, ListChecks, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NewTaskModal } from '../components/Overlays';
import { TaskRow } from '../components/TaskRow';
import { Empty, ErrorBox, Panel, Skeleton } from '../components/ui';
import { qs } from '../lib/api';
import { useApi, useStore } from '../lib/store';
import { ORIGIN_LABEL, PRIORITY_LABEL, STATUS_LABEL } from '../lib/types';
import type { TaskView } from '../lib/types';

const FILTER_KEYS = ['q', 'priority', 'status', 'project_id', 'responsible', 'category', 'origin', 'due', 'deps', 'from', 'to', 'sort', 'include_closed'] as const;

export default function Tasks() {
  const [params, setParams] = useSearchParams();
  const { meta } = useStore();
  const [newTask, setNewTask] = useState(false);
  const [showMore, setShowMore] = useState(!!(params.get('from') || params.get('to') || params.get('origin') || params.get('category')));
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ''])) as Record<(typeof FILTER_KEYS)[number], string>;
  const { data, error, loading } = useApi<TaskView[]>(`/api/tasks${qs(f)}`);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const active = FILTER_KEYS.filter((k) => k !== 'sort' && f[k]).length;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Gestão</div>
          <h1>Minhas Pendências</h1>
          <p>Todas as tarefas com prioridade calculada e justificada. Os filtros ficam no endereço da página, então voltar a esta área mantém o contexto.</p>
        </div>
        <button className="btn primary" onClick={() => setNewTask(true)}>
          <Plus size={16} /> Nova tarefa
        </button>
      </div>

      <div className="toolbar" role="search">
        <input className="input grow" placeholder="Filtrar por texto, pessoa, projeto…" value={f.q} onChange={(e) => set('q', e.target.value)} aria-label="Filtrar por texto" />
        <select className="select" value={f.priority} onChange={(e) => set('priority', e.target.value)} aria-label="Prioridade">
          <option value="">Todas as prioridades</option>
          {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="select" value={f.status || (f.include_closed ? '__all' : '')} onChange={(e) => (e.target.value === '__all' ? (set('status', ''), set('include_closed', '1')) : (set('include_closed', ''), set('status', e.target.value)))} aria-label="Status">
          <option value="">Abertas</option>
          <option value="__all">Todas (inclui concluídas)</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="select" value={f.project_id} onChange={(e) => set('project_id', e.target.value)} aria-label="Projeto">
          <option value="">Todos os projetos</option>
          <option value="none">Sem projeto</option>
          {meta?.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className="select" value={f.due} onChange={(e) => set('due', e.target.value)} aria-label="Prazo">
          <option value="">Qualquer prazo</option>
          <option value="atrasadas">Atrasadas</option>
          <option value="hoje">Vencem hoje</option>
          <option value="semana">Próximos 7 dias</option>
          <option value="inferidas">Datas inferidas</option>
          <option value="sem_prazo">Sem prazo</option>
        </select>
        <select className="select" value={f.deps} onChange={(e) => set('deps', e.target.value)} aria-label="Dependências">
          <option value="">Dependências: todas</option>
          <option value="bloqueadas">Bloqueadas</option>
          <option value="bloqueiam">Bloqueiam outras</option>
          <option value="terceiros">Aguardando terceiros</option>
          <option value="sem">Sem dependências</option>
        </select>
        <select className="select" value={f.sort} onChange={(e) => set('sort', e.target.value)} aria-label="Ordenação">
          <option value="">Ordem: próxima ação recomendada</option>
          <option value="prioridade">Ordem: prioridade</option>
          <option value="prazo">Ordem: prazo</option>
          <option value="impacto">Ordem: impacto</option>
          <option value="recentes">Ordem: atualizadas recentemente</option>
        </select>
        <button className="btn sm ghost" onClick={() => setShowMore((s) => !s)} aria-expanded={showMore}>
          <Filter size={14} /> Mais filtros
        </button>
        {active > 0 && (
          <button className="btn sm ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            <X size={14} /> Limpar ({active})
          </button>
        )}
      </div>
      {showMore && (
        <div className="toolbar">
          <input className="input" placeholder="Responsável ou envolvido" value={f.responsible} onChange={(e) => set('responsible', e.target.value)} list="avant-people-filter" aria-label="Responsável" />
          <datalist id="avant-people-filter">{meta?.people.map((p) => <option key={p} value={p} />)}</datalist>
          <select className="select" value={f.category} onChange={(e) => set('category', e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {meta?.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select className="select" value={f.origin} onChange={(e) => set('origin', e.target.value)} aria-label="Origem">
            <option value="">Todas as origens</option>
            {Object.entries(ORIGIN_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label className="small muted">
            Prazo de <input className="input" type="date" value={f.from} onChange={(e) => set('from', e.target.value)} style={{ width: 150 }} />
          </label>
          <label className="small muted">
            até <input className="input" type="date" value={f.to} onChange={(e) => set('to', e.target.value)} style={{ width: 150 }} />
          </label>
        </div>
      )}

      <ErrorBox error={error} />
      <Panel title="Tarefas" icon={<ListChecks />} count={data ? `${data.length} resultado(s)` : undefined} flush>
        {loading && !data ? (
          <Skeleton rows={8} />
        ) : data && data.length ? (
          <ul className="task-list">
            {data.map((t) => (
              <TaskRow key={t.id} task={t} why={f.sort ? undefined : t.priority_reasons.filter((r) => r.points > 0).sort((a, b) => b.points - a.points).slice(0, 1).map((r) => r.text)} />
            ))}
          </ul>
        ) : (
          <Empty title="Nenhuma tarefa encontrada">{active ? 'Ajuste ou limpe os filtros.' : 'Use a Captura Inteligente ou crie uma tarefa.'}</Empty>
        )}
      </Panel>
      <NewTaskModal open={newTask} onClose={() => setNewTask(false)} />
    </>
  );
}
