// Blocos de inteligência reutilizados no painel e em outras telas.
import { AlertTriangle, CalendarDays, Lightbulb, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { dateBr, localDate, localTime } from '../lib/format';
import { useMutation } from '../lib/store';
import type { Alert, CalendarEvent, Recommendation, TaskView } from '../lib/types';
import { EVENT_TYPE_LABEL } from '../lib/types';
import { useOpenTask } from './TaskRow';
import { Empty } from './ui';

export function RecommendationList({ recs, limit }: { recs: Recommendation[]; limit?: number }) {
  const openTask = useOpenTask();
  const navigate = useNavigate();
  const mutate = useMutation();
  if (!recs.length) return <Empty icon={<Lightbulb aria-hidden />} title="Sem recomendações no momento">As sugestões aparecem quando há prazos, dependências ou dados a confirmar.</Empty>;
  return (
    <div>
      {recs.slice(0, limit ?? recs.length).map((r) => (
        <div className="rec" key={r.key}>
          <span className={`sev ${r.severity}`} title={`Severidade ${r.severity}`} />
          <div style={{ minWidth: 0 }}>
            <div className="msg">{r.message}</div>
            <div className="reason">{r.reason}</div>
            <div className="chips">
              {r.evidence.map((e) => (
                <button
                  key={`${e.type}${e.id}`}
                  className="chip"
                  title={e.label}
                  onClick={() => {
                    if (e.type === 'task') openTask(e.id);
                    else if (e.type === 'project') navigate(`/projetos/${e.id}`);
                    else if (e.type === 'event') navigate(`/agenda?evento=${e.id}`);
                    else navigate('/terceiros');
                  }}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>
          <button className="icon-btn" title="Dispensar recomendação" aria-label="Dispensar recomendação" onClick={() => mutate(() => api.post('/api/recommendations/dismiss', { key: r.key }), 'Recomendação dispensada.')}>
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function AlertList({ alerts }: { alerts: Alert[] }) {
  const navigate = useNavigate();
  const openTask = useOpenTask();
  if (!alerts.length) return <Empty title="Nenhum alerta operacional">Sem conflitos de agenda, bloqueios por terceiros ou datas ambíguas.</Empty>;
  return (
    <ul className="list-simple">
      {alerts.map((a, i) => (
        <li
          key={i}
          className="clickable small"
          style={{ display: 'flex', gap: 10 }}
          onClick={() => {
            const r = a.refs[0];
            if (a.kind === 'atrasada') navigate('/pendencias?due=atrasadas');
            else if (a.kind === 'data_ambigua') navigate('/pendencias?due=inferidas');
            else if (a.kind === 'sem_proxima_acao') navigate('/pendencias');
            else if (a.kind === 'confirmacao_pendente') navigate('/captura');
            else if (r?.type === 'event') navigate(`/agenda?evento=${r.id}`);
            else if (r?.type === 'task') openTask(r.id);
          }}
        >
          <AlertTriangle size={15} style={{ flex: 'none', marginTop: 2, color: a.kind === 'conflito_agenda' || a.kind === 'atrasada' ? 'var(--critica)' : 'var(--alta)' }} aria-hidden />
          <span>{a.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function UpcomingList({ tasks, events, today }: { tasks: TaskView[]; events: CalendarEvent[]; today: string }) {
  const openTask = useOpenTask();
  const navigate = useNavigate();
  const items = [
    ...tasks.map((t) => ({ date: t.due_date!, time: t.due_time ?? '', kind: 'task' as const, t })),
    ...events.map((e) => ({ date: localDate(e.start_at), time: e.all_day ? '' : localTime(e.start_at), kind: 'event' as const, e }))
  ].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if (!items.length) return <Empty icon={<CalendarDays aria-hidden />} title="Nada nos próximos 14 dias">Prazos e compromissos aparecerão aqui.</Empty>;
  return (
    <ul className="list-simple">
      {items.map((i) =>
        i.kind === 'task' ? (
          <li key={`t${i.t.id}`} className="clickable small" onClick={() => openTask(i.t.id)} style={{ display: 'flex', gap: 10 }}>
            <span className="mono" style={{ width: 82, flex: 'none', color: i.date === today ? 'var(--critica)' : undefined }}>
              {dateBr(i.date).slice(0, 5)}
              {i.time ? ` ${i.time}` : ''}
            </span>
            <span style={{ minWidth: 0 }}>
              <strong style={{ fontWeight: 500 }}>Prazo:</strong> {i.t.title} {i.t.certainty.due_date === 'inferida' && <span className="cert c-inferida">inferida</span>}
            </span>
          </li>
        ) : (
          <li key={`e${i.e.id}`} className="clickable small" onClick={() => navigate(`/agenda?evento=${i.e.id}`)} style={{ display: 'flex', gap: 10 }}>
            <span className="mono" style={{ width: 82, flex: 'none' }}>
              {dateBr(i.date).slice(0, 5)}
              {i.time ? ` ${i.time}` : ''}
            </span>
            <span>
              <strong style={{ fontWeight: 500 }}>{EVENT_TYPE_LABEL[i.e.type]}:</strong> {i.e.title}
            </span>
          </li>
        )
      )}
    </ul>
  );
}
