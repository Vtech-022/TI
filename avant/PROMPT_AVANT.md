# PROMPT MESTRE — AVANT, Central Inteligente de Gestão (versão atual)

> Este prompt descreve o AVANT exatamente como ele está hoje, com todas as decisões tomadas durante o desenvolvimento. Use-o para recriar, evoluir ou documentar o sistema.

---

## 1. Papel e objetivo

Atue como arquiteto de software sênior, engenheiro full-stack, especialista em produtividade, designer de produto e engenheiro de qualidade.

Desenvolva o **AVANT — Central Inteligente de Gestão**: um sistema real (não protótipo, não página estática) que transforma mensagens, anotações e arquivos desorganizados em tarefas estruturadas, prioriza o trabalho com justificativas e acompanha projetos, prazos, agenda, dependências, terceiros e atividades da equipe.

Regras de conduta:
- Não simule funcionalidades, não invente dados e não declare nada como concluído sem verificar.
- Não invente prazos, responsáveis, horários, locais, participantes ou status de conclusão.
- Distinga sempre: informação **explícita**, **inferida**, **confirmada** pelo usuário e **não informada**.
- Não marque tarefas como concluídas sem confirmação.
- Peça confirmação em ambiguidades importantes, sem interromper o restante da análise.
- Execute testes reais e só declare aprovado o que foi executado.
- O usuário se chama **Victor**; a saudação inicial usa o nome dele.

---

## 2. Arquitetura

- **Front-end:** React + Vite + TypeScript, CSS próprio baseado em tokens (sem framework visual genérico).
- **Back-end:** API única com regras de negócio independentes do servidor HTTP:
  - **Edição servidor (Node):** Fastify + SQLite nativo (`node:sqlite`), validação com Zod, tratamento centralizado de erros, migrações versionadas.
  - **Edição online (publicada como página no claude.ai):** a mesma API e as mesmas regras rodando no navegador com SQLite em JavaScript (sql.js); o banco é salvo automaticamente, compactado, na área privada do usuário no armazenamento da página, com cópia no IndexedDB do navegador. Nunca sobrescrever dados na nuvem se a leitura falhar.
- **Camadas separadas:** domínio puro (texto, datas, extração, correspondência, prioridade, agenda, progresso), serviços com persistência e histórico, rotas, interface.
- **Fuso horário:** America/Sao_Paulo para todas as datas, prazos e agenda.
- **Histórico:** toda alteração importante registrada (data, operação, origem, registro afetado, estado antes/depois), com desfazer individual ou por captura, bloqueado quando o registro foi alterado depois.
- **Operações atômicas:** cada alteração roda em transação; a pré-visualização da captura executa a mesma lógica dentro de uma transação desfeita ao final.

---

## 3. Identidade visual (referência atual: painel com trilho de ícones e gráficos)

**Versão atual (prevalece sobre os itens abaixo quando houver conflito):**
- Fundo azul-lavanda suave em degradê; cartões translúcidos brancos com cantos de 18px e sombra leve.
- Trilho vertical à esquerda: logotipo em pílula azul (letra A + linha de pulso) e navegação em ícones circulares dentro de uma faixa arredondada; item ativo em círculo azul com degradê; nome da área aparece ao passar o mouse.
- Topo: saudação "Boa tarde, Victor" com data e entregas concluídas na semana; à direita, pesquisa em pílula e pílula de ações (captura rápida, nova tarefa, notificações, modo claro/escuro, avatar).
- Visão Geral: 4 cartões de indicadores com ícone em círculo contornado; gráfico de barras "Pendências por projeto" (Abertas/Concluídas/Todas); gráfico de rosca "Distribuição por prioridade" com rótulos e legenda (Abertas/Com prazo/Com terceiros); tabela "Minhas pendências" com cabeçalho em faixa azul-clara e prioridade em etiquetas contornadas; "Precisa de atenção" e "Próximos 14 dias" lado a lado.
- Cores dos gráficos validadas para daltonismo: Crítica #e5484d, Alta #f59e0b, Normal #2f6bff, Baixa #0fa3a3 (modo escuro: #e0434b, #c08a00, #4a78ff, #0f9e9e). Azul principal #2f6bff.
- Modo escuro com fundo preto e cartões #141519.

**Base anterior (referências: Outlook e Trello):**

- **Estrutura no estilo Outlook:** painel lateral de pastas **somente em texto, sem ícones**, fundo cinza-claro, item ativo em azul-claro com traço azul à esquerda; área de conteúdo limpa; barra superior branca e discreta.
- **Cartões no estilo Trello:** tarefas como cartões separados, com espaço entre eles, etiquetas coloridas e visualização em quadro (colunas).
- **Fontes:** Segoe UI, com Arial e Helvetica como alternativas (aparência de sistema corporativo). Títulos em peso 600, sem fontes decorativas.
- **Cores vivas e complementares:**
  - Principal: azul corporativo `#0f6cbd`.
  - Prioridades como etiquetas sólidas: Crítica vermelho `#e5484d`, Alta laranja `#f76808`, Normal azul `#0c66e4`, Baixa cinza `#8590a2`; Concluída verde `#1f845a`; Aguardando/Bloqueada roxo `#8270db`.
  - Cada projeto e cada pessoa recebe uma cor fixa de uma paleta de etiquetas: `#1f845a #0c66e4 #e56910 #ae2e24 #6e5dc6 #227d9b #5b7f24 #c9372c #943d73 #b38600`.
  - Indicadores do topo com cores distintas (azul, vermelho, roxo, verde).
- **Modo claro e modo escuro:** interruptor "Modo escuro" no rodapé do menu lateral; segue o tema do sistema até o usuário escolher. O modo escuro tem **fundo preto** (`#000`), superfícies `#111112` e `#1a1a1c`, texto claro e azul `#4aa3ff`.
- **Sem emojis:** usar apenas ícones profissionais de traço fino (biblioteca Lucide) dentro das telas; nada de símbolos decorativos.
- **Barras de rolagem finas e arredondadas**, discretas, destacando ao passar o mouse.
- **Busca:** campo simples com lupa e o texto "Buscar tarefas, projetos e pessoas", sem exibir atalho.
- **Data:** fora da barra superior; aparece em um cartão na Visão Geral (dia em destaque azul + dia da semana, mês e ano).
- **Acessibilidade:** contraste adequado, navegação por teclado, foco visível, respeito à redução de movimento, janelas com nome acessível, e o foco nunca pode "pular" de campo enquanto o usuário digita.
- **Responsivo:** computador, tablet e celular; no celular, barra de navegação inferior de aplicativo (Início, Pendências, Capturar, Projetos, Tarefa) e menu lateral recolhível.

---

## 4. Navegação (menu lateral, somente texto)

**Operação**
- Visão Geral
- Foco de Hoje

**Gestão**
- Minhas Pendências
- Projetos
- Aguardando Terceiros

**Equipe**
- Atividades da equipe

**Registro**
- Arquivos e Documentos
- Relatórios

**Rodapé do menu:** Notificações (com contador) e interruptor Modo escuro; abaixo, o estado do salvamento ("Salvo na nuvem · hora", "Salvando…" ou "Salvo só neste navegador").

**Barra superior:** busca global, botão "+ Tarefa" e botão azul "Capturar" (captura rápida).

As telas de Captura Inteligente, Agenda, Histórico e Configurações **não aparecem no menu**, mas continuam acessíveis por botões e links internos (ex.: botão Capturar, links de eventos, "Ver alterações e desfazer").

Atalhos de teclado: Ctrl+K ou `/` busca, Alt+C captura rápida, Alt+N nova tarefa, Alt+P críticas, Alt+H foco de hoje, Alt+1…7 áreas, `?` lista de atalhos, Esc fecha.

---

## 5. Captura inteligente (principal diferencial)

Acessível em qualquer tela pelo botão **Capturar**. Aceita texto colado (WhatsApp, e-mail, ata, lista, anotações) e arquivos **TXT, MD, CSV, XLSX, DOCX e PDF com texto selecionável** (arrastar e soltar). Formatos não suportados ou com extensão trocada são informados; PDF digitalizado é guardado e avisado (sem OCR).

Fluxo: colar ou importar → analisar → separar ações → extrair prazos, responsáveis, projetos e dependências → identificar atualizações e duplicidades → classificar → priorizar com justificativa → salvar → mostrar resumo. Opção "Revisar antes de salvar" mostra a pré-visualização exata. Botão "Desfazer captura" reverte tudo.

Regras de interpretação (locais, sem IA externa):
- Mensagens do WhatsApp (`[21/10/2026, 09:13] Nome: texto` e `21/10/2026 09:13 - Nome: texto`): a data de cada mensagem é a referência para "até quarta-feira" etc.
- Várias ações numa frase viram tarefas distintas; a ação de fechamento (enviar, validar, encaminhar…) passa a depender das anteriores (dependência inferida). Ação elíptica herda o objeto ("revisar a ata e encaminhar para Luciana" → "Encaminhar a ata para Luciana").
- Cabeçalho de lista ("Ajustes da revista:") cria tarefa principal com subtarefas; cabeçalhos genéricos ("Pendências da semana:") são só contexto; cabeçalho com nome de pessoa atribui os itens a ela.
- Datas explícitas (28/10/2026, 30 de outubro) e inferidas (hoje, amanhã, dia da semana, "sexta que vem", "dia 5", "fim do mês", "em 3 dias"); mais de uma leitura plausível gera pergunta.
- Pessoas: "responsável: X", "@X", "X vai/ficou de…", "com X", "para X", "aguardando o X…".
- Terceiros: "aguardando", "depende de", "cobrar", "liberação de" → registro em Aguardando Terceiros.
- Projetos: pelo nome, por palavras-chave do projeto ou por "projeto: Nome".
- Eventos: "Treinamento na terça-feira às 14h com a equipe" vira evento, sem inventar término, local ou participantes; horário ambíguo ("às 2") pede confirmação.
- Sinais de conclusão ou cancelamento no texto sempre pedem confirmação; "em andamento" atualiza o status.
- Correspondência com tarefas existentes por similaridade em português (radicais e sinônimos de verbos de trabalho): correspondência clara vira atualização com histórico ou "já registrada"; duvidosa vira pergunta com alternativas; itens da mesma captura não são comparados entre si.
- O texto original é preservado e vinculado a cada registro.

---

## 6. Motor de priorização (determinístico e transparente)

Pontuação exibida em cada tarefa ("Por que esta prioridade"):

| Fator | Pontos |
|---|---|
| Impacto alto / médio / baixo / não informado | +38 / +20 / +5 / +15 |
| Atrasada | +50, mais 3 por dia de atraso (máx. +25) |
| Vence hoje / amanhã / em até 3 dias / até 7 / até 14 | +42 / +35 / +26 / +16 / +8 |
| Prazo inferido | 75% dos pontos de prazo, com aviso para confirmar |
| Necessária para outras tarefas abertas | +8 por tarefa (máx. 3) |
| Libera entrega de alto impacto / dependente vence em até 7 dias | +10 / +10 |
| Bloqueada por tarefa aberta | −8 |
| Acompanhamento de terceiro vencido | +10 |
| Baixo esforço / alto esforço com prazo em até 7 dias / em andamento | +3 / +8 / +3 |

Níveis: **Crítica ≥ 70**, **Alta ≥ 35**, **Normal ≥ 15**, **Baixa < 15**. Sem prazo nem dependentes, nunca passa de Alta. Subtarefas herdam o impacto da tarefa principal. Recalcular após cada alteração e a cada hora. Ajuste manual exige motivo, fica no histórico e mantém o cálculo automático visível.

---

## 7. Telas

**Visão Geral (enxuta):** saudação "Bom dia/Boa tarde/Boa noite, Victor" com o próximo passo recomendado; cartão de data; faixa com 4 indicadores (Pendências abertas, Críticas ou atrasadas, Aguardando terceiros, Concluídas na semana); confirmações pendentes (se houver); Foco de hoje (5 tarefas, um motivo curto cada); bloco único "Precisa de atenção" (alertas + recomendações relevantes, com nomes das tarefas envolvidas); Próximos 14 dias; Projetos em linhas compactas com barra de progresso.

**Foco de Hoje:** sequência recomendada (sem tarefas bloqueadas) e lista separada do que está bloqueado e por quê.

**Minhas Pendências:** barra de filtros **unificada** — busca + botão "Filtros" que abre um painel com prioridade, status, projeto, prazo, dependências, pessoa, categoria, origem e período + seletor de ordenação (recomendada, prioridade, prazo, impacto, atualização recente). Filtros ativos aparecem como etiquetas removíveis. Alternância **Lista / Quadro**; o quadro tem colunas Pendente, Em andamento, Aguardando/bloqueada e Concluída, com arrastar e soltar.

**Painel da tarefa (lateral):** status, justificativa da prioridade com pontos, ajuste manual, informações com grau de certeza, confirmar data inferida, texto original, dependências (adicionar, confirmar, remover), subtarefas, terceiros, documentos, eventos, histórico, editar e excluir com confirmação. Aviso ao sair com alterações não salvas.

**Regras de conclusão:** tarefa com dependências ou subtarefas abertas só conclui como exceção com motivo registrado; tarefas que exigem verificação pedem confirmação explícita; ciclos de dependência são bloqueados.

**Projetos:** progresso real (tarefas folha concluídas ÷ tarefas folha não canceladas), próxima ação, próxima entrega, riscos, marcos, mapa de dependências, documentos, histórico; visualizações Lista (hierárquica), Kanban e Cronograma (prazos inferidos hachurados, linha de hoje).

**Aguardando Terceiros:** agrupado por pessoa, com datas de solicitação, prazo esperado e próximo acompanhamento; aviso quando várias pendências aguardam a mesma pessoa. Nenhuma cobrança é enviada automaticamente.

**Atividades da equipe:** quadro compartilhado no estilo Trello (A fazer, Em andamento, Concluída). Cada colaborador entra com a própria conta e registra as próprias atividades (título, situação, prazo, projeto ou setor, observações); todos com acesso veem o quadro; cada pessoa só altera os próprios cartões. Etiqueta e avatar com cor por pessoa, filtro por colaborador, prazo vencido em vermelho. As pendências pessoais do Victor continuam privadas e separadas.

**Arquivos e Documentos:** original preservado sem alteração (verificação SHA-256), texto extraído, vínculo com projeto e tarefa, envio do texto para a captura, download com confirmação; remover do AVANT não apaga o original.

**Relatórios:** ritmo das últimas 8 semanas (criadas, concluídas, capturas), abertas por prioridade e status, projetos com progresso, qualidade da informação (certeza dos prazos), origem dos registros, por responsável, por categoria e por terceiro; exportação de cópia de segurança em JSON.

**Agenda (acessível por links):** dia, semana e mês; criação por linguagem natural com escolha entre interpretações; conflitos de horário (término não informado considera 1 h e é sinalizado); prazos de tarefas no calendário; editar, reagendar e excluir com confirmação; histórico do evento.

**Notificações:** alertas operacionais (conflitos, atrasos, datas a confirmar, bloqueios por terceiros, confirmações pendentes) e recomendações de alta severidade.

---

## 8. Dados iniciais (primeira execução)

Cadastrar como **pendentes**, com origem "carga inicial" e texto original preservado:
1. Investigar e corrigir o QR Code cujo valor não permanece estável — projeto a confirmar; Normal.
2. Apresentação da revista (completa, explicativa e institucional, sem aparência de sumário) — Revista de Experiências Exitosas SBCD 2025–2026; Alta.
3. Revisar e finalizar as capas dos eixos — Revista; Alta.
4. Desenvolver o sistema de controle de agenda virtual — projeto Controle de Agenda Virtual; Alta; sem prazo inventado.
5. Acompanhar a automação do Microsoft Forms — contato Daniela (espera registrada); Alta sujeita a confirmação.
6. Acompanhar a liberação das planilhas das unidades — contato Rogério (espera registrada); dependência inferida com o painel; Alta.
7. Estruturar o painel de Educação — anotação de 21/10/2026 "até quarta-feira", interpretada como 28/10/2026 **inferida**; Alta.
8. Corrigir e validar as versões física e digital da revista — subtarefas: retirar o mapa da capa; reescrever a apresentação; remover os sete trabalhos indicados (cada remoção como subtarefa que exige verificação nas versões revisadas); validar as versões revisadas (depende das anteriores). Os sete trabalhos: Implementação de Duas Telas no Setor Financeiro e Faturamento; Avaliação dos Pés e Saúde Bucal em Idosos com Diabetes (CRI-Norte); Gestão de Agendas (CRI Norte); Gestão de Agendamentos e Inovação em Canais de Acesso (CRI Norte); Movimento de Atualização Documental no CRI Norte; Implantação de Prontuário Eletrônico; Atendimento Interdisciplinar em Ambulatório de Especialidades para o Tratamento da Disfagia em Idosos.
9. Revisar a ata do colegiado e encaminhar para Luciana — Normal; sem data inventada.

---

## 9. Segurança e confiabilidade

Validar entradas e arquivos (tamanho, formato, assinatura binária); nenhum segredo no código; nenhuma mensagem ou e-mail enviado automaticamente; confirmação para exclusões; histórico de alterações; mensagens de erro úteis; nunca sobrescrever dados salvos após falha de leitura; edição servidor escuta só localmente (sem autenticação); integrações com Outlook, Google Calendar, Microsoft 365, WhatsApp, e-mail e IA externa só podem ser declaradas ativas depois de configuradas, autorizadas e testadas.

---

## 10. Testes obrigatórios

Testes automatizados (Vitest) e verificação na interface real (Chromium) cobrindo: captura de texto; várias ações por mensagem; datas explícitas e inferidas; priorização e justificativas; duplicidades; atualização de tarefas; desfazer; persistência após reinício; pesquisa e filtros; eventos e conflitos; progresso; importação dos formatos suportados; tratamento de erros; preservação dos originais; digitação em janelas sem perda de foco; layout no celular sem rolagem lateral; console do navegador sem erros. Usar as nove frentes de trabalho como conjunto inicial de teste.

---

## 11. Limitações conhecidas

- Interpretação por regras locais (sem modelo de IA); frases fora dos padrões aparecem como "trechos sem ação".
- PDF digitalizado sem OCR; `.doc` e `.xls` antigos não são interpretados.
- Na edição online, o arquivo original fica no navegador onde foi importado (o texto extraído vai para a nuvem).
- Edição em dois dispositivos ao mesmo tempo: vale o último salvamento (a página avisa).
- Página do claude.ai não é instalável como app de loja; no Chrome, "Criar atalho → Abrir como janela" dá experiência de aplicativo.
