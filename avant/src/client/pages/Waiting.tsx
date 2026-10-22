import { Hourglass, Plus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useOpenTask } from '../components/TaskRow';
import { Cert, ConfirmDialog, Empty, ErrorBox, Field, Modal, Panel, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { dateBr } from '../lib/format';
import { useApi, useMutation, useStore } from '../lib/store';
import { WAIT_STATUS_LABEL } from '../lib/types';
import type { TaskView, Wait } from '../lib/types';

type WaitRow = Wait & { task_title: string | null; task_status: string | null; project_name: string | null };

const blank = { party: '', description: '', task_id: '', requested_at: '', expected_at: '', follow_up_at: '', note: '' };

export default function Waiting() {
  const { data, error } = useApi<WaitRow[]>('/api/waits');
  const { data: tasks } = useApi<TaskView[]>('/api/tasks');
  const { meta } = useStore();
  const mutate = useMutation();
  const openTask = useOpenTask();
  const [status, setStatus] = useState('aguardando');
  const [form, setForm] = useState<(typeof blank & { id?: number }) | null>(null);
  const [askDelete, setAskDelete] = useState<WaitRow | null>(null);
  const rows = (data ?? []).filter((w) => !status || w.status === status);
  const groups = useMemo(() => {
    const m = new Map<string, WaitRow[]>();
    for (const w of rows) m.set(w.party, [...(m.get(w.party) ?? []), w]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [rows]);
  const today = meta?.today ?? '';
  const save = async () => {
    if (!form) return;
    const body = {
      party: form.party,
      description: form.description,
      task_id: form.task_id ? Number(form.task_id) : null,
      requested_at: form.requested_at || null,
      expected_at: form.expected_at || null,
      follow_up_at: form.follow_up_at || null,
      note: form.note || null
    };
    const r = await mutate(() => (form.id ? api.patch(`/api/waits/${form.id}`, body) : api.post('/api/waits', body)), form.id ? 'Pendência atualizada.' : 'Pendência registrada.');
    if (r) setForm(null);
  };
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Dependências externas</div>
          <h1>Aguardando Terceiros</h1>
          <p>O que depende de outras pessoas, equipes, informações ou aprovações. Nenhuma cobrança é enviada automaticamente — o AVANT apenas organiza e lembra.</p>
        </div>
        <button className="btn primary" onClick={() => setForm({ ...blank })}>
          <Plus size={16} /> Registrar espera
        </button>
      </div>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Status">
          {['aguardando', 'recebido', 'cancelado', ''].map((s) => (
            <button key={s || 'todos'} aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s ? WAIT_STATUS_LABEL[s as Wait['status']] : 'Todos'}
            </button>
          ))}
        </div>
      </div>
      <ErrorBox error={error} />
      {!data ? (
        <Skeleton rows={5} />
      ) : groups.length === 0 ? (
        <Empty icon={<Hourglass />} title="Nada nesta lista">Registre esperas manualmente ou pela captura (“aguardando o Rogério liberar…”).</Empty>
      ) : (
        <div className="grid cols-2">
          {groups.map(([party, items]) => (
            <Panel key={party} title={party} icon={<Users />} count={`${items.length} item(ns)`} flush>
              {items.length >= 2 && status === 'aguardando' && (
                <div className="small" style={{ padding: '10px 18px', background: 'var(--gold-100)', color: '#5c4a17' }}>
                  {items.length} pendências aguardam {party}: um único contato pode resolver todas.
                </div>
              )}
              <ul className="list-simple">
                {items.map((w) => {
                  const late = (w.follow_up_at && w.follow_up_at <= today) || (w.expected_at && w.expected_at < today);
                  return (
                    <li key={w.id}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <strong style={{ fontWeight: 500 }}>{w.description}</strong>
                        <Cert c={w.certainty} />
                        {late && w.status === 'aguardando' && <span className="badge overdue">Acompanhamento vencido</span>}
                      </div>
                      <div className="small muted" style={{ marginTop: 4 }}>
                        Solicitado: {w.requested_at ? dateBr(w.requested_at) : 'não informado'} · Esperado: {w.expected_at ? dateBr(w.expected_at) : 'não informado'} · Acompanhar: {w.follow_up_at ? dateBr(w.follow_up_at) : 'não definido'}
                      </div>
                      {(w.task_title || w.project_name) && (
                        <div className="small" style={{ marginTop: 4 }}>
                          {w.task_title && (
                            <a href="#" onClick={(e) => (e.preventDefault(), openTask(w.task_id!))}>
                              {w.task_title}
                            </a>
                          )}
                          {w.project_name && <span className="muted"> · {w.project_name}</span>}
                        </div>
                      )}
                      {w.note && <div className="small muted">{w.note}</div>}
                      <div className="btn-row" style={{ marginTop: 8 }}>
                        {w.status === 'aguardando' && (
                          <button className="btn sm" onClick={() => mutate(() => api.patch(`/api/waits/${w.id}`, { status: 'recebido' }), `Retorno de ${w.party} registrado.`)}>
                            Marcar como recebido
                          </button>
                        )}
                        {w.status !== 'aguardando' && (
                          <button className="btn sm" onClick={() => mutate(() => api.patch(`/api/waits/${w.id}`, { status: 'aguardando' }), 'Reaberto.')}>
                            Reabrir
                          </button>
                        )}
                        <button
                          className="btn sm ghost"
                          onClick={() =>
                            setForm({
                              id: w.id,
                              party: w.party,
                              description: w.description,
                              task_id: w.task_id ? String(w.task_id) : '',
                              requested_at: w.requested_at ?? '',
                              expected_at: w.expected_at ?? '',
                              follow_up_at: w.follow_up_at ?? '',
                              note: w.note ?? ''
                            })
                          }
                        >
                          Editar
                        </button>
                        <button className="btn sm ghost" onClick={() => setAskDelete(w)}>
                          Remover
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ))}
        </div>
      )}
      <Modal
        open={!!form}
        title={form?.id ? 'Editar pendência de terceiro' : 'Registrar pendência de terceiro'}
        onClose={() => setForm(null)}
        footer={
          <>
            <button className="btn" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button className="btn primary" disabled={!form || form.party.trim().length < 2 || form.description.trim().length < 2} onClick={save}>
              Salvar
            </button>
          </>
        }
      >
        {form && (
          <div className="form-grid">
            <Field label="Pessoa ou equipe">
              <input className="input" value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} list="avant-people-w" data-autofocus />
              <datalist id="avant-people-w">{meta?.people.map((p) => <option key={p} value={p} />)}</datalist>
            </Field>
            <Field label="Tarefa relacionada">
              <select className="select" value={form.task_id} onChange={(e) => setForm({ ...form, task_id: e.target.value })}>
                <option value="">Nenhuma</option>
                {tasks?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="O que está sendo aguardado" full>
              <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Data da solicitação">
              <input className="input" type="date" value={form.requested_at} onChange={(e) => setForm({ ...form, requested_at: e.target.value })} />
            </Field>
            <Field label="Prazo esperado">
              <input className="input" type="date" value={form.expected_at} onChange={(e) => setForm({ ...form, expected_at: e.target.value })} />
            </Field>
            <Field label="Próximo acompanhamento">
              <input className="input" type="date" value={form.follow_up_at} onChange={(e) => setForm({ ...form, follow_up_at: e.target.value })} />
            </Field>
            <Field label="Observação" full>
              <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={!!askDelete}
        title="Remover pendência?"
        message={`A espera por ${askDelete?.party} será removida (pode ser desfeita pelo Histórico).`}
        confirmLabel="Remover"
        danger
        onCancel={() => setAskDelete(null)}
        onConfirm={async () => {
          const w = askDelete!;
          setAskDelete(null);
          await mutate(() => api.del(`/api/waits/${w.id}`), 'Pendência removida.');
        }}
      />
    </>
  );
}
