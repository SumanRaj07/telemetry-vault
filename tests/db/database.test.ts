import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TelemetryDatabase } from '../../src/main/db/database';
import { AppRepository, CommitRepository, RepositoryRepository, SessionRepository } from '../../src/main/db/repositories';

function openMemory() {
  const db = new TelemetryDatabase(':memory:');
  db.open();
  return db;
}

describe('database', () => {
  it('applies migrations and seeds settings and categories', () => {
    const db = openMemory();
    const version = db.handle.pragma('user_version', { simple: true }) as number;
    expect(version).toBe(2);
    const settings = db.handle.prepare('SELECT COUNT(*) AS c FROM settings').get() as { c: number };
    expect(settings.c).toBeGreaterThan(10);
    const categories = db.handle.prepare('SELECT COUNT(*) AS c FROM categories').get() as { c: number };
    expect(categories.c).toBe(8);
    db.close();
  });

  it('upserts applications and records sessions', () => {
    const db = openMemory();
    const apps = new AppRepository(db.handle);
    const sessions = new SessionRepository(db.handle);
    const id = apps.upsert('Code.exe', 'Code', null, 'development', 'productive');
    const again = apps.upsert('Code.exe', 'Visual Studio Code', null, 'development', 'productive');
    expect(again).toBe(id);
    const sessionId = sessions.insert(id, null, 1000, 'foreground', 1.0, false);
    sessions.touch(sessionId, 5000);
    sessions.close(sessionId, 6000);
    const row = sessions.getById(sessionId);
    expect(row?.durationMs).toBe(5000);
    expect(row?.status).toBe('closed');
    db.close();
  });

  it('rejects duplicate commits for the same repository', () => {
    const db = openMemory();
    const repos = new RepositoryRepository(db.handle);
    const commits = new CommitRepository(db.handle);
    const repoId = repos.add('/tmp/fake-repo', 'fake-repo', null);
    const commit = { hash: 'abc123', message: 'init', authorName: 'A', authorEmail: null, commitMs: 1000, branch: 'main' };
    expect(commits.insertMany(repoId, [commit])).toBe(1);
    expect(commits.insertMany(repoId, [commit])).toBe(0);
    expect(commits.list(repoId)).toHaveLength(1);
    db.close();
  });

  it('rolls back a failed transaction', () => {
    const db = openMemory();
    const apps = new AppRepository(db.handle);
    expect(() => {
      const tx = db.handle.transaction(() => {
        apps.upsert('Code.exe', 'Code', null, 'development', 'productive');
        throw new Error('boom');
      });
      tx();
    }).toThrow('boom');
    expect(apps.list()).toHaveLength(0);
    db.close();
  });

  it('backs up to a file and validates it', async () => {
    const db = openMemory();
    const apps = new AppRepository(db.handle);
    apps.upsert('Code.exe', 'Code', null, 'development', 'productive');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-backup-'));
    const dest = path.join(tmp, 'backup.db');
    const bytes = await db.backup(dest);
    expect(bytes).toBeGreaterThan(0);
    expect(fs.existsSync(dest)).toBe(true);
    const validation = TelemetryDatabase.validateBackupFile(dest);
    expect(validation.ok).toBe(true);
    expect(TelemetryDatabase.validateBackupFile(path.join(tmp, 'missing.db')).ok).toBe(false);
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('passes integrity checks and maintenance', () => {
    const db = openMemory();
    expect(db.integrity().ok).toBe(true);
    db.maintenance();
    expect(db.integrity().ok).toBe(true);
    db.close();
  });

  it('splits and merges sessions', () => {
    const db = openMemory();
    const apps = new AppRepository(db.handle);
    const sessions = new SessionRepository(db.handle);
    const id = apps.upsert('Code.exe', 'Code', null, 'development', 'productive');
    const sessionId = sessions.insert(id, null, 1000, 'foreground', 1.0, false);
    sessions.close(sessionId, 5000);
    const secondId = sessions.split(sessionId, 3000);
    const first = sessions.getById(sessionId);
    const second = sessions.getById(secondId);
    expect(first?.endMs).toBe(3000);
    expect(second?.startMs).toBe(3000);
    sessions.merge(sessionId, secondId);
    const merged = sessions.getById(sessionId);
    expect(merged?.startMs).toBe(1000);
    expect(merged?.endMs).toBe(5000);
    db.close();
  });
});
