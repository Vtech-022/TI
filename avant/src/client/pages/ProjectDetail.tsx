import { ArrowLeft, CalendarRange, Diamond, FileText, GitMerge, Kanban, List, Pencil, Plus, Trash2 } from 'lucide-react';
import { ReactElement, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { emptyProject, projectBody, ProjectForm } from './Projects';
import { TaskRow, useOpenTask } from '../components/TaskRow';
import { Cert, ConfirmDialog, Empty, ErrorBox, Modal, Panel, PriorityBadge, ProgressBar, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { addDays, dateBr, diffDays, localDate, localDateTime } from '../lib/format';
import { useApi, useMutation, useStore } from '../lib/store';
import type { ProjectDetail as Detail, TaskStatus, TaskView } from '../lib/types';

type View = 'lista' | 'kanban' | 'cronograma';

function Tree({ tasks }: { tasks: TaskView[] }) {
  const ids = new Set(tasks.map((t) => t.id));
  const byParent = new Map<number | null, TaskView[]>();
  for (const t of tasks) {
    const key = t.parent_id != null && ids.has(t.parent_id) ? t.parent_id : null;
    byParent.set(key, [...(byParent.get(key) ?? []), t]);
  }
  const render = (parent: number | null, depth: number): ReactElement[] =>
    (byParent.get(parent) ?? [])
      .sort((a, b) => (parent == null ? 0 : a.position - b.position))
      .flatMap((t) => [
        <div key={t.id} style={{ paddingLeft: depth * 26, borderLeft: depth ? '1px dashed var(--line-strong)' : undefined, marginLeft: depth ? 18 : 0 }}>
          <ul className="task-list">
            <TaskRow task={t} showProject={false} />
          </ul>
          {t.blockers.length > 0 && (
            <div className="small" style={{ padding: '0 18px 10px 56px', color: 'var(--blocked)' }}>
              <GitMerge size={12} style={{ verticalAlign: -1 }} /> Depende de: {t.blockers.map((b) => `${b.title}${b.status === 'concluida' ? ' ✓' : ''}${b.certainty === 'inferida' ? ' (inferida)' : ''}`).join(' · ')}
            </div>
          )}
        </div>,
        ...render(t.id, depth + 1)
      ]);
  return <div>{render(null, 0)}</div>;
}

const COLUMNS: { key: string; label: string; statuses: TaskStatus[]; target: TaskStatus }[] = [
  { key: 'pendente', label: 'Pendente', statuses: ['pendente'], target: 'pendente' },
  { key: 'andamento', label: 'Em andamento', statuses: ['em_andamento'], target: 'em_andamento' },
  { key: 'espera', label: 'Aguardando / bloqueada', statuses: ['aguardando', 'bloqueada'], target: 'aguardando' },
  { key: 'concluida', label: 'Concluída', statuses: ['concluida'], target: 'concluida' }
];

function KanbanBoard({ tasks }: { tasks: TaskView[] }) {
  const mutate = useMutation();
  const openTask = useOpenTask();
  const [over, setOver] = useState<string | null>(null);
  const parents = new Set(tasks.map((t) => t.parent_id));
  const leaves = tasks.filter((t) => !parents.has(t.id) && t.status !== 'cancelada');
  return (
    <div className="kanban">
      {COLUMNS.map((col) => {
        const items = leaves.filter((t) => col.statuses.includes(t.status));
        return (
          <div
            key={col.key}
            className={`kanban-col${over === col.key ? ' over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(col.key);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = Number(e.dataTransfer.getData('text/plain'));
              const t = tasks.find((x) => x.id === id);
              if (!t || col.statuses.includes(t.status)) return;
              mutate(() => api.post(`/api/tasks/${id}/status`, { status: col.target }), `"${t.title}" → ${col.label}`);
            }}
          >
            <header>
              <span>{col.label}</span>
              <span className="mono muted">{items.length}</span>
            </header>
            <div className="cards">
              {items.map((t) => (
                <div
                  key={t.id}
                  className="kcard"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', String(t.id))}
                  onClick={() => openTask(t.id)}
                  onKeyDown={(e) => e.key === 'Enter' && openTask(t.id)}
                  tabIndex={0}
                  role="button"
                >
                  <div className="t">{t.title}</div>
                  <div className="btn-row">
                    {t.status !== 'concluida' && <PriorityBadge p={t.effective_priority} />}
                    {t.is_blocked && <span className="badge blocked">Bloqueada</span>}
                    {t.due_date && <span className="small mono muted">{dateBr(t.due_date)}</span>}
                  </div>
                  {t.parent_title && <div className="small muted" style={{ marginTop: 4 }}>↳ {t.parent_title}</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Timeline({ tasks, milestones, today }: { tasks: TaskView[]; milestones: Detail['milestones']; today: string }) {
  const openTask = useOpenTask();
  const dated = tasks.filter((t) => t.due_date && t.status !== 'cancelada');
  const undated = tasks.filter((t) => !t.due_date && t.status !== 'cancelada' && t.status !== 'concluida');
  const starts = dated.map((t) => localDate(t.created_at));
  const ends = [...dated.map((t) => t.due_date!), ...milestones.filter((m) => m.due_date).map((m) => m.due_date!)];
  if (!ends.length)
    return (
      <Empty icon={<CalendarRange />} title="Nenhuma tarefa com prazo">
        O cronograma mostra tarefas com prazo e marcos. {undated.length} tarefa(s) sem prazo.
      </Empty>
    );
  const min = [addDays(today, -3), ...starts].sort()[0];
  const max = addDays([...ends, addDays(today, 7)].sort().reverse()[0], 3);
  const span = Math.max(diffDays(min, max), 1);
  const pct = (d: string) => `${(diffDays(min, d) / span) * 100}%`;
  const ticks = Array.from({ length: 6 }, (_, i) => addDays(min, Math.round((span * i) / 5)));
  return (
    <div className="gantt">
      <div className="gantt-grid">
        <div className="gantt-row" style={{ minHeight: 28 }}>
          <div className="gantt-label small muted">Tarefa</div>
          <div className="gantt-track" style={{ minHeight: 28 }}>
            {ticks.map((t) => (
              <span key={t} className="small mono muted" style={{ position: 'absolute', left: pct(t), top: 6, transform: 'translateX(-50%)' }}>
                {dateBr(t).slice(0, 5)}
              </span>
            ))}
          </div>
        </div>
        {milestones.filter((m) => m.due_date).map((m) => (
          <div className="gantt-row" key={`m${m.id}`}>
            <div className="gantt-label">
              <Diamond size={12} style={{ color: 'var(--gold-500)', verticalAlign: -1 }} /> {m.title}
            </div>
            <div className="gantt-track">
              <span className="gantt-today" style={{ left: pct(today) }} />
              <Diamond size={16} style={{ position: 'absolute', top: 11, left: pct(m.due_date!), transform: 'translateX(-50%)', color: m.done ? 'var(--ok)' : 'var(--gold-500)', fill: 'currentColor' }} aria-label={`Marco ${m.title} em ${dateBr(m.due_date)}`} />
            </div>
          </div>
        ))}
        {dated
          .sort((a, b) => a.due_date!.localeCompare(b.due_date!))
          .map((t) => {
            const start = [localDate(t.created_at), t.due_date!].sort()[0];
            const width = Math.max(diffDays(start, t.due_date!), 1);
            return (
              <div className="gantt-row" key={t.id}>
                <button className="gantt-label" style={{ background: 'none', border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => openTask(t.id)} title={t.title}>
                  {t.is_blocked ? '🔒 ' : ''}
                  {t.title}
                </button>
                <div className="gantt-track">
                  <span className="gantt-today" style={{ left: pct(today) }} title="Hoje" />
                  <span
                    className={`gantt-bar${t.certainty.due_date === 'inferida' ? ' inferred' : ''}${t.status === 'concluida' ? ' done' : ''}`}
                    style={{ left: pct(start), width: `${(width / span) * 100}%` }}
                    title={`${t.title}: até ${dateBr(t.due_date)}${t.certainty.due_date === 'inferida' ? ' (data inferida)' : ''}`}
                  >
                    {dateBr(t.due_date).slice(0, 5)}
                  </span>
                </div>
              </div>
            );
          })}
      </div>
      <div className="legend" style={{ padding: '10px 12px' }}>
        <span>
          <i style={{ background: 'var(--navy-600)' }} />
          Prazo registrado
        </span>
        <span>
          <i style={{ background: 'var(--gold-400)' }} />
          Prazo inferido
        </span>
        <span>
          <i style={{ background: 'var(--ok)' }} />
          Concluída
        </span>
        <span>
          <i style={{ background: 'var(--critica)' }} />
          Hoje
        </span>
      </div>
      {undated.length > 0 && <p className="small muted" style={{ padding: '0 12px 12px' }}>{undated.length} tarefa(s) aberta(s) sem prazo não aparecem no cronograma.</p>}
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const { data, error } = useApi<Detail>(`/api/projects/${id}`);
  const { meta } = useStore();
  const navigate = useNavigate();
  const mutate = useMutation();
  const [view, setView] = useState<View>(() => {
    try {
      return (sessionStorage.getItem('avant:project-view') as View) || 'lista';
    } catch {
      return 'lista';
    }
  });
  const [editing, setEditing] = useState<Record<string, string> | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const [milestone, setMilestone] = useState({ title: '', due_date: '' });
  const [newTask, setNewTask] = useState('');
  const links = useMemo(() => (data ? data.tasks.flatMap((t) => t.blockers.map((b) => ({ from: b, to: t }))) : []), [data]);
  const changeView = (v: View) => {
    setView(v);
    try {
      sessionStorage.setItem('avant:project-view', v);
    } catch {
      /* preferência não persistida */
    }
  };
  if (error) return <ErrorBox error={error} />;
  if (!data || !meta) return <Skeleton rows={8} />;
  const p = data.project;
  const open = data.tasks.filter((t) => t.status !== 'concluida' && t.status !== 'cancelada');
  const closed = data.tasks.filter((t) => t.status === 'concluida' || t.status === 'cancelada');
  return (
    <>
      <div className="page-head">
        <div>
          <button className="btn sm ghost" onClick={() => navigate('/projetos')} style={{ marginBottom: 8 }}>
            <ArrowLeft size={14} /> Projetos
          </button>
          <div className="eyebrow">Projeto · {p.status}</div>
          <h1>{p.name}</h1>
          {p.objective && <p>{p.objective}</p>}
        </div>
        <div className="btn-row">
          <button
            className="btn"
            onClick={() => setEditing({ ...emptyProject, name: p.name, objective: p.objective ?? '', description: p.description ?? '', owners: p.owners.join(', '), keywords: p.keywords.join(', '), status: p.status })}
          >
            <Pencil size={16} /> Editar
          </button>
          <button className="btn danger" onClick={() => setAskDelete(true)}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <div className="kpi" style={{ cursor: 'default' }}>
          <div className="label">Progresso real</div>
          <div className="value">{p.progress.percent ?? 0}%</div>
          <ProgressBar value={p.progress.percent} />
          <div className="hint" style={{ marginTop: 6 }}>
            {p.progress.done} de {p.progress.total} tarefas folha
          </div>
        </div>
        <div className="kpi" style={{ cursor: 'default' }}>
          <div className="label">Abertas</div>
          <div className="value">{p.open}</div>
          <div className="hint">{p.blocked} bloqueada(s)</div>
        </div>
        <div className="kpi" style={{ cursor: 'default' }}>
          <div className="label">Próxima entrega</div>
          <div className="value" style={{ fontSize: 18 }}>
            {p.next_due ? dateBr(p.next_due.date) : '—'}
          </div>
          <div className="hint">{p.next_due ? <>{p.next_due.title} {p.next_due.certainty === 'inferida' && <Cert c="inferida" />}</> : 'Sem prazos registrados'}</div>
        </div>
        <div className="kpi" style={{ cursor: 'default' }}>
          <div className="label">Próxima ação recomendada</div>
          <div className="hint" style={{ fontSize: 13, color: 'var(--text)', marginTop: 6 }}>
            {p.next_action?.text ?? 'Não definida'}
          </div>
        </div>
      </div>
      {p.risks.length > 0 && (
        <div className="error-box" style={{ marginBottom: 18 }}>
          <strong>Riscos:</strong> {p.risks.join(' ')}
        </div>
      )}

      <div className="grid main-side">
        <div className="grid" style={{ alignContent: 'start' }}>
          <Panel
            title="Tarefas"
            count={`${open.length} abertas · ${closed.length} encerradas`}
            flush
            actions={
              <div className="seg" role="group" aria-label="Visualização">
                <button aria-pressed={view === 'lista'} onClick={() => changeView('lista')}>
                  <List size={13} /> Lista
                </button>
                <button aria-pressed={view === 'kanban'} onClick={() => changeView('kanban')}>
                  <Kanban size={13} /> Kanban
                </button>
                <button aria-pressed={view === 'cronograma'} onClick={() => changeView('cronograma')}>
                  <CalendarRange size={13} /> Cronograma
                </button>
              </div>
            }
          >
            {view === 'lista' && (data.tasks.length ? <Tree tasks={data.tasks} /> : <Empty title="Nenhuma tarefa neste projeto" />)}
            {view === 'kanban' && (
              <div style={{ padding: 12 }}>
                <KanbanBoard tasks={data.tasks} />
                <p className="small muted" style={{ marginTop: 8 }}>
                  Arraste os cartões para mudar o status. Tarefas principais acompanham as subtarefas e não aparecem no quadro.
                </p>
              </div>
            )}
            {view === 'cronograma' && <Timeline tasks={data.tasks} milestones={data.milestones} today={meta.today} />}
            <form
              className="btn-row"
              style={{ padding: 12, borderTop: '1px solid var(--line)' }}
              onSubmit={async (e) => {
                e.preventDefault();
                if (newTask.trim().length < 2) return;
                const r = await mutate(() => api.post('/api/tasks', { title: newTask.trim(), project_id: p.id }), 'Tarefa adicionada ao projeto.');
                if (r) setNewTask('');
              }}
            >
              <input className="input" style={{ flex: 1 }} placeholder="Adicionar tarefa ao projeto" value={newTask} onChange={(e) => setNewTask(e.target.value)} aria-label="Nova tarefa do projeto" />
              <button className="btn sm" type="submit">
                <Plus size={14} /> Adicionar
              </button>
            </form>
          </Panel>
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          {p.description && (
            <Panel title="Descrição">
              <p className="small">{p.description}</p>
              {p.owners.length > 0 && <p className="small muted" style={{ marginTop: 8 }}>Responsáveis: {p.owners.join(', ')}</p>}
            </Panel>
          )}
          <Panel title="Mapa de dependências" icon={<GitMerge />} count={links.length} flush>
            {links.length === 0 && <Empty title="Sem dependências registradas" />}
            <ul className="list-simple">
              {links.map((l, i) => (
                <li key={i} className="small">
                  <span style={{ textDecoration: l.from.status === 'concluida' ? 'line-through' : undefined }}>{l.from.title}</span>
                  <span style={{ color: 'var(--gold-500)', fontWeight: 700 }}> → </span>
                  <span>{l.to.title}</span> <Cert c={l.from.certainty as any} />
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Marcos" icon={<Diamond />} count={data.milestones.length} flush>
            <ul className="list-simple">
              {data.milestones.map((m) => (
                <li key={m.id} className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={m.done} onChange={(e) => mutate(() => api.patch(`/api/milestones/${m.id}`, { done: e.target.checked }))} aria-label={`Marco ${m.title} concluído`} />
                  <span style={{ flex: 1, textDecoration: m.done ? 'line-through' : undefined }}>{m.title}</span>
                  <span className="mono muted">{m.due_date ? dateBr(m.due_date) : 'sem data'}</span>
                  <button className="icon-btn" aria-label="Excluir marco" onClick={() => mutate(() => api.del(`/api/milestones/${m.id}`), 'Marco excluído.')}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="btn-row"
              style={{ padding: 12, borderTop: '1px solid var(--line)' }}
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await mutate(() => api.post(`/api/projects/${p.id}/milestones`, { title: milestone.title, due_date: milestone.due_date || null }), 'Marco criado.');
                if (r) setMilestone({ title: '', due_date: '' });
              }}
            >
              <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Novo marco" required minLength={2} value={milestone.title} onChange={(e) => setMilestone({ ...milestone, title: e.target.value })} />
              <input className="input" type="date" style={{ width: 150 }} value={milestone.due_date} onChange={(e) => setMilestone({ ...milestone, due_date: e.target.value })} aria-label="Data do marco" />
              <button className="btn sm" type="submit">
                Adicionar
              </button>
            </form>
          </Panel>
          <Panel title="Documentos" icon={<FileText />} count={data.documents.length} flush>
            {data.documents.length === 0 && <Empty title="Nenhum documento vinculado">Vincule arquivos na área Arquivos e Documentos.</Empty>}
            <ul className="list-simple">
              {data.documents.map((d) => (
                <li key={d.id} className="small">
                  <a href={`/api/documents/${d.id}/file`}>{d.filename}</a> <span className="muted">· {localDateTime(d.created_at)}</span>
                </li>
              ))}
            </ul>
          </Panel>
          {data.events.length > 0 && (
            <Panel title="Eventos" flush>
              <ul className="list-simple">
                {data.events.map((e) => (
                  <li key={e.id} className="small clickable" onClick={() => navigate(`/agenda?evento=${e.id}`)}>
                    {e.title} · {localDateTime(e.start_at)}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Histórico do projeto" flush>
            <ul className="list-simple">
              {data.history.slice(0, 10).map((h) => (
                <li key={h.id} className="small">
                  {h.summary} <span className="muted">· {localDateTime(h.created_at)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <Modal
        open={!!editing}
        title="Editar projeto"
        onClose={() => setEditing(null)}
        footer={
          <>
            <button className="btn" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button
              className="btn primary"
              disabled={!editing || editing.name.trim().length < 2}
              onClick={async () => {
                const r = await mutate(() => api.patch(`/api/projects/${p.id}`, projectBody(editing!)), 'Projeto atualizado.');
                if (r) setEditing(null);
              }}
            >
              Salvar
            </button>
          </>
        }
      >
        {editing && <ProjectForm value={editing} onChange={setEditing} />}
      </Modal>
      <ConfirmDialog
        open={askDelete}
        title="Excluir projeto?"
        message={data.tasks.length ? 'Este projeto possui tarefas e não pode ser excluído. Mova as tarefas ou altere o status para “encerrado”.' : `"${p.name}" será excluído. A operação pode ser desfeita pelo Histórico.`}
        confirmLabel="Excluir"
        danger
        onCancel={() => setAskDelete(false)}
        onConfirm={async () => {
          setAskDelete(false);
          const r = await mutate(() => api.del(`/api/projects/${p.id}`), 'Projeto excluído.');
          if (r) navigate('/projetos');
        }}
      />
    </>
  );
}
