import type { DB } from './db/tx';
import { dateInTz } from './domain/dates';

export interface Ctx {
  db: DB;
  tz: string;
  dataDir: string;
  maxUploadBytes: number;
  now: () => Date;
}

export const today = (ctx: Ctx) => dateInTz(ctx.now(), ctx.tz);
export const nowIso = (ctx: Ctx) => ctx.now().toISOString();

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, 'nao_encontrado', `${what} não encontrado(a).`);
