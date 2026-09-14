import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export class Database {
  readonly connection: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
    this.connection = new DatabaseSync(filename, { timeout: 5000 });
    this.connection.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, username TEXT NOT NULL, normalized TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id), token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL, absolute_expires_at INTEGER NOT NULL,
        writer_id TEXT, writer_epoch INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name_key TEXT NOT NULL,
        profile TEXT NOT NULL, deleted_at INTEGER,
        UNIQUE(user_id, id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS character_names ON characters(user_id,name_key) WHERE deleted_at IS NULL;
      CREATE TABLE IF NOT EXISTS stashes (user_id TEXT PRIMARY KEY REFERENCES users(id), state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (
        session_id TEXT NOT NULL, operation_id TEXT NOT NULL, request_hash TEXT NOT NULL,
        result TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(session_id,operation_id)
      );
      CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS remembered_logins (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS remembered_login_expiry ON remembered_logins(expires_at);
      INSERT OR IGNORE INTO migrations VALUES (1);
      INSERT OR IGNORE INTO migrations VALUES (2);`);
  }
  get<T>(sql: string, ...values: SQLInputValue[]): T | undefined { return this.connection.prepare(sql).get(...values) as T | undefined; }
  all<T>(sql: string, ...values: SQLInputValue[]): T[] { return this.connection.prepare(sql).all(...values) as T[]; }
  run(sql: string, ...values: SQLInputValue[]) { return this.connection.prepare(sql).run(...values); }
  transaction<T>(operation: () => T): T {
    this.connection.exec('BEGIN IMMEDIATE');
    try { const result = operation(); this.connection.exec('COMMIT'); return result; }
    catch (error) { this.connection.exec('ROLLBACK'); throw error; }
  }
  close() { this.connection.close(); }
}
