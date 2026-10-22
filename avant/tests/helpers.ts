import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/server/app';
import type { Ctx } from '../src/server/context';
import { openDatabase } from '../src/server/db/database';
import { seed } from '../src/server/seed';

/** 22/10/2026 12:00 em São Paulo (UTC−3). */
export const FIXED_NOW = new Date('2026-10-22T15:00:00.000Z');

export function makeCtx(opts: { seed?: boolean; dir?: string; now?: Date } = {}): Ctx & { dir: string } {
  const dir = opts.dir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'avant-test-'));
  const db = openDatabase(path.join(dir, 'avant.db'));
  const clock = { now: opts.now ?? FIXED_NOW };
  const ctx = { db, tz: 'America/Sao_Paulo', dataDir: dir, maxUploadBytes: 5 * 1024 * 1024, now: () => clock.now, dir };
  if (opts.seed !== false) seed(ctx);
  return ctx;
}

export async function makeApp(opts: { seed?: boolean } = {}) {
  const ctx = makeCtx(opts);
  const app = await buildApp({ ctx });
  return { ctx, app };
}

export function taskByTitle(ctx: Ctx, title: string) {
  const row = ctx.db.prepare('SELECT * FROM tasks WHERE title = ?').get(title);
  if (!row) throw new Error(`Tarefa não encontrada: ${title}`);
  return row as any;
}
