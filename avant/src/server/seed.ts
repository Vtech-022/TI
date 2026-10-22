// Carga inicial: as nove frentes de trabalho informadas por Victor (seção 13 do briefing).
// Tudo começa como pendente; nada é marcado como concluído sem confirmação.
import type { Ctx } from './context';
import { nowIso } from './context';
import { transaction } from './db/tx';
import { Meta } from './services/history';
import { createProject } from './services/projects';
import { addLink, createTask, recomputePriorities } from './services/tasks';
import { createWait } from './services/waits';

export const SEED_VERSION = '1';

export const REMOVED_WORKS = [
  'Implementação de Duas Telas no Setor Financeiro e Faturamento: Redução de Impressões e Aumento de Produtividade dos Colaboradores',
  'Avaliação dos Pés e Saúde Bucal em Idosos com Diabetes: uma Experiência Multiprofissional no CRI-Norte',
  'Gestão de Agendas: Planejamento, Previsibilidade e Eficiência Assistencial no CRI Norte',
  'Gestão de Agendamentos e Inovação em Canais de Acesso: Experiência do CRI Norte',
  'Movimento de Atualização Documental no CRI Norte: uma Experiência Exitosa em Gestão e Qualidade',
  'Implantação de Prontuário Eletrônico',
  'Atendimento Interdisciplinar em Ambulatório de Especialidades para o Tratamento da Disfagia em Idosos'
];

export function isSeeded(ctx: Ctx): boolean {
  return !!ctx.db.prepare("SELECT 1 FROM settings WHERE key = 'seed_version'").get();
}

export function seed(ctx: Ctx): boolean {
  if (isSeeded(ctx)) return false;
  const meta: Meta = { source: 'carga inicial' };
  transaction(ctx.db, () => {
    const revista = createProject(
      ctx,
      {
        name: 'Revista de Experiências Exitosas SBCD 2025–2026',
        objective: 'Concluir e validar as versões física e digital da revista.',
        description: 'Frente editorial que reúne a apresentação institucional, as capas dos eixos e os ajustes das versões física e digital.',
        keywords: ['revista', 'sbcd', 'editorial', 'capa', 'capas', 'eixos', 'experiências exitosas', 'versão física', 'versão digital', 'trabalhos']
      },
      meta
    );
    const painel = createProject(
      ctx,
      {
        name: 'Painel de Educação',
        objective: 'Estruturar o painel de Educação.',
        description: 'A relação com a liberação das planilhas das unidades foi inferida e precisa de confirmação.',
        keywords: ['painel de educação', 'painel', 'planilhas das unidades', 'planilhas']
      },
      meta
    );
    const agenda = createProject(
      ctx,
      {
        name: 'Controle de Agenda Virtual',
        objective: 'Sistema de agenda para eventos externos, cursos, treinamentos, atividades e trabalhos pendentes, preenchido e consultado por diferentes pessoas.',
        description: 'Iniciativa de projeto. Prazo de conclusão não informado.',
        keywords: ['agenda virtual', 'controle de agenda']
      },
      meta
    );

    const base = { origin: 'carga_inicial' as const };

    createTask(
      ctx,
      {
        ...base,
        title: 'Investigar e corrigir o QR Code cujo valor não permanece estável',
        description: 'Projeto relacionado a confirmar. Prioridade normal até que impacto e prazo sejam esclarecidos.',
        category: 'Desenvolvimento e automação',
        next_action: 'Reproduzir o problema e identificar onde o valor do QR Code é gerado',
        original_text: 'Qr code que nao muda o valor',
        certainty: { project: 'desconhecida', category: 'inferida' },
        position: 1
      },
      meta
    );

    const apresentacao = createTask(
      ctx,
      {
        ...base,
        project_id: revista.id,
        title: 'Apresentação da revista',
        description: 'Tornar a apresentação completa, explicativa e institucional, sem aparência de sumário.',
        category: 'Editorial',
        impact: 'alto',
        next_action: 'Reescrever a apresentação em formato institucional e explicativo',
        original_text: 'TAREFA 2 — APRESENTAÇÃO DA REVISTA. Ação: tornar a apresentação completa, explicativa e institucional, sem aparência de sumário.',
        certainty: { project: 'explicita', impact: 'explicita', category: 'inferida' },
        position: 2
      },
      meta
    );

    createTask(
      ctx,
      {
        ...base,
        project_id: revista.id,
        title: 'Revisar e finalizar as capas dos eixos',
        category: 'Editorial',
        impact: 'alto',
        next_action: 'Revisar as capas dos eixos',
        original_text: 'TAREFA 3 — CAPAS DOS EIXOS. Ação: revisar e finalizar as capas dos eixos.',
        certainty: { project: 'explicita', impact: 'explicita', category: 'inferida' },
        position: 3
      },
      meta
    );

    createTask(
      ctx,
      {
        ...base,
        project_id: agenda.id,
        title: 'Desenvolver o sistema de controle de agenda virtual',
        description:
          'Sistema de agenda para eventos externos, cursos, treinamentos, atividades e trabalhos pendentes, permitindo que diferentes pessoas preencham e visualizem as informações.',
        category: 'Desenvolvimento e automação',
        impact: 'alto',
        effort: 'alto',
        next_action: 'Levantar requisitos: quem preenche, quem visualiza e quais tipos de compromisso',
        original_text: 'TAREFA 4 — CONTROLE DE AGENDA VIRTUAL. Prioridade sugerida: alta como iniciativa de projeto, sem inventar prazo de conclusão.',
        certainty: { project: 'explicita', impact: 'explicita', effort: 'inferida' },
        position: 4
      },
      meta
    );

    const forms = createTask(
      ctx,
      {
        ...base,
        title: 'Acompanhar a automação do Microsoft Forms',
        description: 'Acompanhar a automação do Microsoft Forms e verificar os próximos passos. Prioridade sujeita à confirmação do prazo e das dependências.',
        category: 'Desenvolvimento e automação',
        impact: 'alto',
        involved: ['Daniela'],
        next_action: 'Verificar com Daniela os próximos passos da automação',
        original_text: 'TAREFA 5 — AUTOMAÇÃO DO FORMS: DANIELA. Ação: acompanhar a automação do Microsoft Forms e verificar os próximos passos.',
        certainty: { impact: 'inferida', responsible: 'desconhecida', project: 'desconhecida' },
        position: 5
      },
      meta
    );
    createWait(ctx, { task_id: forms.id, party: 'Daniela', description: 'Próximos passos da automação do Microsoft Forms', certainty: 'explicita' }, meta);

    const planilhas = createTask(
      ctx,
      {
        ...base,
        project_id: painel.id,
        title: 'Acompanhar a liberação das planilhas das unidades',
        description: 'Prioridade alta se a liberação bloquear a alimentação do painel. A relação com o Painel de Educação é inferida.',
        category: 'Acompanhamento',
        impact: 'medio',
        involved: ['Rogério'],
        next_action: 'Confirmar com Rogério a previsão de liberação das planilhas',
        original_text: 'TAREFA 6 — LIBERAÇÃO DAS PLANILHAS DAS UNIDADES: ROGÉRIO. Ação: acompanhar a liberação das planilhas das unidades.',
        certainty: { project: 'inferida', impact: 'inferida', responsible: 'desconhecida' },
        position: 6
      },
      meta
    );
    createWait(ctx, { task_id: planilhas.id, project_id: painel.id, party: 'Rogério', description: 'Liberação das planilhas das unidades', certainty: 'explicita' }, meta);

    const estruturar = createTask(
      ctx,
      {
        ...base,
        project_id: painel.id,
        title: 'Estruturar o painel de Educação',
        category: 'Dados e painéis',
        impact: 'alto',
        due_date: '2026-10-28',
        due_note: 'Anotação original de 21/10/2026: "até quarta-feira". Interpretado como quarta-feira, 28/10/2026 — não é prazo formal confirmado.',
        next_action: 'Definir a estrutura e os indicadores do painel',
        original_text: 'Estruturação do painel de Educação — anotação de 21/10/2026: "até quarta-feira".',
        certainty: { due_date: 'inferida', project: 'explicita', impact: 'explicita' },
        position: 7
      },
      meta
    );
    addLink(ctx, planilhas.id, estruturar.id, 'inferida', 'A liberação das planilhas provavelmente alimenta o painel (dependência inferida, a confirmar).', meta);

    const ajustes = createTask(
      ctx,
      {
        ...base,
        project_id: revista.id,
        title: 'Corrigir e validar as versões física e digital da revista',
        category: 'Editorial',
        impact: 'alto',
        next_action: 'Executar as subtarefas de ajuste e validar as versões revisadas',
        original_text: 'TAREFA 8 — AJUSTES DA REVISTA FÍSICA E DIGITAL. Ação principal: corrigir e validar as versões física e digital da revista.',
        certainty: { project: 'explicita', impact: 'explicita' },
        position: 8
      },
      meta
    );
    const sub = (title: string, position: number, extra: Record<string, unknown> = {}) =>
      createTask(
        ctx,
        {
          ...base,
          project_id: revista.id,
          parent_id: ajustes.id,
          title,
          category: 'Editorial',
          next_action: title,
          position,
          original_text: `TAREFA 8 — subtarefa ${position}: ${title}.`,
          certainty: { project: 'explicita' },
          ...extra
        },
        meta
      );
    const mapa = sub('Retirar o mapa da capa', 1);
    const reescrever = sub('Reescrever a apresentação com caráter explicativo, sem aparência de sumário', 2);
    const remover = sub('Remover os sete trabalhos indicados das versões física e digital', 3, {
      description: 'Controle editorial das sete remoções. Os arquivos originais não devem ser alterados nem excluídos.',
      next_action: 'Remover os trabalhos listados e conferir nas duas versões'
    });
    REMOVED_WORKS.forEach((w, i) =>
      createTask(
        ctx,
        {
          ...base,
          project_id: revista.id,
          parent_id: remover.id,
          title: `Remover trabalho: ${w}`,
          category: 'Editorial',
          next_action: 'Remover das versões física e digital e verificar',
          requires_verification: true,
          verification_note: 'Concluir somente depois de verificar a remoção nas versões física e digital revisadas.',
          original_text: w,
          position: i + 1,
          certainty: { project: 'explicita' }
        },
        meta
      )
    );
    const validar = sub('Validar as versões revisadas após as alterações', 4);
    for (const blocker of [mapa, reescrever, remover]) addLink(ctx, blocker.id, validar.id, 'explicita', 'Validação ocorre após as alterações.', meta);
    void apresentacao;

    createTask(
      ctx,
      {
        ...base,
        title: 'Revisar a ata do colegiado e encaminhar para Luciana',
        category: 'Documentação',
        involved: ['Luciana'],
        next_action: 'Revisar a ata do colegiado',
        original_text: 'TAREFA 9 — ATA DO COLEGIADO. Ação: revisar a ata do colegiado e encaminhar para Luciana.',
        certainty: { responsible: 'desconhecida', project: 'desconhecida', category: 'inferida' },
        position: 9
      },
      meta
    );

    ctx.db.prepare("INSERT INTO settings (key, value) VALUES ('seed_version', ?), ('seeded_at', ?)").run(SEED_VERSION, nowIso(ctx));
    recomputePriorities(ctx);
  });
  return true;
}
