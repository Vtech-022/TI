import { describe, expect, it } from 'vitest';
import { findConflicts, parseEventText } from '../src/server/domain/agenda';
import { createEvent, deleteEvent, listEvents, updateEvent } from '../src/server/services/events';
import { listHistory, undoEntry } from '../src/server/services/history';
import { makeCtx } from './helpers';

const meta = { source: 'teste' };

describe('agenda', () => {
  it('interpreta evento em linguagem natural no fuso de São Paulo sem inventar dados', () => {
    const d = parseEventText('Treinamento na terça-feira às 14h com a equipe.', '2026-10-22');
    expect(d).toMatchObject({ title: 'Treinamento', type: 'treinamento', date: '2026-10-27', start: '14:00', end: null, location: null, participants: ['Equipe'] });
    expect(d.missing).toEqual(['horário de término', 'local']);
    expect(d.ambiguities).toEqual([]);
  });

  it('solicita confirmação quando há mais de uma interpretação', () => {
    const d = parseEventText('Reunião na quinta às 2', '2026-10-22');
    expect(d.ambiguities.map((a) => a.field).sort()).toEqual(['date', 'start']);
  });

  it('cria, edita, reagenda e exclui eventos com histórico', () => {
    const ctx = makeCtx({ seed: false });
    const { event } = createEvent(ctx, { title: 'Reunião de pauta', type: 'reuniao', start_at: '2026-10-27T13:00:00.000Z', end_at: '2026-10-27T14:00:00.000Z', participants: ['Daniela'] }, meta);
    updateEvent(ctx, event.id, { location: 'Sala 3' }, meta);
    updateEvent(ctx, event.id, { start_at: '2026-10-28T13:00:00.000Z', end_at: '2026-10-28T14:00:00.000Z' }, meta);
    expect(listEvents(ctx)[0]).toMatchObject({ location: 'Sala 3', start_at: '2026-10-28T13:00:00.000Z' });
    const ops = listHistory(ctx, { entity_type: 'event', entity_id: event.id }).map((h) => h.operation);
    expect(ops).toEqual(['reagendado', 'atualizado', 'criado']);
    deleteEvent(ctx, event.id, meta);
    expect(listEvents(ctx)).toHaveLength(0);
    undoEntry(ctx, listHistory(ctx, { entity_type: 'event', entity_id: event.id })[0].id);
    expect(listEvents(ctx)).toHaveLength(1);
    expect(() => updateEvent(ctx, event.id, { end_at: '2026-10-28T12:00:00.000Z' }, meta)).toThrow(/término/);
  });

  it('detecta conflitos de horário, inclusive com término não informado', () => {
    const ctx = makeCtx({ seed: false });
    const a = createEvent(ctx, { title: 'Curso de gestão', type: 'curso', start_at: '2026-10-27T12:00:00.000Z', end_at: '2026-10-27T15:00:00.000Z' }, meta);
    const b = createEvent(ctx, { title: 'Treinamento', type: 'treinamento', start_at: '2026-10-27T14:00:00.000Z' }, meta);
    expect(b.conflicts.map((e) => e.id)).toEqual([a.event.id]);
    const c = createEvent(ctx, { title: 'Visita técnica', type: 'evento_externo', start_at: '2026-10-27T16:00:00.000Z', end_at: '2026-10-27T17:00:00.000Z' }, meta);
    expect(c.conflicts).toHaveLength(0);
    const conflicts = findConflicts(listEvents(ctx));
    expect(conflicts).toEqual([{ a: a.event.id, b: b.event.id, assumed: true, overlapMinutes: 60 }]);
  });
});
