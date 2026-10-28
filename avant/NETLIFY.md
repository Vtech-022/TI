# AVANT na Netlify — versão compartilhada e ao vivo

Nesta versão, todas as pessoas que abrem o link veem **os mesmos dados**. O que alguém cria, conclui, move ou anexa aparece para os demais em **2 a 3 segundos**, sem recarregar a página.

## Como funciona

- **Interface:** arquivos estáticos em `dist/netlify`, gerados por `npm run build:netlify`.
- **API:** a função `netlify/functions/api.mts` atende `/api/*`. Ela usa as mesmas rotas e regras do servidor Node.
- **Dados:** ficam no **Netlify Blobs**, o armazenamento da própria Netlify. Não é preciso criar banco de dados nem conta em outro serviço.
  - `avant-dados`: banco SQLite (tarefas, projetos, agenda, anotações) e quadro da equipe.
  - `avant-arquivos`: documentos originais e anexos dos cartões.
- **Gravação segura:** cada gravação só vale se ninguém salvou antes. Se duas pessoas salvam juntas, a segunda é refeita automaticamente sobre a versão mais nova, e nada se perde. Isso foi testado com 30 gravações simultâneas em dois servidores.
- **Ao vivo:** cada tela consulta `/api/live` a cada 3 segundos (pausa quando a aba fica em segundo plano) e se atualiza quando alguém salva.

## Publicar (uma vez)

1. Entre em https://app.netlify.com e clique em **Add new site → Import an existing project → GitHub**.
2. Escolha o repositório **vtech-022/ti**.
3. Em **Branch to deploy**, escolha `claude/adoring-bardeen-g095g7`, ou `main` depois que as alterações forem incorporadas.
4. Em **Base directory**, escreva **`avant`**. Isso é importante: a raiz do repositório tem outro site (Next.js) com configuração própria.
5. Os demais campos são preenchidos pelo arquivo `avant/netlify.toml`:
   - Build command: `npm run build:netlify`
   - Publish directory: `dist/netlify`
   - Functions directory: `netlify/functions`
6. Recomendado: em **Site configuration → Environment variables**, crie `AVANT_ACCESS_CODE` com um código da equipe (ex.: `cri-norte-2026`). Com ele, só entra quem souber o código. Sem ele, qualquer pessoa com o link pode ver e alterar tudo.
7. Clique em **Deploy**. A cada novo envio ao GitHub, a Netlify publica de novo sozinha, e os dados são mantidos.

## Na primeira visita

Cada pessoa informa **o nome** (e o código, se houver). O nome aparece:
- na saudação;
- no avatar;
- nos cartões da equipe.

Ele fica guardado no navegador daquela pessoa.

## Limites desta versão

- Anexos e documentos: até **4 MB** por arquivo (limite das funções da Netlify).
- Word e Excel não são aceitos como anexo de cartão: salve como PDF. Como documento importado, `.docx` e `.xlsx` funcionam, com extração de texto.
- "Ao vivo" significa atualização a cada ~3 segundos, não instantânea.
- Duas pessoas editando a **mesma anotação do dia** ao mesmo tempo: vale a última gravação.
- O código de acesso é compartilhado pela equipe. Não há login individual com senha.

## Testar localmente

```bash
cd avant
npm install
npm run build:netlify
npm run netlify:local   # http://localhost:8888 (simula a função e o armazenamento)
```
