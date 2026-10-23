import { Lock, Target } from 'lucide-react';
import { TaskRow } from '../components/TaskRow';
import { Empty, ErrorBox, Panel, Skeleton } from '../components/ui';
import { longDate } from '../lib/format';
import { useApi } from '../lib/store';
import type { TaskView } from '../lib/types';

export default function Focus() {
  const { data, error } = useApi<{ task: TaskView; why: string[] }[]>('/api/focus');
  const blocked = useApi<TaskView[]>('/api/tasks?deps=bloqueadas');
  const today = useApi<{ today: string }>('/api/health');
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{today.data ? longDate(today.data.today) : 'Hoje'}</div>
          <h1>Prioridades</h1>
          <p>Ordem recomendada considerando prazo, impacto, dependências e esforço conhecido. Tarefas bloqueadas ficam fora da fila até a liberação.</p>
        </div>
      </div>
      <ErrorBox error={error} />
      <div className="grid main-side">
        <Panel title="Sequência recomendada" icon={<Target />} count={data?.length} flush accent>
          {!data ? (
            <Skeleton rows={6} />
          ) : data.length ? (
            <ul className="task-list">
              {data.map((f, i) => (
                <TaskRow key={f.task.id} task={f.task} rank={i + 1} why={f.why} />
              ))}
            </ul>
          ) : (
            <Empty title="Nada para executar agora">Cadastre tarefas pela Captura Inteligente ou libere as bloqueadas.</Empty>
          )}
        </Panel>
        <Panel title="Bloqueadas por dependências" icon={<Lock />} count={blocked.data?.length} flush>
          {blocked.data?.length ? (
            <ul className="task-list">
              {blocked.data.map((t) => (
                <TaskRow key={t.id} task={t} why={[`Aguarda: ${t.blockers.filter((b) => b.status !== 'concluida' && b.status !== 'cancelada').map((b) => b.title).join('; ')}`]} />
              ))}
            </ul>
          ) : (
            <Empty title="Nenhuma tarefa bloqueada" />
          )}
        </Panel>
      </div>
    </>
  );
}
