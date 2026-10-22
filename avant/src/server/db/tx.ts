// Transações independentes da implementação SQLite (Node ou navegador).

export interface Statement {
  run(...args: any[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...args: any[]): unknown;
  all(...args: any[]): unknown[];
}

export interface DB {
  prepare(sql: string): Statement;
  exec(sql: string): void;
}

let depth = 0;
/** Executa `fn` atomicamente; transações aninhadas reutilizam a externa. */
export function transaction<T>(db: DB, fn: () => T): T {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    depth--;
  }
}

class Rollback extends Error {}

/** Executa `fn` e desfaz tudo ao final (pré-visualização fiel ao resultado real). */
export function dryRun<T>(db: DB, fn: () => T): T {
  if (depth > 0) throw new Error('dryRun não pode ser aninhado em outra transação');
  let result!: T;
  try {
    transaction(db, () => {
      result = fn();
      throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
  return result;
}

export function migrate(db: DB, migrations: { id: number; name: string; sql: string }[]): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const applied = new Set((db.prepare('SELECT id FROM schema_migrations').all() as { id: number }[]).map((r) => Number(r.id)));
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    transaction(db, () => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(m.id, m.name, new Date().toISOString());
    });
  }
}
