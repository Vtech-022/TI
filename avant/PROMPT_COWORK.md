# Prompt para o Cowork — AVANT, Central de Acompanhamento do Trabalho

Copie tudo abaixo da linha e cole no Cowork.

---

Você vai construir e manter o **AVANT**, um sistema web real e funcionando (não um protótipo), em português do Brasil, para acompanhar a rotina e o trabalho de uma equipe de cerca de 30 pessoas. Quem pede é o **Victor**, que é o administrador do sistema. Chame-o sempre de Victor.

## 1. Objetivo

Uma central onde cada pessoa:
- organiza o próprio dia (o que fazer hoje, anotações, agenda);
- acompanha as frentes de trabalho;
- vê o que a equipe está fazendo, **ao vivo**.

O visual deve ser acolhedor e pessoal, como um painel de rotina. **Não pode parecer sistema de chamados de TI.**

## 2. Acesso e contas

- **Qualquer e-mail pode criar conta:** Gmail, Outlook, institucional ou outro, sem restrição de domínio.
- **Tela de login** com duas abas:
  - **Entrar:** e-mail e senha.
  - **Criar conta:** nome completo, e-mail, senha e confirmação da senha.
- **Regra da senha:** de 4 a 7 caracteres, com pelo menos **uma letra, um número e um caractere especial** (ex.: `Av@2026`), sem espaços. Mostre a regra embaixo do campo e explique o erro com clareza quando a senha não atender.
- **E-mail:**
  - validar o formato;
  - não diferenciar maiúsculas e minúsculas;
  - não permitir duas contas com o mesmo e-mail.
- A senha **nunca** é guardada em texto: use resumo com sal (PBKDF2 ou bcrypt). Bloqueie por 1 minuto após 5 tentativas erradas.
- Sessão de 30 dias, encerrada pelo botão **Sair**.
- **Administrador:**
  - a **primeira conta criada** é a do administrador (o Victor criará a dele logo após publicar);
  - depois disso, todas as novas contas entram como **membro**.
- **O administrador pode:**
  - ver a tela **Usuários** (nome, e-mail, perfil, data de criação);
  - tornar alguém administrador ou membro;
  - definir nova senha;
  - excluir conta, com confirmação. Ele não pode excluir a própria conta nem o último administrador.
  - editar e mover os cartões de qualquer pessoa no quadro da equipe.
- **O membro** só altera os próprios cartões. Essa regra vale **no servidor**, não só na tela.
- Clicando no avatar (inicial do nome), aparece o menu com: nome, perfil, **Personalizar**, **Alterar minha senha** (pede a senha atual) e **Sair**.

## 3. Ao vivo e dados compartilhados

- Todas as pessoas logadas veem **os mesmos dados**. O que uma cria, conclui, move ou anexa aparece para as outras em poucos segundos, **sem recarregar a página**. Mostre o indicador "● Ao vivo" no rodapé do menu.
- Duas pessoas salvando ao mesmo tempo não podem perder dados. Use controle de concorrência (versão/ETag) e refaça a operação sobre a versão mais nova.
- Quando a internet cair, mostre "Sem conexão" e tente de novo sozinho.

## 4. Regras de informação (obrigatórias)

- **Não invente dados.** Nunca crie data, horário, local, responsável ou participante que não foi informado.
- Marque o grau de certeza de cada informação: **explícita, inferida, confirmada ou não informada**. Datas inferidas aparecem com a etiqueta "inferida" e o botão "Confirmar data".
- **Nunca marque uma tarefa como concluída sem ação da pessoa.**
- **Peça confirmação** antes de excluir qualquer coisa.
- **Nunca envie mensagens, e-mails ou cobranças automaticamente.**
- Não declare uma integração externa (Outlook, Google Agenda, WhatsApp) como funcionando sem tê-la testado. Até lá, mostre "não configurada".
- Arquivos enviados ficam preservados sem alteração.

## 5. Telas (menu lateral com ícones e dica ao passar o mouse)

1. **Meu dia (início)**
   - Cartão de boas-vindas colorido com a data, "Bom dia/Boa tarde/Boa noite, [primeiro nome]", uma frase sobre o dia e um anel de progresso do dia.
   - Atalhos: atrasadas, esperando alguém, feitas nos últimos 7 dias.
   - Lista **Meu dia** com o campo "O que você precisa fazer hoje?", que cria uma tarefa com prazo hoje. Seções: Ficou para trás, Para hoje, Em andamento, Sugestões para hoje (quando nada vence hoje; nunca altera prazos) e Feito hoje (riscado).
   - Conclusão em um clique.
   - Bloco **Anotações do dia**, em estilo folha de caderno amarela, salvo automaticamente, com as anotações dos dias anteriores.
   - Agenda de hoje, **Ritmo da semana** (concluídas por dia), **Frentes de trabalho** (barra de progresso) e Próximos dias.
2. **Prioridades:** sequência recomendada para hoje e, à parte, o que está bloqueado e por quê.
3. **Minhas tarefas:**
   - lista ou quadro (Pendente, Em andamento, Aguardando/Bloqueada, Concluída), com arrastar;
   - filtros unificados (prioridade, situação, projeto, prazo, pessoa, categoria) e ordenação.
4. **Painel da tarefa:**
   - situação em caixa de seleção **liberada para todas as opções, inclusive Concluída**, sem precisar de outro botão;
   - justificativa da prioridade com pontos;
   - ajuste manual da prioridade, dependências, subtarefas, terceiros, documentos e histórico com "desfazer".
5. **Frentes de trabalho (projetos):** progresso real, próxima ação, riscos, marcos; visões Lista, Kanban e Cronograma.
6. **Aguardando terceiros:** agrupado por pessoa, com data do pedido e do próximo acompanhamento. Nada é cobrado automaticamente.
7. **Atividades da equipe**, em estilo **Trello**:
   - Colunas A fazer, Em andamento e Concluída, com **arrastar e soltar**.
   - Cartões compactos (título, etiquetas de cor, prazo, ícones de descrição e anexos, avatar de quem criou). "Adicionar um cartão" em cada coluna; filtro por pessoa.
   - Ao clicar, o cartão abre em **tela grande** com: título editável, descrição, **anexos** (fotos com miniatura e ampliação, PDF, vídeo e texto, até 4 MB cada) e painel lateral com situação, **tipo de atividade** (Rotina, Projeto novo, Viagem, Reunião ou evento, Treinamento, Suporte, Outro), prazo e projeto/setor.
   - Cartões **concluídos há mais de 15 dias** (ou excluídos) saem do quadro e vão para a área discreta **"Excluídos"**, de onde podem ser **restaurados**.
8. **Arquivos e documentos:**
   - importar PDF, Word, Excel, CSV e texto, com extração do texto;
   - vínculo com projeto e tarefa;
   - envio do texto para a Captura.
9. **Acompanhamento (relatórios):**
   - ritmo das últimas semanas, abertas por prioridade e situação, projetos, qualidade da informação (certeza dos prazos) e exportação de cópia de segurança em JSON;
   - seção **Indicadores por colaborador** (período de 30, 90 ou 365 dias, ou tudo):
     - destaques: quem mais concluiu, quem mais viajou, quem mais fez projetos novos e quem tem a maior carga atual;
     - alerta de **possível sobrecarga** (pelo menos 1,5× a média de atividades em aberto e no mínimo 4) e de quem está **com folga** (até 50% da média);
     - barras de carga por pessoa com a linha da média;
     - ranking ordenável com o "por quê" de cada pessoa.
10. **Agenda** (acessada por links):
    - dia, semana e mês;
    - criação por linguagem natural ("treinamento na terça às 14h"), mostrando como foi interpretada antes de salvar;
    - aviso de conflito de horário;
    - fuso America/Sao_Paulo.
11. **Captura inteligente:**
    - colar texto (e-mail, WhatsApp, ata) e transformar em tarefas, prazos, eventos e esperas;
    - antes de gravar, mostrar o resumo do que será criado ou atualizado;
    - opção de desfazer.
12. **Usuários:** só para administradores (ver seção 2).

## 6. Prioridade (determinística e explicada)

- A pontuação considera prazo, impacto, bloqueios, dependências e esperas.
- Faixas: Crítica a partir de 70, Alta a partir de 35, Normal a partir de 15, abaixo disso Baixa.
- Sempre mostre os motivos e os pontos de cada um.

## 7. Personalização (cada pessoa, salva na conta dela)

Painel **Personalizar**, aberto pelo ícone de paleta no topo e pelo menu do avatar. As mudanças aparecem na hora.

- **Papel de parede animado**, bem acabado, que fica atrás do conteúdo sem atrapalhar a leitura:
  - **Aurora:** luzes coloridas em movimento lento.
  - **Constelação:** pontos que se ligam e seguem o mouse.
  - **Bolhas de luz:** sobem e vão surgindo.
  - **Ondas:** camadas em movimento.
  - **Céu estrelado:** estrelas piscando e estrelas cadentes.
  - **Formas flutuantes:** figuras geométricas girando.
  - **Nenhum**.
  - Cada opção tem uma miniatura animada.
  - Intensidade Suave, Média ou Forte, e a opção "deixar o fundo parado".
  - As cores seguem a cor principal.
  - A animação pausa quando a aba fica em segundo plano e respeita a configuração "reduzir movimento" do computador.
- **Cor principal:** 10 cores prontas (azul, violeta, rosa, vermelho, laranja, dourado, verde, turquesa, petróleo, grafite) ou qualquer outra pelo seletor. Ela é aplicada a botões, menu ativo, cartão de boas-vindas e gráficos.
- **Fonte:** Padrão (Segoe UI), Arial, Verdana, Trebuchet, Tahoma, Georgia e Arredondada.
- **Tamanho do texto:** Pequeno, Normal, Grande e Muito grande, sem quebrar o layout nem as janelas.
- **Tema:** Claro, Escuro (fundo preto de verdade) ou Automático.
- Botão "Restaurar padrão".

## 8. Identidade visual

- **Logotipo:** quadrado de cantos bem arredondados em degradê azul `#2f6bff` → violeta `#7b4dff`. Dentro, um "A" branco cuja perna direita vira um sinal de concluído laranja `#ffb23f`, e um ponto branco. Abaixo, a palavra "avant" em minúsculas. O mesmo desenho serve de ícone da aba.
- Fundo claro em degradê suave (lavanda → pêssego); cartões claros com cantos arredondados e sombra leve.
- **Ícones profissionais de traço fino (Lucide), sem emojis.**
- Cores das prioridades, testadas para daltonismo: Crítica `#e5484d`, Alta `#f59e0b`, Normal `#2f6bff`, Baixa `#0fa3a3`.
- Barras de rolagem finas e discretas.
- **Funciona bem no celular:** barra inferior de navegação e nenhuma rolagem lateral.
- **Acessibilidade:** contraste adequado, uso por teclado, foco visível. O cursor nunca pode "pular" de campo enquanto a pessoa digita.

## 9. Dados iniciais

- Na primeira execução, carregue as 9 frentes de trabalho do Victor, todas como pendentes (nada concluído).
- Datas incertas ficam marcadas como "inferida".

## 10. Tecnologia e publicação

- **Hospedagem:** **Netlify**, a partir do repositório GitHub **vtech-022/ti**. O código fica na pasta `avant`, com o próprio `netlify.toml`; a raiz do repositório tem outro site, que não deve ser alterado.
- **Arquitetura:**
  - interface estática;
  - função `/api/*` (Netlify Functions);
  - dados no **Netlify Blobs**, gravados com controle de concorrência;
  - anexos no armazenamento de arquivos da Netlify.
- **Variável opcional `AVANT_ACCESS_CODE`:** se definida, é exigida para criar conta.
- Também gere um **arquivo HTML único** (`AVANT.html`) que funcione sozinho, sem internet, com os dados guardados no navegador. Deixe claro que essa versão **não é compartilhada** entre pessoas.

## 11. Testes obrigatórios antes de entregar

- **Testes automáticos de regras:** senha, prioridade, datas em português, captura e permissões.
- **Teste no navegador:**
  - criar a conta do administrador e uma de membro;
  - membro não acessa Usuários nem altera cartões de outros (testar também direto na API);
  - duas pessoas em navegadores diferentes vendo as alterações uma da outra ao vivo;
  - 30 gravações simultâneas sem perda;
  - personalização aplicada e mantida após recarregar;
  - celular sem rolagem lateral;
  - nenhum erro no console.
- Informe o resultado real dos testes. Se algo falhar ou não puder ser testado, diga exatamente o quê.

## 12. Entrega

- O link do site publicado na Netlify.
- O arquivo `AVANT.html`.
- Um guia curto de publicação e uso em português.
- Uma lista honesta do que funciona, do que não foi testado e das limitações. Exemplos:
  - "ao vivo" significa atualização a cada ~3 segundos;
  - anexos de até 4 MB;
  - a versão HTML não é compartilhada.
