// Pesquisa global, notificações, captura rápida, nova tarefa e ajuda de atalhos.
import { Bell, CalendarDays, CheckSquare, FileText, FolderKanban, Hourglass, Search, User, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi, useMutation, useStore } from '../lib/store';
import type { Alert, CaptureResult, Recommendation } from '../lib/types';
import { CaptureResultView } from './CaptureResultView';
import { draftFrom, draftToBody, TaskForm, useDirty } from './TaskForm';
import { useOpenTask } from './TaskRow';
import { ConfirmDialog, Modal } from './ui';

interface Hit {
  type: 'task' | 'project' | 'event' | 'document' | 'wait' | 'person';
  id: number | string;
  title: string;
  subtitle: string;
}

const ICON = { task: CheckSquare, project: FolderKanban, event: CalendarDays, document: FileText, wait: Hourglass, person: User };
const TYPE_LABEL = { task: 'Tarefa', project: 'Projeto', event: 'Evento', document: 'Documento', wait: 'Terceiro', person: 'Pessoa' };

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
  const navigate = useNavigate();
  const openTask = useOpenTask();
  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const h = setTimeout(() => {
      api
        .get<Hit[]>(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => {
          setHits(r);
          setSel(0);
        })
        .catch(() => setHits([]));
    }, 140);
    return () => clearTimeout(h);
  }, [q, open]);
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);
  const go = (h: Hit) => {
    onClose();
    if (h.type === 'task') openTask(Number(h.id));
    else if (h.type === 'project') navigate(`/projetos/${h.id}`);
    else if (h.type === 'event') navigate(`/agenda?evento=${h.id}`);
    else if (h.type === 'document') navigate(`/arquivos?doc=${h.id}`);
    else if (h.type === 'wait') navigate('/terceiros');
    else navigate(`/pendencias?responsible=${encodeURIComponent(String(h.id))}`);
  };
  return (
    <Modal open={open} title="Pesquisa global" onClose={onClose} className="palette">
      <div className="palette-input" style={{ margin: '-18px -20px 0' }}>
        <Search size={18} aria-hidden />
        <input
          autoFocus
          data-autofocus
          placeholder="Tarefas, projetos, pessoas, eventos, documentos…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Pesquisar"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(s + 1, hits.length - 1)));
            if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(s - 1, 0)));
            if (e.key === 'Enter' && hits[sel]) go(hits[sel]);
          }}
        />
      </div>
      <ul className="palette-results" role="listbox" style={{ margin: '0 -14px' }}>
        {q.trim().length >= 2 && hits.length === 0 && <li className="muted">Nenhum resultado para “{q}”.</li>}
        {hits.map((h, i) => {
          const Icon = ICON[h.type];
          return (
            <li key={`${h.type}-${h.id}`} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => go(h)}>
              <span className="type">
                <Icon aria-hidden />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{h.title}</div>
                <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {TYPE_LABEL[h.type]} · {h.subtitle}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const { data } = useApi<{ alerts: Alert[]; recommendations: Recommendation[] }>('/api/dashboard');
  const navigate = useNavigate();
  const openTask = useOpenTask();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const items = [
    ...(data?.alerts ?? []).map((a) => ({ key: a.kind + a.message, sev: a.kind === 'conflito_agenda' || a.kind === 'atrasada' ? 'alta' : 'media', text: a.message, ref: a.refs[0] })),
    ...(data?.recommendations ?? []).filter((r) => r.severity === 'alta').map((r) => ({ key: r.key, sev: 'alta', text: r.message, ref: r.evidence[0] as any }))
  ];
  const urgent = items.filter((i) => i.sev === 'alta').length;
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" aria-label={`Notificações (${items.length})`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Bell />
        {items.length > 0 && <span className="dot">{items.length}</span>}
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Notificações">
          <div className="panel-head">
            <h2>Alertas operacionais</h2>
            <span className="spacer" />
            <span className="count">{urgent} urgente(s)</span>
          </div>
          {items.length === 0 && <div className="empty small">Nenhum alerta no momento.</div>}
          <ul className="list-simple">
            {items.map((i) => (
              <li
                key={i.key}
                className="clickable small"
                onClick={() => {
                  setOpen(false);
                  if (i.ref?.type === 'task') openTask(i.ref.id);
                  else if (i.ref?.type === 'event') navigate(`/agenda?evento=${i.ref.id}`);
                  else if (i.ref?.type === 'confirmation') navigate('/captura');
                  else if (i.ref?.type === 'wait') navigate('/terceiros');
                  else if (i.ref?.type === 'project') navigate(`/projetos/${i.ref.id}`);
                }}
              >
                <span className={`sev ${i.sev}`} style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 8 }} />
                {i.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function QuickCapture({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<CaptureResult | null>(null);
  const { track, fail, refresh, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  useEffect(() => {
    if (!open) {
      setResult(null);
    }
  }, [open]);
  const close = () => {
    if (text.trim() && !result) setAskDiscard(true);
    else {
      setText('');
      onClose();
    }
  };
  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await track(api.post<CaptureResult>('/api/captures', { text }));
      setResult(r);
      setText('');
      refresh();
      toast(`Captura #${r.capture_id} processada.`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Modal
        open={open}
        title={
          <>
            <Zap size={16} style={{ verticalAlign: -2, color: 'var(--gold-500)' }} /> Captura rápida
          </>
        }
        onClose={close}
        label="Captura rápida"
        footer={
          result ? (
            <button className="btn primary" onClick={() => (setResult(null), onClose())}>
              Concluir
            </button>
          ) : (
            <>
              <span className="small muted" style={{ marginRight: 'auto', alignSelf: 'center' }}>
                <kbd>Ctrl</kbd> + <kbd>Enter</kbd> para processar
              </span>
              <button className="btn" onClick={close}>
                Cancelar
              </button>
              <button className="btn gold" onClick={submit} disabled={busy || !text.trim()}>
                {busy ? 'Analisando…' : 'Analisar e salvar'}
              </button>
            </>
          )
        }
      >
        {result ? (
          <div style={{ margin: '-18px -20px' }}>
            <CaptureResultView result={result} onUndone={() => setResult(null)} />
          </div>
        ) : (
          <>
            <textarea
              className="textarea"
              data-autofocus
              style={{ minHeight: 180 }}
              placeholder={'Cole aqui mensagens, anotações ou listas.\nEx.: "Revisar a ata até sexta e encaminhar para Luciana"'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
              }}
              aria-label="Texto da captura"
            />
            <p className="small muted" style={{ marginTop: 8 }}>
              O AVANT identifica tarefas, prazos, responsáveis, projetos e eventos. Informações ausentes ficam como “não informadas”; ambiguidades geram pedidos de confirmação.
            </p>
          </>
        )}
      </Modal>
      <ConfirmDialog
        open={askDiscard}
        title="Descartar texto?"
        message="O texto colado ainda não foi processado."
        confirmLabel="Descartar"
        danger
        onCancel={() => setAskDiscard(false)}
        onConfirm={() => {
          setAskDiscard(false);
          setText('');
          onClose();
        }}
      />
    </>
  );
}

export function NewTaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const form = useDirty(draftFrom());
  const mutate = useMutation();
  const openTask = useOpenTask();
  const [askDiscard, setAskDiscard] = useState(false);
  const close = () => (form.dirty ? setAskDiscard(true) : onClose());
  return (
    <>
      <Modal
        open={open}
        title="Nova tarefa"
        onClose={close}
        footer={
          <>
            <button className="btn" onClick={close}>
              Cancelar
            </button>
            <button
              className="btn primary"
              disabled={form.value.title.trim().length < 2}
              onClick={async () => {
                const r = await mutate(() => api.post<{ id: number }>('/api/tasks', draftToBody(form.value)), 'Tarefa criada.');
                if (r) {
                  form.reset(draftFrom());
                  onClose();
                  openTask(r.id);
                }
              }}
            >
              Criar tarefa
            </button>
          </>
        }
      >
        <TaskForm draft={form.value} onChange={form.setValue} />
      </Modal>
      <ConfirmDialog
        open={askDiscard}
        title="Descartar nova tarefa?"
        message="Os dados preenchidos serão perdidos."
        confirmLabel="Descartar"
        danger
        onCancel={() => setAskDiscard(false)}
        onConfirm={() => {
          setAskDiscard(false);
          form.reset(draftFrom());
          onClose();
        }}
      />
    </>
  );
}

export const SHORTCUTS: [string, string][] = [
  ['Ctrl + K  ou  /', 'Pesquisa global'],
  ['Alt + C', 'Captura rápida'],
  ['Alt + N', 'Nova tarefa'],
  ['Alt + P', 'Prioridades críticas'],
  ['Alt + H', 'Foco de hoje'],
  ['Alt + 1 … 7', 'Navegar pelas áreas'],
  ['Esc', 'Fechar janela ou painel'],
  ['?', 'Mostrar atalhos']
];

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Atalhos de teclado" onClose={onClose}>
      <table className="data">
        <tbody>
          {SHORTCUTS.map(([k, v]) => (
            <tr key={k}>
              <td style={{ width: 180 }}>
                <kbd>{k}</kbd>
              </td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
