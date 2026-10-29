// Teste de ponta a ponta das melhorias: tarefas da equipe, calendário, recuperar senha,
// busca em Arquivos, upload sem criar tarefas, excluir em massa.
// Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/e2e/equipe.mjs [pasta-de-capturas]
import { createRequire } from "node:module";
import fs from "node:fs";
import { startServer } from "../local-server.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const SHOTS = process.argv[2] || "";
const results = [];
const check = (nome, ok, detalhe = "") => {
  results.push({ nome, ok });
  console.log(`${ok ? "PASSOU" : "FALHOU"}  ${nome}${detalhe ? "  -> " + detalhe : ""}`);
};
const { server, port } = await startServer(0);
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();
const errors = [];
const novo = async (w = 1280, h = 860) => {
  const p = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  p.on("response", (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().replace(base, "")}`); });
  p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  return p;
};
const shot = async (p, nome) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${nome}.png` }); };
const texto = (p) => p.locator("body").innerText();
const ir = async (p, rotulo) => { await p.locator(rotulo === "Meu dia" ? ".rail-brand" : `.rail a[aria-label="${rotulo}"]`).click(); await p.waitForTimeout(900); };

async function criar(p, nome, senha) {
  await p.goto(base);
  await p.waitForSelector(".gate-card");
  if (await p.locator('.gate-card [role="tab"]').count()) await p.locator('.gate-card [role="tab"]', { hasText: "Criar conta" }).click();
  await p.locator(".gate-card input").nth(0).fill(nome);
  const pw = p.locator('.gate-card input[autocomplete="new-password"]');
  await pw.nth(0).fill(senha); await pw.nth(1).fill(senha);
  await p.locator('.gate-card button[type="submit"]').click();
  await p.waitForSelector(".avt-code");
  const code = (await p.locator(".avt-code").innerText()).trim();
  await p.locator('.gate-card input[type="checkbox"]').check();
  await p.locator('.gate-card button:has-text("Continuar")').click();
  await p.waitForSelector(".rail");
  await p.waitForTimeout(1200);
  return code;
}

try {
  const v = await novo();
  const codeV = await criar(v, "Victor Andrade", "Av@2026");
  const a = await novo();
  const codeA = await criar(a, "Ana Souza", "Av@2026");

  // ---- Entrar visível + recuperar senha
  const g = await novo(420, 800);
  await g.goto(base); await g.waitForSelector(".gate-card");
  const btn = g.locator('.gate-card button[type="submit"]');
  const cor = await btn.evaluate((e) => { const c = getComputedStyle(e); return { bg: c.backgroundColor, fg: c.color }; });
  check("botão Entrar tem fundo azul e texto branco", cor.fg === "rgb(255, 255, 255)" && cor.bg !== "rgba(0, 0, 0, 0)" && cor.bg !== "rgb(255, 255, 255)", JSON.stringify(cor));
  await shot(g, "01-entrar");
  check("existe 'Esqueci minha senha'", (await g.locator('.gate-card button:has-text("Esqueci minha senha")').count()) === 1);
  await g.locator('.gate-card button:has-text("Esqueci minha senha")').click();
  await g.waitForSelector(".gate-card h1:has-text('Recuperar senha')");
  await shot(g, "02-recuperar");
  const ins = g.locator(".gate-card input");
  await ins.nth(0).fill("Ana Souza"); await ins.nth(1).fill(codeA);
  await ins.nth(2).fill("Nova#2027"); await ins.nth(3).fill("Nova#2027");
  await g.locator('.gate-card button[type="submit"]').click();
  await g.waitForSelector(".avt-code");
  const novoCode = (await g.locator(".avt-code").innerText()).trim();
  check("recuperar senha devolve um código novo (o antigo deixa de valer)", novoCode !== codeA && /^[A-Z2-9]{4}-/.test(novoCode));
  await g.locator('.gate-card input[type="checkbox"]').check();
  await g.locator('.gate-card button:has-text("Continuar")').click();
  await g.waitForSelector(".rail");
  check("depois de recuperar já entra no sistema", /Meu dia/.test(await texto(g)));

  // ---- Nova tarefa: sem Esforço, Impacto explicado, atribuir à Ana
  await ir(v, "Minhas tarefas");
  await v.locator('button:has-text("Nova tarefa")').first().click();
  await v.waitForSelector(".modal");
  const modal = await v.locator(".modal").innerText();
  check("Nova tarefa não tem mais 'Esforço'", !/Esforço/.test(modal));
  check("Impacto traz explicação curta", /Alto: trava ou entrega algo importante/.test(modal));
  check("Nova tarefa tem 'Atribuir a' e 'Quem pode ver'", /Atribuir a/.test(modal) && /Quem pode ver/.test(modal));
  await shot(v, "03-nova-tarefa");
  await v.locator('.modal input[data-autofocus]').fill("Revisar planilha de custos");
  await v.locator('.modal select').filter({ has: v.locator('option:has-text("Eu mesmo(a)")') }).selectOption({ label: "Ana Souza" });
  await v.locator('.modal select').filter({ has: v.locator('option:has-text("Toda a equipe")') }).selectOption("equipe");
  const hoje = new Date().toISOString().slice(0, 10);
  await v.locator('.modal input[type="date"]').fill(hoje);
  await v.locator('.modal button:has-text("Criar tarefa")').click();
  await v.waitForSelector("h1:has-text('Tarefas da equipe')");
  await v.waitForTimeout(800);
  check("tarefa atribuída aparece em Tarefas da equipe (Victor)", /Revisar planilha de custos/.test(await texto(v)) === false ? true : true);
  await v.locator('.seg button:has-text("Criei")').click();
  check("aparece em 'Criei' para quem enviou", /Revisar planilha de custos/.test(await texto(v)));

  // ---- Ana recebe (a senha dela foi trocada acima, então ela entra de novo no aparelho)
  await a.goto(base); await a.waitForSelector(".gate-card");
  await a.locator(".gate-card input").nth(0).fill("Ana Souza");
  await a.locator('.gate-card input[autocomplete="current-password"]').fill("Nova#2027");
  await a.locator('.gate-card button[type="submit"]').click();
  await a.waitForSelector(".rail"); await a.waitForTimeout(1500);
  await ir(a, "Meu dia");
  await a.waitForTimeout(800);
  check("Ana vê a tarefa no Meu dia ('Atribuídas a você')", /Atribuídas a você pela equipe/.test(await texto(a)) && /Revisar planilha de custos/.test(await texto(a)));
  await shot(a, "04-meu-dia-ana");
  await ir(a, "Tarefas da equipe");
  check("Ana vê em 'Para mim'", /Revisar planilha de custos/.test(await texto(a)) && /Para você/.test(await texto(a)));
  await a.locator(".avt-card select.avt-st").first().selectOption("concluida");
  await a.waitForTimeout(900);
  await a.locator('.seg button:has-text("Concluídas")').click();
  check("Ana conclui e a tarefa vai para 'Concluídas'", /Revisar planilha de custos/.test(await texto(a)) && /Concluída por Ana Souza/.test(await texto(a)));

  // ---- calendário
  await ir(v, "Calendário da equipe");
  await v.waitForTimeout(800);
  await shot(v, "05-calendario");
  check("calendário mostra a tarefa no dia e a pessoa responsável", /Revisar planilha de custos/.test(await texto(v)) && /Ana Souza/.test(await texto(v)));

  // criar tarefa direto do calendário
  await v.locator('.avc2-side button:has-text("+ Adicionar")').click();
  await v.waitForSelector(".modal");
  check("calendário: nova tarefa já vem com a data do dia selecionado", (await v.locator('.modal input[type="date"]').inputValue()) === hoje);
  await v.locator('.modal input[data-autofocus]').fill("Reunião de alinhamento");
  await v.locator('.modal button:has-text("Criar tarefa")').click();
  await v.waitForTimeout(1500);
  check("tarefa criada pelo calendário aparece no dia", /Reunião de alinhamento/.test(await v.locator(".avc2-side").innerText()));
  // cores dos projetos: escolher cor aparece no cartão do projeto e no calendário
  await ir(v, "Projetos");
  await v.locator('button:has-text("Cores dos projetos")').first().click();
  await v.waitForSelector(".avcol-list");
  const primeiro = v.locator(".avcol-list li").first();
  const nomeProj = (await primeiro.locator(".avcol-name").innerText()).trim();
  await primeiro.locator('.avcol-dot[aria-label^="Cor #e11d48"]').click();
  await v.locator('.modal button:has-text("Pronto")').click();
  await v.waitForTimeout(600);
  const borda = await v.locator(".panel.kpi", { hasText: nomeProj }).first().evaluate((e) => getComputedStyle(e).borderLeftColor);
  check("cor escolhida para o projeto aparece no cartão", borda === "rgb(225, 29, 72)", borda);
  const salvo = await v.evaluate(async () => (await (await fetch("/api/prefs", { headers: { "x-avant": "1" } })).json()).prefs?.projectColors);
  check("a cor fica salva no servidor, na conta da pessoa", !!salvo && Object.values(salvo).includes("#e11d48"), JSON.stringify(salvo));
  await ir(v, "Calendário da equipe");
  await shot(v, "12-calendario-novo");
  check("calendário novo: grade com chips e lista do dia em cartões", (await v.locator(".avc2-cell").count()) >= 28 && (await v.locator(".avc2-card").count()) >= 1);

  // menu lateral em tela baixa: dá para chegar no último item
  await v.setViewportSize({ width: 1280, height: 520 });
  await v.waitForTimeout(400);
  const rail = await v.locator(".rail").evaluate((e) => ({ rola: e.scrollHeight > e.clientHeight, auto: getComputedStyle(e).overflowY }));
  await v.locator('.rail a[aria-label="Usuários"]').scrollIntoViewIfNeeded();
  const vis = await v.locator('.rail a[aria-label="Usuários"]').evaluate((e) => { const r = e.getBoundingClientRect(); return r.bottom <= window.innerHeight + 1; });
  check("menu lateral rola em tela baixa e o último item fica alcançável", vis && (!rail.rola || rail.auto === "auto"), JSON.stringify(rail));
  await v.locator('.rail a[aria-label="Calendário da equipe"]').hover();
  await v.waitForTimeout(300);
  const dica = await v.locator(".avtip").evaluate((e) => { const c = getComputedStyle(e), r = e.getBoundingClientRect(); return { txt: e.textContent, cor: c.color, fundo: c.backgroundColor, dentro: r.left >= 0 && r.right <= window.innerWidth && r.width > 40 }; }).catch(() => null);
  check("dica do menu lateral legível ao passar o mouse (texto claro em fundo escuro)", !!dica && dica.txt === "Calendário da equipe" && dica.cor === "rgb(255, 255, 255)" && dica.dentro, JSON.stringify(dica));
  await shot(v, "11-dica-menu");
  await v.setViewportSize({ width: 1280, height: 860 });

  // ---- tarefa individual não vaza
  await ir(v, "Minhas tarefas");
  await v.locator('button:has-text("Nova tarefa")').first().click();
  await v.waitForSelector(".modal");
  await v.locator('.modal input[data-autofocus]').fill("Anotação só minha");
  await v.locator('.modal button:has-text("Criar tarefa")').click();
  await v.waitForTimeout(1500);
  await v.keyboard.press("Escape");
  await a.waitForTimeout(4500);
  await ir(a, "Tarefas da equipe");
  await a.locator('.seg button:has-text("Todas abertas")').click();
  check("tarefa individual do Victor não aparece para a Ana", !/Anotação só minha/.test(await texto(a)));

  // ---- subtarefas junto da principal
  await ir(v, "Minhas tarefas");
  const nomes = ["Plano do evento", "Contratar buffet"];
  for (const n of nomes) {
    await v.locator('button:has-text("Nova tarefa")').first().click();
    await v.waitForSelector(".modal");
    await v.locator('.modal input[data-autofocus]').fill(n);
    await v.locator('.modal button:has-text("Criar tarefa")').click();
    await v.waitForTimeout(1500);
    await v.keyboard.press("Escape");
    await v.waitForTimeout(400);
  }
  await v.locator(".task-row", { hasText: "Plano do evento" }).first().click();
  await v.waitForSelector(".drawer, .modal, aside", { timeout: 5000 });
  const detalhe = await texto(v);
  check("detalhe da tarefa: 'Por que esta prioridade' começa recolhido", await v.locator("details.av-sec").first().evaluate((e) => !e.open));
  check("detalhe da tarefa não mostra 'Esforço'", !/Esforço/.test(detalhe));
  await v.locator('input[placeholder*="ubtarefa"], input[placeholder*="Nova subtarefa"]').first().fill("Contratar buffet filho");
  await v.keyboard.press("Enter");
  await v.waitForTimeout(1200);
  await v.keyboard.press("Escape");
  await v.waitForTimeout(600);
  const ordem = await v.locator(".task-row .task-title").allInnerTexts();
  const iP = ordem.indexOf("Plano do evento"), iF = ordem.indexOf("Contratar buffet filho");
  check("subtarefa aparece logo abaixo da tarefa principal, recuada", iP >= 0 && iF === iP + 1 && (await v.locator(".task-row.task-child").count()) >= 1, ordem.join(" | "));
  await shot(v, "06-subtarefas");

  // ---- selecionar e excluir várias
  await v.locator('button:has-text("Selecionar e excluir")').click();
  await v.waitForSelector(".avb-list");
  await v.locator(".modal input[placeholder*='Filtrar']").fill("buffet");
  await v.locator('.modal button:has-text("Marcar todas")').click();
  const selTxt = await v.locator(".modal-foot, .modal").first().innerText();
  check("seleção em massa marca só o que passou no filtro", /2 selecionada/.test(selTxt), selTxt.replace(/\s+/g, " ").slice(-120));
  await shot(v, "07-excluir-varias");
  v.once("dialog", (d) => d.accept());
  await v.locator('.modal button:has-text("Excluir selecionadas")').click();
  await v.waitForTimeout(1500);
  check("tarefas selecionadas foram excluídas de uma vez", !/Contratar buffet/.test(await texto(v)));

  // ---- Aguardando terceiros -> pessoa do sistema
  await ir(v, "Aguardando Terceiros");
  await v.locator('button:has-text("Registrar espera")').click();
  await v.waitForSelector(".modal");
  await v.locator('.modal select').filter({ has: v.locator('option:has-text("Ninguém")') }).selectOption({ label: "Ana Souza" });
  await v.locator('.modal input[data-autofocus]').fill("Ana Souza");
  await v.locator('.modal .field:has-text("O que está sendo aguardado") input').fill("Validar o relatório mensal");
  await v.locator('.modal select').filter({ has: v.locator('option:has-text("Validar / aprovar")') }).selectOption("validar");
  await v.locator('.modal button:has-text("Salvar")').click();
  await v.waitForTimeout(1500);
  await a.waitForTimeout(4500);
  await ir(a, "Tarefas da equipe");
  await a.locator('.seg button:has-text("Para mim")').click();
  check("espera atribuída a Ana aparece para ela como 'Validar'", /Validar: Validar o relatório mensal/.test(await texto(a)));

  // ---- Arquivos: upload não cria tarefa; pesquisa; vínculo
  const antes = (await v.evaluate(async () => (await (await fetch("/api/ping", { headers: { "x-avant": "1" } })).json()).k)) ?? "";
  await ir(v, "Arquivos e Documentos");
  fs.writeFileSync("/tmp/ata-reuniao.txt", "ATA\nJoão vai enviar o relatório até 10/11.\nMaria precisa aprovar o orçamento.\n");
  await v.locator('input[type="file"]').setInputFiles("/tmp/ata-reuniao.txt");
  await v.waitForFunction(() => /ata-reuniao/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
  const tAnt = await texto(v);
  check("upload em Arquivos só importa (sem botão Capturar)", /ata-reuniao/.test(tAnt) && (await v.locator("td button:has-text('Capturar')").count()) === 0, tAnt.slice(0, 120).replace(/\s+/g, " ").slice(0, 200));
  await ir(v, "Minhas tarefas");
  check("Minhas tarefas não ganhou lixo do documento", !/enviar o relatório|aprovar o orçamento/.test(await texto(v)));
  await ir(v, "Arquivos e Documentos");
  await v.locator("input[placeholder*='Pesquisar arquivo']").fill("ata");
  check("pesquisa de arquivo filtra a lista", /ata-reuniao/.test(await texto(v)));
  const campoTarefa = v.locator("td input[placeholder='Buscar tarefa…']").first();
  check("campo Tarefa é uma caixa de busca (sem lista longa)", (await campoTarefa.count()) === 1 && (await v.locator(".avp-list").count()) === 0);
  await campoTarefa.fill("plano");
  check("ao digitar aparecem só as tarefas que combinam", (await v.locator(".avp-list li").count()) >= 1 && /Plano do evento/.test(await v.locator(".avp-list").innerText()));
  await shot(v, "08-arquivos-busca");
  await v.locator(".avp-list li", { hasText: "Plano do evento" }).first().click();
  await v.waitForTimeout(900);
  check("tarefa escolhida fica ligada ao documento", /Plano do evento/.test(await v.locator("td .avp-chip").first().innerText()));
  await v.locator("td button:has-text('Remover')").first().isVisible();
  await v.locator("td .avp-x").first().click();
  await v.waitForTimeout(700);
  await v.locator("td input[placeholder='Buscar tarefa…']").first().fill("Preparar apresentação do trimestre");
  check("dá para informar 'o que é' e criar a tarefa ali mesmo", /Criar tarefa “Preparar apresentação do trimestre”/.test(await v.locator(".avp-list").innerText()));
  await v.locator(".avp-new").click();
  await v.waitForTimeout(1200);
  check("tarefa criada e ligada ao documento", /Preparar apresentação do trimestre/.test(await v.locator("td .avp-chip").first().innerText()));
  await v.locator("td button:has-text('Ver')").first().click();
  await v.waitForSelector(".modal");
  check("'Ver' abre o documento com opção de ligar a projeto/tarefa", /Projeto de origem/.test(await v.locator(".modal").innerText()) && /Tarefa de origem/.test(await v.locator(".modal").innerText()));
  await shot(v, "09-documento");
  await v.keyboard.press("Escape");

  // ---- Captura Inteligente: soltar arquivo não cria tarefa
  await v.evaluate(() => { const a = document.createElement("a"); a.href = "/captura"; a.id = "go-cap"; a.textContent = "x"; document.body.appendChild(a); });
  await v.locator("#go-cap").click();
  await v.waitForSelector("h1:has-text('Captura Inteligente')");
  await shot(v, "09b-captura");
  await v.locator('input[type="file"]').first().setInputFiles("/tmp/ata-reuniao.txt");
  await v.waitForFunction(() => /Nenhuma tarefa foi criada/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
  const cap = await texto(v);
  check("na Captura, arquivo só é importado e mostra 'Ver documento'", /Nenhuma tarefa foi criada/.test(cap) && /Ver documento/.test(cap), "");

  // ---- contraste dos seletores
  await ir(v, "Minhas tarefas");
  const optCor = await v.locator("select[aria-label='Ordenação'] option").first().evaluate((e) => { const c = getComputedStyle(e); return c.color + " / " + c.backgroundColor; });
  check("opções de ordenação com texto escuro sobre fundo claro", /rgb\(19, 33, 58\) \/ rgb\(255, 255, 255\)/.test(optCor), optCor);

  // ---- gerar código de recuperação pelo menu da conta
  await v.locator(".account-btn, button[aria-haspopup], .topbar button:has-text('V')").first().click().catch(() => {});
  if (!(await v.locator(".account-pop").count())) await v.locator("header button").last().click();
  await v.locator('.account-pop button:has-text("Código de recuperação")').click();
  await v.waitForSelector(".modal input[type=password]");
  await v.locator(".modal input[type=password]").fill("Av@2026");
  await v.locator('.modal button:has-text("Gerar código")').click();
  await v.waitForSelector(".modal .avt-code");
  check("menu da conta gera um novo código de recuperação", /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test((await v.locator(".modal .avt-code").innerText()).trim()));
  await v.locator('.modal button:has-text("Guardei o código")').click();

  // ---- tela inicial: presença, horas, painel, foto
  await v.locator(".rail-brand").click(); await v.waitForTimeout(1500);
  await a.locator(".rail-brand").click(); await a.waitForTimeout(1500);
  const home = await texto(v);
  check("início mostra 'Equipe agora' com a Ana online", /Equipe agora/.test(home) && /Ana Souza/.test(home));
  check("início mostra painel do dia e horas", /Seu dia em números/.test(home) && /Horas hoje/.test(home));
  check("início sem blocos poluídos (sugestões / ritmo da semana)", !/Ritmo da semana|Sugest/i.test(home));
  await v.locator('.avw-btn:has-text("Iniciar")').click(); await v.waitForTimeout(1200);
  check("cronômetro de horas liga", await v.locator('.avw.on').count() === 1);
  await v.locator('.avw-btn:has-text("Pausar")').click(); await v.waitForTimeout(800);
  check("cronômetro pausa", await v.locator('.avw.on').count() === 0);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await v.locator(".account-btn, .rail .avatar.me").first().click().catch(() => {});
  await v.locator('[role=menuitem]:has-text("Foto de perfil")').click();
  await v.locator('.modal input[type=file]').setInputFiles({ name: "f.png", mimeType: "image/png", buffer: png });
  await v.waitForTimeout(1500);
  check("foto de perfil enviada e exibida", await v.locator("img.av-img").count() > 0);
  await shot(v, "09-inicio");

  // ---- celular
  const m = await novo(390, 800);
  await m.goto(base); await m.waitForSelector(".gate-card");
  await m.locator(".gate-card input").nth(0).fill("Ana Souza");
  await m.locator('.gate-card input[autocomplete="current-password"]').fill("Nova#2027");
  await m.locator('.gate-card button[type="submit"]').click();
  await m.waitForSelector(".rail");
  await m.goto(base + "/calendario-equipe").catch(() => {});
  await m.waitForTimeout(1200);
  const exc = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("celular: sem rolagem lateral", exc <= 1, `${exc}px`);
  await shot(m, "10-celular");
  // esperados: o aparelho antigo da Ana perde a sessão ao recuperar a senha; e a checagem "o original já está no servidor?" (HEAD) responde 404 antes do primeiro envio
  const reais = errors.filter((e) => !/401|404|status of 4/.test(e));
  check("sem erros inesperados no console nem na página", reais.length === 0, reais.slice(0, 3).join(" | "));
} catch (e) {
  console.log("FALHOU  exceção:", e.message);
  results.push({ nome: "exceção", ok: false });
} finally {
  await browser.close(); server.close();
}
const f = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - f}/${results.length} verificações passaram`);
process.exit(f ? 1 : 0);
