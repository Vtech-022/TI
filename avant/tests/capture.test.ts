import { describe, expect, it } from 'vitest';
import { listConfirmations, processCapture, resolveConfirmation } from '../src/server/services/captures';
import { listEvents } from '../src/server/services/events';
import { undoCapture } from '../src/server/services/history';
import { getTask, listLinks, listTasks } from '../src/server/services/tasks';
import { listWaits } from '../src/server/services/waits';
import { makeCtx, taskByTitle } from './helpers';

describe('captura inteligente', () => {
  it('reconhece itens já cadastrados e evita duplicidade (exemplo do briefing)', () => {
    const ctx = makeCtx();
    const before = listTasks(ctx).length;
    const r = processCapture(ctx, { text: 'Finalizar a apresentação da revista, retirar o mapa da capa, remover os sete trabalhos indicados e enviar a versão revisada para validação.' });
    const kinds = r.operations.map((o) => o.kind);
    expect(kinds.filter((k) => k === 'ja_registrada' || k === 'atualizacao').length).toBeGreaterThanOrEqual(3);
    const created = r.operations.filter((o) => o.kind === 'nova_tarefa');
    expect(listTasks(ctx).length).toBe(before + created.length);
    expect(created.length).toBeLessThanOrEqual(1);
    const mapa = r.operations.find((o) => o.excerpt && o.title === 'Retirar o mapa da capa');
    expect(mapa?.kind).toBe('ja_registrada');
  });

  it('cria tarefas novas com projeto, responsável, prazo e espera por terceiros quando o texto informa', () => {
    const ctx = makeCtx({ seed: false });
    const r = processCapture(ctx, {
      text: `- Preparar o relatório trimestral até 30/10/2026, responsável: Marcos
- Daniela vai enviar a lista de participantes até sexta
- organizar o arquivo do setor`
    });
    expect(r.stats.nova_tarefa).toBe(3);
    const rel = taskByTitle(ctx, 'Preparar o relatório trimestral');
    expect(rel.due_date).toBe('2026-10-30');
    expect(JSON.parse(rel.certainty).due_date).toBe('explicita');
    expect(rel.responsible).toBe('Marcos');
    const lista = taskByTitle(ctx, 'Enviar a lista de participantes');
    expect(lista.responsible).toBe('Daniela');
    expect(lista.due_date).toBe('2026-10-23');
    expect(JSON.parse(lista.certainty).due_date).toBe('inferida');
    expect(listWaits(ctx).some((w) => w.party === 'Daniela' && w.task_id === lista.id)).toBe(true);
    const org = taskByTitle(ctx, 'Organizar o arquivo do setor');
    expect(org.due_date).toBeNull();
    expect(org.responsible).toBeNull();
    // Texto original preservado
    expect(ctx.db.prepare('SELECT raw_text FROM captures WHERE id = ?').get(r.capture_id) as any).toMatchObject({ raw_text: expect.stringContaining('relatório trimestral') });
    expect(rel.original_text).toContain('Preparar o relatório trimestral até 30/10/2026');
  });

  it('atualiza tarefa existente quando a correspondência é clara e registra o histórico', () => {
    const ctx = makeCtx();
    const id = taskByTitle(ctx, 'Revisar e finalizar as capas dos eixos').id;
    const r = processCapture(ctx, { text: 'Capas dos eixos: revisar e finalizar até 05/11/2026, urgente' });
    expect(r.operations.find((o) => o.task_id === id)?.kind).toBe('atualizacao');
    const t = getTask(ctx, id);
    expect(t.due_date).toBe('2026-11-05');
    expect(t.certainty.due_date).toBe('explicita');
    const h = ctx.db.prepare("SELECT * FROM history WHERE entity_type = 'task' AND entity_id = ? AND operation = 'atualizada'").all(id) as any[];
    expect(h.length).toBe(1);
    expect(JSON.parse(h[0].before).due_date).toBeNull();
  });

  it('não marca conclusão sem confirmação do usuário', () => {
    const ctx = makeCtx();
    const id = taskByTitle(ctx, 'Revisar a ata do colegiado e encaminhar para Luciana').id;
    const r = processCapture(ctx, { text: 'A ata do colegiado já foi enviada para Luciana.' });
    expect(getTask(ctx, id).status).toBe('pendente');
    const conf = r.confirmations.find((c) => c.kind === 'conclusao')!;
    expect(conf).toBeDefined();
    resolveConfirmation(ctx, conf.id, 'concluir');
    expect(getTask(ctx, id).status).toBe('concluida');
  });

  it('pede confirmação quando a correspondência é ambígua, sem interromper os demais itens', () => {
    const ctx = makeCtx();
    const before = listTasks(ctx).length;
    const r = processCapture(ctx, { text: '- revisar a apresentação\n- comprar toner para a impressora' });
    expect(r.operations.some((o) => o.kind === 'nova_tarefa' && o.title === 'Comprar toner para a impressora')).toBe(true);
    const amb = r.confirmations.find((c) => c.kind === 'possivel_duplicidade');
    expect(amb).toBeDefined();
    expect(amb!.options.some((o) => o.value === 'nova')).toBe(true);
    expect(listTasks(ctx).length).toBe(before + 1);
    resolveConfirmation(ctx, amb!.id, 'nova');
    expect(listTasks(ctx).length).toBe(before + 2);
    expect(listConfirmations(ctx).find((c) => c.id === amb!.id)).toBeUndefined();
  });

  it('pré-visualização não grava nada e coincide com o resultado real', () => {
    const ctx = makeCtx({ seed: false });
    const text = '- revisar contrato até amanhã\n- ligar para o fornecedor';
    const preview = processCapture(ctx, { text, dry_run: true });
    expect(preview.dry_run).toBe(true);
    expect(listTasks(ctx)).toHaveLength(0);
    expect(ctx.db.prepare('SELECT COUNT(*) n FROM captures').get()).toMatchObject({ n: 0 });
    const real = processCapture(ctx, { text });
    expect(real.operations.map((o) => [o.kind, o.title])).toEqual(preview.operations.map((o) => [o.kind, o.title]));
    expect(listTasks(ctx)).toHaveLength(2);
  });

  it('desfaz todas as alterações de uma captura', () => {
    const ctx = makeCtx();
    const before = listTasks(ctx).length;
    const capasId = taskByTitle(ctx, 'Revisar e finalizar as capas dos eixos').id;
    const r = processCapture(ctx, { text: '- Capas dos eixos: revisar e finalizar até 05/11/2026\n- Preparar ofício para a secretaria e enviar para assinatura' });
    expect(listTasks(ctx).length).toBeGreaterThan(before);
    expect(listLinks(ctx).length).toBeGreaterThan(4);
    undoCapture(ctx, r.capture_id!);
    expect(listTasks(ctx).length).toBe(before);
    expect(getTask(ctx, capasId).due_date).toBeNull();
    expect(listLinks(ctx).length).toBe(4);
  });

  it('cria eventos a partir da captura e confirma horários ambíguos antes de registrar', () => {
    const ctx = makeCtx({ seed: false });
    const r = processCapture(ctx, { text: 'Treinamento na terça-feira às 14h com a equipe.\nReunião com a diretoria na sexta às 2' });
    expect(r.stats.novo_evento).toBe(1);
    const ev = listEvents(ctx)[0];
    expect(ev).toMatchObject({ title: 'Treinamento', type: 'treinamento', start_at: '2026-10-27T17:00:00.000Z', end_at: null, location: null });
    const conf = r.confirmations[0];
    expect(conf.options.map((o) => o.value)).toEqual(['2026-10-23|02:00', '2026-10-23|14:00', 'ignorar']);
    resolveConfirmation(ctx, conf.id, '2026-10-23|14:00');
    expect(listEvents(ctx)).toHaveLength(2);
  });

  it('converte espera explícita sem tarefa correspondente em acompanhamento', () => {
    const ctx = makeCtx({ seed: false });
    const r = processCapture(ctx, { text: 'Ainda aguardando o Paulo liberar o orçamento do evento.' });
    expect(r.stats.nova_tarefa).toBe(1);
    expect(listTasks(ctx)[0].title).toBe('Acompanhar Paulo: liberar o orçamento do evento');
    expect(listWaits(ctx)[0]).toMatchObject({ party: 'Paulo', certainty: 'explicita' });
  });

  it('rejeita texto vazio com mensagem útil', () => {
    const ctx = makeCtx({ seed: false });
    expect(() => processCapture(ctx, { text: '   ' })).toThrow(/Cole um texto/);
  });
});
