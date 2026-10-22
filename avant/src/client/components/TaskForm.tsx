// Formulário de tarefa (criação e edição), com controle de alterações não salvas.
import { useEffect, useMemo, useState } from 'react';
import { CERTAINTY_LABEL, LEVEL_LABEL } from '../lib/types';
import type { Certainty, Task } from '../lib/types';
import { useStore } from '../lib/store';
import { Field } from './ui';

export interface TaskDraft {
  title: string;
  description: string;
  project_id: string;
  parent_id: string;
  category: string;
  impact: string;
  effort: string;
  due_date: string;
  due_time: string;
  due_certainty: string;
  responsible: string;
  involved: string;
  next_action: string;
}

export function draftFrom(t?: Partial<Task>): TaskDraft {
  return {
    title: t?.title ?? '',
    description: t?.description ?? '',
    project_id: t?.project_id ? String(t.project_id) : '',
    parent_id: t?.parent_id ? String(t.parent_id) : '',
    category: t?.category ?? '',
    impact: t?.impact ?? '',
    effort: t?.effort ?? '',
    due_date: t?.due_date ?? '',
    due_time: t?.due_time ?? '',
    due_certainty: t?.certainty?.due_date ?? (t?.due_date ? 'explicita' : 'desconhecida'),
    responsible: t?.responsible ?? '',
    involved: (t?.involved ?? []).join(', '),
    next_action: t?.next_action ?? ''
  };
}

/** Converte o rascunho no corpo da API. Campos alterados manualmente passam a ser "confirmados". */
export function draftToBody(d: TaskDraft, original?: Task): Record<string, unknown> {
  const n = (s: string) => (s.trim() ? s.trim() : null);
  const certainty = { ...(original?.certainty ?? {}) } as Record<string, Certainty>;
  const changed = (k: keyof TaskDraft, orig: unknown) => String(orig ?? '') !== d[k];
  if (d.due_date) certainty.due_date = (changed('due_date', original?.due_date) ? 'confirmada' : (d.due_certainty as Certainty)) || 'confirmada';
  else certainty.due_date = 'desconhecida';
  if (changed('responsible', original?.responsible)) certainty.responsible = d.responsible ? 'confirmada' : 'desconhecida';
  if (changed('project_id', original?.project_id)) certainty.project = d.project_id ? 'confirmada' : 'desconhecida';
  if (changed('impact', original?.impact)) certainty.impact = d.impact ? 'confirmada' : 'desconhecida';
  if (changed('category', original?.category)) certainty.category = d.category ? 'confirmada' : 'desconhecida';
  return {
    title: d.title.trim(),
    description: n(d.description),
    project_id: d.project_id ? Number(d.project_id) : null,
    parent_id: d.parent_id ? Number(d.parent_id) : null,
    category: n(d.category),
    impact: d.impact || null,
    effort: d.effort || null,
    due_date: d.due_date || null,
    due_time: d.due_date && d.due_time ? d.due_time : null,
    responsible: n(d.responsible),
    involved: d.involved
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    next_action: n(d.next_action),
    certainty
  };
}

export function TaskForm({ draft, onChange, parentOptions }: { draft: TaskDraft; onChange: (d: TaskDraft) => void; parentOptions?: { id: number; title: string }[] }) {
  const { meta } = useStore();
  const set = (k: keyof TaskDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange({ ...draft, [k]: e.target.value });
  return (
    <div className="form-grid">
      <Field label="Título" full>
        <input className="input" value={draft.title} onChange={set('title')} required minLength={2} data-autofocus />
      </Field>
      <Field label="Descrição" full>
        <textarea className="textarea" value={draft.description} onChange={set('description')} rows={3} />
      </Field>
      <Field label="Projeto">
        <select className="select" value={draft.project_id} onChange={set('project_id')}>
          <option value="">Não informado</option>
          {meta?.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      {parentOptions && (
        <Field label="Tarefa principal">
          <select className="select" value={draft.parent_id} onChange={set('parent_id')}>
            <option value="">Nenhuma</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Prazo" hint={draft.due_date ? `Certeza atual: ${CERTAINTY_LABEL[(draft.due_certainty as Certainty) ?? 'explicita']}` : undefined}>
        <input className="input" type="date" value={draft.due_date} onChange={set('due_date')} />
      </Field>
      <Field label="Horário (opcional)">
        <input className="input" type="time" value={draft.due_time} onChange={set('due_time')} disabled={!draft.due_date} />
      </Field>
      <Field label="Responsável">
        <input className="input" value={draft.responsible} onChange={set('responsible')} list="avant-people" placeholder="Não informado" />
      </Field>
      <Field label="Envolvidos (separados por vírgula)">
        <input className="input" value={draft.involved} onChange={set('involved')} list="avant-people" />
      </Field>
      <Field label="Impacto">
        <select className="select" value={draft.impact} onChange={set('impact')}>
          <option value="">Não informado</option>
          {Object.entries(LEVEL_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Esforço">
        <select className="select" value={draft.effort} onChange={set('effort')}>
          <option value="">Não informado</option>
          {Object.entries(LEVEL_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Categoria">
        <input className="input" value={draft.category} onChange={set('category')} list="avant-categories" placeholder="Não informada" />
      </Field>
      <Field label="Próxima ação" full>
        <input className="input" value={draft.next_action} onChange={set('next_action')} placeholder="Qual é o próximo passo concreto?" />
      </Field>
      <datalist id="avant-people">{meta?.people.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="avant-categories">{meta?.categories.map((c) => <option key={c} value={c} />)}</datalist>
    </div>
  );
}

export function useDirty<T>(initial: T) {
  const [value, setValue] = useState(initial);
  const [base, setBase] = useState(initial);
  const dirty = useMemo(() => JSON.stringify(value) !== JSON.stringify(base), [value, base]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  return {
    value,
    setValue,
    dirty,
    reset: (v: T) => {
      setValue(v);
      setBase(v);
    }
  };
}
