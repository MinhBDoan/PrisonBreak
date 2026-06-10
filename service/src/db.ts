import Database from "better-sqlite3";

export type ServiceDatabase = Database.Database;

export function createDatabase(filename: string): ServiceDatabase {
  const database = new Database(filename);
  database.pragma("foreign_keys = ON");
  try {
    database.pragma("journal_mode = WAL");
  } catch {
    // Some SQLite targets, including certain in-memory configurations, cannot use WAL.
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_json TEXT NOT NULL,
      outcome TEXT,
      duration_ms INTEGER,
      completion_idempotency_key TEXT UNIQUE,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS run_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      event_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_run_events_run_id_id ON run_events(run_id, id);
    CREATE TABLE IF NOT EXISTS adaptations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER REFERENCES runs(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      report_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS completion_requests (
      idempotency_key TEXT PRIMARY KEY,
      run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      outcome TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return database;
}
