import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const DB_PATH = process.env.DB_PATH ?? './data/eli.db';

// Crear el directorio si no existe (p.ej. primer arranque)
const dir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);

// WAL mejora el rendimiento de escrituras concurrentes y reduce bloqueos
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Migración inicial: se ejecuta solo si la tabla no existe todavía.
// Para migraciones posteriores, añadir sentencias aquí o migrar a un sistema
// de migraciones como better-sqlite3-migrations cuando el esquema crezca.
db.exec(`
  CREATE TABLE IF NOT EXISTS device_bans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_hash TEXT    NOT NULL UNIQUE,
    fecha_ban   TEXT    NOT NULL,
    motivo      TEXT    NOT NULL,
    baneado_por TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_device_bans_hash
    ON device_bans(device_hash);
`);

export default db;
