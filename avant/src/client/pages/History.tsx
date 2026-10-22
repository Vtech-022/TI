import { History as HistoryIcon, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOpenTask } from '../components/TaskRow';
import { ConfirmDialog, Empty, ErrorBox, Panel, Skeleton } from '../components/ui';
import { api, qs } from '../lib/api';
import { localDateTime } from '../lib/format';
import { useApi, useMutation } from '../lib/store';
import type { HistoryEntry } from '../lib/types';

const ENTITY: Record<string, string> = { task: 'Tarefa', project: 'Projeto', event: 'Evento', wait: 'Terceiro', link: 'Dependência', document: 'Documento', milestone: 'Marco' };

export default function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const f = { q: params.get('q') ?? '', entity_type: params.get('entity_type') ?? '', capture_id: params.get('capture_id') ?? '', from: params.get('from') ?? '', to: params.get('to') ?? '' };
  const { data, error } = useApi<HistoryEntry[]>(`/api/history${qs({ ...f, from: f.from ? `${f.from}T00:00:00` : '', to: f.to ? `${f.to}T23:59:59` : '' })}`);
  const mutate = useMutation();
  const openTask = useOpenTask();
  const [ask, setAsk] = useState<{ kind: 'entry'; h: HistoryEntry } | { kind: 'capture'; id: string } | null>(null);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Rastreabilidade</div>
          <h1>Histórico</h1>
          <p>Todas as alterações importantes, com data, origem e registro afetado. Desfazer só é permitido quando o registro não foi alterado depois — para não perder dados.</p>
        </div>
        {f.capture_id && (
          <button className="btn" onClick={() => setAsk({ kind: 'capture', id: f.capture_id })}>
            <Undo2 size={16} /> Desfazer captura #{f.capture_id}
          </button>
        )}
      </div>
      <div className="toolbar">
        <input className="input grow" placeholder="Pesquisar no histórico" value={f.q} onChange={(e) => set('q', e.target.value)} aria-label="Pesquisar no histórico" />
        <select className="select" value={f.entity_type} onChange={(e) => set('entity_type', e.target.value)} aria-label="Tipo de registro">
          <option value="">Todos os registros</option>
          {Object.entries(ENTITY).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input className="input" type="date" value={f.from} onChange={(e) => set('from', e.target.value)} aria-label="De" />
        <input className="input" type="date" value={f.to} onChange={(e) => set('to', e.target.value)} aria-label="Até" />
        {f.capture_id && (
          <button className="btn sm ghost" onClick={() => set('capture_id', '')}>
            Captura #{f.capture_id} ✕
          </button>
        )}
      </div>
      <ErrorBox error={error} />
      <Panel title="Alterações" icon={<HistoryIcon />} count={data?.length} flush>
        {!data ? (
          <Skeleton rows={8} />
        ) : data.length === 0 ? (
          <Empty title="Nenhuma alteração encontrada" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Registro</th>
                  <th>Operação</th>
                  <th>Origem</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((h) => (
                  <tr key={h.id} style={{ opacity: h.undone ? 0.55 : 1 }}>
                    <td className="small mono" style={{ whiteSpace: 'nowrap' }}>
                      {localDateTime(h.created_at)}
                    </td>
                    <td className="small">
                      <span className="badge neutral">{ENTITY[h.entity_type] ?? h.entity_type}</span> #{h.entity_id}
                    </td>
                    <td>
                      {h.entity_type === 'task' && h.operation !== 'excluida' ? (
                        <a href="#" onClick={(e) => (e.preventDefault(), openTask(h.entity_id))} style={{ textDecoration: h.undone ? 'line-through' : undefined }}>
                          {h.summary}
                        </a>
                      ) : (
                        <span style={{ textDecoration: h.undone ? 'line-through' : undefined }}>{h.summary}</span>
                      )}
                    </td>
                    <td className="small">
                      {h.source}
                      {h.capture_id ? (
                        <>
                          {' '}
                          ·{' '}
                          <a href="#" onClick={(e) => (e.preventDefault(), set('capture_id', String(h.capture_id)))}>
                            captura #{h.capture_id}
                          </a>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {!h.undone && h.operation !== 'desfeito' && h.operation !== 'prioridade_recalculada' && (h.before !== null || h.after !== null) && (
                        <button className="btn sm ghost" onClick={() => setAsk({ kind: 'entry', h })} title="Desfazer esta alteração">
                          <Undo2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <ConfirmDialog
        open={!!ask}
        title={ask?.kind === 'capture' ? `Desfazer captura #${ask.id}?` : 'Desfazer alteração?'}
        message={ask?.kind === 'capture' ? 'Todas as tarefas, eventos, esperas e atualizações criadas por esta captura serão revertidas.' : ask?.kind === 'entry' ? `“${ask.h.summary}” será revertida.` : ''}
        confirmLabel="Desfazer"
        onCancel={() => setAsk(null)}
        onConfirm={async () => {
          const a = ask!;
          setAsk(null);
          if (a.kind === 'capture') await mutate(() => api.post<{ undone: number }>(`/api/captures/${a.id}/undo`), (r) => `${r.undone} alteração(ões) desfeita(s).`);
          else await mutate(() => api.post(`/api/history/${a.h.id}/undo`), 'Alteração desfeita.');
        }}
      />
    </>
  );
}
