# Equipe de agentes do Claude Code

Definições em `.claude/agents/*.md` (frontmatter YAML + instruções). `.claude/settings.json` define `"agent": "coordenador"`, então toda sessão aberta neste projeto já começa como o Coordenador, que encaminha o pedido ao especialista.

| Agente | Arquivo | Modelo | Ferramentas | Escreve em |
|---|---|---|---|---|
| Coordenador | `coordenador.md` | opus | Agent (só os 6 especialistas), Read, Grep, Glob, Bash (leitura), Task* | nada — só delega |
| Arquiteto | `arquiteto.md` | opus | Read, Grep, Glob, Bash (leitura), WebFetch, WebSearch, Write | `docs/planejamento/` |
| Desenvolvedor | `desenvolvedor.md` | sonnet | Read, Grep, Glob, Edit, Write, Bash | arquivos atribuídos na tarefa |
| Analista de Dados | `analista-dados.md` | sonnet | Read, Grep, Glob, Bash, Write | `saidas/dados/` |
| Automação | `automacao.md` | sonnet | Read, Grep, Glob, Edit, Write, Bash, WebFetch | `scripts/`, `.github/workflows/` |
| Testes | `testes.md` | sonnet | Read, Grep, Glob, Bash | nada (só reporta) |
| Revisor | `revisor.md` | opus | Read, Grep, Glob, Bash (leitura); Edit/Write/NotebookEdit bloqueados | nada (só analisa) |

## Como acionar

- **Automático (padrão):** abra o Claude Code na pasta do projeto e escreva o pedido. O Coordenador classifica e delega.
- **Agente específico na sessão inteira:** `claude --agent analista-dados` (ou `-p` para modo não interativo).
- **Dentro de uma sessão:** "use o agente revisor para revisar src/utils" ou `@agent-revisor ...`.
- **Gerenciar:** comando `/agents` no modo interativo.
- **Desligar o roteamento automático:** remova `"agent"` de `.claude/settings.json` ou rode `claude --agent claude`.

## Regras contra conflito

- O Coordenador só roda em paralelo tarefas com arquivos disjuntos; cada agente que escreve recebe a lista exata de arquivos.
- Testes e Revisor só leem e rodam depois que os agentes que escrevem terminam.
- Subagentes não acionam outros subagentes (limitação do Claude Code); por isso o Coordenador precisa ser o agente principal da sessão.

## Observação de versão

Testado no Claude Code 2.1.308. Nessa versão, Grep/Glob não são ferramentas separadas (a busca é feita via Bash); elas continuam listadas para instalações que ainda as expõem.
