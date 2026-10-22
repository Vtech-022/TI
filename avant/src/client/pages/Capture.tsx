import { FileUp, HelpCircle, History, ScanText, Sparkles, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CaptureResultView, ConfirmationCard } from '../components/CaptureResultView';
import { Empty, Panel } from '../components/ui';
import { api } from '../lib/api';
import { localDateTime } from '../lib/format';
import { useApi, useStore } from '../lib/store';
import type { CaptureResult, Confirmation, DocumentRecord } from '../lib/types';

const DRAFT_KEY = 'avant:capture-draft';
const EXAMPLE = `[21/10/2026, 09:13] Victor: Estruturar o painel de educação até quarta-feira
[21/10/2026, 09:15] Ana: A Daniela vai verificar os próximos passos da automação do Forms até sexta
[22/10/2026, 10:02] Ana: Finalizar a apresentação da revista, retirar o mapa da capa, remover os sete trabalhos indicados e enviar a versão revisada para validação.
Treinamento na terça-feira às 14h com a equipe.`;

type Pending = { type: 'text'; text: string } | { type: 'doc'; id: number; filename: string };

function readDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
}

export default function Capture() {
  const { meta, track, refresh, fail, toast } = useStore();
  const [text, setText] = useState(readDraft);
  const [review, setReview] = useState(false);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [fileNotes, setFileNotes] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const confirmations = useApi<Confirmation[]>('/api/confirmations');
  const captures = useApi<{ id: number; preview: string; created_at: string; source_type: string; summary: { stats?: Record<string, number> } }[]>('/api/captures');

  // Rascunho preservado ao alternar entre áreas.
  useEffect(() => {
    try {
      if (text) localStorage.setItem(DRAFT_KEY, text);
      else localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* sem armazenamento local: o rascunho vale apenas nesta tela */
    }
  }, [text]);

  const runText = async (dry: boolean, body: string) => {
    setBusy(true);
    try {
      const r = await track(api.post<CaptureResult>('/api/captures', { text: body, dry_run: dry }));
      setResult(r);
      if (dry) setPending({ type: 'text', text: body });
      else {
        setPending(null);
        setText('');
        refresh();
        toast(`Captura #${r.capture_id} salva.`);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const runDoc = async (dry: boolean, id: number, filename: string) => {
    setBusy(true);
    try {
      const r = await track(api.post<CaptureResult>(`/api/documents/${id}/capture`, { dry_run: dry }));
      setResult(r);
      if (dry) setPending({ type: 'doc', id, filename });
      else {
        setPending(null);
        refresh();
        toast(`${filename}: captura #${r.capture_id} salva.`);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (files: FileList | File[]) => {
    const list = [...files];
    if (!list.length) return;
    const notes: string[] = [];
    setBusy(true);
    try {
      for (const f of list) {
        const form = new FormData();
        form.append('file', f, f.name);
        const [r] = await track(api.upload<{ document: DocumentRecord; duplicate_of: DocumentRecord | null }[]>('/api/documents', form));
        const d = r.document;
        if (r.duplicate_of) notes.push(`${d.filename}: conteúdo idêntico a um arquivo já importado em ${localDateTime(r.duplicate_of.created_at)}.`);
        if (d.parse_status !== 'ok') {
          notes.push(`${d.filename}: ${d.parse_error}`);
          continue;
        }
        notes.push(`${d.filename}: texto extraído e original preservado.`);
        await runDoc(review, d.id, d.filename);
      }
      refresh();
    } catch (e) {
      fail(e);
    } finally {
      setFileNotes(notes);
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Principal forma de entrada</div>
          <h1>Captura Inteligente</h1>
          <p>
            Cole mensagens do WhatsApp, e-mails, atas ou listas — ou solte arquivos. O AVANT separa as ações, extrai prazos, responsáveis e projetos, reconhece o que já existe e pergunta só o que for ambíguo.
          </p>
        </div>
      </div>

      <div className="grid main-side">
        <div className="grid" style={{ alignContent: 'start' }}>
          <Panel title="Nova captura" icon={<Zap />} accent>
            <div className="capture-box">
              <textarea
                className="textarea"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim() && runText(review, text)}
                placeholder="Cole aqui o texto a ser analisado…"
                aria-label="Texto da captura"
              />
            </div>
            <div className="btn-row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
              <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} />
                Revisar antes de salvar
              </label>
              <div className="btn-row">
                {!text && (
                  <button className="btn sm ghost" onClick={() => setText(EXAMPLE)}>
                    <Sparkles size={14} /> Inserir exemplo
                  </button>
                )}
                {text && (
                  <button className="btn sm ghost" onClick={() => setText('')}>
                    Limpar
                  </button>
                )}
                <button className="btn gold" disabled={busy || !text.trim()} onClick={() => runText(review, text)}>
                  <ScanText size={16} /> {busy ? 'Analisando…' : review ? 'Analisar (pré-visualizar)' : 'Analisar e salvar'}
                </button>
              </div>
            </div>
            <div
              className={`dropzone${over ? ' over' : ''}`}
              style={{ marginTop: 14 }}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                upload(e.dataTransfer.files);
              }}
              onClick={() => fileInput.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
              aria-label="Importar arquivos"
            >
              <FileUp aria-hidden />
              <div>
                <strong>Arraste arquivos aqui</strong> ou clique para selecionar
              </div>
              <div className="small muted">
                {meta?.supported_formats.map((f) => f.ext.toUpperCase().slice(1)).join(', ')} · até {meta?.max_upload_mb} MB · o arquivo original é preservado sem alterações
              </div>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                accept={meta?.supported_formats.map((f) => f.ext).join(',')}
                onChange={(e) => {
                  if (e.target.files) upload(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
            {fileNotes.length > 0 && (
              <ul className="small" style={{ marginTop: 10, color: 'var(--text-2)' }}>
                {fileNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
          </Panel>

          {result && (
            <section className="panel" aria-live="polite">
              <CaptureResultView result={result} onUndone={() => setResult(null)} />
              {result.dry_run && pending && (
                <div className="modal-foot" style={{ borderRadius: '0 0 10px 10px' }}>
                  <button className="btn" onClick={() => (setResult(null), setPending(null))}>
                    Descartar
                  </button>
                  <button className="btn primary" disabled={busy} onClick={() => (pending.type === 'text' ? runText(false, pending.text) : runDoc(false, pending.id, pending.filename))}>
                    Salvar estas alterações
                  </button>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <Panel title="Aguardando confirmação" icon={<HelpCircle />} count={confirmations.data?.length}>
            {confirmations.data?.length ? (
              confirmations.data.map((c) => <ConfirmationCard key={c.id} c={c} />)
            ) : (
              <p className="small muted">Nenhuma pergunta pendente. Itens ambíguos aparecem aqui sem bloquear o restante da captura.</p>
            )}
          </Panel>
          <Panel title="Como o AVANT interpreta" icon={<Sparkles />}>
            <ul className="small" style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)', display: 'grid', gap: 6 }}>
              <li>
                <span className="cert c-explicita">Explícita</span> — escrita no texto (ex.: 28/10/2026, “responsável: Ana”).
              </li>
              <li>
                <span className="cert c-inferida">Inferida</span> — deduzida (ex.: “até quarta”, a partir da data da mensagem).
              </li>
              <li>
                <span className="cert c-confirmada">Confirmada</span> — validada por você.
              </li>
              <li>
                <span className="cert c-desconhecida">Não informada</span> — o texto não diz; nada é inventado.
              </li>
              <li>Mensagens que repetem tarefas existentes viram atualização ou são reconhecidas como “já registradas”.</li>
              <li>Conclusões e cancelamentos citados no texto sempre pedem confirmação.</li>
            </ul>
          </Panel>
          <Panel title="Capturas recentes" icon={<History />} flush>
            {!captures.data?.length && <Empty title="Nenhuma captura ainda" />}
            <ul className="list-simple">
              {captures.data?.slice(0, 10).map((c) => (
                <li key={c.id} className="small">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <strong>#{c.id}</strong>
                    <span className="muted">{localDateTime(c.created_at)}</span>
                    <span className="badge neutral">{c.source_type}</span>
                  </div>
                  <div style={{ color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.preview}</div>
                  {c.summary.stats && (
                    <div className="muted">
                      {c.summary.stats.nova_tarefa} nova(s) · {c.summary.stats.atualizacao} atualização(ões) · {c.summary.stats.novo_evento} evento(s)
                    </div>
                  )}
                  <a href={`/historico?capture_id=${c.id}`}>Ver alterações e desfazer</a>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
