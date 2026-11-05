// Auditoria visual: entra, cria dados de exemplo e fotografa telas em vários temas/modos.
// Uso: NODE_PATH=/opt/npm-tools/node_modules node tests/e2e/auditoria.mjs <pasta> [temas] [modos] [paginas]
import { createRequire } from "node:module";
import { startServer } from "../local-server.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const OUT = process.argv[2];
const TEMAS = (process.argv[3] || "Padrão Zênite,Coral,Elétrico,Monocromático,Ouro").split(",");
const MODOS = (process.argv[4] || "Claro,Escuro").split(",");
const PAGS = (process.argv[5] || "Home,Atividades da equipe,Calendário da equipe,Minhas tarefas").split(",");
const WALL = process.env.WALL || "";
const { server, port } = await startServer(0);
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();
async function conta(p, nome) {
  await p.goto(base); await p.waitForSelector(".gate-card");
  if (await p.locator('.gate-card [role="tab"]').count()) await p.locator('.gate-card [role="tab"]', { hasText: "Criar conta" }).click();
  await p.locator(".gate-card input").nth(0).fill(nome);
  const pw = p.locator('.gate-card input[autocomplete="new-password"]'); await pw.nth(0).fill("Av@2026"); await pw.nth(1).fill("Av@2026");
  await p.locator('.gate-card button[type="submit"]').click(); await p.waitForSelector(".avt-code");
  await p.locator('.gate-card input[type="checkbox"]').check(); await p.locator('.gate-card button:has-text("Continuar")').click();
  await p.waitForSelector(".rail"); await p.waitForTimeout(800);
}
try {
  const v = await (await browser.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
  const errs = []; v.on("pageerror", (e) => errs.push(e.message));
  await conta(v, "Victor Andrade");
  const a = await (await browser.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
  await conta(a, "Lara Souza");
  // dados de exemplo
  for (const t of ["Revisar planilha da revista", "Enviar relatório mensal", "Preparar treinamento NR-32"]) {
    await v.locator(".quick-add input").fill(t); await v.locator(".quick-add input").press("Enter"); await v.waitForTimeout(350);
  }
  await v.evaluate(async () => {
    const team = await (await fetch("/api/team", { headers: { "x-avant": "1" } })).json();
    for (const p of team.people) {
      const items = [
        { id: "c" + p.id.slice(-4) + "1", title: "Atualizar painel de Educação", status: "a_fazer", kind: null, project: "Painel de Educação" },
        { id: "c" + p.id.slice(-4) + "2", title: "Revisar capas da revista", status: "em_andamento", project: "Revista" },
        { id: "c" + p.id.slice(-4) + "3", title: "Fechar lista de presença", status: "concluida" }];
      await fetch(`/api/team/${p.id}/cards`, { method: "POST", headers: { "x-avant": "1", "content-type": "application/json" }, body: JSON.stringify({ cards: items }) });
    }
  });
  await v.reload(); await v.waitForSelector(".rail"); await v.waitForTimeout(800);
  for (const tema of TEMAS) for (const modo of MODOS) {
    await v.locator('button[aria-label*="ersonaliz"]').first().click(); await v.waitForSelector(".pzy-dots");
    await v.locator(".pzy-mode button", { hasText: modo }).click();
    await v.locator(`.pzy-dot[aria-label="${tema}"]`).click();
    if (WALL) await v.locator(`.pzw-it[aria-label="Papel de parede: ${WALL}"]`).click();
    await v.waitForTimeout(500);
    if (PAGS.includes("Temas")) await v.screenshot({ path: `${OUT}/${tema}-${modo}-Temas.png` });
    await v.keyboard.press("Escape"); await v.waitForTimeout(300);
    for (const pg of PAGS.filter((x) => x !== "Temas")) {
      if (pg === "Home") await v.locator('.rail a[aria-label="Home"]').click(); else await v.locator(`.rail a[aria-label="${pg}"]`).click();
      await v.waitForTimeout(1100);
      await v.screenshot({ path: `${OUT}/${tema}-${modo}-${pg}.png` });
    }
  }
  console.log("erros:", errs.length, errs.slice(0, 3).join(" | "));
} finally { await browser.close(); server.close(); }
