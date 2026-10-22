// Conexão SQLite no Node (módulo nativo node:sqlite).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from './migrations';
import { DB, migrate } from './tx';

export type { DB } from './tx';
export { dryRun, transaction } from './tx';

export function openDatabase(file: string): DB & { close(): void } {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db as unknown as DB, MIGRATIONS);
  return db as unknown as DB & { close(): void };
}
