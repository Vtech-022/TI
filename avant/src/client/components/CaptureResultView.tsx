import { CalendarPlus, CheckCircle2, CircleDashed, FolderPlus, GitMerge, HelpCircle, Hourglass, PlusCircle, RefreshCw, Undo2 } from 'lucide-react';
import { ReactElement, useState } from 'react';
import { api } from '../lib/api';
import { dateBr } from '../lib/format';
import { useMutation } from '../lib/store';
import type { CaptureOperation, CaptureResult, Confirmation } from '../lib/types';
import { useOpenTask } from './TaskRow';

const KIND: Record<CaptureOperation['kind'], { label: string; icon: ReactElement }> = {
  nova_tarefa: { label: 'Nova tarefa', icon: <PlusCircle /> },
  atualizacao: { label: 'Atualização', icon: <RefreshCw /> },
  ja_registrada: { label: 'Já registrada', icon: <CheckCircle2 /> },
  novo_evento: { label: 'Novo evento', icon: <CalendarPlus /> },
  nova_espera: { label: 'Aguardando terceiro', icon: <Hourglass /> },
  novo_projeto: { label: 'Novo projeto', icon: <FolderPlus /> },
  dependencia: { label: 'Dependência', icon: <GitMerge /> },
  confirmacao: { label: 'Precisa de confirmação', icon: <HelpCircle /> }
};

export function ConfirmationCard({ c, onResolved }: { c: Confirmation; onResolved?: () => void }) {
  const mutate = useMutation();
  const [custom, setCustom] = useState('');
  const resolve = async (value: string) => {
    const r = await mutate(() => api.post(`/api/confirmations/${c.id}`, { value }), 'Confirmação registrada.');
    if (r) onResolved?.();
  };
  return (
    <div className="confirm-card">
      <p>{c.question}</p>
      <div className="btn-row">
        {c.options.map((o) => (
          <button key={o.value} className={`btn sm ${o.value === 'ignorar' || o.value === 'manter' ? 'ghost' : ''}`} onClick={() => resolve(o.value)} disabled={!c.id}>
            {o.label}
          </button>
        ))}
        {c.payload?.allow_custom_date && (
          <>
            <input className="input" type="date" style={{ width: 160, height: 30 }} value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Informar data" />
            <button className="btn sm primary" disabled={!custom || !c.id} onClick={() => resolve(`data:${custom}`)}>
              Usar {custom ? dateBr(custom) : 'data'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function CaptureResultView({ result, onUndone }: { result: CaptureResult; onUndone?: () => void }) {
  const open = useOpenTask();
  const mutate = useMutation();
  const s = result.stats;
  const summary = [
    s.nova_tarefa && `${s.nova_tarefa} nova(s) tarefa(s)`,
    s.atualizacao && `${s.atualizacao} atualização(ões)`,
    s.ja_registrada && `${s.ja_registrada} já registrada(s)`,
    s.novo_evento && `${s.novo_evento} evento(s)`,
    s.nova_espera && `${s.nova_espera} espera(s) de terceiros`,
    s.dependencia && `${s.dependencia} dependência(s)`,
    s.confirmacao && `${s.confirmacao} confirmação(ões) pendente(s)`
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div>
      <div className="panel-head" style={{ borderTop: '1px solid var(--line)' }}>
        <h2>{result.dry_run ? 'Pré-visualização — nada foi salvo' : `Captura #${result.capture_id} salva`}</h2>
        <span className="spacer" />
        {!result.dry_run && result.capture_id && (
          <button
            className="btn sm"
            onClick={async () => {
              const r = await mutate(() => api.post(`/api/captures/${result.capture_id}/undo`), (x: any) => `${x.undone} alteração(ões) desfeita(s).`);
              if (r) onUndone?.();
            }}
          >
            <Undo2 size={14} /> Desfazer captura
          </button>
        )}
      </div>
      <div className="panel-body" style={{ paddingBottom: 6 }}>
        <p className="small" style={{ color: 'var(--text-2)' }}>
          {summary || 'Nenhuma ação identificada.'} · {s.candidatos} item(ns) analisado(s) em {s.mensagens} mensagem(ns) · referência {dateBr(result.reference_date)}
        </p>
      </div>
      {!result.dry_run && result.confirmations.length > 0 && (
        <div className="panel-body" style={{ paddingTop: 4 }}>
          {result.confirmations.map((c) => (
            <ConfirmationCard key={c.id} c={c} />
          ))}
        </div>
      )}
      <div>
        {result.operations.map((op, i) => (
          <div className="op" key={i} style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}>
            <span className={`op-icon k-${op.kind}`} aria-hidden>
              {KIND[op.kind].icon}
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="small muted">{KIND[op.kind].label}</div>
              <div style={{ fontWeight: 500 }}>
                {op.task_id && !result.dry_run ? (
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      open(op.task_id!);
                    }}
                  >
                    {op.title}
                  </a>
                ) : (
                  op.title
                )}
              </div>
              {op.details.length > 0 && (
                <ul>
                  {op.details.map((d, j) => (
                    <li key={j}>{d}</li>
                  ))}
                </ul>
              )}
              {op.excerpt && op.excerpt !== op.title && <div className="small muted" style={{ marginTop: 4 }}>Trecho: “{op.excerpt}”</div>}
            </div>
          </div>
        ))}
      </div>
      {result.ignored.length > 0 && (
        <details className="panel-body" style={{ borderTop: '1px solid var(--line)' }}>
          <summary className="small" style={{ cursor: 'pointer', color: 'var(--text-2)' }}>
            <CircleDashed size={13} style={{ verticalAlign: -2 }} /> {result.ignored.length} trecho(s) sem ação
          </summary>
          <ul className="small" style={{ color: 'var(--text-2)', marginTop: 8 }}>
            {result.ignored.map((x, i) => (
              <li key={i}>
                “{x.text}” — {x.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
