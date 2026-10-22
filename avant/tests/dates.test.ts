import { describe, expect, it } from 'vitest';
import { dateInTz, parseDates, parseTimes, zonedToUtc } from '../src/server/domain/dates';

const REF = '2026-10-22'; // quinta-feira

describe('interpretação de datas', () => {
  it('distingue data explícita de data inferida', () => {
    const [explicit] = parseDates('Entregar até 28/10/2026', REF);
    expect(explicit).toMatchObject({ date: '2026-10-28', certainty: 'explicita' });
    const [inferred] = parseDates('Entregar até quarta-feira', REF);
    expect(inferred).toMatchObject({ date: '2026-10-28', certainty: 'inferida' });
  });

  it('reproduz a anotação da tarefa 7 (21/10/2026, "até quarta-feira") como 28/10, inferida e com alternativa', () => {
    const [d] = parseDates('até quarta-feira', '2026-10-21');
    expect(d.date).toBe('2026-10-28');
    expect(d.certainty).toBe('inferida');
    expect(d.alternatives).toEqual(['2026-10-21', '2026-10-28']);
  });

  it('interpreta expressões relativas a partir da data de referência', () => {
    expect(parseDates('amanhã', REF)[0].date).toBe('2026-10-23');
    expect(parseDates('depois de amanhã', REF)[0].date).toBe('2026-10-24');
    expect(parseDates('terça da semana que vem', REF)[0].date).toBe('2026-10-27');
    expect(parseDates('fim do mês', REF)[0].date).toBe('2026-10-31');
    expect(parseDates('30 de outubro', REF)[0]).toMatchObject({ date: '2026-10-30', certainty: 'explicita' });
    expect(parseDates('dia 5', REF)[0]).toMatchObject({ date: '2026-11-05', certainty: 'inferida' });
  });

  it('sinaliza ambiguidade em "sexta que vem" dito perto da sexta', () => {
    const [d] = parseDates('sexta que vem', REF);
    expect(d.alternatives).toEqual(['2026-10-23', '2026-10-30']);
  });

  it('não inventa datas quando o texto não tem nenhuma', () => {
    expect(parseDates('Revisar a ata do colegiado', REF)).toEqual([]);
    expect(parseDates('remover 7 trabalhos', REF)).toEqual([]);
  });

  it('lê horários, intervalos e horários ambíguos', () => {
    expect(parseTimes('Treinamento na terça-feira às 14h com a equipe.')[0]).toMatchObject({ start: '14:00', end: null });
    expect(parseTimes('reunião das 9h às 10h30')[0]).toMatchObject({ start: '09:00', end: '10:30' });
    expect(parseTimes('às 3 da tarde')[0].start).toBe('15:00');
    const amb = parseTimes('às 2')[0];
    expect(amb.start).toBe('14:00');
    expect(amb.alternatives).toEqual(['02:00', '14:00']);
  });

  it('converte horário local de São Paulo para UTC', () => {
    expect(zonedToUtc('2026-10-27', '14:00', 'America/Sao_Paulo')).toBe('2026-10-27T17:00:00.000Z');
    expect(dateInTz(new Date('2026-10-23T02:30:00Z'), 'America/Sao_Paulo')).toBe('2026-10-22');
  });
});
