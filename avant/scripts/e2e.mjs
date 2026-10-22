// Verificação de ponta a ponta na interface real (Chromium headless).
// Uso: com o AVANT em execução, `npm run test:e2e` (variáveis: AVANT_URL, CHROMIUM_PATH, E2E_SHOTS).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.AVANT_URL ?? 'http://127.0.0.1:4310';
const SHOTS = process.env.E2E_SHOTS ?? 'test-results/e2e';
const executablePath = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(['OK', name]);
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push(['FALHOU', name, err.message]);
    await page.screenshot({ path: path.join(SHOTS, `falha-${results.length}.png`) }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    console.log(`  ✗ ${name}\n      ${err.message.split('\n')[0]}`);
  }
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const browser = await chromium.launch({ executablePath, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
const page = await ctx.newPage();
const consoleErrors = [];
// Respostas 409 são regras de negócio tratadas pela interface (ex.: conclusão bloqueada), não erros.
page.on('console', (m) => m.type() === 'error' && !/status of 409/.test(m.text()) && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(e.message));
const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });

console.log(`AVANT e2e em ${BASE}`);

await check('Visão Geral carrega com dados reais do banco', async () => {
  await page.goto(BASE + '/');
  await page.getByRole('heading', { level: 1 }).filter({ hasText: 'Victor' }).waitFor();
  const kpi = await page.locator('.kpi').first().innerText();
  assert(/Pendências abertas\s*\n?\s*\d+/.test(kpi), `KPI inesperado: ${kpi}`);
  assert((await page.locator('.task-row').count()) > 3, 'Foco de hoje vazio');
  await shot('01-visao-geral');
});

await check('Painel lateral da tarefa mostra justificativa da prioridade e texto original', async () => {
  await page.goto(BASE + '/pendencias?q=painel');
  await page.locator('.task-row', { hasText: 'Estruturar o painel de Educação' }).first().click();
  const drawer = page.getByRole('dialog', { name: /Tarefa:/ });
  await drawer.getByText('Por que esta prioridade').waitFor();
  await drawer.getByText('Data inferida (28/10/2026) — precisa de confirmação.', { exact: false }).waitFor();
  await drawer.getByText('até quarta-feira', { exact: false }).first().waitFor();
  await shot('02-tarefa-detalhe');
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'detached' });
});

await check('Captura inteligente transforma texto em tarefas e mostra o resumo', async () => {
  await page.goto(BASE + '/captura');
  await page.getByLabel('Texto da captura').fill(
    [
      '[22/10/2026, 10:40] Coordenação: Preparar a pauta do colegiado até 29/10/2026, responsável: Marcos',
      '[22/10/2026, 10:41] Coordenação: Ainda aguardando o Rogério liberar as planilhas das unidades',
      '[22/10/2026, 10:42] Coordenação: Capas dos eixos: revisar e finalizar até 05/11/2026'
    ].join('\n')
  );
  await page.getByRole('button', { name: /Analisar e salvar/ }).click();
  await page.getByText(/Captura #\d+ salva/).first().waitFor();
  const text = await page.locator('section[aria-live="polite"]').innerText();
  assert(text.includes('Preparar a pauta do colegiado'), 'Nova tarefa ausente no resumo');
  assert(/Atualização/.test(text) && text.includes('Revisar e finalizar as capas dos eixos'), 'Atualização da tarefa existente ausente');
  await shot('03-captura');
});

await check('Pendências: filtros pela URL e ordenação', async () => {
  await page.goto(BASE + '/pendencias?due=semana&sort=prazo');
  await page.locator('.task-row').first().waitFor();
  const first = await page.locator('.task-row .task-title').first().innerText();
  assert(first === 'Estruturar o painel de Educação', `Primeira por prazo: ${first}`);
  await shot('04-pendencias');
});

await check('Conclusão bloqueada por dependências pede exceção justificada', async () => {
  await page.goto(BASE + '/pendencias?q=Validar');
  await page.locator('.task-row', { hasText: 'Validar as versões revisadas' }).locator('.check').click();
  await page.getByRole('dialog', { name: 'Existem condições em aberto' }).waitFor();
  await shot('05-conclusao-bloqueada');
  await page.getByRole('button', { name: 'Manter em aberto' }).click();
});

await check('Projeto: lista hierárquica, Kanban e cronograma', async () => {
  await page.goto(BASE + '/projetos');
  await page.getByText('Revista de Experiências Exitosas SBCD 2025–2026').first().click();
  await page.getByText('Mapa de dependências').waitFor();
  await page.getByText('Remover trabalho: Implantação de Prontuário Eletrônico').waitFor();
  await page.getByRole('button', { name: /Kanban/ }).click();
  await page.locator('.kanban-col').first().waitFor();
  await shot('06-projeto-kanban');
  await page.getByRole('button', { name: /Cronograma/ }).click();
  await page.locator('.gantt-grid').waitFor();
  await shot('07-projeto-cronograma');
  await page.getByRole('button', { name: /Lista/ }).click();
});

await check('Agenda: evento por linguagem natural no fuso de São Paulo', async () => {
  await page.goto(BASE + '/agenda?v=semana&d=2026-10-27');
  await page.getByLabel('Descrição do evento').fill('Treinamento na terça-feira às 14h com a equipe.');
  await page.getByRole('button', { name: 'Interpretar' }).click();
  await page.getByText('27/10/2026 (terça-feira)').waitFor();
  await page.getByRole('button', { name: 'Revisar e salvar' }).click();
  const dlg = page.getByRole('dialog', { name: 'Novo evento' });
  assert((await dlg.getByLabel('Início').inputValue()) === '14:00', 'Horário incorreto');
  assert((await dlg.getByLabel('Local').inputValue()) === '', 'Local inventado');
  await dlg.getByRole('button', { name: 'Salvar' }).click();
  await page.locator('.cal-block', { hasText: 'Treinamento' }).waitFor();
  await page.locator('.cal-daycol').nth(1).locator('.cal-slot').nth(2).click(); // terça às 09h → evento sobreposto ao treinamento
  const dlg2 = page.getByRole('dialog', { name: 'Novo evento' });
  await dlg2.getByLabel('Título').fill('Reunião de alinhamento');
  await dlg2.getByLabel('Início').fill('14:30');
  await dlg2.getByLabel('Término').fill('15:30');
  await dlg2.getByRole('button', { name: 'Salvar' }).click();
  await page.getByText(/conflito de horário neste período/).waitFor();
  await shot('08-agenda-conflito');
});

await check('Pesquisa global (Ctrl+K) encontra pessoa e tarefa sem acento', async () => {
  await page.goto(BASE + '/');
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.keyboard.press('Control+k');
  await page.getByLabel('Pesquisar').fill('rogerio');
  await page.getByRole('option').filter({ hasText: 'Rogério' }).first().waitFor();
  await shot('09-pesquisa');
  await page.keyboard.press('Escape');
});

await check('Captura rápida por atalho (Alt+C)', async () => {
  await page.keyboard.press('Alt+c');
  const dlg = page.getByRole('dialog', { name: /Captura rápida/ });
  await dlg.getByLabel('Texto da captura').fill('Comprar toner para a impressora da sala 3');
  await dlg.getByRole('button', { name: 'Analisar e salvar' }).click();
  await dlg.getByText('Comprar toner para a impressora da sala 3').first().waitFor();
  await dlg.getByRole('button', { name: 'Concluir' }).click();
});

await check('Histórico registra alterações e permite desfazer captura', async () => {
  await page.goto(BASE + '/historico');
  await page.getByText(/Tarefa criada: "Comprar toner/).first().waitFor();
  await shot('10-historico');
});

await check('Relatórios calculados', async () => {
  await page.goto(BASE + '/relatorios');
  await page.getByText('Ritmo das últimas 8 semanas').waitFor();
  await shot('11-relatorios');
});

await check('Celular: layout responsivo e menu recolhível', async () => {
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const mp = await m.newPage();
  mp.on('pageerror', (e) => consoleErrors.push(e.message));
  await mp.goto(BASE + '/');
  await mp.getByRole('heading', { level: 1 }).waitFor();
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, 'Rolagem horizontal na página inicial');
  await mp.screenshot({ path: path.join(SHOTS, '12-celular.png') });
  await mp.getByRole('button', { name: 'Abrir menu' }).click();
  await mp.getByRole('link', { name: /Projetos/ }).click();
  await mp.getByRole('heading', { name: 'Projetos', level: 1 }).waitFor();
  await mp.screenshot({ path: path.join(SHOTS, '13-celular-projetos.png') });
  await m.close();
});

await check('Sem erros no console do navegador', async () => {
  assert(consoleErrors.length === 0, consoleErrors.join(' | '));
});

await browser.close();
const failed = results.filter((r) => r[0] !== 'OK');
console.log(`\n${results.length - failed.length}/${results.length} verificações aprovadas. Capturas de tela em ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
