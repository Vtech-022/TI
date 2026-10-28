// Teste de ponta a ponta no navegador (Chromium via Playwright).
// Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/e2e/smoke.mjs
import { createRequire } from "node:module";
import { startServer } from "../local-server.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const results = [];
const check = (nome, ok, detalhe = "") => {
  results.push({ nome, ok });
  console.log(`${ok ? "PASSOU" : "FALHOU"}  ${nome}${detalhe ? "  -> " + detalhe : ""}`);
};

const { server, port, ctx } = await startServer(0);
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();
const errors = [];
let esperandoErroDeRede = false; // durante o teste de "sem internet" o navegador registra erros de propósito

const novoContexto = (opts = {}) => browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
function acompanhar(page, rotulo) {
  page.on("pageerror", (e) => errors.push(`${rotulo} pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error" || esperandoErroDeRede) return;
    errors.push(`${rotulo} console: ${m.text()}`);
  });
}
const ir = async (page, rotulo) => { await page.locator(`.rail a[aria-label="${rotulo}"]`).click(); await page.waitForTimeout(900); };
const texto = (page) => page.locator("body").innerText();
const campoSenha = (page) => page.locator('.gate-card input[autocomplete="current-password"]').first();

async function criarConta(page, nome, senha) {
  await page.goto(base);
  await page.waitForSelector(".gate-card");
  if (await page.locator('.gate-card [role="tab"]').count()) await page.locator('.gate-card [role="tab"]', { hasText: "Criar conta" }).click();
  await page.locator(".gate-card input").nth(0).fill(nome);
  const pw = page.locator('.gate-card input[autocomplete="new-password"]');
  await pw.nth(0).fill(senha);
  await pw.nth(1).fill(senha);
  await page.locator('.gate-card button[type="submit"]').click();
  await page.waitForSelector(".avt-code", { timeout: 20000 });
  await page.locator('.gate-card input[type="checkbox"]').check();
  await page.locator('.gate-card button:has-text("Continuar")').click();
  await page.waitForSelector(".rail", { timeout: 20000 });
  await page.waitForTimeout(1500);
}
async function entrar(page, nome, senha) {
  await page.goto(base);
  await page.waitForSelector(".gate-card");
  await page.locator(".gate-card input").nth(0).fill(nome);
  await campoSenha(page).fill(senha);
  await page.locator('.gate-card button[type="submit"]').click();
  await page.waitForSelector(".rail", { timeout: 20000 });
  await page.waitForTimeout(1500);
}

try {
  // ------------------------------------------------------------ Victor (administrador)
  const v = await (await novoContexto()).newPage();
  acompanhar(v, "Victor");
  await v.goto(base);
  await v.waitForSelector(".gate-card");
  const titulo = await v.locator(".gate-card h1").innerText();
  check("primeira tela pede para criar a conta do administrador", /administrador/i.test(titulo), titulo);
  check("login é só por nome: não existe campo de e-mail", (await v.locator('.gate-card input[type="email"]').count()) === 0);

  await v.locator(".gate-card input").nth(0).fill("Victor Andrade");
  const pw = v.locator('.gate-card input[autocomplete="new-password"]');
  await pw.nth(0).fill("Av@202");
  await pw.nth(1).fill("Av@202");
  await v.locator('.gate-card button[type="submit"]').click();
  await v.waitForSelector(".gate-error");
  const erroSenha = await v.locator(".gate-error").innerText();
  check("senha com 6 caracteres é recusada com mensagem clara", /mínimo 7/.test(erroSenha), erroSenha);
  check("a regra da senha aparece na tela (mínimo 7)", /No mínimo 7 caracteres/.test(await v.locator(".pw-rule").innerText()));
  await pw.nth(0).fill("abcdefgh");
  await pw.nth(1).fill("abcdefgh");
  await v.locator('.gate-card button[type="submit"]').click();
  check("senha sem número/especial é recusada", /número|especial/.test(await v.locator(".gate-error").innerText()));
  await pw.nth(0).fill("Av@2026");
  await pw.nth(1).fill("Av@2026");
  await v.locator('.gate-card button[type="submit"]').click();
  await v.waitForSelector(".avt-code", { timeout: 20000 });
  check("depois de criar a conta aparece o código de recuperação", /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test((await v.locator(".avt-code").innerText()).trim()));
  check("'Continuar' só libera depois de confirmar que guardou o código", await v.locator('.gate-card button:has-text("Continuar")').isDisabled());
  await v.locator('.gate-card input[type="checkbox"]').check();
  await v.locator('.gate-card button:has-text("Continuar")').click();
  await v.waitForSelector(".rail", { timeout: 20000 });
  await v.waitForTimeout(1500);

  check("Victor entrou no PRUMO", /Meu dia/.test(await texto(v)));
  check("administrador vê o item Usuários no menu", (await v.locator('.rail a[aria-label="Usuários"]').count()) === 1);
  check("rodapé do menu mostra ● Ao vivo", /Ao vivo/.test(await v.locator(".rail").innerText()));
  await ir(v, "Frentes de trabalho");
  check("carga inicial: as frentes de trabalho do Victor existem", /Revista de Experiências Exitosas/.test(await texto(v)));

  // ------------------------------------------------------------ Ana (membro, outro navegador)
  const a = await (await novoContexto()).newPage();
  acompanhar(a, "Ana");
  await criarConta(a, "Ana Souza", "Av@2026");
  check("membro entrou", /Meu dia/.test(await texto(a)));
  check("membro NÃO vê Usuários", (await a.locator('.rail a[aria-label="Usuários"]').count()) === 0);
  await ir(a, "Frentes de trabalho");
  check("membro NÃO recebe as frentes do Victor", !/Revista de Experiências Exitosas/.test(await texto(a)));

  // nome repetido (sem diferenciar maiúsculas/acentos) é recusado
  const dup = await (await novoContexto()).newPage(); // (não é acompanhada: o 409 aqui é provocado de propósito)
  await dup.goto(base);
  await dup.waitForSelector(".gate-card");
  await dup.locator('.gate-card [role="tab"]', { hasText: "Criar conta" }).click();
  await dup.locator(".gate-card input").nth(0).fill("ANA souza");
  const pwd = dup.locator('.gate-card input[autocomplete="new-password"]');
  await pwd.nth(0).fill("Av@2026");
  await pwd.nth(1).fill("Av@2026");
  await dup.locator('.gate-card button[type="submit"]').click();
  await dup.waitForSelector(".gate-error");
  check("nome repetido é recusado", /Já existe uma conta com esse nome/.test(await dup.locator(".gate-error").innerText()));

  // ------------------------------------------------------------ equipe ao vivo
  await ir(v, "Atividades da equipe");
  await ir(a, "Atividades da equipe");
  await a.waitForTimeout(1000);
  check("tela Atividades da equipe abre", /Arraste os cartões entre as listas/.test(await texto(a)));
  await a.locator("button", { hasText: /Adicionar um cartão/i }).first().click();
  const campo = a.locator("textarea, input.input, input[type=text]").last();
  await campo.fill("Cartão criado pela Ana");
  await campo.press("Enter");
  await a.waitForTimeout(1000);
  check("Ana vê o próprio cartão", /Cartão criado pela Ana/.test(await texto(a)));
  let apareceu = false, t0 = Date.now();
  while (!apareceu && Date.now() - t0 < 9000) { await v.waitForTimeout(400); apareceu = /Cartão criado pela Ana/.test(await texto(v)); }
  check("o cartão da Ana aparece para o Victor ao vivo, sem recarregar", apareceu, `${Date.now() - t0} ms`);

  // Victor (admin) cria um cartão; a Ana vê ao vivo também
  await v.locator("button", { hasText: /Adicionar um cartão/i }).first().click();
  const campoV = v.locator("textarea, input.input, input[type=text]").last();
  await campoV.fill("Cartão do Victor");
  await campoV.press("Enter");
  let aparecaV = false; t0 = Date.now();
  while (!aparecaV && Date.now() - t0 < 9000) { await a.waitForTimeout(400); aparecaV = /Cartão do Victor/.test(await texto(a)); }
  check("o cartão do Victor aparece para a Ana ao vivo", aparecaV, `${Date.now() - t0} ms`);
  await v.waitForTimeout(800);
  check("os dois cartões convivem no quadro (nada se perdeu)", /Cartão criado pela Ana/.test(await texto(v)) && /Cartão do Victor/.test(await texto(v)));

  // ------------------------------------------------------------ dados pessoais salvos no servidor e entre aparelhos
  await ir(v, "Meu dia");
  const nova = v.locator('input[placeholder*="precisa fazer hoje"]').first();
  await nova.fill("Tarefa de teste de persistência");
  await nova.press("Enter");
  await v.waitForTimeout(2800);
  const copias = [...ctx.store._dump().keys()].filter((k) => k.startsWith("data/"));
  check("o servidor guarda a cópia dos dados de cada conta", copias.length >= 2, `${copias.length} cópias`);

  const v2 = await (await novoContexto()).newPage();
  acompanhar(v2, "Victor-2");
  await v2.goto(base);
  await v2.waitForSelector(".gate-card");
  check("navegador novo, sem sessão, pede login (abas Entrar / Criar conta)", (await v2.locator('.gate-card [role="tab"]').count()) === 2);
  await entrar(v2, "victor andrade", "Av@2026");
  check("em outro aparelho o Victor entra pelo nome e vê a tarefa criada no primeiro", /Tarefa de teste de persistência/.test(await texto(v2)));

  // alteração no 2º aparelho chega ao 1º sem recarregar
  const nova2 = v2.locator('input[placeholder*="precisa fazer hoje"]').first();
  await nova2.fill("Feita no segundo aparelho");
  await nova2.press("Enter");
  let sincronizou = false; t0 = Date.now();
  while (!sincronizou && Date.now() - t0 < 12000) { await v.waitForTimeout(500); sincronizou = /Feita no segundo aparelho/.test(await texto(v)); }
  check("alteração do mesmo usuário em outro aparelho chega ao primeiro ao vivo", sincronizou, `${Date.now() - t0} ms`);

  // ------------------------------------------------------------ personalização salva na conta
  await v.locator(".account-btn").click();
  await v.locator('.account-pop button', { hasText: "Personalizar" }).click();
  await v.waitForSelector(".modal-personalize");
  const painel = v.locator(".modal-personalize");
  await painel.getByRole("button", { name: "Escuro", exact: true }).click();
  await painel.getByRole("button", { name: "Violeta", exact: true }).click();
  await painel.getByRole("button", { name: /^Constelação/ }).click();
  await v.waitForTimeout(1600);
  const prefsKey = [...ctx.store._dump().keys()].find((k) => k.startsWith("prefs/"));
  const prefsSalvas = prefsKey ? JSON.parse(new TextDecoder().decode(ctx.store._dump().get(prefsKey).bytes)) : {};
  check("Personalizar: tema, cor e papel de parede são salvos na conta, no servidor",
    prefsSalvas.theme === "escuro" && !!prefsSalvas.wallpaper && prefsSalvas.wallpaper !== "aurora", JSON.stringify(prefsSalvas).slice(0, 160));
  const v3 = await (await novoContexto()).newPage();
  acompanhar(v3, "Victor-3");
  await entrar(v3, "Victor Andrade", "Av@2026");
  const aplicado = await v3.evaluate(() => {
    const id = window.__avUid;
    const prefs = JSON.parse(localStorage.getItem(`avant:prefs:${id}`) ?? "{}");
    return { prefs, papelDeParede: document.documentElement.classList.contains("has-wallpaper") };
  });
  check("a personalização aparece em outro aparelho (vem do servidor)",
    aplicado.prefs.theme === "escuro" && aplicado.prefs.accent === "#7b4dff" && aplicado.prefs.wallpaper === "constelacao" && aplicado.papelDeParede,
    JSON.stringify(aplicado));

  // ------------------------------------------------------------ Usuários (administrador)
  await painel.getByRole("button", { name: "Pronto", exact: true }).click();
  await v.waitForTimeout(400);
  await ir(v, "Usuários");
  const usuarios = await texto(v);
  check("administrador vê a tela Usuários com as contas", /Victor Andrade/.test(usuarios) && /Ana Souza/.test(usuarios));
  check("a tela Usuários não mostra e-mail", !/E-mail/i.test(usuarios));

  // ------------------------------------------------------------ sem conexão
  esperandoErroDeRede = true;
  await v.context().setOffline(true);
  let semConexao = false; t0 = Date.now();
  while (!semConexao && Date.now() - t0 < 16000) { await v.waitForTimeout(500); semConexao = /Sem conexão/.test(await v.locator(".rail").innerText()); }
  check("sem internet o rodapé mostra 'Sem conexão'", semConexao, `${Date.now() - t0} ms`);
  await v.context().setOffline(false);
  let voltou = false; t0 = Date.now();
  while (!voltou && Date.now() - t0 < 16000) { await v.waitForTimeout(500); voltou = /Ao vivo/.test(await v.locator(".rail").innerText()); }
  esperandoErroDeRede = false;
  check("a conexão volta sozinha e mostra ● Ao vivo de novo", voltou, `${Date.now() - t0} ms`);

  // ------------------------------------------------------------ mobile
  const m = await (await novoContexto({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true })).newPage();
  acompanhar(m, "Mobile");
  await entrar(m, "Victor Andrade", "Av@2026");
  const excesso = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("celular: sem rolagem lateral", excesso <= 1, `excesso ${excesso}px`);

  // Erros de console esperados: só os de tentativa de login errada, que este teste não provoca.
  check("nenhum erro no console nem na página", errors.length === 0, errors.slice(0, 4).join(" | "));
} catch (e) {
  check("execução sem exceções", false, (e.stack ?? String(e)).split("\n").slice(0, 5).join(" | "));
} finally {
  await browser.close();
  server.close();
}
const falhas = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
process.exit(falhas ? 1 : 0);
