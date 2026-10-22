import { describe, expect, it } from 'vitest';
import { computeProgress } from '../src/server/domain/progress';
import { listHistory, undoEntry } from '../src/server/services/history';
import { queryTasks, recommendations, search } from '../src/server/services/insights';
import { summarizeProject } from '../src/server/services/projects';
import { addLink, changeStatus, createTask, getTask, listLinks, listTasks, updateTask } from '../src/server/services/tasks';
import { REMOVED_WORKS } from '../src/server/seed';
import { makeCtx, taskByTitle } from './helpers';

const meta = { source: 'teste' };

describe('carga inicial', () => {
  it('registra as nove frentes, todas pendentes, com as sete remoções como subtarefas de controle editorial', () => {
    const ctx = makeCtx();
    const tasks = listTasks(ctx);
    const roots = tasks.filter((t) => t.parent_id == null);
    expect(roots).toHaveLength(9);
    expect(tasks.every((t) => t.status === 'pendente')).toBe(true);
    expect(tasks.every((t) => t.origin === 'carga_inicial' && t.original_text)).toBe(true);
    const remover = taskByTitle(ctx, 'Remover os sete trabalhos indicados das versões física e digital');
    const removals = tasks.filter((t) => t.parent_id === remover.id);
    expect(removals.map((t) => t.original_text)).toEqual(REMOVED_WORKS);
    expect(removals.every((t) => t.requires_verification)).toBe(true);
    const painel = taskByTitle(ctx, 'Estruturar o painel de Educação');
    expect(painel.due_date).toBe('2026-10-28');
    expect(JSON.parse(painel.certainty).due_date).toBe('inferida');
    expect(painel.due_note).toContain('até quarta-feira');
    const projects = ctx.db.prepare('SELECT COUNT(*) n FROM projects').get() as any;
    expect(projects.n).toBe(3); // as remoções não viram projetos
    expect(ctx.db.prepare("SELECT COUNT(*) n FROM history WHERE source = 'carga inicial'").get()).toMatchObject({ n: expect.any(Number) });
  });

  it('não repete a carga ao reiniciar', () => {
    const ctx = makeCtx();
    const n = listTasks(ctx).length;
    const again = makeCtx({ dir: ctx.dir });
    expect(listTasks(again).length).toBe(n);
  });
});

describe('persistência', () => {
  it('mantém tarefas, projetos e histórico após fechar e reabrir o banco', () => {
    const ctx = makeCtx({ seed: false });
    const t = createTask(ctx, { title: 'Tarefa persistente' }, meta);
    updateTask(ctx, t.id, { responsible: 'Victor' }, meta);
    (ctx.db as unknown as { close(): void }).close();
    const reopened = makeCtx({ dir: ctx.dir, seed: false });
    expect(getTask(reopened, t.id)).toMatchObject({ title: 'Tarefa persistente', responsible: 'Victor' });
    expect(listHistory(reopened, { entity_type: 'task', entity_id: t.id })).toHaveLength(2);
  });
});

describe('dependências, conclusão e progresso', () => {
  it('impede concluir a tarefa principal com subtarefas abertas, salvo exceção com motivo', () => {
    const ctx = makeCtx();
    const ajustes = taskByTitle(ctx, 'Corrigir e validar as versões física e digital da revista');
    expect(() => changeStatus(ctx, ajustes.id, 'concluida', {}, meta)).toThrow(/dependências ou subtarefas/);
    expect(() => changeStatus(ctx, ajustes.id, 'concluida', { force: true }, meta)).toThrow(/motivo/);
    const t = changeStatus(ctx, ajustes.id, 'concluida', { force: true, reason: 'Entrega aceita pela coordenação' }, meta);
    expect(t.status).toBe('concluida');
    expect(listHistory(ctx, { entity_type: 'task', entity_id: ajustes.id })[0].summary).toContain('exceção');
  });

  it('bloqueia a validação enquanto as alterações estiverem abertas', () => {
    const ctx = makeCtx();
    const validar = taskByTitle(ctx, 'Validar as versões revisadas após as alterações');
    expect(() => changeStatus(ctx, validar.id, 'concluida', {}, meta)).toThrow();
    const view = queryTasks(ctx, {}).find((t) => t.id === validar.id)!;
    expect(view.is_blocked).toBe(true);
    expect(view.blockers).toHaveLength(3);
  });

  it('exige verificação explícita para concluir uma remoção', () => {
    const ctx = makeCtx();
    const removal = taskByTitle(ctx, `Remover trabalho: ${REMOVED_WORKS[5]}`);
    expect(() => changeStatus(ctx, removal.id, 'concluida', {}, meta)).toThrow(/verificar/);
    expect(changeStatus(ctx, removal.id, 'concluida', { verified: true }, meta).status).toBe('concluida');
  });

  it('calcula progresso real do projeto a partir das tarefas folha', () => {
    const ctx = makeCtx();
    const revista = ctx.db.prepare("SELECT * FROM projects WHERE name LIKE 'Revista%'").get() as any;
    let sum = summarizeProject(ctx, { ...revista, owners: [], keywords: [] });
    // Folhas: apresentação, capas, mapa, reescrever, 7 remoções, validar = 12
    expect(sum.progress).toEqual({ total: 12, done: 0, percent: 0 });
    changeStatus(ctx, taskByTitle(ctx, 'Retirar o mapa da capa').id, 'concluida', {}, meta);
    changeStatus(ctx, taskByTitle(ctx, `Remover trabalho: ${REMOVED_WORKS[0]}`).id, 'concluida', { verified: true }, meta);
    changeStatus(ctx, taskByTitle(ctx, 'Revisar e finalizar as capas dos eixos').id, 'cancelada', {}, meta);
    sum = summarizeProject(ctx, { ...revista, owners: [], keywords: [] });
    expect(sum.progress).toEqual({ total: 11, done: 2, percent: 18 });
    expect(computeProgress([])).toEqual({ total: 0, done: 0, percent: null });
  });

  it('rejeita ciclos de dependência', () => {
    const ctx = makeCtx({ seed: false });
    const a = createTask(ctx, { title: 'A' + 'aa' }, meta);
    const b = createTask(ctx, { title: 'B' + 'bb' }, meta);
    addLink(ctx, a.id, b.id, 'explicita', null, meta);
    expect(() => addLink(ctx, b.id, a.id, 'explicita', null, meta)).toThrow(/ciclo/);
    expect(listLinks(ctx)).toHaveLength(1);
  });

  it('desfaz uma alteração pelo histórico e protege alterações posteriores', () => {
    const ctx = makeCtx({ seed: false });
    const t = createTask(ctx, { title: 'Original' }, meta);
    updateTask(ctx, t.id, { title: 'Primeira' }, meta);
    updateTask(ctx, t.id, { title: 'Segunda' }, meta);
    const [last, first] = listHistory(ctx, { entity_type: 'task', entity_id: t.id });
    expect(() => undoEntry(ctx, first.id)).toThrow(/alterado depois/);
    undoEntry(ctx, last.id);
    expect(getTask(ctx, t.id).title).toBe('Primeira');
  });
});

describe('pesquisa, filtros e recomendações', () => {
  it('pesquisa por título, responsável, projeto e pessoa, ignorando acentos', () => {
    const ctx = makeCtx();
    const hits = search(ctx, 'rogerio');
    expect(hits[0]).toMatchObject({ type: 'person', title: 'Rogério' });
    expect(hits.some((h) => h.type === 'task' && h.title === 'Acompanhar a liberação das planilhas das unidades')).toBe(true);
    expect(search(ctx, 'disfagia').some((h) => h.type === 'task')).toBe(true);
    expect(search(ctx, 'Painel de Educação').some((h) => h.type === 'project')).toBe(true);
  });

  it('filtra por prioridade, projeto, prazo, dependências e terceiros', () => {
    const ctx = makeCtx();
    expect(queryTasks(ctx, { priority: 'normal' }).map((t) => t.title).sort()).toEqual([
      'Investigar e corrigir o QR Code cujo valor não permanece estável',
      'Revisar a ata do colegiado e encaminhar para Luciana',
      'Validar as versões revisadas após as alterações' // alto impacto herdado, mas bloqueada por 3 tarefas abertas
    ]);
    expect(queryTasks(ctx, { due: 'inferidas' }).map((t) => t.title)).toEqual(['Estruturar o painel de Educação']);
    expect(queryTasks(ctx, { deps: 'terceiros' }).map((t) => t.title).sort()).toEqual(['Acompanhar a automação do Microsoft Forms', 'Acompanhar a liberação das planilhas das unidades']);
    expect(queryTasks(ctx, { project_id: 'none' })).toHaveLength(3);
    expect(queryTasks(ctx, { q: 'Luciana' })).toHaveLength(1);
    expect(queryTasks(ctx, { responsible: 'Daniela' })).toHaveLength(1);
    const byDue = queryTasks(ctx, { sort: 'prazo' });
    expect(byDue[0].title).toBe('Estruturar o painel de Educação');
  });

  it('gera recomendações sustentadas por evidências', () => {
    const ctx = makeCtx();
    const recs = recommendations(ctx);
    const kinds = recs.map((r) => r.kind);
    expect(kinds).toContain('data_inferida');
    expect(kinds).toContain('dependencia_inferida');
    expect(kinds).toContain('sem_data_acompanhamento');
    const dup = recs.find((r) => r.kind === 'possivel_duplicidade');
    expect(dup?.evidence.map((e) => e.label).sort()).toEqual(['Apresentação da revista', 'Reescrever a apresentação com caráter explicativo, sem aparência de sumário']);
    expect(recs.every((r) => r.reason && r.evidence.length > 0)).toBe(true);
  });
});
