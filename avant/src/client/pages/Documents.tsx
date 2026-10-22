import { Download, FileStack, FileUp, ScanText } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ConfirmDialog, Empty, ErrorBox, Modal, Panel, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { localDateTime } from '../lib/format';
import { useApi, useMutation, useStore } from '../lib/store';
import type { CaptureResult, DocumentRecord, TaskView } from '../lib/types';

const STATUS: Record<DocumentRecord['parse_status'], { label: string; cls: string }> = {
  ok: { label: 'Texto extraído', cls: 's-concluida' },
  sem_texto: { label: 'Sem texto', cls: 'p-alta' },
  nao_suportado: { label: 'Não suportado', cls: 'p-baixa' },
  erro: { label: 'Erro de leitura', cls: 'p-critica' }
};

function size(n: number) {
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

export default function Documents() {
  const { data, error } = useApi<DocumentRecord[]>('/api/documents');
  const { data: tasks } = useApi<TaskView[]>('/api/tasks?include_closed=1');
  const { meta, track, fail, refresh, toast } = useStore();
  const mutate = useMutation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [over, setOver] = useState(false);
  const [askRemove, setAskRemove] = useState<DocumentRecord | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const docId = params.get('doc');
  const detail = useApi<{ document: DocumentRecord; text: string | null }>(docId ? `/api/documents/${docId}` : null);

  const upload = async (files: FileList | File[]) => {
    for (const f of [...files]) {
      const form = new FormData();
      form.append('file', f, f.name);
      try {
        const [r] = await track(api.upload<{ document: DocumentRecord; duplicate_of: DocumentRecord | null }[]>('/api/documents', form));
        toast(r.document.parse_status === 'ok' ? `${f.name}: importado e texto extraído.` : `${f.name}: ${r.document.parse_error}`, r.document.parse_status === 'ok' ? 'ok' : 'error');
      } catch (e) {
        fail(e);
      }
    }
    refresh();
  };

  const closeDetail = () => {
    const next = new URLSearchParams(params);
    next.delete('doc');
    setParams(next, { replace: true });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Registro</div>
          <h1>Arquivos e Documentos</h1>
          <p>Arquivos importados ficam armazenados exatamente como enviados (verificação por SHA-256). O AVANT lê o conteúdo quando o formato permite, mas nunca altera nem exclui o original.</p>
        </div>
      </div>
      <div
        className={`dropzone${over ? ' over' : ''}`}
        style={{ marginBottom: 18 }}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          upload(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      >
        <FileUp aria-hidden />
        <div>
          <strong>Importar arquivos</strong> — arraste ou clique
        </div>
        <div className="small muted">
          Leitura de conteúdo: {meta?.supported_formats.map((f) => f.label).join(', ')}. Outros formatos não são aceitos para interpretação.
        </div>
        <input ref={input} type="file" multiple hidden onChange={(e) => (e.target.files && upload(e.target.files), (e.target.value = ''))} />
      </div>
      <ErrorBox error={error} />
      <Panel title="Arquivos" icon={<FileStack />} count={data?.length} flush>
        {!data ? (
          <Skeleton rows={4} />
        ) : data.length === 0 ? (
          <Empty title="Nenhum arquivo importado" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Leitura</th>
                  <th>Projeto</th>
                  <th>Tarefa</th>
                  <th>Importado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setParams({ doc: String(d.id) });
                        }}
                      >
                        {d.filename}
                      </a>
                      <div className="small muted mono">
                        {size(d.size)} · {d.sha256.slice(0, 12)}…
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${STATUS[d.parse_status].cls}`} title={d.parse_error ?? ''}>
                        {STATUS[d.parse_status].label}
                      </span>
                      {d.parse_error && <div className="small muted" style={{ maxWidth: 260 }}>{d.parse_error}</div>}
                    </td>
                    <td>
                      <select
                        className="select"
                        style={{ height: 30, minWidth: 150 }}
                        value={d.project_id ?? ''}
                        onChange={(e) => mutate(() => api.patch(`/api/documents/${d.id}`, { project_id: e.target.value ? Number(e.target.value) : null }), 'Vínculo atualizado.')}
                        aria-label="Projeto do documento"
                      >
                        <option value="">—</option>
                        {meta?.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="select"
                        style={{ height: 30, minWidth: 150, maxWidth: 220 }}
                        value={d.task_id ?? ''}
                        onChange={(e) => mutate(() => api.patch(`/api/documents/${d.id}`, { task_id: e.target.value ? Number(e.target.value) : null }), 'Vínculo atualizado.')}
                        aria-label="Tarefa do documento"
                      >
                        <option value="">—</option>
                        {tasks?.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="small">{localDateTime(d.created_at)}</td>
                    <td>
                      <div className="btn-row" style={{ flexWrap: 'nowrap' }}>
                        {d.parse_status === 'ok' && (
                          <button
                            className="btn sm"
                            title="Enviar o texto para a Captura Inteligente"
                            onClick={async () => {
                              const r = await mutate(() => api.post<CaptureResult>(`/api/documents/${d.id}/capture`, {}), (x) => `Captura #${x.capture_id}: ${x.stats.nova_tarefa} nova(s), ${x.stats.atualizacao} atualização(ões).`);
                              if (r) navigate(`/historico?capture_id=${r.capture_id}`);
                            }}
                          >
                            <ScanText size={14} /> Capturar
                          </button>
                        )}
                        <a className="btn sm ghost" href={`/api/documents/${d.id}/file`} aria-label={`Baixar ${d.filename}`}>
                          <Download size={14} />
                        </a>
                        <button className="btn sm ghost" onClick={() => setAskRemove(d)}>
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Modal open={!!docId} title={detail.data?.document?.filename ?? 'Documento'} onClose={closeDetail}>
        <ErrorBox error={detail.error} />
        {detail.data && (
          <>
            <p className="small muted" style={{ marginBottom: 10 }}>
              {detail.data.document.mime} · {size(detail.data.document.size)} · SHA-256 {detail.data.document.sha256}
            </p>
            {detail.data.text ? (
              <pre className="quote" style={{ maxHeight: '50vh', overflow: 'auto', fontFamily: 'var(--font)' }}>
                {detail.data.text}
              </pre>
            ) : (
              <p className="muted">{detail.data.document.parse_error ?? 'Sem texto extraído.'}</p>
            )}
          </>
        )}
      </Modal>
      <ConfirmDialog
        open={!!askRemove}
        title="Remover do AVANT?"
        message={`"${askRemove?.filename}" deixará de aparecer no AVANT. O arquivo original permanece guardado no armazenamento local (data/uploads) e não é apagado.`}
        confirmLabel="Remover registro"
        danger
        onCancel={() => setAskRemove(null)}
        onConfirm={async () => {
          const d = askRemove!;
          setAskRemove(null);
          await mutate(() => api.del(`/api/documents/${d.id}`, { confirm: true }), 'Registro removido; original preservado.');
        }}
      />
    </>
  );
}
