# AVANT — Central Inteligente de Gestão

Sistema pessoal para organizar pendências, projetos, prazos, agenda e dependências de terceiros.
O diferencial é a **Captura Inteligente**: você cola mensagens, anotações, atas ou listas (ou importa arquivos)
e o AVANT transforma o conteúdo em tarefas estruturadas, com prioridade justificada — sem formulários longos e
sem inventar informações.

Tudo roda localmente: banco SQLite em arquivo, regras de interpretação próprias em português e nenhuma chamada
a serviços externos.

---

## Requisitos

- **Node.js 22.13 ou superior** (usa o módulo nativo `node:sqlite`; não há compilação nativa).
- npm 10+.
- Testado em Linux com Node 22.22.

## Instalação e execução

```bash
cd avant
npm install
npm run build        # gera a interface (dist/client) e o servidor (dist/server)
npm start            # http://127.0.0.1:4310
```

Na primeira execução o banco `data/avant.db` é criado e as **nove frentes de trabalho iniciais** são cadastradas
(todas pendentes). Reiniciar a aplicação não duplica a carga e preserva todos os dados.

### Desenvolvimento

```bash
npm run dev          # API com recarga (porta 4310) + Vite (porta 5173, com proxy para /api)
```

### Configuração (variáveis de ambiente)

Copie `.env.example` e ajuste se necessário (as variáveis são lidas do ambiente do processo):

| Variável | Padrão | Descrição |
|---|---|---|
| `AVANT_PORT` | `4310` | Porta HTTP |
| `AVANT_HOST` | `127.0.0.1` | Endereço de escuta. Mantenha local: **não há autenticação** (uso individual). |
| `AVANT_DATA_DIR` | `./data` | Banco SQLite e arquivos importados (`uploads/`) |
| `AVANT_TIMEZONE` | `America/Sao_Paulo` | Fuso para datas, prazos e agenda |
| `AVANT_MAX_UPLOAD_MB` | `15` | Limite por arquivo importado |

**Cópia de segurança:** copie a pasta `data/` com o servidor parado, ou use *Configurações → Baixar cópia de
segurança (JSON)*.

## Testes

```bash
npm test             # 59 testes automatizados (Vitest) — domínio, serviços e API com banco real em arquivo
npm run typecheck    # TypeScript estrito
npm run test:e2e     # com o servidor em execução: verificação na interface real com Chromium
```

O `test:e2e` usa `playwright-core` e um Chromium já instalado (variável `CHROMIUM_PATH` se estiver em outro
local). Ele altera os dados do servidor em execução — use um diretório de dados de teste:
`AVANT_DATA_DIR=/tmp/avant-e2e npm start`.

---

## Como usar a Captura Inteligente

Acesse pelo menu **Captura Inteligente**, pelo botão dourado **Captura rápida** (em qualquer tela) ou com
**Alt + C**.

1. Cole o texto: conversa do WhatsApp exportada ou copiada, e-mail, ata, lista com marcadores, anotações soltas.
   Ou arraste arquivos **TXT, MD, CSV, XLSX, DOCX ou PDF** (com texto selecionável).
2. Clique em **Analisar e salvar** (ou marque *Revisar antes de salvar* para ver a pré-visualização exata antes).
3. Leia o resumo: novas tarefas, atualizações de tarefas existentes, itens já registrados, eventos de agenda,
   esperas por terceiros, dependências e perguntas de confirmação.
4. Responda às confirmações (aparecem na própria captura, no painel inicial e na lista lateral). Elas não
   bloqueiam o restante da análise.
5. Se algo não ficou certo, use **Desfazer captura** — todas as alterações daquela captura são revertidas.

### O que o AVANT reconhece

- **Mensagens do WhatsApp** (`[21/10/2026, 09:13] Nome: texto` ou `21/10/2026 09:13 - Nome: texto`): a data de
  cada mensagem vira a referência para expressões como “até quarta-feira”.
- **Várias ações numa frase**: “Finalizar a apresentação, retirar o mapa da capa, remover os trabalhos e enviar
  para validação” vira ações distintas; a ação de fechamento (enviar, validar, encaminhar…) passa a depender das
  anteriores (dependência *inferida*).
- **Listas com cabeçalho**: “Ajustes da revista:” seguido de itens cria uma tarefa principal com subtarefas;
  cabeçalhos genéricos (“Pendências da semana:”) servem só de contexto; “Daniela:” atribui os itens a Daniela.
- **Prazos**: datas escritas (explícitas) e relativas — hoje, amanhã, dia da semana, “sexta que vem”, “dia 5”,
  “fim do mês”, “em 3 dias” (inferidas). Se houver mais de uma leitura plausível, o AVANT pergunta.
- **Pessoas**: “responsável: X”, “@X”, “X vai…/ficou de…”, “com X”, “para X”, “aguardando o X…”.
- **Terceiros**: “aguardando”, “depende de”, “cobrar”, “liberação de” → registro em *Aguardando Terceiros*.
- **Projetos**: pelo nome, pelas palavras-chave do projeto ou por “projeto: Nome” (cria o projeto, se não existir).
- **Eventos**: “Treinamento na terça-feira às 14h com a equipe” vira evento na agenda, sem inventar término, local
  ou participantes. Horários ambíguos (“às 2”) pedem confirmação.
- **Status**: “já foi enviada”, “concluído” → pede confirmação antes de concluir. “Em andamento” atualiza o status.
- **Duplicidades**: itens que correspondem claramente a tarefas existentes viram atualização (com histórico) ou
  “já registrada”. Correspondências duvidosas geram uma pergunta com as alternativas.

Cada informação é marcada como **Explícita**, **Inferida**, **Confirmada** (por você) ou **Não informada**.
O texto original da captura é preservado e vinculado aos registros.

## Priorização automática

O motor é determinístico e mostra a conta em cada tarefa (*Por que esta prioridade*). Pontuação:

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

Níveis: **Crítica ≥ 70**, **Alta ≥ 35**, **Normal ≥ 15**, **Baixa < 15**. Sem prazo nem dependentes, uma tarefa
não passa de Alta (importância não é urgência). O impacto da tarefa principal vale para as subtarefas sem
impacto próprio. As prioridades são recalculadas após cada alteração e a cada hora (virada do dia).
O ajuste manual exige motivo, fica no histórico e mantém o cálculo automático visível.

## Áreas

- **Visão Geral** — foco do dia, críticas, atrasadas, terceiros, próximas entregas, projetos, captura rápida,
  alertas operacionais, recomendações e confirmações pendentes. Todos os números vêm do banco.
- **Foco de Hoje** — sequência recomendada (sem tarefas bloqueadas) e a lista do que está bloqueado.
- **Minhas Pendências** — filtros (prioridade, status, projeto, responsável, categoria, origem, prazo,
  dependências, período) e ordenação. Os filtros ficam na URL.
- **Projetos** — progresso real (tarefas folha concluídas ÷ tarefas folha não canceladas), próxima ação, riscos,
  marcos, documentos, mapa de dependências e visualizações **Lista** (hierárquica), **Kanban** (arrastar muda o
  status) e **Cronograma**.
- **Agenda** — dia, semana e mês; criação por linguagem natural; conflitos de horário; prazos de tarefas no
  calendário; edição, reagendamento e exclusão com confirmação; histórico do evento.
- **Aguardando Terceiros** — agrupado por pessoa, com datas de solicitação, prazo esperado e acompanhamento.
  Nenhuma mensagem é enviada automaticamente.
- **Arquivos e Documentos** — originais guardados sem alteração (SHA-256), texto extraído, vínculo com
  projeto/tarefa e envio do conteúdo para a captura. Remover um arquivo do AVANT **não** apaga o original.
- **Histórico** — todas as alterações com origem; desfazer individual ou por captura (bloqueado quando o registro
  foi alterado depois, para não perder dados).
- **Relatórios** — ritmo semanal, distribuição por prioridade/status/responsável/categoria, qualidade da
  informação (certeza dos prazos), projetos e terceiros.
- **Configurações** — redução de animações, menu recolhido, fuso, cópia de segurança e estado das integrações.

### Regras de conclusão

- Tarefa com dependências ou subtarefas abertas só é concluída como **exceção**, com motivo registrado.
- As remoções da revista exigem a confirmação “verifiquei nas versões revisadas”.
- Conclusões detectadas em mensagens sempre pedem confirmação.

### Atalhos

`Ctrl+K` ou `/` pesquisa · `Alt+C` captura rápida · `Alt+N` nova tarefa · `Alt+A` agenda ·
`Alt+P` críticas · `Alt+H` foco de hoje · `Alt+1…9` áreas · `?` lista de atalhos · `Esc` fecha.

---

## Arquitetura

```
avant/
├── src/shared/types.ts          Tipos e rótulos comuns
├── src/server/
│   ├── db/                      Conexão SQLite (node:sqlite), migrações versionadas, mapeamento de linhas
│   ├── domain/                  Regras puras, sem banco
│   │   ├── text.ts              Normalização, radicais em português, similaridade
│   │   ├── dates.ts             Datas pt-BR relativas/explícitas, fuso, horários
│   │   ├── extraction.ts        Texto livre → candidatos (tarefas, eventos, atualizações)
│   │   ├── matching.ts          Correspondência com tarefas existentes e duplicidades
│   │   ├── priority.ts          Motor de priorização
│   │   ├── agenda.ts            Eventos em linguagem natural e conflitos
│   │   └── progress.ts          Progresso real
│   ├── services/                Regras de negócio com persistência e histórico
│   ├── importers/               TXT, MD, CSV, XLSX (exceljs), DOCX (mammoth), PDF (pdfjs-dist)
│   ├── seed.ts                  Carga inicial das nove frentes
│   └── app.ts / index.ts        API Fastify, validação Zod, erros centralizados
├── src/client/                  React + Vite + TypeScript, CSS próprio, fontes locais
├── tests/                       Vitest
└── scripts/e2e.mjs              Verificação na interface real
```

Operações que alteram dados rodam em transação; a pré-visualização da captura executa exatamente a mesma lógica
dentro de uma transação que é desfeita ao final.

## Limitações conhecidas

- **Uso individual e local**: não há login nem perfis. Para várias pessoas (como a futura agenda compartilhada da
  tarefa 4) seria necessário adicionar autenticação, autorização e, de preferência, PostgreSQL.
- **Interpretação por regras**: cobre os padrões mais comuns de mensagens em português; frases muito livres podem
  não ser reconhecidas (aparecem em “trechos sem ação”, nunca são descartadas em silêncio). Não há modelo de IA
  integrado.
- **PDF digitalizado** (imagem) não tem OCR: o arquivo é guardado e o AVANT informa que não há texto.
- **Formatos antigos** `.doc` e `.xls` não são interpretados (apenas `.docx` e `.xlsx`).
- **Integrações** com Outlook, Google Calendar, Microsoft 365, WhatsApp e e-mail **não estão implementadas**;
  aparecem como “não configuradas”.
- `node:sqlite` ainda é marcado como experimental no Node 22 (o aviso é suprimido em `npm start`).
- `npm audit` aponta avisos moderados em dependências indiretas (`argparse`/`sprintf-js` do mammoth, usados só
  pela linha de comando do mammoth; `uuid` do exceljs, na função com buffer que o AVANT não usa).
