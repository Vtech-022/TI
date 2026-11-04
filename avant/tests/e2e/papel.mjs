// Papéis de parede: seletor com miniaturas, todos os estilos desenham sem erro e aparecem atrás dos cartões.
// Uso:  NODE_PATH=/opt/npm-tools/node_modules node tests/e2e/papel.mjs [pasta-de-capturas]
import { createRequire } from "node:module";
import { startServer } from "../local-server.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const SHOTS = process.argv[2] || "";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASSOU" : "FALHOU"}  ${n}${d ? "  -> " + d : ""}`); };
const { server, port } = await startServer(0);
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await p.goto(base);
  await p.waitForSelector(".gate-card");
  if (await p.locator('.gate-card [role="tab"]').count()) await p.locator('.gate-card [role="tab"]', { hasText: "Criar conta" }).click();
  await p.locator(".gate-card input").nth(0).fill("Victor Andrade");
  const pw = p.locator('.gate-card input[autocomplete="new-password"]');
  await pw.nth(0).fill("Av@2026"); await pw.nth(1).fill("Av@2026");
  await p.locator('.gate-card button[type="submit"]').click();
  await p.waitForSelector(".avt-code");
  await p.locator('.gate-card input[type="checkbox"]').check();
  await p.locator('.gate-card button:has-text("Continuar")').click();
  await p.waitForSelector(".rail");
  await p.waitForTimeout(800);
  await p.locator('button[aria-label*="ersonaliz"]').first().click();
  await p.waitForSelector(".pzw-grid");
  const itens = await p.locator(".pzw-it").count();
  check("seletor mostra 16 opções (liso + 15 estilos)", itens === 16, String(itens));
  await p.waitForTimeout(400);
  const vazias = await p.evaluate(() => [...document.querySelectorAll(".pzw-cv")].filter((c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 8) n++; return n < 20; }).map((c) => c.closest(".pzw-it").getAttribute("aria-label")));
  check("todas as miniaturas desenham algo", vazias.length === 0, vazias.join(", "));
  await p.locator(".pzw-grid").scrollIntoViewIfNeeded();
  if (SHOTS) await p.locator(".pzw").screenshot({ path: `${SHOTS}/wp-grade.png` });
  if (SHOTS) await p.locator(".modal-personalize, .pzy").first().screenshot({ path: `${SHOTS}/wp-painel.png` });
  for (const nome of ["Galáxia", "Gradiente vivo", "Retrô neon", "Colmeia", "Vaga-lumes", "Feixes de luz", "Névoa", "Camadas", "Confete"]) {
    await p.locator(`.pzw-it[aria-label="Papel de parede: ${nome}"]`).click();
    await p.waitForTimeout(700);
  }
  await p.locator(`.pzw-it[aria-label="Papel de parede: Gradiente vivo"]`).click();
  await p.keyboard.press("Escape");
  await p.waitForTimeout(1200);
  const vis = await p.evaluate(() => {
    const c = document.querySelector("canvas.wallpaper"); if (!c) return { canvas: false };
    const main = [document.getElementById("root"), document.querySelector("#root .main")].map((e) => getComputedStyle(e).backgroundColor).join("|");
    return { canvas: true, op: getComputedStyle(c).opacity, main };
  });
  check("papel de parede aparece (canvas visível e área principal transparente)", vis.canvas && +vis.op > .5 && vis.main === "rgba(0, 0, 0, 0)|rgba(0, 0, 0, 0)", JSON.stringify(vis));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/wp-claro-gradiente.png` });
  await p.locator('.topbar button[aria-label*="scuro"], .topbar button[aria-label*="tema"]').first().click().catch(() => {});
  await p.waitForTimeout(1500);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/wp-escuro-gradiente.png` });
  check("sem erros no console", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close(); server.close();
  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} verificações passaram`);
  process.exitCode = ok === results.length ? 0 : 1;
}
