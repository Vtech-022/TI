// Ponto de entrada do servidor AVANT.
import path from 'node:path';
import { buildApp } from './app';
import { loadConfig } from './config';
import type { Ctx } from './context';
import { openDatabase } from './db/database';
import { seed } from './seed';
import { recomputePriorities } from './services/tasks';

async function main() {
  const config = loadConfig();
  const db = openDatabase(path.join(config.dataDir, 'avant.db'));
  const ctx: Ctx = { db, tz: config.tz, dataDir: config.dataDir, maxUploadBytes: config.maxUploadBytes, now: () => new Date() };
  if (seed(ctx)) console.log('AVANT: carga inicial das nove frentes de trabalho registrada.');
  recomputePriorities(ctx);
  // Prioridades dependem da data: recalcula a cada hora para refletir a virada do dia.
  setInterval(() => recomputePriorities(ctx), 60 * 60 * 1000).unref();
  const app = await buildApp({ ctx, staticDir: config.staticDir, logger: process.env.AVANT_LOG === '1' });
  await app.listen({ port: config.port, host: config.host });
  console.log(`AVANT — Central Inteligente de Gestão: http://${config.host}:${config.port}`);
  console.log(`Dados em ${config.dataDir} · fuso ${config.tz}`);
  const shutdown = async () => {
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Falha ao iniciar o AVANT:', err);
  process.exit(1);
});
