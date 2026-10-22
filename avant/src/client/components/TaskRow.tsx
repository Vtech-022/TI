import { CalendarClock, Check, GitBranch, Hourglass, Sparkles, User } from 'lucide-react';
import { labelColor } from '../lib/colors';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { dateBr, relativeDue } from '../lib/format';
import { useMutation, useStore } from '../lib/store';
import type { TaskView } from '../lib/types';
import { BlockedBadge, Cert, DueBadge, Modal, PriorityBadge, StatusBadge } from './ui';

export function useOpenTask() {
  const [params, setParams] = useSearchParams();
  return (id: number) => {
    const next = new URLSearchParams(params);
    next.set('tarefa', String(id));
    setParams(next);
  };
}

/** Botão de conclusão com as regras de negócio: verificação obrigatória e exceções justificadas. */
export function CompleteButton({ task, onDone }: { task: Pick<TaskView, 'id' | 'title' | 'status' | 'requires_verification' | 'verification_note'>; onDone?: () => void }) {
  const mutate = useMutation();
  const { fail } = useStore();
  const [dialog, setDialog] = useState<null | { kind: 'verify' } | { kind: 'pending'; blockers: { id: number; title: string }[]; children: { id: number; title: string }[] }>(null);
  const [verified, setVerified] = useState(false);
  const [reason, setReason] = useState('');
  const [pop, setPop] = useState(false);
  const done = task.status === 'concluida';

  const send = async (body: Record<string, unknown>) => {
    try {
      await api.post(`/api/tasks/${task.id}/status`, { status: 'concluida', ...body });
      setDialog(null);
      setPop(true);
      onDone?.();
      await mutate(
        async () => null,
        `Concluída: ${task.title}`,
        { label: 'Desfazer', run: () => mutate(() => api.post(`/api/tasks/${task.id}/status`, { status: task.status }), 'Conclusão desfeita.') }
      );
    } catch (e) {
      if (e instanceof ApiError && e.code === 'pendencias_abertas') setDialog({ kind: 'pending', ...e.details });
      else if (e instanceof ApiError && e.code === 'verificacao_necessaria') setDialog({ kind: 'verify' });
      else fail(e);
    }
  };

  const click = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (done) {
      mutate(() => api.post(`/api/tasks/${task.id}/status`, { status: 'pendente' }), 'Tarefa reaberta.');
      return;
    }
    if (task.requires_verification) setDialog({ kind: 'verify' });
    else send({});
  };

  return (
    <>
      <button
        className={`check${done ? ' done' : ''}${pop ? ' pop' : ''}`}
        onClick={click}
        onAnimationEnd={() => setPop(false)}
        aria-label={done ? `Reabrir "${task.title}"` : `Concluir "${task.title}"`}
        title={done ? 'Reabrir' : 'Concluir'}
      >
        <Check aria-hidden />
      </button>
      <Modal
        open={dialog?.kind === 'verify'}
        title="Verificação necessária"
        onClose={() => setDialog(null)}
        footer={
          <>
            <button className="btn" onClick={() => setDialog(null)}>
              Cancelar
            </button>
            <button className="btn primary" disabled={!verified} onClick={() => send({ verified: true })}>
              Concluir
            </button>
          </>
        }
      >
        <p style={{ marginBottom: 12 }}>{task.verification_note ?? 'Esta tarefa exige verificação antes da conclusão.'}</p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
          Confirmo que verifiquei as versões revisadas.
        </label>
      </Modal>
      <Modal
        open={dialog?.kind === 'pending'}
        title="Existem condições em aberto"
        onClose={() => setDialog(null)}
        footer={
          <>
            <button className="btn" onClick={() => setDialog(null)}>
              Manter em aberto
            </button>
            <button className="btn danger" disabled={reason.trim().length < 3} onClick={() => send({ force: true, reason, verified: task.requires_verification ? true : undefined })}>
              Concluir como exceção
            </button>
          </>
        }
      >
        {dialog?.kind === 'pending' && (
          <div onClick={(e) => e.stopPropagation()}>
            <p className="muted" style={{ marginBottom: 10 }}>
              "{task.title}" depende de itens que ainda não foram concluídos:
            </p>
            <ul style={{ margin: '0 0 14px', paddingLeft: 18 }}>
              {dialog.blockers.map((b) => (
                <li key={`b${b.id}`}>Dependência: {b.title}</li>
              ))}
              {dialog.children.map((c) => (
                <li key={`c${c.id}`}>Subtarefa: {c.title}</li>
              ))}
            </ul>
            <label className="field">
              <span>Motivo da exceção (obrigatório, fica no histórico)</span>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: entrega aceita pela coordenação" />
            </label>
          </div>
        )}
      </Modal>
    </>
  );
}

export function TaskRow({ task, rank, why, showProject = true, compact }: { task: TaskView; rank?: number; why?: string[]; showProject?: boolean; compact?: boolean }) {
  const open = useOpenTask();
  const closed = task.status === 'concluida' || task.status === 'cancelada';
  return (
    <li
      className={`task-row prio-${closed ? 'none' : task.effective_priority}${closed ? ' is-done' : ''}${task.is_blocked ? ' is-blocked' : ''}`}
      onClick={() => open(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) open(task.id);
      }}
      tabIndex={0}
      aria-label={`${task.title}. Prioridade ${task.effective_priority}.`}
    >
      {rank !== undefined ? <span className="rank">{rank}</span> : <CompleteButton task={task} />}
      <div style={{ minWidth: 0 }}>
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          {showProject && task.project_name && (
            <span className="label" style={{ background: labelColor(task.project_name) }} title={`Projeto: ${task.project_name}`}>
              {task.project_name}
            </span>
          )}
          {task.parent_title && (
            <span>
              <GitBranch aria-hidden />
              {task.parent_title}
            </span>
          )}
          {task.due_date && (
            <span>
              <CalendarClock aria-hidden />
              <span className={task.days_to_due != null && task.days_to_due < 0 ? 'mono' : 'mono'} style={task.days_to_due != null && task.days_to_due < 0 ? { color: 'var(--critica)', fontWeight: 600 } : undefined}>
                {dateBr(task.due_date)}
              </span>
              {task.certainty.due_date === 'inferida' && <Cert c="inferida" />}
              {!compact && <span className="muted">· {relativeDue(task.days_to_due)}</span>}
            </span>
          )}
          {task.responsible && (
            <span>
              <User aria-hidden />
              {task.responsible}
            </span>
          )}
          {task.waits.filter((w) => w.status === 'aguardando').length > 0 && (
            <span>
              <Hourglass aria-hidden />
              Aguardando {task.waits.filter((w) => w.status === 'aguardando').map((w) => w.party).join(', ')}
            </span>
          )}
          {task.children.total > 0 && (
            <span className="mono">
              {task.children.total - task.children.open}/{task.children.total} subtarefas
            </span>
          )}
        </div>
        {why && why.length > 0 && (
          <div className="task-why">
            <Sparkles aria-hidden />
            <span>{why.join(' ')}</span>
          </div>
        )}
      </div>
      <div className="task-side">
        {closed ? <StatusBadge s={task.status} /> : <PriorityBadge p={task.effective_priority} manual={!!task.priority_override} />}
        {!closed && task.is_blocked && <BlockedBadge />}
        {!closed && <DueBadge days={task.days_to_due} date={task.due_date} />}
        {!closed && task.status !== 'pendente' && <StatusBadge s={task.status} />}
      </div>
    </li>
  );
}
