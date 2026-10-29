# Zênite — Central de Acompanhamento do Trabalho (versão online)

(O sistema chamava AVANT; o nome novo é Zênite, com logotipo próprio: estrela amarela em órbita sobre azul.)

## Como publicar no Netlify (uma vez)
1. Netlify → **Add new site → Import an existing project** → GitHub → repositório `Vtech-022/ti`.
2. **Base directory:** `avant`  (o site que está na raiz do repositório não é tocado).
3. Publish directory `public` e Functions directory `netlify/functions` já vêm do `avant/netlify.toml`. Build command: vazio.
4. (Opcional) Em *Site configuration → Environment variables* crie `AVANT_ACCESS_CODE` com um código. Se existir, ele será exigido para criar contas novas.
5. Clique em Deploy. Abra o link e **crie a sua conta primeiro: a primeira conta vira Administrador**. Depois passe o link para a equipe.

## Uso
- Entrar/criar conta: **só nome + senha** (mínimo 7 caracteres, com letra, número e caractere especial, sem espaços).
- 5 senhas erradas = bloqueio de 1 minuto. Sessão dura 30 dias; há botão de sair.
- Quadro da equipe: todos veem tudo ao vivo; cada pessoa só altera os próprios cartões (o servidor também impede).
- Administrador tem a tela **Usuários**: mudar função, definir nova senha, excluir conta (com confirmação; não a própria nem o último admin).
- Personalização (papel de parede, cores, fontes, tema) fica salva por conta.
- Anexos até 4 MB.
- **Tarefas da equipe**: em *Nova tarefa* escolha *Atribuir a* (qualquer pessoa com login) e *Quem pode ver* (só eu / toda a equipe). Quem recebe vê em *Meu dia* e em *Tarefas da equipe → Para mim* e marca como feita. Sem atribuir nem compartilhar, a tarefa continua individual (só sua).
- **Calendário da equipe**: mês com a tarefa de cada pessoa por dia (tarefas individuais só aparecem para quem pode vê-las).
- **Aguardando Terceiros**: ao registrar a espera dá para pedir a uma pessoa do sistema *fazer* ou *validar*; aparece na lista dela.
- **Subtarefas** aparecem recuadas logo abaixo da tarefa principal. O detalhe da tarefa tem seções recolhidas. “Esforço” foi removido; “Impacto” tem explicação no campo.
- **Selecionar e excluir** várias tarefas de uma vez (Minhas tarefas). Dá para desfazer pelo Histórico.
- **Arquivos e Documentos**: enviar um arquivo **nunca cria tarefa**. Há pesquisa por nome, botão *Ver* e o campo Tarefa é uma busca (só mostra resultados ao digitar; dá para criar a tarefa ali mesmo).
- **Recuperar senha**: ao criar a conta aparece um código de recuperação (12 caracteres, uso único). Na tela de entrada: *Esqueci minha senha* → nome + código + nova senha. Quem já tinha conta gera o código em menu da conta → *Código de recuperação*. Sem o código, o administrador define nova senha em *Usuários*.
- **Onde ficam os dados**: no servidor (Netlify Blobs), não em HTML. Tarefas da equipe em um documento único com gravação protegida contra edições simultâneas. Um banco SQL (ex.: Netlify DB/Postgres) é um passo futuro opcional se o uso crescer muito.

## Testado
- 48 testes de API (inclui tarefas da equipe, permissões, recuperação de senha e 30 pessoas criando tarefas ao mesmo tempo) (regras, permissões direto na API, bloqueio, 30 gravações simultâneas sem perda) — com armazenamento em memória e com o cliente oficial do Netlify Blobs contra emulador local.
- 32 + 34 verificações no navegador (tarefas da equipe, calendário, recuperar senha, busca em Arquivos, upload sem tarefas, excluir em massa; admin + membro, isolamento, quadro ao vivo entre dois navegadores, personalização, offline/“Sem conexão”, celular sem rolagem lateral, sem erros no console).

## Não testado / limitações (honesto)
- Os testes rodam contra emulador local; o Netlify de produção é conferido à parte após cada publicação.
- “Ao vivo” = consulta a cada ~3 s (10 s se a aba ficar parada; pausa em aba oculta). Com ~30 pessoas isso consome chamadas de função do plano do Netlify; acompanhe o uso.
- Dados pessoais de cada conta (base interna) têm limite de ~5,5 MB por conta.
- Se a mesma conta for editada em dois aparelhos ao mesmo tempo, vale a última gravação (há aviso).
- Fechar a aba imediatamente após alterar pode perder essa última alteração.
- Anexos de cartões excluídos podem ficar órfãos no armazenamento.
- `AVANT.html` (nesta pasta) é a versão de arquivo único, **só local**: não compartilha nada com a equipe.

## Novidades (projetos, calendário, tela inicial)
- **Projetos**: "Frentes de trabalho" agora se chama *Projetos*. Em *Calendário da equipe → Cores dos projetos* cada pessoa escolhe as cores dos seus projetos (valem só para ela).
- **Calendário** em células arredondadas, tarefas com a cor do projeto, avatares de quem tem tarefa no dia e lista lateral do dia selecionado.
- **Ranking/histórico da equipe**: o Administrador vê "Remover" nas linhas "(conta removida)" para limpá-las.
- **Tela inicial (Meu dia)** enxuta: só as atividades do dia, painel "Seu dia em números" (feitas/total, atrasadas, em andamento, aguardando, horas), **Equipe agora** (quem está online, com bolinha verde) e anotações recolhidas.
- **Horas trabalhadas**: botão Iniciar/Pausar no topo da tela inicial. O cronômetro pausa sozinho ~2,5 min após você sair do sistema e zera à meia-noite (Brasília).
- **Foto de perfil**: menu da conta → "Foto de perfil" (JPG/PNG/WEBP; recortada e reduzida automaticamente).
