// Repository layer: all SQL lives here, behind small typed methods.
// Every query is parameterized; multi-row writes use transactions.
import type Database from 'better-sqlite3';
import type { AppCategory, Classification } from '../../shared/types';

export interface AppRow {
  id: number;
  displayName: string;
  processName: string;
  executablePath: string | null;
  category: AppCategory;
  classification: Classification;
  trackingEnabled: boolean;
  excluded: boolean;
}

function mapApp(row: Record<string, unknown>): AppRow {
  return {
    id: row.id as number,
    displayName: row.display_name as string,
    processName: row.process_name as string,
    executablePath: (row.executable_path as string | null) ?? null,
    category: (row.category_name as AppCategory) ?? 'uncategorized',
    classification: (row.classification as Classification) ?? 'neutral',
    trackingEnabled: (row.tracking_enabled as number) === 1,
    excluded: (row.excluded as number) === 1,
  };
}

const APP_SELECT = `
  SELECT a.id, a.display_name, a.process_name, a.executable_path,
         c.name AS category_name, a.classification, a.tracking_enabled, a.excluded
  FROM applications a JOIN categories c ON c.id = a.category_id`;

export class AppRepository {
  constructor(private db: Database.Database) {}

  upsert(processName: string, displayName: string, executablePath: string | null, category: AppCategory, classification: Classification): number {
    const cat = this.db.prepare('SELECT id FROM categories WHERE name = ?').get(category) as { id: number } | undefined;
    const categoryId = cat?.id ?? 8;
    const existing = this.db.prepare('SELECT id FROM applications WHERE process_name = ?').get(processName) as { id: number } | undefined;
    if (existing) {
      this.db.prepare('UPDATE applications SET display_name = ?, executable_path = COALESCE(?, executable_path), updated_at = ? WHERE id = ?')
        .run(displayName, executablePath, Date.now(), existing.id);
      return existing.id;
    }
    const info = this.db.prepare(
      'INSERT INTO applications (display_name, process_name, executable_path, category_id, classification, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(displayName, processName, executablePath, categoryId, classification, Date.now(), Date.now());
    return Number(info.lastInsertRowid);
  }

  getById(id: number): AppRow | null {
    const row = this.db.prepare(`${APP_SELECT} WHERE a.id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? mapApp(row) : null;
  }

  list(search = '', category = ''): AppRow[] {
    let sql = APP_SELECT;
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (search) {
      clauses.push('(a.display_name LIKE ? OR a.process_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category) {
      clauses.push('c.name = ?');
      params.push(category);
    }
    if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`;
    sql += ' ORDER BY a.display_name ASC';
    return (this.db.prepare(sql).all(...params) as Record<string, unknown>[]).map(mapApp);
  }

  setCategory(id: number, category: AppCategory, classification: Classification): void {
    const cat = this.db.prepare('SELECT id FROM categories WHERE name = ?').get(category) as { id: number } | undefined;
    if (!cat) throw new Error(`Unknown category: ${category}`);
    this.db.prepare('UPDATE applications SET category_id = ?, classification = ?, updated_at = ? WHERE id = ?')
      .run(cat.id, classification, Date.now(), id);
  }

  setExcluded(id: number, excluded: boolean): void {
    this.db.prepare('UPDATE applications SET excluded = ?, updated_at = ? WHERE id = ?')
      .run(excluded ? 1 : 0, Date.now(), id);
  }

  listRules(): { id: number; match: string; category: AppCategory; classification: Classification }[] {
    return this.db.prepare('SELECT id, match_text AS match, category, classification FROM app_rules ORDER BY match_text')
      .all() as { id: number; match: string; category: AppCategory; classification: Classification }[];
  }

  addRule(match: string, category: AppCategory, classification: Classification): number {
    const info = this.db.prepare('INSERT INTO app_rules (match_text, category, classification) VALUES (?, ?, ?)')
      .run(match.toLowerCase(), category, classification);
    return Number(info.lastInsertRowid);
  }
}

export interface SessionRow {
  id: number;
  appId: number;
  appName: string;
  processName: string;
  category: AppCategory;
  classification: Classification;
  projectId: number | null;
  projectName: string | null;
  startMs: number;
  endMs: number;
  durationMs: number;
  source: string;
  confidence: number;
  manual: boolean;
  notes: string | null;
  status: string;
}

const SESSION_SELECT = `
  SELECT s.id, s.app_id AS appId, a.display_name AS appName, a.process_name AS processName,
         c.name AS category, a.classification, s.project_id AS projectId, p.name AS projectName,
         s.start_ms AS startMs, s.end_ms AS endMs, s.duration_ms AS durationMs,
         s.source, s.confidence, s.manual, s.notes, s.status
  FROM activity_sessions s
  JOIN applications a ON a.id = s.app_id
  JOIN categories c ON c.id = a.category_id
  LEFT JOIN projects p ON p.id = s.project_id`;

export class SessionRepository {
  constructor(private db: Database.Database) {}

  insert(appId: number, projectId: number | null, startMs: number, source: string, confidence: number, manual: boolean): number {
    const info = this.db.prepare(
      'INSERT INTO activity_sessions (app_id, project_id, start_ms, end_ms, duration_ms, source, confidence, manual, status, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)',
    ).run(appId, projectId, startMs, startMs, source, confidence, manual ? 1 : 0, 'open', Date.now(), Date.now());
    return Number(info.lastInsertRowid);
  }

  /** Heartbeat: extend the open session's end time (accurate crash recovery). */
  touch(id: number, endMs: number): void {
    // MAX guards: a clock jumping backwards must never shrink a session.
    this.db.prepare('UPDATE activity_sessions SET end_ms = MAX(end_ms, ?), duration_ms = MAX(end_ms, ?) - start_ms, updated_at = ? WHERE id = ? AND status = ?')
      .run(endMs, endMs, Date.now(), id, 'open');
  }

  close(id: number, endMs: number): void {
    // Clamp: end can never precede start (see tracker idle clamping).
    this.db.prepare("UPDATE activity_sessions SET end_ms = MAX(?, start_ms), duration_ms = MAX(0, MAX(?, start_ms) - start_ms), status = 'closed', updated_at = ? WHERE id = ?")
      .run(endMs, endMs, Date.now(), id);
  }

  closeAllOpen(endMs: number, reason: string): void {
    const open = this.db.prepare("SELECT id FROM activity_sessions WHERE status = 'open'").all() as { id: number }[];
    const close = this.db.prepare("UPDATE activity_sessions SET end_ms = MAX(end_ms, ?), duration_ms = MAX(0, MAX(end_ms, ?) - start_ms), status = 'closed', updated_at = ? WHERE id = ?");
    const tx = this.db.transaction(() => {
      for (const row of open) close.run(endMs, endMs, Date.now(), row.id);
    });
    tx();
    void reason;
  }

  getById(id: number): SessionRow | null {
    const row = this.db.prepare(`${SESSION_SELECT} WHERE s.id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? (row as unknown as SessionRow) : null;
  }

  listInRange(startMs: number, endMs: number, appId?: number, projectId?: number, limit = 2000): SessionRow[] {
    let sql = `${SESSION_SELECT} WHERE s.start_ms < ? AND s.end_ms >= ? AND s.status = 'closed'`;
    const params: unknown[] = [endMs, startMs];
    if (appId !== undefined) {
      sql += ' AND s.app_id = ?';
      params.push(appId);
    }
    if (projectId !== undefined) {
      sql += ' AND s.project_id = ?';
      params.push(projectId);
    }
    sql += ' ORDER BY s.start_ms DESC LIMIT ?';
    params.push(limit);
    return this.db.prepare(sql).all(...params) as SessionRow[];
  }

  update(id: number, projectId: number | null | undefined, notes: string | undefined): void {
    if (projectId !== undefined) {
      this.db.prepare('UPDATE activity_sessions SET project_id = ?, updated_at = ? WHERE id = ?').run(projectId, Date.now(), id);
    }
    if (notes !== undefined) {
      this.db.prepare('UPDATE activity_sessions SET notes = ?, updated_at = ? WHERE id = ?').run(notes, Date.now(), id);
    }
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM activity_sessions WHERE id = ?').run(id);
  }

  split(id: number, atMs: number): number {
    const original = this.getById(id);
    if (!original) throw new Error('Session not found');
    if (atMs <= original.startMs || atMs >= original.endMs) throw new Error('Split point must be inside the session');
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE activity_sessions SET end_ms = ?, duration_ms = ? - start_ms, updated_at = ? WHERE id = ?')
        .run(atMs, atMs, Date.now(), id);
      const info = this.db.prepare(
        'INSERT INTO activity_sessions (app_id, project_id, start_ms, end_ms, duration_ms, source, confidence, manual, notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)',
      ).run(original.appId, original.projectId, atMs, original.endMs, original.endMs - atMs, original.source, original.confidence, original.notes, 'closed', Date.now(), Date.now());
      return Number(info.lastInsertRowid);
    });
    return tx();
  }

  merge(firstId: number, secondId: number): void {
    const first = this.getById(firstId);
    const second = this.getById(secondId);
    if (!first || !second) throw new Error('Session not found');
    if (first.appId !== second.appId) throw new Error('Can only merge sessions of the same application');
    const start = Math.min(first.startMs, second.startMs);
    const end = Math.max(first.endMs, second.endMs);
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE activity_sessions SET start_ms = ?, end_ms = ?, duration_ms = ? - ?, updated_at = ? WHERE id = ?')
        .run(start, end, end, start, Date.now(), firstId);
      this.db.prepare('DELETE FROM activity_sessions WHERE id = ?').run(secondId);
    });
    tx();
  }

  /** Aggregated durations per app in range (excludes excluded apps). */
  totalsByApp(startMs: number, endMs: number): { appId: number; name: string; category: AppCategory; classification: Classification; ms: number; sessions: number }[] {
    return this.db.prepare(`
      SELECT a.id AS appId, a.display_name AS name, c.name AS category, a.classification,
             SUM(MAX(0, MIN(s.end_ms, ?) - MAX(s.start_ms, ?))) AS ms, COUNT(*) AS sessions
      FROM activity_sessions s
      JOIN applications a ON a.id = s.app_id
      JOIN categories c ON c.id = a.category_id
      WHERE s.start_ms < ? AND s.end_ms >= ? AND s.status = 'closed' AND a.excluded = 0
      GROUP BY a.id ORDER BY ms DESC
    `).all(endMs, startMs, endMs, startMs) as { appId: number; name: string; category: AppCategory; classification: Classification; ms: number; sessions: number }[];
  }

  totalsByProject(startMs: number, endMs: number): { projectId: number | null; name: string; ms: number; sessions: number }[] {
    return this.db.prepare(`
      SELECT s.project_id AS projectId, COALESCE(p.name, 'Unassigned') AS name,
             SUM(MAX(0, MIN(s.end_ms, ?) - MAX(s.start_ms, ?))) AS ms, COUNT(*) AS sessions
      FROM activity_sessions s LEFT JOIN projects p ON p.id = s.project_id
      WHERE s.start_ms < ? AND s.end_ms >= ? AND s.status = 'closed'
      GROUP BY s.project_id ORDER BY ms DESC
    `).all(endMs, startMs, endMs, startMs) as { projectId: number | null; name: string; ms: number; sessions: number }[];
  }

  dailyTotals(startMs: number, endMs: number, categoryFilter?: string): { date: string; ms: number }[] {
    const rows = this.db.prepare(`
      SELECT s.start_ms AS startMs, s.end_ms AS endMs, c.name AS category
      FROM activity_sessions s
      JOIN applications a ON a.id = s.app_id
      JOIN categories c ON c.id = a.category_id
      WHERE s.start_ms < ? AND s.end_ms >= ? AND s.status = 'closed' AND a.excluded = 0
    `).all(endMs, startMs) as { startMs: number; endMs: number; category: string }[];
    const byDay = new Map<string, number>();
    for (const r of rows) {
      if (categoryFilter && r.category !== categoryFilter) continue;
      // Split across midnight boundaries so each day gets its own share.
      let cursor = Math.max(r.startMs, startMs);
      const end = Math.min(r.endMs, endMs);
      while (cursor < end) {
        const d = new Date(cursor);
        const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
        const sliceEnd = Math.min(end, dayEnd);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        byDay.set(key, (byDay.get(key) ?? 0) + (sliceEnd - cursor));
        cursor = sliceEnd;
      }
    }
    return [...byDay.entries()].map(([date, ms]) => ({ date, ms })).sort((a, b) => a.date.localeCompare(b.date));
  }

  countAll(): number {
    return (this.db.prepare("SELECT COUNT(*) AS c FROM activity_sessions WHERE status = 'closed'").get() as { c: number }).c;
  }

  bounds(): { earliest: number | null; latest: number | null } {
    const row = this.db.prepare('SELECT MIN(start_ms) AS earliest, MAX(end_ms) AS latest FROM activity_sessions WHERE status = \'closed\'').get() as { earliest: number | null; latest: number | null };
    return row;
  }
}

export class EventRepository {
  constructor(private db: Database.Database) {}

  insert(type: string, timestampMs: number, appId: number | null, projectId: number | null, metadata: Record<string, unknown> | null): number {
    const info = this.db.prepare('INSERT INTO activity_events (type, timestamp_ms, app_id, project_id, metadata) VALUES (?, ?, ?, ?, ?)')
      .run(type, timestampMs, appId, projectId, metadata ? JSON.stringify(metadata) : null);
    return Number(info.lastInsertRowid);
  }

  listInRange(startMs: number, endMs: number, type?: string, limit = 500): { id: number; type: string; timestampMs: number; metadata: string | null }[] {
    let sql = 'SELECT id, type, timestamp_ms AS timestampMs, metadata FROM activity_events WHERE timestamp_ms >= ? AND timestamp_ms < ?';
    const params: unknown[] = [startMs, endMs];
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    sql += ' ORDER BY timestamp_ms DESC LIMIT ?';
    params.push(limit);
    return this.db.prepare(sql).all(...params) as { id: number; type: string; timestampMs: number; metadata: string | null }[];
  }
}

export class ProjectRepository {
  constructor(private db: Database.Database) {}

  list(includeArchived = false): { id: number; name: string; description: string; category: string; color: string; archived: boolean }[] {
    const sql = includeArchived
      ? 'SELECT id, name, description, category, color, archived FROM projects ORDER BY name'
      : 'SELECT id, name, description, category, color, archived FROM projects WHERE archived = 0 ORDER BY name';
    return (this.db.prepare(sql).all() as Record<string, unknown>[]).map((r) => ({
      id: r.id as number,
      name: r.name as string,
      description: r.description as string,
      category: r.category as string,
      color: r.color as string,
      archived: (r.archived as number) === 1,
    }));
  }

  create(name: string, description: string, category: string, color: string): number {
    const info = this.db.prepare('INSERT INTO projects (name, description, category, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, description, category, color, Date.now(), Date.now());
    return Number(info.lastInsertRowid);
  }

  update(id: number, patch: { name?: string; description?: string; category?: string; color?: string }): void {
    const fields: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        params.push(value);
      }
    }
    if (!fields.length) return;
    params.push(Date.now(), id);
    this.db.prepare(`UPDATE projects SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`).run(...params);
  }

  setArchived(id: number, archived: boolean): void {
    this.db.prepare('UPDATE projects SET archived = ?, updated_at = ? WHERE id = ?').run(archived ? 1 : 0, Date.now(), id);
  }

  remove(id: number): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE activity_sessions SET project_id = NULL WHERE project_id = ?').run(id);
      this.db.prepare('DELETE FROM project_repositories WHERE project_id = ?').run(id);
      this.db.prepare('DELETE FROM goals WHERE project_id = ?').run(id);
      this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    });
    tx();
  }

  linkRepo(projectId: number, repoId: number): void {
    this.db.prepare('INSERT OR IGNORE INTO project_repositories (project_id, repo_id) VALUES (?, ?)').run(projectId, repoId);
    this.db.prepare('UPDATE repositories SET project_id = ? WHERE id = ?').run(projectId, repoId);
  }

  unlinkRepo(projectId: number, repoId: number): void {
    this.db.prepare('DELETE FROM project_repositories WHERE project_id = ? AND repo_id = ?').run(projectId, repoId);
    this.db.prepare('UPDATE repositories SET project_id = NULL WHERE id = ? AND project_id = ?').run(repoId, projectId);
  }

  repoIds(projectId: number): number[] {
    return (this.db.prepare('SELECT repo_id FROM project_repositories WHERE project_id = ?').all(projectId) as { repo_id: number }[])
      .map((r) => r.repo_id);
  }
}

export class RepositoryRepository {
  constructor(private db: Database.Database) {}

  list(): { id: number; path: string; name: string; projectId: number | null; projectName: string | null; enabled: boolean; lastScanMs: number | null; lastError: string | null; commitCount: number }[] {
    return (this.db.prepare(`
      SELECT r.id, r.path, r.name, r.project_id AS projectId, p.name AS projectName,
             r.enabled, r.last_scan_ms AS lastScanMs, r.last_error AS lastError,
             (SELECT COUNT(*) FROM git_commits c WHERE c.repo_id = r.id) AS commitCount
      FROM repositories r LEFT JOIN projects p ON p.id = r.project_id ORDER BY r.name
    `).all() as Record<string, unknown>[]).map((r) => ({
      id: r.id as number,
      path: r.path as string,
      name: r.name as string,
      projectId: (r.projectId as number | null) ?? null,
      projectName: (r.projectName as string | null) ?? null,
      enabled: (r.enabled as number) === 1,
      lastScanMs: (r.lastScanMs as number | null) ?? null,
      lastError: (r.lastError as string | null) ?? null,
      commitCount: r.commitCount as number,
    }));
  }

  add(pathValue: string, name: string, projectId: number | null): number {
    const existing = this.db.prepare('SELECT id FROM repositories WHERE path = ?').get(pathValue) as { id: number } | undefined;
    if (existing) throw new Error('This repository is already tracked.');
    const info = this.db.prepare('INSERT INTO repositories (path, name, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(pathValue, name, projectId, Date.now(), Date.now());
    return Number(info.lastInsertRowid);
  }

  remove(id: number): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM git_commits WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM repo_languages WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM project_repositories WHERE repo_id = ?').run(id);
      this.db.prepare('DELETE FROM repositories WHERE id = ?').run(id);
    });
    tx();
  }

  setEnabled(id: number, enabled: boolean): void {
    this.db.prepare('UPDATE repositories SET enabled = ?, updated_at = ? WHERE id = ?').run(enabled ? 1 : 0, Date.now(), id);
  }

  setScanResult(id: number, lastScanMs: number, lastError: string | null): void {
    this.db.prepare('UPDATE repositories SET last_scan_ms = ?, last_error = ?, updated_at = ? WHERE id = ?')
      .run(lastScanMs, lastError, Date.now(), id);
  }

  getByPath(pathValue: string): { id: number } | null {
    return (this.db.prepare('SELECT id FROM repositories WHERE path = ?').get(pathValue) as { id: number } | undefined) ?? null;
  }
}

export class CommitRepository {
  constructor(private db: Database.Database) {}

  insertMany(repoId: number, commits: { hash: string; message: string; authorName: string; authorEmail: string | null; commitMs: number; branch: string | null }[]): number {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO git_commits (repo_id, hash, message, author_name, author_email, commit_ms, branch, first_seen_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const tx = this.db.transaction(() => {
      let added = 0;
      for (const c of commits) {
        const info = stmt.run(repoId, c.hash, c.message, c.authorName, c.authorEmail, c.commitMs, c.branch, Date.now());
        added += info.changes;
      }
      return added;
    });
    return tx();
  }

  list(repoId?: number, search = '', startMs?: number, endMs?: number, limit = 500): { id: number; repoId: number; repoName: string; hash: string; message: string; authorName: string; commitMs: number; branch: string | null }[] {
    let sql = `SELECT c.id, c.repo_id AS repoId, r.name AS repoName, c.hash, c.message, c.author_name AS authorName, c.commit_ms AS commitMs, c.branch
      FROM git_commits c JOIN repositories r ON r.id = c.repo_id WHERE 1=1`;
    const params: unknown[] = [];
    if (repoId !== undefined) {
      sql += ' AND c.repo_id = ?';
      params.push(repoId);
    }
    if (search) {
      sql += ' AND c.message LIKE ?';
      params.push(`%${search}%`);
    }
    if (startMs !== undefined) {
      sql += ' AND c.commit_ms >= ?';
      params.push(startMs);
    }
    if (endMs !== undefined) {
      sql += ' AND c.commit_ms < ?';
      params.push(endMs);
    }
    sql += ' ORDER BY c.commit_ms DESC LIMIT ?';
    params.push(limit);
    return this.db.prepare(sql).all(...params) as { id: number; repoId: number; repoName: string; hash: string; message: string; authorName: string; commitMs: number; branch: string | null }[];
  }

  countInRange(startMs: number, endMs: number): number {
    return (this.db.prepare('SELECT COUNT(*) AS c FROM git_commits WHERE commit_ms >= ? AND commit_ms < ?').get(startMs, endMs) as { c: number }).c;
  }

  dailyCounts(startMs: number, endMs: number): { date: string; count: number }[] {
    const rows = this.db.prepare('SELECT commit_ms AS ms FROM git_commits WHERE commit_ms >= ? AND commit_ms < ?').all(startMs, endMs) as { ms: number }[];
    const byDay = new Map<string, number>();
    for (const r of rows) {
      const d = new Date(r.ms);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    return [...byDay.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
  }
}

export class FocusRepository {
  constructor(private db: Database.Database) {}

  start(plannedMs: number, projectId: number | null, notes: string): number {
    const info = this.db.prepare('INSERT INTO focus_sessions (start_ms, planned_ms, status, project_id, notes) VALUES (?, ?, ?, ?, ?)')
      .run(Date.now(), plannedMs, 'running', projectId, notes);
    return Number(info.lastInsertRowid);
  }

  current(): { id: number; startMs: number; plannedMs: number; projectId: number | null; projectName: string | null; notes: string | null } | null {
    const row = this.db.prepare(`SELECT f.id, f.start_ms AS startMs, f.planned_ms AS plannedMs, f.project_id AS projectId, p.name AS projectName, f.notes
      FROM focus_sessions f LEFT JOIN projects p ON p.id = f.project_id WHERE f.status = 'running' ORDER BY f.start_ms DESC LIMIT 1`).get() as Record<string, unknown> | undefined;
    return row ? (row as unknown as { id: number; startMs: number; plannedMs: number; projectId: number | null; projectName: string | null; notes: string | null }) : null;
  }

  stop(id: number, status: 'completed' | 'cancelled'): void {
    const row = this.db.prepare('SELECT start_ms FROM focus_sessions WHERE id = ?').get(id) as { start_ms: number } | undefined;
    if (!row) throw new Error('Focus session not found');
    const endMs = Date.now();
    this.db.prepare('UPDATE focus_sessions SET end_ms = ?, actual_ms = ? - start_ms, status = ? WHERE id = ?')
      .run(endMs, endMs, status, id);
  }

  history(startMs: number, endMs: number): { id: number; startMs: number; endMs: number | null; plannedMs: number; actualMs: number | null; status: string; projectId: number | null; projectName: string | null; notes: string | null }[] {
    return this.db.prepare(`SELECT f.id, f.start_ms AS startMs, f.end_ms AS endMs, f.planned_ms AS plannedMs, f.actual_ms AS actualMs, f.status, f.project_id AS projectId, p.name AS projectName, f.notes
      FROM focus_sessions f LEFT JOIN projects p ON p.id = f.project_id
      WHERE f.start_ms >= ? AND f.start_ms < ? ORDER BY f.start_ms DESC`).all(startMs, endMs) as { id: number; startMs: number; endMs: number | null; plannedMs: number; actualMs: number | null; status: string; projectId: number | null; projectName: string | null; notes: string | null }[];
  }
}

export class GoalRepository {
  constructor(private db: Database.Database) {}

  list(): { id: number; name: string; type: string; targetMs: number; period: string; projectId: number | null; projectName: string | null; enabled: boolean }[] {
    return (this.db.prepare(`SELECT g.id, g.name, g.type, g.target_ms AS targetMs, g.period, g.project_id AS projectId, p.name AS projectName, g.enabled
      FROM goals g LEFT JOIN projects p ON p.id = g.project_id ORDER BY g.name`).all() as Record<string, unknown>[]).map((r) => ({
      id: r.id as number,
      name: r.name as string,
      type: r.type as string,
      targetMs: r.targetMs as number,
      period: r.period as string,
      projectId: (r.projectId as number | null) ?? null,
      projectName: (r.projectName as string | null) ?? null,
      enabled: (r.enabled as number) === 1,
    }));
  }

  create(name: string, type: string, targetMs: number, projectId: number | null): number {
    const info = this.db.prepare('INSERT INTO goals (name, type, target_ms, project_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, type, targetMs, projectId, Date.now());
    return Number(info.lastInsertRowid);
  }

  remove(id: number): void {
    this.db.prepare('DELETE FROM goals WHERE id = ?').run(id);
  }
}

export class SettingsRepository {
  constructor(private db: Database.Database) {}

  getAll(): Record<string, unknown> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const out: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        out[row.key] = JSON.parse(row.value);
      } catch {
        out[row.key] = row.value;
      }
    }
    return out;
  }

  set(key: string, value: unknown): void {
    this.db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
      .run(key, JSON.stringify(value), Date.now());
  }
}

export class InsightRepository {
  constructor(private db: Database.Database) {}

  upsert(type: string, period: string, title: string, detail: string, metrics: Record<string, unknown>): void {
    this.db.prepare(`INSERT INTO insights (type, period, title, detail, metrics_json, created_ms) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(type, period) DO UPDATE SET title = excluded.title, detail = excluded.detail, metrics_json = excluded.metrics_json, created_ms = excluded.created_ms`)
      .run(type, period, title, detail, JSON.stringify(metrics), Date.now());
  }

  list(): { id: number; type: string; period: string; title: string; detail: string; metricsJson: string; dismissed: boolean; createdMs: number }[] {
    return (this.db.prepare('SELECT id, type, period, title, detail, metrics_json AS metricsJson, dismissed, created_ms AS createdMs FROM insights ORDER BY created_ms DESC LIMIT 100').all() as Record<string, unknown>[]).map((r) => ({
      id: r.id as number,
      type: r.type as string,
      period: r.period as string,
      title: r.title as string,
      detail: r.detail as string,
      metricsJson: r.metricsJson as string,
      dismissed: (r.dismissed as number) === 1,
      createdMs: r.createdMs as number,
    }));
  }

  dismiss(id: number): void {
    this.db.prepare('UPDATE insights SET dismissed = 1 WHERE id = ?').run(id);
  }
}

export class MiscRepository {
  constructor(private db: Database.Database) {}

  audit(action: string, entityType: string, entityId: number | null, note: string | null): void {
    this.db.prepare('INSERT INTO audit_events (action, entity_type, entity_id, user_note, created_ms) VALUES (?, ?, ?, ?, ?)')
      .run(action, entityType, entityId, note, Date.now());
  }

  notify(type: string, title: string, body: string): void {
    this.db.prepare('INSERT INTO notifications (type, title, body, created_ms) VALUES (?, ?, ?, ?)').run(type, title, body, Date.now());
  }

  setRepoLanguages(repoId: number, langs: { language: string; files: number }[]): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM repo_languages WHERE repo_id = ?').run(repoId);
      const stmt = this.db.prepare('INSERT INTO repo_languages (repo_id, language, files, updated_ms) VALUES (?, ?, ?, ?)');
      for (const l of langs) stmt.run(repoId, l.language, l.files, Date.now());
    });
    tx();
  }

  getRepoLanguages(repoId: number): { language: string; files: number }[] {
    return this.db.prepare('SELECT language, files FROM repo_languages WHERE repo_id = ? ORDER BY files DESC').all(repoId) as { language: string; files: number }[];
  }

  lastBackupMs(): number | null {
    const row = this.db.prepare('SELECT MAX(created_ms) AS ms FROM backups').get() as { ms: number | null };
    return row.ms;
  }
}
