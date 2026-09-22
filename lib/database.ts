import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs/promises';

let db: Database | null = null;

export async function getDb() {
  if (db) return db;

  const dbPath = path.resolve(process.env.DATABASE_PATH || './data/streams.db');
  const dbDir = path.dirname(dbPath);

  try {
    await fs.mkdir(dbDir, { recursive: true });
  } catch (error) {
    console.error('Error creating database directory:', error);
  }

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      duration INTEGER,
      file_size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS streams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      video_id INTEGER REFERENCES videos(id),
      rtmp_url TEXT NOT NULL,
      quality TEXT DEFAULT '720p',
      loop_enabled BOOLEAN DEFAULT 1,
      status TEXT DEFAULT 'stopped',
      pid INTEGER,
      started_at DATETIME,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used DATETIME
    );
  `);

  // Auto-migrate videos table columns if missing
  try {
    await db.exec('ALTER TABLE videos ADD COLUMN name TEXT;');
  } catch {}
  try {
    await db.exec('ALTER TABLE videos ADD COLUMN resolution TEXT;');
  } catch {}

  // Add updated_at column if it doesn't exist
  try {
    await db.run(`ALTER TABLE streams ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
  } catch (e) {
    // Column already exists, ignore error
  }

  // Add RTMP Ingest & Receiver columns
  try {
    await db.run(`ALTER TABLE streams ADD COLUMN source_type TEXT DEFAULT 'video'`);
  } catch (e) {}

  try {
    await db.run(`ALTER TABLE streams ADD COLUMN source_url TEXT`);
  } catch (e) {}

  try {
    await db.run(`ALTER TABLE streams ADD COLUMN fallback_video_id INTEGER`);
  } catch (e) {}

  try {
    await db.run(`ALTER TABLE streams ADD COLUMN auto_start BOOLEAN DEFAULT 1`);
  } catch (e) {}

  try {
    await db.run(`ALTER TABLE streams ADD COLUMN scheduled_start TEXT`);
  } catch (e) {}

  try {
    await db.run(`ALTER TABLE streams ADD COLUMN scheduled_stop TEXT`);
  } catch (e) {}

  try {
    await db.run(`ALTER TABLE streams ADD COLUMN is_recording BOOLEAN DEFAULT 0`);
  } catch (e) {}

  return db;
}

export async function logActivity(action: string, details?: string) {
  const database = await getDb();
  await database.run(
    'INSERT INTO activity_logs (action, details) VALUES (?, ?)',
    [action, details]
  );
}

export async function getSetting(key: string, defaultValue: string | null = null): Promise<string | null> {
  const database = await getDb();
  const row = await database.get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : defaultValue;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await getDb();
  await database.run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    [key, value]
  );
}

export async function deleteSetting(key: string): Promise<void> {
  const database = await getDb();
  await database.run('DELETE FROM settings WHERE key = ?', [key]);
}

export interface ApiKeyRecord {
  id: number;
  name: string;
  key: string;
  created_at: string;
  last_used?: string | null;
}

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  const database = await getDb();
  let keys = await database.all<ApiKeyRecord[]>('SELECT * FROM api_keys ORDER BY id DESC');
  
  // If no keys exist, seed a default key
  if (!keys || keys.length === 0) {
    const defaultKey = process.env.LOOPSTREAM_API_KEY || 'ls_live_' + (process.env.SESSION_SECRET ? process.env.SESSION_SECRET.substring(0, 24) : 'key_default_8819');
    await database.run('INSERT OR IGNORE INTO api_keys (name, key) VALUES (?, ?)', ['Default API Key', defaultKey]);
    keys = await database.all<ApiKeyRecord[]>('SELECT * FROM api_keys ORDER BY id DESC');
  }
  return keys;
}

export async function createApiKey(name: string, keyString?: string): Promise<ApiKeyRecord> {
  const database = await getDb();
  const crypto = await import('crypto');
  const key = keyString || `ls_live_${crypto.randomBytes(24).toString('hex')}`;
  const keyName = name.trim() || 'API Key';

  const result = await database.run(
    'INSERT INTO api_keys (name, key, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
    [keyName, key]
  );

  // Also record active primary api_key in settings
  await setSetting('api_key', key);
  await logActivity('api_key_created', `Generated new API key: "${keyName}" (${key.substring(0, 12)}...)`);

  return {
    id: result.lastID!,
    name: keyName,
    key,
    created_at: new Date().toISOString(),
    last_used: null,
  };
}

export async function deleteApiKey(id: number): Promise<boolean> {
  const database = await getDb();
  const existing = await database.get<ApiKeyRecord>('SELECT * FROM api_keys WHERE id = ?', [id]);
  if (!existing) return false;

  await database.run('DELETE FROM api_keys WHERE id = ?', [id]);

  const activeSetting = await getSetting('api_key');
  if (activeSetting === existing.key) {
    const nextKey = await database.get<ApiKeyRecord>('SELECT key FROM api_keys ORDER BY id DESC LIMIT 1');
    if (nextKey) {
      await setSetting('api_key', nextKey.key);
    } else {
      await deleteSetting('api_key');
    }
  }

  await logActivity('api_key_deleted', `Deleted API key "${existing.name}"`);
  return true;
}

export async function validateApiKey(providedKey: string): Promise<boolean> {
  if (!providedKey || typeof providedKey !== 'string') return false;

  const defaultKey = process.env.LOOPSTREAM_API_KEY || 'ls_mcp_' + (process.env.SESSION_SECRET ? process.env.SESSION_SECRET.substring(0, 24) : 'key_default_8819');
  if (providedKey === defaultKey) return true;

  try {
    const database = await getDb();
    const row = await database.get<ApiKeyRecord>('SELECT id FROM api_keys WHERE key = ?', [providedKey]);
    if (row) {
      database.run('UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = ?', [row.id]).catch(() => {});
      return true;
    }
  } catch (err) {
    console.error('Error validating API key:', err);
  }

  return false;
}