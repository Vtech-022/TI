# AVANT — Central de Acompanhamento do Trabalho (versão online)

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

## Testado
- 35 testes de API (regras, permissões direto na API, bloqueio, 30 gravações simultâneas sem perda) — com armazenamento em memória e com o cliente oficial do Netlify Blobs contra emulador local.
- 30 verificações no navegador (admin + membro, isolamento, quadro ao vivo entre dois navegadores, personalização, offline/“Sem conexão”, celular sem rolagem lateral, sem erros no console).

## Não testado / limitações (honesto)
- **Não foi feito deploy real no Netlify** nem usado o Blobs de produção; o emulador local foi ajustado para devolver ETag como o serviço real. Faça um teste rápido após publicar (criar conta, criar cartão, abrir em outro aparelho).
- “Ao vivo” = consulta a cada ~3 s (10 s se a aba ficar parada; pausa em aba oculta). Com ~30 pessoas isso consome chamadas de função do plano do Netlify; acompanhe o uso.
- Dados pessoais de cada conta (base interna) têm limite de ~5,5 MB por conta.
- Se a mesma conta for editada em dois aparelhos ao mesmo tempo, vale a última gravação (há aviso).
- Fechar a aba imediatamente após alterar pode perder essa última alteração.
- Anexos de cartões excluídos podem ficar órfãos no armazenamento.
- `AVANT.html` (nesta pasta) é a versão de arquivo único, **só local**: não compartilha nada com a equipe.
