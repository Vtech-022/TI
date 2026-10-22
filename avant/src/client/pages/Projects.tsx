import { FolderKanban, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cert, Empty, ErrorBox, Field, Modal, ProgressBar, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { dateBr } from '../lib/format';
import { useApi, useMutation } from '../lib/store';
import type { ProjectSummary } from '../lib/types';

export function ProjectForm({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="form-grid">
      <Field label="Nome" full>
        <input className="input" value={value.name} onChange={set('name')} data-autofocus />
      </Field>
      <Field label="Objetivo" full>
        <textarea className="textarea" rows={2} value={value.objective} onChange={set('objective')} />
      </Field>
      <Field label="Descrição" full>
        <textarea className="textarea" rows={3} value={value.description} onChange={set('description')} />
      </Field>
      <Field label="Responsáveis (vírgula)">
        <input className="input" value={value.owners} onChange={set('owners')} />
      </Field>
      <Field label="Status">
        <select className="select" value={value.status} onChange={set('status')}>
          <option value="ativo">Ativo</option>
          <option value="pausado">Pausado</option>
          <option value="encerrado">Encerrado</option>
        </select>
      </Field>
      <Field label="Palavras-chave para a captura (vírgula)" full hint="Usadas para relacionar mensagens a este projeto automaticamente.">
        <input className="input" value={value.keywords} onChange={set('keywords')} />
      </Field>
    </div>
  );
}

export const emptyProject = { name: '', objective: '', description: '', owners: '', keywords: '', status: 'ativo' };
export const projectBody = (v: Record<string, string>) => ({
  name: v.name.trim(),
  objective: v.objective.trim() || null,
  description: v.description.trim() || null,
  owners: v.owners.split(',').map((s) => s.trim()).filter(Boolean),
  keywords: v.keywords.split(',').map((s) => s.trim()).filter((s) => s.length >= 2),
  status: v.status
});

export default function Projects() {
  const { data, error } = useApi<ProjectSummary[]>('/api/projects');
  const navigate = useNavigate();
  const mutate = useMutation();
  const [creating, setCreating] = useState<Record<string, string> | null>(null);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Gestão</div>
          <h1>Projetos</h1>
          <p>Progresso calculado pelas tarefas reais (subtarefas contam individualmente; canceladas não entram na conta).</p>
        </div>
        <button className="btn primary" onClick={() => setCreating({ ...emptyProject })}>
          <Plus size={16} /> Novo projeto
        </button>
      </div>
      <ErrorBox error={error} />
      {!data ? (
        <Skeleton rows={6} />
      ) : data.length === 0 ? (
        <Empty icon={<FolderKanban />} title="Nenhum projeto">Crie um projeto ou cite “projeto: Nome” em uma captura.</Empty>
      ) : (
        <div className="grid cols-3">
          {data.map((p) => (
            <button key={p.id} className="panel kpi" style={{ textAlign: 'left', padding: 18 }} onClick={() => navigate(`/projetos/${p.id}`)}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <span className={`badge ${p.status === 'ativo' ? 'gold' : 'neutral'}`}>{p.status}</span>
                {p.critical > 0 && <span className="badge p-critica">{p.critical} crítica(s)</span>}
                {p.overdue > 0 && <span className="badge overdue">{p.overdue} atrasada(s)</span>}
              </div>
              <h2 className="project-name" style={{ fontSize: 19 }}>{p.name}</h2>
              {p.objective && <p className="small muted" style={{ marginTop: 4 }}>{p.objective}</p>}
              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '14px 0 6px' }} className="small">
                <span className="mono">
                  {p.progress.done}/{p.progress.total} tarefas
                </span>
                <span className="mono">{p.progress.percent ?? 0}%</span>
              </div>
              <ProgressBar value={p.progress.percent} />
              <div className="small" style={{ marginTop: 12, color: 'var(--text-2)' }}>
                <strong style={{ fontWeight: 500 }}>Próxima ação:</strong> {p.next_action?.text ?? 'não definida'}
              </div>
              {p.next_due && (
                <div className="small" style={{ color: 'var(--text-2)' }}>
                  <strong style={{ fontWeight: 500 }}>Próxima entrega:</strong> {dateBr(p.next_due.date)} {p.next_due.certainty === 'inferida' && <Cert c="inferida" />}
                </div>
              )}
              {p.risks.length > 0 && (
                <div className="small" style={{ color: 'var(--critica)', marginTop: 6 }}>
                  {p.risks[0]}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      <Modal
        open={!!creating}
        title="Novo projeto"
        onClose={() => setCreating(null)}
        footer={
          <>
            <button className="btn" onClick={() => setCreating(null)}>
              Cancelar
            </button>
            <button
              className="btn primary"
              disabled={!creating || creating.name.trim().length < 2}
              onClick={async () => {
                const r = await mutate(() => api.post<{ id: number }>('/api/projects', projectBody(creating!)), 'Projeto criado.');
                if (r) {
                  setCreating(null);
                  navigate(`/projetos/${r.id}`);
                }
              }}
            >
              Criar
            </button>
          </>
        }
      >
        {creating && <ProjectForm value={creating} onChange={setCreating} />}
      </Modal>
    </>
  );
}
