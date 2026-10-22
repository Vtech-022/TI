import { describe, expect, it } from 'vitest';
import { getTask, listTasks, recomputePriorities, setPriorityOverride, updateTask } from '../src/server/services/tasks';
import { FIXED_NOW, makeCtx, taskByTitle } from './helpers';

describe('motor de priorização com as nove frentes da carga inicial', () => {
  it('atribui as prioridades sugeridas no briefing, com justificativas', () => {
    const ctx = makeCtx();
    const p = (title: string) => taskByTitle(ctx, title).priority;
    expect(p('Investigar e corrigir o QR Code cujo valor não permanece estável')).toBe('normal');
    expect(p('Apresentação da revista')).toBe('alta');
    expect(p('Revisar e finalizar as capas dos eixos')).toBe('alta');
    expect(p('Desenvolver o sistema de controle de agenda virtual')).toBe('alta');
    expect(p('Acompanhar a automação do Microsoft Forms')).toBe('alta');
    expect(p('Acompanhar a liberação das planilhas das unidades')).toBe('alta');
    expect(p('Estruturar o painel de Educação')).toBe('alta');
    expect(p('Corrigir e validar as versões física e digital da revista')).toBe('alta');
    expect(p('Revisar a ata do colegiado e encaminhar para Luciana')).toBe('normal');

    const planilhas = getTask(ctx, taskByTitle(ctx, 'Acompanhar a liberação das planilhas das unidades').id);
    const texts = planilhas.priority_reasons.map((r) => r.text).join(' ');
    expect(texts).toContain('Tarefa necessária para concluir "Estruturar o painel de Educação" (dependência inferida)');
    expect(texts).toContain('A tarefa dependente é de alto impacto.');

    const painel = getTask(ctx, taskByTitle(ctx, 'Estruturar o painel de Educação').id);
    expect(painel.priority_reasons.map((r) => r.text).join(' ')).toContain('Data inferida (28/10/2026) — precisa de confirmação');

    const qr = getTask(ctx, taskByTitle(ctx, 'Investigar e corrigir o QR Code cujo valor não permanece estável').id);
    expect(qr.priority_reasons.map((r) => r.text)).toContain('Sem prazo definido.');
  });

  it('não classifica nenhuma tarefa da carga inicial como crítica', () => {
    const ctx = makeCtx();
    expect(listTasks(ctx).filter((t) => t.priority === 'critica')).toHaveLength(0);
  });

  it('recalcula quando o prazo muda e quando o tempo passa', () => {
    const ctx = makeCtx();
    const id = taskByTitle(ctx, 'Revisar a ata do colegiado e encaminhar para Luciana').id;
    updateTask(ctx, id, { due_date: '2026-10-23', certainty: { due_date: 'confirmada' } }, { source: 'teste' });
    recomputePriorities(ctx);
    let t = getTask(ctx, id);
    expect(t.priority).toBe('alta');
    expect(t.priority_reasons.map((r) => r.text)).toContain('Prazo confirmado próximo: vence amanhã.');

    // Três dias depois a tarefa está atrasada.
    const later = makeCtx({ dir: (ctx as any).dir, seed: false, now: new Date(FIXED_NOW.getTime() + 3 * 86400000) });
    recomputePriorities(later);
    t = getTask(later, id);
    expect(t.priority).toBe('critica');
    expect(t.priority_reasons[1].text).toBe('Atrasada há 2 dias.');
  });

  it('permite ajuste manual com motivo obrigatório e preserva o cálculo automático', () => {
    const ctx = makeCtx();
    const id = taskByTitle(ctx, 'Investigar e corrigir o QR Code cujo valor não permanece estável').id;
    expect(() => setPriorityOverride(ctx, id, 'critica', '', { source: 'teste' })).toThrow(/motivo/);
    const t = setPriorityOverride(ctx, id, 'critica', 'Sistema em produção afetado', { source: 'teste' });
    expect(t.priority_override).toBe('critica');
    expect(t.priority).toBe('normal');
    const h = ctx.db.prepare("SELECT summary FROM history WHERE entity_id = ? AND operation = 'prioridade_ajustada'").get(id) as any;
    expect(h.summary).toContain('Sistema em produção afetado');
  });
});
