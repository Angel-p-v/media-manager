import { mkdirSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { migrations, type Migration } from './migrations/index.js';
import { DbError } from '../../shared/errors.js';

export type Db = Database.Database;

/** Abre (o crea) la base de datos y aplica las pragmas de la aplicación. */
export function openDatabase(dbPath: string): Db {
  if (dbPath !== ':memory:') {
    try {
      mkdirSync(path.dirname(dbPath), { recursive: true });
    } catch (error) {
      throw new DbError(
        `No se pudo crear la carpeta de la base de datos: ${(error as Error).message}`,
        {
          cause: error,
        },
      );
    }
  }

  let db: Db;
  try {
    db = new Database(dbPath);
  } catch (error) {
    throw new DbError(`No se pudo abrir la base de datos: ${(error as Error).message}`, {
      cause: error,
    });
  }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  runMigrations(db);
  return db;
}

/**
 * Aplica las migraciones pendientes. Es idempotente: aplicada una vez, una migración
 * con la misma versión no se vuelve a ejecutar.
 */
export function runMigrations(db: Db, pending: readonly Migration[] = migrations): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const applied = new Set(
    db
      .prepare<[], { version: number }>('SELECT version FROM schema_migrations')
      .all()
      .map((row) => row.version),
  );

  for (const migration of [...pending].sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue;

    try {
      db.exec('BEGIN');
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(
        migration.version,
        migration.name,
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new DbError(
        `Falló la migración ${migration.version} (${migration.name}): ${(error as Error).message}`,
        { cause: error },
      );
    }
  }
}

/** Cierra la base de datos de forma segura. */
export function closeDatabase(db: Db): void {
  if (db.open) db.close();
}
