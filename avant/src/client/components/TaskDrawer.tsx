// Painel lateral de tarefa: detalhes, justificativa da prioridade, dependências, terceiros, histórico e edição.
import { CalendarDays, FileText, History, Link2, Pencil, Plus, Trash2, Undo2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useBlocker, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { dateBr, localDateTime, timeAgo } from '../lib/format';
import { useApi, useMutation } from '../lib/store';
import { CERTAINTY_LABEL, LEVEL_LABEL, ORIGIN_LABEL, PRIORITY_LABEL, STATUS_LABEL, TASK_STATUSES } from '../lib/types';
import type { Priority, TaskDetail, TaskStatus, TaskView } from '../lib/types';
import { draftFrom, draftToBody, TaskForm, useDirty } from './TaskForm';
import { CompleteButton, TaskRow } from './TaskRow';
import { BlockedBadge, Cert, ConfirmDialog, Drawer, DueBadge, ErrorBox, Modal, PriorityBadge, Skeleton, StatusBadge } from './ui';

export function TaskDrawerHost() {
  const [params, setParams] = useSearchParams();
  const id = params.get('tarefa');
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete('tarefa');
    setParams(next);
  };
  if (!id) return null;
  return <TaskDrawer key={id} id={Number(id)} onClose={close} />;
}

function TaskDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, error, loading } = useApi<TaskDetail>(`/api/tasks/${id}`);
  const mutate = useMutation();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const form = useDirty(draftFrom());
  const [askDiscard, setAskDiscard] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [override, setOverride] = useState<{ priority: string; reason: string } | null>(null);
  const [addDep, setAddDep] = useState(false);
  const [newSub, setNewSub] = useState('');
  const [waitForm, setWaitForm] = useState<{ party: string; description: string; follow_up_at: string } | null>(null);
  const [allTasks, setAllTasks] = useState<TaskView[]>([]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => editing && form.dirty && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (data && !editing) form.reset(draftFrom(data.task));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, editing]);

  useEffect(() => {
    if (editing || addDep) api.get<TaskView[]>('/api/tasks?include_closed=1').then(setAllTasks).catch(() => setAllTasks([]));
  }, [editing, addDep]);

  const requestClose = () => {
    if (editing && form.dirty) setAskDiscard(true);
    else onClose();
  };

  const t = data?.task;

  const save = async () => {
    if (!t) return;
    const r = await mutate(() => api.patch(`/api/tasks/${t.id}`, draftToBody(form.value, t)), 'Alterações salvas.');
    if (r) setEditing(false);
  };

  const header = (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {t && <CompleteButton task={t} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="small muted" style={{ marginBottom: 2 }}>
            {t?.project_name ?? 'Sem projeto'} {t?.parent_title ? `› ${t.parent_title}` : ''}
          </div>
          <h2 style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 600 }}>{t?.title ?? 'Carregando…'}</h2>
          {t && (
            <div className="btn-row" style={{ marginTop: 8 }}>
              <PriorityBadge p={t.effective_priority} manual={!!t.priority_override} />
              <StatusBadge s={t.status} />
              {t.is_blocked && <BlockedBadge />}
              <DueBadge days={t.days_to_due} date={t.due_date} />
            </div>
          )}
        </div>
        <button className="icon-btn" onClick={requestClose} aria-label="Fechar">
          <X />
        </button>
      </div>
    </div>
  );

  const footer = t ? (
    editing ? (
      <>
        <span className="small muted" style={{ marginRight: 'auto', alignSelf: 'center' }}>
          {form.dirty ? 'Alterações não salvas' : 'Sem alterações'}
        </span>
        <button className="btn" onClick={() => (form.dirty ? setAskDiscard(true) : setEditing(false))}>
          Cancelar
        </button>
        <button className="btn primary" onClick={save} disabled={!form.dirty || form.value.title.trim().length < 2}>
          Salvar
        </button>
      </>
    ) : (
      <>
        <button className="btn danger" onClick={() => setAskDelete(true)} style={{ marginRight: 'auto' }}>
          <Trash2 /> Excluir
        </button>
        <button className="btn" onClick={() => setEditing(true)}>
          <Pencil /> Editar
        </button>
      </>
    )
  ) : null;

  return (
    <>
      <Drawer open onClose={requestClose} header={header} footer={footer} label={t ? `Tarefa: ${t.title}` : 'Tarefa'}>
        <ErrorBox error={error} />
        {loading && !data && <Skeleton rows={6} />}
        {t && data && editing && (
          <TaskForm draft={form.value} onChange={form.setValue} parentOptions={allTasks.filter((x) => x.id !== t.id).map((x) => ({ id: x.id, title: x.title }))} />
        )}
        {t && data && !editing && (
          <>
            <div className="btn-row">
              <label className="small muted" htmlFor="status-select">
                Status
              </label>
              <select
                id="status-select"
                className="select"
                style={{ width: 'auto' }}
                value={t.status}
                onChange={(e) => {
                  const s = e.target.value as TaskStatus;
                  if (s === 'concluida') return; // conclusão usa o botão com as regras de verificação
                  mutate(() => api.post(`/api/tasks/${t.id}/status`, { status: s }), `Status: ${STATUS_LABEL[s]}`);
                }}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s} disabled={s === 'concluida' && t.status !== 'concluida'}>
                    {STATUS_LABEL[s]}
                    {s === 'concluida' && t.status !== 'concluida' ? ' (use o botão de conclusão)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="section">
              <h3>Por que esta prioridade</h3>
              <ul className="reasons">
                {t.priority_override && (
                  <li>
                    <span>
                      <strong>Ajuste manual para {PRIORITY_LABEL[t.priority_override]}:</strong> {t.priority_override_reason} (cálculo automático: {PRIORITY_LABEL[t.priority]})
                    </span>
                  </li>
                )}
                {t.priority_reasons.map((r, i) => (
                  <li key={i}>
                    <span>{r.text}</span>
                    <span className={`pts ${r.points > 0 ? 'pos' : r.points < 0 ? 'neg' : ''}`}>{r.points > 0 ? `+${r.points}` : r.points}</span>
                  </li>
                ))}
                <li>
                  <span className="muted">Pontuação total (Crítica ≥ 70 · Alta ≥ 35 · Normal ≥ 15)</span>
                  <span className="pts">{t.priority_score}</span>
                </li>
              </ul>
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button className="btn sm" onClick={() => setOverride({ priority: t.priority_override ?? t.priority, reason: t.priority_override_reason ?? '' })}>
                  Ajustar prioridade
                </button>
                {t.priority_override && (
                  <button className="btn sm ghost" onClick={() => mutate(() => api.post(`/api/tasks/${t.id}/priority`, { priority: null }), 'Prioridade automática restaurada.')}>
                    <Undo2 size={14} /> Voltar ao cálculo automático
                  </button>
                )}
              </div>
            </div>

            <div className="section">
              <h3>Informações</h3>
              <dl className="kv">
                <dt>Prazo</dt>
                <dd>
                  {t.due_date ? (
                    <>
                      <span className="mono">
                        {dateBr(t.due_date)}
                        {t.due_time ? ` ${t.due_time}` : ''}
                      </span>
                      <Cert c={t.certainty.due_date} />
                      {t.certainty.due_date === 'inferida' && (
                        <button
                          className="btn sm"
                          onClick={() => mutate(() => api.patch(`/api/tasks/${t.id}`, { certainty: { ...t.certainty, due_date: 'confirmada' } }), 'Prazo confirmado.')}
                        >
                          Confirmar data
                        </button>
                      )}
                    </>
                  ) : (
                    <Cert c="desconhecida" />
                  )}
                </dd>
                {t.due_note && (
                  <>
                    <dt>Anotação do prazo</dt>
                    <dd className="small">{t.due_note}</dd>
                  </>
                )}
                <dt>Projeto</dt>
                <dd>
                  {t.project_id ? (
                    <a href={`/projetos/${t.project_id}`} onClick={(e) => (e.preventDefault(), navigate(`/projetos/${t.project_id}`))}>
                      {t.project_name}
                    </a>
                  ) : (
                    <Cert c="desconhecida" label="A confirmar" />
                  )}
                  {t.project_id && t.certainty.project && t.certainty.project !== 'explicita' && <Cert c={t.certainty.project} />}
                </dd>
                <dt>Responsável</dt>
                <dd>
                  {t.responsible ?? <Cert c="desconhecida" />}
                  {t.responsible && <Cert c={t.certainty.responsible} />}
                </dd>
                <dt>Envolvidos</dt>
                <dd>{t.involved.length ? t.involved.join(', ') : <span className="muted">—</span>}</dd>
                <dt>Impacto</dt>
                <dd>
                  {t.impact ? LEVEL_LABEL[t.impact] : <Cert c="desconhecida" />}
                  {t.impact && t.certainty.impact && <Cert c={t.certainty.impact} />}
                </dd>
                <dt>Esforço</dt>
                <dd>{t.effort ? LEVEL_LABEL[t.effort] : <Cert c="desconhecida" />}</dd>
                <dt>Categoria</dt>
                <dd>
                  {t.category ?? <Cert c="desconhecida" />}
                  {t.category && t.certainty.category === 'inferida' && <Cert c="inferida" />}
                </dd>
                <dt>Próxima ação</dt>
                <dd>{t.next_action ?? <span className="muted">Não definida</span>}</dd>
                {t.description && (
                  <>
                    <dt>Descrição</dt>
                    <dd>{t.description}</dd>
                  </>
                )}
                <dt>Origem</dt>
                <dd>
                  {ORIGIN_LABEL[t.origin]}
                  {t.capture_id && (
                    <a href="/captura" onClick={(e) => (e.preventDefault(), navigate(`/historico?capture_id=${t.capture_id}`))}>
                      captura #{t.capture_id}
                    </a>
                  )}
                  <span className="muted small">· registrada em {localDateTime(t.created_at)}</span>
                </dd>
                {t.requires_verification && (
                  <>
                    <dt>Verificação</dt>
                    <dd className="small">{t.verification_note}</dd>
                  </>
                )}
              </dl>
            </div>

            {t.original_text && (
              <div className="section">
                <h3>Texto original</h3>
                <div className="quote">{t.original_text}</div>
              </div>
            )}

            <div className="section">
              <h3>
                <Link2 size={12} /> Dependências
              </h3>
              {t.blockers.length === 0 && t.dependents.length === 0 && <p className="small muted">Nenhuma dependência registrada.</p>}
              <ul className="list-simple" style={{ border: t.blockers.length + t.dependents.length ? '1px solid var(--line)' : 0, borderRadius: 8 }}>
                {t.blockers.map((b) => (
                  <li key={`b${b.link_id}`} className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>Depende de</span>
                    <strong style={{ textDecoration: b.status === 'concluida' ? 'line-through' : undefined }}>{b.title}</strong>
                    <StatusBadge s={b.status as TaskStatus} />
                    <Cert c={b.certainty as any} />
                    <span style={{ flex: 1 }} />
                    {b.certainty === 'inferida' && (
                      <button className="btn sm" onClick={() => mutate(() => api.patch(`/api/links/${b.link_id}`, { certainty: 'confirmada' }), 'Dependência confirmada.')}>
                        Confirmar
                      </button>
                    )}
                    <button className="btn sm ghost" onClick={() => mutate(() => api.del(`/api/links/${b.link_id}`), 'Dependência removida.')} aria-label="Remover dependência">
                      <X size={14} />
                    </button>
                  </li>
                ))}
                {t.dependents.map((d) => (
                  <li key={`d${d.link_id}`} className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>Necessária para</span>
                    <strong>{d.title}</strong>
                    <Cert c={d.certainty as any} />
                  </li>
                ))}
              </ul>
              <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setAddDep(true)}>
                <Plus size={14} /> Adicionar dependência
              </button>
            </div>

            <div className="section">
              <h3>Subtarefas {t.children.total > 0 && `· ${t.children.total - t.children.open}/${t.children.total}`}</h3>
              {data.children.length > 0 && (
                <ul className="task-list" style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
                  {data.children.map((c) => (
                    <TaskRow key={c.id} task={c} showProject={false} compact />
                  ))}
                </ul>
              )}
              <form
                className="btn-row"
                style={{ marginTop: 8 }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (newSub.trim().length < 2) return;
                  const r = await mutate(() => api.post('/api/tasks', { title: newSub.trim(), parent_id: t.id, project_id: t.project_id }), 'Subtarefa criada.');
                  if (r) setNewSub('');
                }}
              >
                <input className="input" style={{ flex: 1 }} placeholder="Nova subtarefa" value={newSub} onChange={(e) => setNewSub(e.target.value)} aria-label="Nova subtarefa" />
                <button className="btn sm" type="submit">
                  Adicionar
                </button>
              </form>
            </div>

            <div className="section">
              <h3>Aguardando terceiros</h3>
              {t.waits.length === 0 && <p className="small muted">Nenhuma pendência de terceiros.</p>}
              {t.waits.map((w) => (
                <div key={w.id} className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <strong>{w.party}</strong>
                  <span>{w.description}</span>
                  <Cert c={w.certainty} />
                  <span className="badge neutral">{w.status}</span>
                  {w.follow_up_at && <span className="muted">acompanhar em {dateBr(w.follow_up_at)}</span>}
                  <span style={{ flex: 1 }} />
                  {w.status === 'aguardando' && (
                    <button className="btn sm" onClick={() => mutate(() => api.patch(`/api/waits/${w.id}`, { status: 'recebido' }), `Retorno de ${w.party} registrado.`)}>
                      Recebido
                    </button>
                  )}
                </div>
              ))}
              {waitForm ? (
                <form
                  className="form-grid"
                  style={{ marginTop: 10 }}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await mutate(
                      () => api.post('/api/waits', { task_id: t.id, project_id: t.project_id, party: waitForm.party, description: waitForm.description, follow_up_at: waitForm.follow_up_at || null }),
                      'Pendência de terceiro registrada.'
                    );
                    if (r) setWaitForm(null);
                  }}
                >
                  <input className="input" placeholder="Pessoa ou equipe" required minLength={2} value={waitForm.party} onChange={(e) => setWaitForm({ ...waitForm, party: e.target.value })} list="avant-people" />
                  <input className="input" type="date" aria-label="Data de acompanhamento" value={waitForm.follow_up_at} onChange={(e) => setWaitForm({ ...waitForm, follow_up_at: e.target.value })} />
                  <input className="input full" placeholder="O que está sendo aguardado" required minLength={2} value={waitForm.description} onChange={(e) => setWaitForm({ ...waitForm, description: e.target.value })} />
                  <div className="btn-row full">
                    <button className="btn sm primary" type="submit">
                      Registrar
                    </button>
                    <button className="btn sm" type="button" onClick={() => setWaitForm(null)}>
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setWaitForm({ party: '', description: '', follow_up_at: '' })}>
                  <Plus size={14} /> Registrar espera
                </button>
              )}
            </div>

            {(data.documents.length > 0 || data.events.length > 0) && (
              <div className="section">
                <h3>Documentos e eventos</h3>
                {data.documents.map((d) => (
                  <div key={d.id} className="small">
                    <FileText size={13} /> <a href={`/api/documents/${d.id}/file`}>{d.filename}</a>
                  </div>
                ))}
                {data.events.map((e) => (
                  <div key={e.id} className="small">
                    <CalendarDays size={13} /> {e.title} · {localDateTime(e.start_at)}
                  </div>
                ))}
              </div>
            )}

            <div className="section">
              <h3>
                <History size={12} /> Histórico
              </h3>
              <ul className="timeline">
                {data.history.map((h) => (
                  <li key={h.id}>
                    <div style={{ textDecoration: h.undone ? 'line-through' : undefined }}>{h.summary}</div>
                    <div className="small muted">
                      {timeAgo(h.created_at)} · {h.source}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </Drawer>

      <ConfirmDialog
        open={askDiscard}
        title="Descartar alterações?"
        message="Existem alterações não salvas nesta tarefa."
        confirmLabel="Descartar"
        danger
        onCancel={() => setAskDiscard(false)}
        onConfirm={() => {
          setAskDiscard(false);
          setEditing(false);
          if (t) form.reset(draftFrom(t));
        }}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Sair sem salvar?"
        message="A tarefa em edição possui alterações não salvas."
        confirmLabel="Sair e descartar"
        danger
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />
      <ConfirmDialog
        open={askDelete}
        title="Excluir tarefa?"
        message={
          <>
            "{t?.title}" será excluída. A exclusão fica no histórico e pode ser desfeita. {t?.status === 'concluida' && <strong>Esta tarefa está concluída.</strong>}
            {t && t.children.total > 0 && <p style={{ marginTop: 8, color: 'var(--critica)' }}>Ela possui subtarefas: exclua ou mova as subtarefas primeiro.</p>}
          </>
        }
        confirmLabel="Excluir"
        danger
        onCancel={() => setAskDelete(false)}
        onConfirm={async () => {
          setAskDelete(false);
          const r = await mutate(() => api.del(`/api/tasks/${id}`, { confirm: true }), 'Tarefa excluída. É possível desfazer pelo Histórico.');
          if (r) onClose();
        }}
      />
      <Modal
        open={!!override}
        title="Ajustar prioridade"
        onClose={() => setOverride(null)}
        footer={
          <>
            <button className="btn" onClick={() => setOverride(null)}>
              Cancelar
            </button>
            <button
              className="btn primary"
              disabled={!override || override.reason.trim().length < 3}
              onClick={async () => {
                const r = await mutate(() => api.post(`/api/tasks/${id}/priority`, { priority: override!.priority as Priority, reason: override!.reason }), 'Prioridade ajustada.');
                if (r) setOverride(null);
              }}
            >
              Salvar ajuste
            </button>
          </>
        }
      >
        {override && (
          <div className="form-grid">
            <label className="field">
              <span>Prioridade</span>
              <select className="select" value={override.priority} onChange={(e) => setOverride({ ...override, priority: e.target.value })}>
                {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="field full">
              <span>Motivo (obrigatório)</span>
              <input className="input" value={override.reason} onChange={(e) => setOverride({ ...override, reason: e.target.value })} placeholder="Ex.: solicitado pela diretoria" />
            </label>
            <p className="small muted full">O cálculo automático continua visível e é retomado ao remover o ajuste.</p>
          </div>
        )}
      </Modal>
      <AddDependency open={addDep} task={t} tasks={allTasks} onClose={() => setAddDep(false)} />
    </>
  );
}

function AddDependency({ open, task, tasks, onClose }: { open: boolean; task?: TaskView; tasks: TaskView[]; onClose: () => void }) {
  const mutate = useMutation();
  const [blocker, setBlocker] = useState('');
  const [dir, setDir] = useState<'depende' | 'libera'>('depende');
  if (!task) return null;
  return (
    <Modal
      open={open}
      title="Adicionar dependência"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            disabled={!blocker}
            onClick={async () => {
              const body = dir === 'depende' ? { blocker_id: Number(blocker), blocked_id: task.id } : { blocker_id: task.id, blocked_id: Number(blocker) };
              const r = await mutate(() => api.post('/api/links', body), 'Dependência registrada.');
              if (r) {
                setBlocker('');
                onClose();
              }
            }}
          >
            Adicionar
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field full">
          <span>Relação</span>
          <select className="select" value={dir} onChange={(e) => setDir(e.target.value as any)}>
            <option value="depende">"{task.title}" depende de…</option>
            <option value="libera">"{task.title}" é necessária para…</option>
          </select>
        </label>
        <label className="field full">
          <span>Tarefa</span>
          <select className="select" value={blocker} onChange={(e) => setBlocker(e.target.value)}>
            <option value="">Selecione</option>
            {tasks
              .filter((x) => x.id !== task.id)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title} {x.project_name ? `— ${x.project_name}` : ''}
                </option>
              ))}
          </select>
        </label>
        <p className="small muted full">Ciclos são bloqueados automaticamente. {CERTAINTY_LABEL.explicita}: dependências criadas aqui são registradas como explícitas.</p>
      </div>
    </Modal>
  );
}
