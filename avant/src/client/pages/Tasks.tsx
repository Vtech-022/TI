import { ArrowDownUp, ListChecks, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NewTaskModal } from '../components/Overlays';
import { TaskRow } from '../components/TaskRow';
import { Empty, ErrorBox, Field, Panel, Skeleton } from '../components/ui';
import { qs } from '../lib/api';
import { dateBr } from '../lib/format';
import { useApi, useStore } from '../lib/store';
import { ORIGIN_LABEL, PRIORITY_LABEL, STATUS_LABEL } from '../lib/types';
import type { TaskView } from '../lib/types';

const FILTER_KEYS = ['q', 'priority', 'status', 'project_id', 'responsible', 'category', 'origin', 'due', 'deps', 'from', 'to', 'sort', 'include_closed'] as const;
type Key = (typeof FILTER_KEYS)[number];

const DUE: Record<string, string> = { atrasadas: 'Atrasadas', hoje: 'Vencem hoje', semana: 'Próximos 7 dias', inferidas: 'Datas inferidas', sem_prazo: 'Sem prazo' };
const DEPS: Record<string, string> = { bloqueadas: 'Bloqueadas', bloqueiam: 'Bloqueiam outras', terceiros: 'Aguardando terceiros', sem: 'Sem dependências' };
const SORT: Record<string, string> = { '': 'Recomendada', prioridade: 'Prioridade', prazo: 'Prazo', impacto: 'Impacto', recentes: 'Atualização recente' };

export default function Tasks() {
  const [params, setParams] = useSearchParams();
  const { meta } = useStore();
  const [newTask, setNewTask] = useState(false);
  const [panel, setPanel] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ''])) as Record<Key, string>;
  const [text, setText] = useState(f.q);
  const { data, error, loading } = useApi<TaskView[]>(`/api/tasks${qs(f)}`);

  const set = (k: Key, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  // A busca por texto aplica após uma pausa curta, sem interromper a digitação.
  useEffect(() => {
    const h = setTimeout(() => text !== f.q && set('q', text), 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  useEffect(() => {
    if (!panel) return;
    const onDoc = (e: MouseEvent) => !barRef.current?.contains(e.target as Node) && setPanel(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPanel(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [panel]);

  const projectName = (id: string) => (id === 'none' ? 'Sem projeto' : (meta?.projects.find((p) => String(p.id) === id)?.name ?? id));
  const chips: { key: Key; label: string }[] = [];
  if (f.priority) chips.push({ key: 'priority', label: `Prioridade: ${PRIORITY_LABEL[f.priority as keyof typeof PRIORITY_LABEL] ?? f.priority}` });
  if (f.status) chips.push({ key: 'status', label: `Status: ${STATUS_LABEL[f.status as keyof typeof STATUS_LABEL] ?? f.status}` });
  if (f.include_closed) chips.push({ key: 'include_closed', label: 'Inclui concluídas' });
  if (f.project_id) chips.push({ key: 'project_id', label: projectName(f.project_id) });
  if (f.due) chips.push({ key: 'due', label: DUE[f.due] ?? f.due });
  if (f.deps) chips.push({ key: 'deps', label: DEPS[f.deps] ?? f.deps });
  if (f.responsible) chips.push({ key: 'responsible', label: `Pessoa: ${f.responsible}` });
  if (f.category) chips.push({ key: 'category', label: f.category });
  if (f.origin) chips.push({ key: 'origin', label: ORIGIN_LABEL[f.origin as keyof typeof ORIGIN_LABEL] ?? f.origin });
  if (f.from) chips.push({ key: 'from', label: `Prazo a partir de ${dateBr(f.from)}` });
  if (f.to) chips.push({ key: 'to', label: `Prazo até ${dateBr(f.to)}` });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Gestão</div>
          <h1>Minhas Pendências</h1>
        </div>
        <button className="btn primary" onClick={() => setNewTask(true)}>
          <Plus size={16} /> Nova tarefa
        </button>
      </div>

      <div className="filterbar" role="search" ref={barRef}>
        <label className="fb-search">
          <Search size={15} aria-hidden />
          <input placeholder="Buscar por tarefa, pessoa ou projeto" value={text} onChange={(e) => setText(e.target.value)} aria-label="Buscar nas pendências" />
          {text && (
            <button className="fb-btn" onClick={() => setText('')} aria-label="Limpar busca" style={{ padding: '0 6px' }}>
              <X />
            </button>
          )}
        </label>
        <span className="sep" aria-hidden />
        <button className="fb-btn" aria-expanded={panel} onClick={() => setPanel((p) => !p)}>
          <SlidersHorizontal aria-hidden /> Filtros {chips.length > 0 && <span className="fb-count">{chips.length}</span>}
        </button>
        <span className="sep" aria-hidden />
        <label className="fb-btn" style={{ cursor: 'pointer' }}>
          <ArrowDownUp aria-hidden />
          <select value={f.sort} onChange={(e) => set('sort', e.target.value)} aria-label="Ordenação" style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', outline: 'none' }}>
            {Object.entries(SORT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>

        {panel && (
          <div className="fb-panel" role="dialog" aria-label="Filtros">
            <Field label="Prioridade">
              <select className="select" value={f.priority} onChange={(e) => set('priority', e.target.value)}>
                <option value="">Todas</option>
                {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                className="select"
                value={f.status || (f.include_closed ? '__all' : '')}
                onChange={(e) => {
                  const next = new URLSearchParams(params);
                  next.delete('status');
                  next.delete('include_closed');
                  if (e.target.value === '__all') next.set('include_closed', '1');
                  else if (e.target.value) next.set('status', e.target.value);
                  setParams(next, { replace: true });
                }}
              >
                <option value="">Abertas</option>
                <option value="__all">Todas, inclusive concluídas</option>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Projeto">
              <select className="select" value={f.project_id} onChange={(e) => set('project_id', e.target.value)}>
                <option value="">Todos</option>
                <option value="none">Sem projeto</option>
                {meta?.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prazo">
              <select className="select" value={f.due} onChange={(e) => set('due', e.target.value)}>
                <option value="">Qualquer</option>
                {Object.entries(DUE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Dependências">
              <select className="select" value={f.deps} onChange={(e) => set('deps', e.target.value)}>
                <option value="">Todas</option>
                {Object.entries(DEPS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pessoa">
              <input className="input" value={f.responsible} onChange={(e) => set('responsible', e.target.value)} list="avant-people-filter" placeholder="Responsável ou envolvido" />
            </Field>
            <datalist id="avant-people-filter">{meta?.people.map((p) => <option key={p} value={p} />)}</datalist>
            <Field label="Categoria">
              <select className="select" value={f.category} onChange={(e) => set('category', e.target.value)}>
                <option value="">Todas</option>
                {meta?.categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Origem">
              <select className="select" value={f.origin} onChange={(e) => set('origin', e.target.value)}>
                <option value="">Todas</option>
                {Object.entries(ORIGIN_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prazo a partir de">
              <input className="input" type="date" value={f.from} onChange={(e) => set('from', e.target.value)} />
            </Field>
            <Field label="Prazo até">
              <input className="input" type="date" value={f.to} onChange={(e) => set('to', e.target.value)} />
            </Field>
            <div className="btn-row full" style={{ justifyContent: 'space-between' }}>
              <button
                className="btn sm ghost"
                onClick={() => {
                  setText('');
                  setParams(f.sort ? new URLSearchParams({ sort: f.sort }) : new URLSearchParams(), { replace: true });
                }}
              >
                Limpar filtros
              </button>
              <button className="btn sm primary" onClick={() => setPanel(false)}>
                Ver {data?.length ?? 0} resultado(s)
              </button>
            </div>
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="fb-chips">
          {chips.map((c) => (
            <button key={c.key} className="fb-chip" onClick={() => set(c.key, '')} aria-label={`Remover filtro ${c.label}`}>
              {c.label} <X aria-hidden />
            </button>
          ))}
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
          <Empty title="Nenhuma tarefa encontrada">{chips.length || f.q ? 'Ajuste ou limpe os filtros.' : 'Use a Captura rápida ou crie uma tarefa.'}</Empty>
        )}
      </Panel>
      <NewTaskModal open={newTask} onClose={() => setNewTask(false)} />
    </>
  );
}
