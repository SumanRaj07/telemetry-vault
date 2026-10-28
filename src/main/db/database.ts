// SQLite database: open, pragmas, migrations, backup/restore, integrity.
// Uses better-sqlite3 (synchronous, transactional). WAL mode keeps the UI
// responsive while the tracker writes; foreign keys are enforced.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from './migrations';
import { CATEGORIES, DEFAULT_SETTINGS } from '../../shared/constants';

export function resolveDbPath(): string {
  const override = process.env.TELEMETRY_VAULT_DB;
  if (override) return override;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron');
    const app = electron.app as { getPath: (name: string) => string } | undefined;
    if (app) return path.join(app.getPath('userData'), 'telemetry.db');
  } catch {
    // Not running inside Electron (tests / CLI without the override).
  }
  const dir = path.resolve(process.cwd(), 'telemetry-vault-data');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'telemetry.db');
}

export class TelemetryDatabase {
  private db: Database.Database | null = null;

  constructor(private dbPath: string) {}

  get path(): string {
    return this.dbPath;
  }

  open(): void {
    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 5000');
    this.migrate();
    this.seedDefaults();
  }

  get handle(): Database.Database {
    if (!this.db) throw new Error('Database is not open');
    return this.db;
  }

  get isOpen(): boolean {
    return this.db !== null && this.db.open;
  }

  close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // Already closed.
      }
      this.db = null;
    }
  }

  private migrate(): void {
    const db = this.handle;
    const current = (db.pragma('user_version', { simple: true }) as number) || 0;
    for (const m of MIGRATIONS) {
      if (m.version > current) {
        const run = db.transaction(() => {
          db.exec(m.sql);
          db.pragma(`user_version = ${m.version}`);
        });
        run();
      }
    }
  }

  private seedDefaults(): void {
    const db = this.handle;
    const now = Date.now();
    const insertSetting = db.prepare(
      'INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
    );
    const seed = db.transaction(() => {
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        insertSetting.run(key, JSON.stringify(value), now);
      }
      const insertCategory = db.prepare(
        'INSERT OR IGNORE INTO categories (name, description, color, classification, created_at) VALUES (?, ?, ?, ?, ?)',
      );
      for (const [name, meta] of Object.entries(CATEGORIES)) {
        insertCategory.run(name, meta.label, meta.color, meta.classification, now);
      }
    });
    seed();
  }

  /** SQLite-safe online backup (uses the backup API, not a raw file copy). */
  async backup(destPath: string): Promise<number> {
    const db = this.handle;
    const dir = path.dirname(destPath);
    fs.mkdirSync(dir, { recursive: true });
    await db.backup(destPath);
    const bytes = fs.statSync(destPath).size;
    this.handle
      .prepare('INSERT INTO backups (path, bytes, created_ms, kind) VALUES (?, ?, ?, ?)')
      .run(destPath, bytes, Date.now(), 'manual');
    return bytes;
  }

  /** Validate a backup file without touching the live database. */
  static validateBackupFile(filePath: string): { ok: boolean; detail: string } {
    if (!fs.existsSync(filePath)) return { ok: false, detail: 'File does not exist.' };
    let probe: Database.Database | null = null;
    try {
      probe = new Database(filePath, { readonly: true });
      const integrity = (probe.pragma('integrity_check', { simple: true }) as string) || '';
      if (integrity !== 'ok') return { ok: false, detail: `Integrity check failed: ${integrity}` };
      const version = (probe.pragma('user_version', { simple: true }) as number) || 0;
      if (version < 1) return { ok: false, detail: 'Not a Telemetry Vault database (no schema version).' };
      const tables = probe
        .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='activity_sessions'")
        .get() as { c: number };
      if (tables.c !== 1) return { ok: false, detail: 'Missing activity_sessions table.' };
      return { ok: true, detail: `Valid backup (schema v${version}).` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'Unreadable file.' };
    } finally {
      try {
        probe?.close();
      } catch {
        // ignore
      }
    }
  }

  integrity(): { ok: boolean; detail: string } {
    const db = this.handle;
    try {
      const integrity = (db.pragma('integrity_check', { simple: true }) as string) || '';
      const fk = db.pragma('foreign_key_check') as unknown[];
      if (integrity !== 'ok') return { ok: false, detail: `Integrity check failed: ${integrity}` };
      if (fk.length > 0) return { ok: false, detail: `${fk.length} foreign key violation(s) found.` };
      return { ok: true, detail: 'Integrity OK, no foreign key violations.' };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'Check failed.' };
    }
  }

  maintenance(): void {
    const db = this.handle;
    db.exec('VACUUM');
    db.exec('ANALYZE');
  }

  sizeBytes(): number {
    try {
      return fs.statSync(this.dbPath).size;
    } catch {
      return 0;
    }
  }
}
