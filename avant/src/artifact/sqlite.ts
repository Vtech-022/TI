// Adaptador do sql.js (SQLite compilado para JavaScript) para a interface usada pelos serviços.
import initSqlJs from 'sql.js/dist/sql-asm-memory-growth.js';
import type { DB, Statement } from '../server/db/tx';
import { migrate } from '../server/db/tx';
import { MIGRATIONS } from '../server/db/migrations';

export interface BrowserDB extends DB {
  export(): Uint8Array;
}

const norm = (args: unknown[]) => args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? (a ? 1 : 0) : a));

export async function openBrowserDatabase(bytes?: Uint8Array | null): Promise<BrowserDB> {
  const SQL = await initSqlJs();
  const raw = bytes ? new SQL.Database(bytes) : new SQL.Database();
  const db: BrowserDB = {
    exec(sql: string) {
      raw.exec(sql);
    },
    export() {
      return raw.export();
    },
    prepare(sql: string): Statement {
      return {
        run(...args: unknown[]) {
          const st = raw.prepare(sql);
          try {
            st.run(norm(args));
          } finally {
            st.free();
          }
          const changes = raw.getRowsModified();
          const last = raw.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0;
          return { changes, lastInsertRowid: Number(last) };
        },
        get(...args: unknown[]) {
          const st = raw.prepare(sql);
          try {
            st.bind(norm(args));
            return st.step() ? st.getAsObject() : undefined;
          } finally {
            st.free();
          }
        },
        all(...args: unknown[]) {
          const st = raw.prepare(sql);
          const rows: unknown[] = [];
          try {
            st.bind(norm(args));
            while (st.step()) rows.push(st.getAsObject());
          } finally {
            st.free();
          }
          return rows;
        }
      };
    }
  };
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db, MIGRATIONS);
  return db;
}
