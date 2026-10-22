import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog, Empty, Field, Modal } from '../components/ui';
import { initials, labelColor } from '../lib/colors';
import { dateBr } from '../lib/format';
import { runtime, TeamActivity, TeamMember, TeamStatus } from '../lib/runtime';
import { useStore } from '../lib/store';

const LISTS: { key: TeamStatus; label: string }[] = [
  { key: 'a_fazer', label: 'A fazer' },
  { key: 'em_andamento', label: 'Em andamento' },
  { key: 'concluida', label: 'Concluída' }
];

const blank = { title: '', status: 'a_fazer' as TeamStatus, due: '', project: '', notes: '' };

function Avatar({ m, size = 26 }: { m: Pick<TeamMember, 'name' | 'id'>; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, background: labelColor(m.id), fontSize: size * 0.4 }} title={m.name} aria-hidden>
      {initials(m.name)}
    </span>
  );
}

export default function Team() {
  const team = runtime.team;
  const { toast, fail, meta } = useStore();
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string | null; canWrite: boolean; name: string } | null>(null);
  const [person, setPerson] = useState<string>('');
  const [form, setForm] = useState<(typeof blank & { id?: string }) | null>(null);
  const [askDelete, setAskDelete] = useState<TeamActivity | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!team) return;
    team.me().then(setMe);
    return team.subscribe(setMembers, setError);
  }, [team]);

  const mine = useMemo(() => members?.find((m) => m.isMe)?.items ?? [], [members]);
  const cards = useMemo(() => {
    const all = (members ?? []).flatMap((m) => m.items.map((it) => ({ it, m })));
    return person ? all.filter((c) => c.m.id === person) : all;
  }, [members, person]);

  if (!team) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Atividades da equipe</h1>
          </div>
        </div>
        <Empty title="Disponível na edição online">
          As atividades dos colaboradores usam o armazenamento compartilhado da página publicada no claude.ai, onde cada pessoa entra com a própria conta.
        </Empty>
      </>
    );
  }

  const save = async (items: TeamActivity[], msg: string) => {
    setSaving(true);
    try {
      await team.saveMine(items);
      toast(msg);
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!form) return;
    const now = new Date().toISOString();
    const item: TeamActivity = {
      id: form.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      title: form.title.trim(),
      status: form.status,
      due: form.due || null,
      project: form.project.trim() || null,
      notes: form.notes.trim() || null,
      updated_at: now
    };
    const next = form.id ? mine.map((x) => (x.id === form.id ? item : x)) : [...mine, item];
    if (await save(next, form.id ? 'Atividade atualizada.' : 'Atividade registrada.')) setForm(null);
  };

  const move = (it: TeamActivity, status: TeamStatus) => save(mine.map((x) => (x.id === it.id ? { ...x, status, updated_at: new Date().toISOString() } : x)), `Movida para ${LISTS.find((l) => l.key === status)!.label}.`);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Equipe</div>
          <h1>Atividades da equipe</h1>
          <p>Cada colaborador registra as próprias atividades. Todos com acesso à página veem o quadro; só o autor altera os próprios cartões.</p>
        </div>
        {me?.canWrite && (
          <button className="btn primary" onClick={() => setForm({ ...blank })}>
            <Plus size={16} /> Minha atividade
          </button>
        )}
      </div>

      {error && <div className="error-box" style={{ marginBottom: 14 }}>{error}</div>}
      {me && !me.canWrite && !error && <div className="info-box">Você pode ver o quadro, mas não registrar atividades. Peça ao responsável pela página acesso de colaborador.</div>}

      <div className="people-bar">
        <button className={`person-chip${person === '' ? ' on' : ''}`} onClick={() => setPerson('')}>
          Todos <span className="muted">{(members ?? []).reduce((n, m) => n + m.items.length, 0)}</span>
        </button>
        {(members ?? []).map((m) => (
          <button key={m.id} className={`person-chip${person === m.id ? ' on' : ''}`} onClick={() => setPerson(person === m.id ? '' : m.id)}>
            <Avatar m={m} size={22} />
            {m.isMe ? `${m.name} (você)` : m.name}
            <span className="muted">{m.items.length}</span>
          </button>
        ))}
      </div>

      {members === null && !error ? (
        <p className="muted">Carregando o quadro…</p>
      ) : (
        <div className="board">
          {LISTS.map((l) => {
            const list = cards.filter((c) => c.it.status === l.key);
            return (
              <section key={l.key} className="board-list" aria-label={l.label}>
                <header>
                  <span>{l.label}</span>
                  <span className="muted">{list.length}</span>
                </header>
                <div className="board-cards">
                  {list.map(({ it, m }) => {
                    const late = it.due && meta && it.due < meta.today && it.status !== 'concluida';
                    return (
                      <article key={`${m.id}-${it.id}`} className="board-card">
                        <div className="labels">
                          <span className="label" style={{ background: labelColor(m.id) }}>{m.name}</span>
                          {it.project && (
                            <span className="label" style={{ background: labelColor(it.project) }}>
                              {it.project}
                            </span>
                          )}
                        </div>
                        <div className="board-title">{it.title}</div>
                        {it.notes && <div className="small muted">{it.notes}</div>}
                        <div className="board-meta">
                          {it.due && <span className={`due-pill${late ? ' late' : ''}`}>{dateBr(it.due)}</span>}
                          <span style={{ flex: 1 }} />
                          <Avatar m={m} size={24} />
                        </div>
                        {m.isMe && me?.canWrite && (
                          <div className="board-actions">
                            <select value={it.status} onChange={(e) => move(it, e.target.value as TeamStatus)} aria-label="Mover cartão" disabled={saving}>
                              {LISTS.map((x) => (
                                <option key={x.key} value={x.key}>
                                  {x.label}
                                </option>
                              ))}
                            </select>
                            <button className="btn sm ghost" onClick={() => setForm({ id: it.id, title: it.title, status: it.status, due: it.due ?? '', project: it.project ?? '', notes: it.notes ?? '' })}>
                              Editar
                            </button>
                            <button className="btn sm ghost" onClick={() => setAskDelete(it)} aria-label="Excluir atividade">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {list.length === 0 && <div className="board-empty">Nenhuma atividade</div>}
                  {l.key === 'a_fazer' && me?.canWrite && (
                    <button className="board-add" onClick={() => setForm({ ...blank })}>
                      <Plus size={15} /> Adicionar atividade
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        open={!!form}
        title={form?.id ? 'Editar atividade' : 'Nova atividade'}
        onClose={() => setForm(null)}
        footer={
          <>
            <button className="btn" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button className="btn primary" disabled={!form || form.title.trim().length < 2 || saving} onClick={submit}>
              Salvar
            </button>
          </>
        }
      >
        {form && (
          <div className="form-grid">
            <Field label="Atividade" full>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-autofocus placeholder="O que você está fazendo?" />
            </Field>
            <Field label="Situação">
              <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TeamStatus })}>
                {LISTS.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prazo">
              <input className="input" type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
            </Field>
            <Field label="Projeto ou setor" full>
              <input className="input" value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} placeholder="Opcional" />
            </Field>
            <Field label="Observações" full>
              <textarea className="textarea" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={!!askDelete}
        title="Excluir atividade?"
        message={`"${askDelete?.title}" será removida do quadro da equipe.`}
        confirmLabel="Excluir"
        danger
        onCancel={() => setAskDelete(null)}
        onConfirm={async () => {
          const it = askDelete!;
          setAskDelete(null);
          await save(
            mine.filter((x) => x.id !== it.id),
            'Atividade excluída.'
          );
        }}
      />
    </>
  );
}
