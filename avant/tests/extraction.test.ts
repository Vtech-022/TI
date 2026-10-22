import { describe, expect, it } from 'vitest';
import { extract } from '../src/server/domain/extraction';

const ctx = {
  referenceDate: '2026-10-22',
  projects: [
    { id: 1, name: 'Revista de Experiências Exitosas SBCD 2025–2026', keywords: ['revista', 'sbcd', 'capa', 'eixos'] },
    { id: 2, name: 'Painel de Educação', keywords: ['painel de educação', 'planilhas das unidades'] }
  ],
  people: ['Daniela', 'Rogério', 'Luciana']
};

describe('extração de tarefas', () => {
  it('separa várias ações de uma mesma frase, relaciona ao projeto e organiza a sequência', () => {
    const r = extract('Finalizar a apresentação da revista, retirar o mapa da capa, remover os sete trabalhos indicados e enviar a versão revisada para validação.', ctx);
    const titles = r.candidates.map((c) => c.title);
    expect(titles).toEqual([
      'Finalizar a apresentação da revista',
      'Retirar o mapa da capa',
      'Remover os sete trabalhos indicados',
      'Enviar a versão revisada para validação'
    ]);
    expect(r.candidates.every((c) => c.project?.id === 1)).toBe(true);
    expect(r.candidates[3].dependsOnRefs).toEqual([0, 1, 2]);
    // Nada inventado
    expect(r.candidates.every((c) => c.due === null && c.responsible === null)).toBe(true);
  });

  it('interpreta conversa do WhatsApp usando a data de cada mensagem como referência', () => {
    const r = extract(
      `[21/10/2026, 09:12] Victor: Bom dia!
[21/10/2026, 09:13] Victor: Estruturar o painel de educação até quarta-feira
[21/10/2026, 09:15] Ana: A Daniela vai verificar os próximos passos da automação do Forms até sexta`,
      ctx
    );
    expect(r.messages).toBe(3);
    expect(r.ignored.map((i) => i.text)).toContain('Bom dia!');
    const painel = r.candidates[0];
    expect(painel.title).toBe('Estruturar o painel de educação');
    expect(painel.due).toMatchObject({ date: '2026-10-28', certainty: 'inferida' });
    expect(painel.project?.id).toBe(2);
    const forms = r.candidates[1];
    expect(forms.responsible).toEqual({ value: 'Daniela', certainty: 'explicita' });
    expect(forms.waitingOn?.party).toBe('Daniela');
    expect(forms.due?.date).toBe('2026-10-23');
  });

  it('usa cabeçalhos de lista como contexto sem criar tarefa genérica', () => {
    const r = extract(`Pendências da semana:
- revisar a ata do colegiado e encaminhar para Luciana
- Qr code que nao muda o valor`, ctx);
    expect(r.candidates.map((c) => c.title)).toEqual(['Revisar a ata do colegiado', 'Encaminhar a ata do colegiado para Luciana', 'Qr code que nao muda o valor']);
    expect(r.candidates[1].involved).toContain('Luciana');
    expect(r.candidates[1].dependsOnRefs).toEqual([r.candidates[0].ref]);
  });

  it('cria subtarefas quando o cabeçalho descreve uma entrega', () => {
    const r = extract(`Ajustes da revista:
- retirar o mapa da capa
- validar a versão digital`, ctx);
    expect(r.candidates[0].title).toBe('Ajustes da revista');
    expect(r.candidates[1].parentRef).toBe(r.candidates[0].ref);
    expect(r.candidates[2].parentRef).toBe(r.candidates[0].ref);
  });

  it('identifica eventos de agenda sem inventar término, local ou participantes', () => {
    const [c] = extract('Treinamento na terça-feira às 14h com a equipe.', ctx).candidates;
    expect(c.kind).toBe('event');
    expect(c.title).toBe('Treinamento');
    expect(c.event).toMatchObject({ type: 'treinamento', date: '2026-10-27', start: '14:00', end: null, location: null, participants: ['Equipe'] });
  });

  it('reconhece sinais de conclusão e espera por terceiros', () => {
    const r = extract('Ata do colegiado já enviada para Luciana. Ainda aguardando o Rogério liberar as planilhas das unidades', ctx);
    expect(r.candidates[0].statusCue).toBe('concluida');
    expect(r.candidates[1].waitingOn).toMatchObject({ party: 'Rogério', certainty: 'explicita' });
  });

  it('marca urgência explícita como impacto alto e mantém ausência como desconhecida', () => {
    const r = extract('- cobrar Daniela sobre o Forms, urgente\n- organizar arquivos', ctx);
    expect(r.candidates[0].impact).toEqual({ value: 'alto', certainty: 'explicita' });
    expect(r.candidates[1].impact).toBeNull();
  });
});
