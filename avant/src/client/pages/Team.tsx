// Quadro da equipe no estilo Trello: cartões compactos, arrastar entre listas, cartão aberto com anexos.
import { AlignLeft, Archive, CalendarDays, Download, FileText, Paperclip, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog, Empty, Field, Modal } from '../components/ui';
import { initials, labelColor } from '../lib/colors';
import { dateBr, localDateTime } from '../lib/format';
import { runtime, TeamActivity, TeamAttachment, TeamMember, TeamStatus } from '../lib/runtime';
import { useStore } from '../lib/store';
import { archiveReason, KINDS, kindLabel, RETENTION_DAYS } from '../lib/team';

const LISTS: { key: TeamStatus; label: string }[] = [
  { key: 'a_fazer', label: 'A fazer' },
  { key: 'em_andamento', label: 'Em andamento' },
  { key: 'concluida', label: 'Concluída' }
];

type Me = { id: string | null; canWrite: boolean; name: string; isOwner: boolean; canUpload: boolean };
type Ref = { memberId: string; itemId: string };

function Avatar({ m, size = 24 }: { m: Pick<TeamMember, 'name' | 'id'>; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, background: labelColor(m.id), fontSize: size * 0.42 }} title={m.name} aria-hidden>
      {initials(m.name)}
    </span>
  );
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isImage = (a: TeamAttachment) => a.type.startsWith('image/');
const sizeLabel = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** Aplica a mudança de situação mantendo as datas de conclusão coerentes. */
function withStatus(it: TeamActivity, status: TeamStatus): TeamActivity {
  const now = new Date().toISOString();
  return { ...it, status, updated_at: now, completed_at: status === 'concluida' ? (it.status === 'concluida' ? it.completed_at : now) : null };
}

export default function Team() {
  const team = runtime.team;
  const { toast, fail, meta } = useStore();
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [person, setPerson] = useState('');
  const [drag, setDrag] = useState<Ref | null>(null);
  const [over, setOver] = useState<TeamStatus | null>(null);
  const [adding, setAdding] = useState<TeamStatus | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [open, setOpen] = useState<Ref | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [saving, setSaving] = useState(false);
  const addRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!team) return;
    team.me().then(setMe);
    return team.subscribe(setMembers, setError);
  }, [team]);
  useEffect(() => {
    if (adding) addRef.current?.focus();
  }, [adding]);

  const myMember: TeamMember | null = useMemo(() => {
    if (!me?.id) return null;
    return members?.find((m) => m.id === me.id) ?? { id: me.id, name: me.name || 'Você', avatarUrl: null, isMe: true, items: [] };
  }, [members, me]);

  const all = useMemo(() => {
    const list = [...(members ?? [])];
    if (myMember && !list.some((m) => m.id === myMember.id)) list.push(myMember);
    return list;
  }, [members, myMember]);

  const cards = useMemo(
    () =>
      all
        .filter((m) => !person || m.id === person)
        .flatMap((m) => m.items.map((it) => ({ it, m })))
        .filter(({ it }) => !archiveReason(it)),
    [all, person]
  );
  const archived = useMemo(() => all.flatMap((m) => m.items.map((it) => ({ it, m, reason: archiveReason(it) }))).filter((x) => x.reason), [all]);

  if (!team) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Atividades da equipe</h1>
          </div>
        </div>
        <Empty title="Disponível na edição online">As atividades dos colaboradores usam o armazenamento compartilhado da página publicada, onde cada pessoa entra com a própria conta.</Empty>
      </>
    );
  }

  const canEdit = (m: TeamMember) => !!me?.canWrite && (m.isMe || m.id === me?.id || !!me?.isOwner);

  const persist = async (m: TeamMember, items: TeamActivity[], msg?: string) => {
    setSaving(true);
    try {
      if (m.id === me?.id) await team.saveMine(items);
      else await team.saveFor(m.id, items);
      if (msg) toast(msg);
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateItem = (ref: Ref, fn: (it: TeamActivity) => TeamActivity, msg?: string) => {
    const m = all.find((x) => x.id === ref.memberId);
    if (!m) return Promise.resolve(false);
    return persist(
      m,
      m.items.map((it) => (it.id === ref.itemId ? fn(it) : it)),
      msg
    );
  };

  const drop = (status: TeamStatus) => {
    setOver(null);
    if (!drag) return;
    const m = all.find((x) => x.id === drag.memberId);
    const it = m?.items.find((x) => x.id === drag.itemId);
    setDrag(null);
    if (!m || !it || it.status === status) return;
    void updateItem(drag, (x) => withStatus(x, status), `"${it.title}" → ${LISTS.find((l) => l.key === status)!.label}`);
  };

  const addCard = async (status: TeamStatus) => {
    const title = newTitle.trim();
    if (title.length < 2 || !myMember) return;
    const now = new Date().toISOString();
    const item: TeamActivity = {
      id: newId(),
      title,
      status,
      due: null,
      project: null,
      notes: null,
      kind: null,
      created_at: now,
      updated_at: now,
      completed_at: status === 'concluida' ? now : null,
      attachments: []
    };
    if (await persist(myMember, [...myMember.items, item])) {
      setNewTitle('');
      addRef.current?.focus();
    }
  };

  const restore = (x: { it: TeamActivity; m: TeamMember }) =>
    updateItem({ memberId: x.m.id, itemId: x.it.id }, (it) => ({ ...it, deleted_at: null, completed_at: it.status === 'concluida' ? new Date().toISOString() : it.completed_at, updated_at: new Date().toISOString() }), 'Atividade restaurada.');

  const openCard = open ? all.find((m) => m.id === open.memberId)?.items.find((it) => it.id === open.itemId) : undefined;
  const openMember = open ? all.find((m) => m.id === open.memberId) : undefined;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Equipe</div>
          <h1>Atividades da equipe</h1>
          <p>Arraste os cartões entre as listas. Clique em um cartão para ver os detalhes, anexar fotos e documentos. Concluídas há mais de {RETENTION_DAYS} dias vão para Excluídos, de onde podem ser restauradas.</p>
        </div>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 14 }}>{error}</div>}
      {me && !me.canWrite && !error && <div className="info-box">Você pode ver o quadro, mas não registrar atividades. Peça ao responsável pela página acesso de colaborador.</div>}

      <div className="people-bar">
        <button className={`person-chip${person === '' ? ' on' : ''}`} onClick={() => setPerson('')}>
          Todos <span className="muted">{cards.length}</span>
        </button>
        {all.map((m) => (
          <button key={m.id} className={`person-chip${person === m.id ? ' on' : ''}`} onClick={() => setPerson(person === m.id ? '' : m.id)}>
            <Avatar m={m} size={22} />
            {m.id === me?.id ? `${m.name} (você)` : m.name}
          </button>
        ))}
      </div>

      {members === null && !error ? (
        <p className="muted">Carregando o quadro…</p>
      ) : (
        <div className="tboard">
          {LISTS.map((l) => {
            const list = cards.filter((c) => c.it.status === l.key);
            return (
              <section
                key={l.key}
                className={`tlist${over === l.key ? ' over' : ''}`}
                aria-label={l.label}
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  setOver(l.key);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(l.key);
                }}
              >
                <header>
                  <span>{l.label}</span>
                  <span className="tcount">{list.length}</span>
                </header>
                <div className="tcards">
                  {list.map(({ it, m }) => {
                    const late = it.due && meta && it.due < meta.today && it.status !== 'concluida';
                    const editable = canEdit(m);
                    const files = it.attachments?.length ?? 0;
                    return (
                      <article
                        key={`${m.id}-${it.id}`}
                        className={`tcard${drag?.itemId === it.id ? ' dragging' : ''}`}
                        draggable={editable}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', it.id);
                          setDrag({ memberId: m.id, itemId: it.id });
                        }}
                        onDragEnd={() => {
                          setDrag(null);
                          setOver(null);
                        }}
                        onClick={() => setOpen({ memberId: m.id, itemId: it.id })}
                        onKeyDown={(e) => e.key === 'Enter' && setOpen({ memberId: m.id, itemId: it.id })}
                        tabIndex={0}
                        role="button"
                        aria-label={`${it.title}, de ${m.name}. Abrir detalhes.`}
                      >
                        <div className="tlabels">
                          {it.kind && <span className="tl-bar" style={{ background: labelColor(it.kind) }} title={kindLabel(it.kind)} />}
                          {it.project && <span className="tl-bar" style={{ background: labelColor(it.project) }} title={it.project} />}
                        </div>
                        <div className="ttitle">{it.title}</div>
                        <div className="tmeta">
                          {it.due && (
                            <span className={`tm-due${late ? ' late' : ''}${it.status === 'concluida' ? ' done' : ''}`}>
                              <CalendarDays size={12} aria-hidden /> {dateBr(it.due).slice(0, 5)}
                            </span>
                          )}
                          {it.notes && <AlignLeft size={13} aria-label="Possui descrição" />}
                          {files > 0 && (
                            <span className="tm-icon">
                              <Paperclip size={12} aria-hidden /> {files}
                            </span>
                          )}
                          <span style={{ flex: 1 }} />
                          <Avatar m={m} size={24} />
                        </div>
                      </article>
                    );
                  })}
                  {adding === l.key ? (
                    <div className="tadd-form">
                      <textarea
                        ref={addRef}
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="Título da atividade (ex.: Viagem para o Nordeste)"
                        rows={2}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void addCard(l.key);
                          }
                          if (e.key === 'Escape') setAdding(null);
                        }}
                        aria-label="Título da nova atividade"
                      />
                      <div className="btn-row">
                        <button className="btn sm primary" disabled={newTitle.trim().length < 2 || saving} onClick={() => addCard(l.key)}>
                          Adicionar cartão
                        </button>
                        <button className="icon-btn" onClick={() => setAdding(null)} aria-label="Cancelar">
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    me?.canWrite && (
                      <button className="tadd" onClick={() => (setAdding(l.key), setNewTitle(''))}>
                        <Plus size={15} /> Adicionar um cartão
                      </button>
                    )
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="archive-toggle">
        <button className="btn sm ghost" onClick={() => setShowArchive((s) => !s)} aria-expanded={showArchive}>
          <Archive size={14} /> Excluídos ({archived.length})
        </button>
      </div>
      {showArchive && (
        <section className="panel archive-panel">
          <div className="panel-head">
            <h2>Excluídos</h2>
            <span className="spacer" />
            <span className="small muted">Concluídas há mais de {RETENTION_DAYS} dias e cartões excluídos. Nada é apagado definitivamente.</span>
          </div>
          <div className="panel-body flush">
            {archived.length === 0 ? (
              <Empty title="Nenhum cartão excluído" />
            ) : (
              <ul className="list-simple">
                {archived.map((x) => (
                  <li key={`${x.m.id}-${x.it.id}`} className="small" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Avatar m={x.m} size={22} />
                    <strong style={{ fontWeight: 600 }}>{x.it.title}</strong>
                    <span className="muted">
                      {x.m.name} · {x.reason}
                      {x.it.deleted_at ? ` em ${dateBr(x.it.deleted_at.slice(0, 10))}` : ''}
                    </span>
                    <span style={{ flex: 1 }} />
                    <button className="btn sm ghost" onClick={() => setOpen({ memberId: x.m.id, itemId: x.it.id })}>
                      Ver
                    </button>
                    {canEdit(x.m) && (
                      <button className="btn sm" onClick={() => restore(x)}>
                        <RotateCcw size={14} /> Restaurar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {openCard && openMember && (
        <CardDetail
          key={`${openMember.id}-${openCard.id}`}
          item={openCard}
          member={openMember}
          editable={canEdit(openMember)}
          canUpload={!!me?.canUpload && canEdit(openMember)}
          onClose={() => setOpen(null)}
          onSave={(fn, msg) => updateItem({ memberId: openMember.id, itemId: openCard.id }, fn, msg)}
        />
      )}
    </>
  );
}

function CardDetail({
  item,
  member,
  editable,
  canUpload,
  onClose,
  onSave
}: {
  item: TeamActivity;
  member: TeamMember;
  editable: boolean;
  canUpload: boolean;
  onClose: () => void;
  onSave: (fn: (it: TeamActivity) => TeamActivity, msg?: string) => Promise<boolean>;
}) {
  const team = runtime.team!;
  const { fail, toast } = useStore();
  const [draft, setDraft] = useState({ title: item.title, notes: item.notes ?? '', due: item.due ?? '', project: item.project ?? '', kind: item.kind ?? '' });
  const [uploading, setUploading] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [preview, setPreview] = useState<TeamAttachment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = draft.title !== item.title || draft.notes !== (item.notes ?? '') || draft.due !== (item.due ?? '') || draft.project !== (item.project ?? '') || draft.kind !== (item.kind ?? '');
  const archived = archiveReason(item);

  const fields = (it: TeamActivity): TeamActivity => ({
    ...it,
    title: draft.title.trim() || it.title,
    notes: draft.notes.trim() || null,
    due: draft.due || null,
    project: draft.project.trim() || null,
    kind: draft.kind || null,
    updated_at: new Date().toISOString()
  });

  const upload = async (files: FileList | File[]) => {
    const list = [...files];
    if (!list.length) return;
    setUploading(true);
    const added: TeamAttachment[] = [];
    for (const f of list) {
      try {
        added.push(await team.upload(f));
      } catch (e) {
        fail(e);
      }
    }
    if (added.length) await onSave((it) => ({ ...fields(it), attachments: [...(it.attachments ?? []), ...added] }), `${added.length} arquivo(s) anexado(s).`);
    setUploading(false);
  };

  return (
    <>
      <Modal
        open
        title={<span className="cd-title-label">{member.name} · {kindLabel(item.kind)}</span>}
        label={`Atividade: ${item.title}`}
        onClose={onClose}
        className="modal-xl"
        footer={
          editable ? (
            <>
              {!archived && (
                <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => setAskDelete(true)}>
                  <Trash2 size={15} /> Excluir
                </button>
              )}
              <button className="btn" onClick={onClose}>
                Fechar
              </button>
              <button
                className="btn primary"
                disabled={!dirty || draft.title.trim().length < 2}
                onClick={async () => {
                  if (await onSave(fields, 'Atividade salva.')) onClose();
                }}
              >
                Salvar
              </button>
            </>
          ) : (
            <button className="btn" onClick={onClose}>
              Fechar
            </button>
          )
        }
      >
        <div className="cd-grid">
          <div className="cd-main">
            <input className="cd-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} readOnly={!editable} aria-label="Título" data-autofocus />
            {archived && <div className="info-box">Este cartão está em Excluídos ({archived}).</div>}
            <label className="field">
              <span>Descrição</span>
              <textarea className="textarea" rows={6} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} readOnly={!editable} placeholder={editable ? 'Detalhes, combinados, contatos, roteiro da viagem…' : 'Sem descrição.'} />
            </label>
            <div className="cd-section">
              <div className="cd-sec-head">
                <h3>
                  <Paperclip size={14} /> Anexos
                </h3>
                {canUpload && (
                  <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Upload size={14} /> {uploading ? 'Enviando…' : 'Anexar'}
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  multiple
                  accept=".png,.jpg,.jpeg,.gif,.webp,.mp4,.webm,.pdf,.txt,.csv,.md,.json"
                  onChange={(e) => {
                    if (e.target.files) void upload(e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>
              {canUpload && (
                <div
                  className="cd-drop"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void upload(e.dataTransfer.files);
                  }}
                >
                  Arraste fotos ou documentos aqui · PNG, JPG, GIF, WEBP, MP4, WEBM, PDF, TXT, CSV — até 20 MB. Word e Excel: salve como PDF.
                </div>
              )}
              {editable && !canUpload && <p className="small muted">Envio de arquivos indisponível para o seu nível de acesso.</p>}
              <div className="cd-files">
                {(item.attachments ?? []).map((a) => (
                  <div key={a.id} className="cd-file">
                    {isImage(a) ? (
                      <button className="cd-thumb" onClick={() => setPreview(a)} aria-label={`Ampliar ${a.name}`}>
                        <img src={team.fileUrl(a)} alt={a.name} loading="lazy" onError={(e) => ((e.currentTarget.style.visibility = 'hidden'))} />
                      </button>
                    ) : (
                      <a className="cd-thumb doc" href={team.fileUrl(a)} target="_blank" rel="noreferrer" aria-label={`Abrir ${a.name}`}>
                        <FileText size={26} aria-hidden />
                        <span>{a.name.split('.').pop()?.toUpperCase()}</span>
                      </a>
                    )}
                    <div className="cd-fname" title={a.name}>
                      {a.name}
                    </div>
                    <div className="cd-fmeta">
                      {sizeLabel(a.size)} · {localDateTime(a.uploaded_at)}
                    </div>
                    <div className="btn-row">
                      <button className="btn sm ghost" onClick={() => team.download(a).catch(fail)} aria-label={`Baixar ${a.name}`}>
                        <Download size={13} />
                      </button>
                      {editable && (
                        <button
                          className="btn sm ghost"
                          onClick={() => onSave((it) => ({ ...it, attachments: (it.attachments ?? []).filter((x) => x.id !== a.id), updated_at: new Date().toISOString() }), 'Anexo removido do cartão.')}
                          aria-label={`Remover ${a.name}`}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {!(item.attachments ?? []).length && <p className="small muted">Nenhum anexo.</p>}
              </div>
            </div>
          </div>
          <aside className="cd-side">
            <Field label="Situação">
              <select
                className="select"
                value={item.status}
                disabled={!editable}
                onChange={(e) => onSave((it) => withStatus(fields(it), e.target.value as TeamStatus), `Movida para ${LISTS.find((l) => l.key === e.target.value)!.label}.`)}
              >
                {LISTS.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de atividade">
              <select className="select" value={draft.kind} disabled={!editable} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                <option value="">Não informado</option>
                {KINDS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prazo">
              <input className="input" type="date" value={draft.due} readOnly={!editable} onChange={(e) => setDraft({ ...draft, due: e.target.value })} />
            </Field>
            <Field label="Projeto ou setor">
              <input className="input" value={draft.project} readOnly={!editable} onChange={(e) => setDraft({ ...draft, project: e.target.value })} placeholder="Opcional" />
            </Field>
            <dl className="cd-facts">
              <dt>Responsável</dt>
              <dd>
                <Avatar m={member} size={22} /> {member.name}
              </dd>
              {item.created_at && (
                <>
                  <dt>Criada em</dt>
                  <dd>{localDateTime(item.created_at)}</dd>
                </>
              )}
              {item.completed_at && (
                <>
                  <dt>Concluída em</dt>
                  <dd>{localDateTime(item.completed_at)}</dd>
                </>
              )}
              <dt>Atualizada em</dt>
              <dd>{localDateTime(item.updated_at)}</dd>
            </dl>
          </aside>
        </div>
      </Modal>
      <Modal open={!!preview} title={preview?.name ?? ''} onClose={() => setPreview(null)} className="modal-xl">
        {preview && <img src={team.fileUrl(preview)} alt={preview.name} style={{ width: '100%', borderRadius: 10 }} />}
      </Modal>
      <ConfirmDialog
        open={askDelete}
        title="Excluir atividade?"
        message={`"${item.title}" vai para Excluídos e pode ser restaurada depois.`}
        confirmLabel="Excluir"
        danger
        onCancel={() => setAskDelete(false)}
        onConfirm={async () => {
          setAskDelete(false);
          if (await onSave((it) => ({ ...it, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }), 'Atividade movida para Excluídos.')) {
            toast('Você pode restaurá-la em Excluídos.');
            onClose();
          }
        }}
      />
    </>
  );
}
