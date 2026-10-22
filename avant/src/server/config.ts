import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  tz: string;
  maxUploadBytes: number;
  staticDir: string;
}

export function loadConfig(env = process.env): Config {
  const tz = env.AVANT_TIMEZONE ?? 'America/Sao_Paulo';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
  } catch {
    throw new Error(`AVANT_TIMEZONE inválido: ${tz}`);
  }
  return {
    port: Number(env.AVANT_PORT ?? 4310),
    host: env.AVANT_HOST ?? '127.0.0.1',
    dataDir: path.resolve(env.AVANT_DATA_DIR ?? 'data'),
    tz,
    maxUploadBytes: Number(env.AVANT_MAX_UPLOAD_MB ?? 15) * 1024 * 1024,
    staticDir: path.resolve(env.AVANT_STATIC_DIR ?? 'dist/client')
  };
}
