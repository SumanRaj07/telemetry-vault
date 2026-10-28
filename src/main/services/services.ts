// Application services: the single place where repositories, the tracker,
// Git scanning, analytics, and reports meet. The renderer and CLI both talk
// to this class; neither duplicates business logic.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { TelemetryDatabase } from '../db/database';
import {
  AppRepository,
  CommitRepository,
  EventRepository,
  FocusRepository,
  GoalRepository,
  InsightRepository,
  MiscRepository,
  ProjectRepository,
  RepositoryRepository,
  SessionRepository,
  SettingsRepository,
} from '../db/repositories';
import type { TrackerService } from '../tracking/tracker';
import { classifyApp } from '../tracking/classify';
import { isGitAvailable, scanRepository, discoverRepositories, validateRepoPath } from '../tracking/git';
import {
  codingMs,
  dailySeries,
  goalProgress,
  hourlyDistribution,
  sessionStats,
  totalsByApp,
  totalsByProject,
  weekdayDistribution,
  gitDailyCounts,
} from '../analytics/analytics';
import { generateInsights } from '../analytics/insights';
import { reportToCsv, reportToHtml, type ReportData } from '../analytics/reports';
import { DEFAULT_SETTINGS } from '../../shared/constants';
import type { Settings, SummaryStats, TimelineItem } from '../../shared/types';
import { localDayRange, localWeekRange } from '../utils/time';
import { LocalApiServer } from './localApi';

export interface HostCallbacks {
  notify?: (title: string, body: string) => void;
  setLoginItem?: (enabled: boolean) => void;
}

export class AppServices {
  private apps: AppRepository;
  private sessions: SessionRepository;
  private events: EventRepository;
  private projects: ProjectRepository;
  private repos: RepositoryRepository;
  private commits: CommitRepository;
  private focus: FocusRepository;
  private goals: GoalRepository;
  private settingsRepo: SettingsRepository;
  private insightsRepo: InsightRepository;
  private misc: MiscRepository;
  private apiServer: LocalApiServer | null = null;

  constructor(
    private db: TelemetryDatabase,
    private tracker: TrackerService,
    private host: HostCallbacks = {},
  ) {
    const handle = db.handle;
    this.apps = new AppRepository(handle);
    this.sessions = new SessionRepository(handle);
    this.events = new EventRepository(handle);
    this.projects = new ProjectRepository(handle);
    this.repos = new RepositoryRepository(handle);
    this.commits = new CommitRepository(handle);
    this.focus = new FocusRepository(handle);
    this.goals = new GoalRepository(handle);
    this.settingsRepo = new SettingsRepository(handle);
    this.insightsRepo = new InsightRepository(handle);
    this.misc = new MiscRepository(handle);
  }

  // ---- Settings -----------------------------------------------------------
  getSettings(): Settings {
    const stored = this.settingsRepo.getAll();
    const out = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const value = stored[key as string];
      if (value !== undefined && typeof value === typeof DEFAULT_SETTINGS[key]) {
        (out as Record<string, unknown>)[key as string] = value;
      }
    }
    return out;
  }

  updateSettings(patch: Partial<Settings>): void {
    const before = this.getSettings();
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) this.settingsRepo.set(key, value);
    }
    const after = this.getSettings();
    if (before.startOnLogin !== after.startOnLogin) this.host.setLoginItem?.(after.startOnLogin);
    if (before.localApiEnabled !== after.localApiEnabled) {
      if (after.localApiEnabled) this.startLocalApi();
      else this.stopLocalApi();
    }
  }

  resetSettings(): void {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (key === 'localApiToken') continue;
      this.settingsRepo.set(key, value);
    }
  }

  // ---- Tracking status ----------------------------------------------------
  getTrackingStatus() {
    return this.tracker.getStatus();
  }

  // ---- Summaries ----------------------------------------------------------
  private allSessionsInRange(startMs: number, endMs: number) {
    const rows = this.sessions.listInRange(startMs, endMs, undefined, undefined, 100000);
    const open = this.tracker.getOpenSession();
    if (open && open.startMs < endMs && open.endMs >= startMs) {
      rows.push(open);
    }
    return rows.map((r) => ({
      startMs: r.startMs,
      endMs: r.endMs,
      category: r.category,
      appName: r.appName,
      projectId: r.projectId,
      projectName: r.projectName,
    }));
  }

  getSummary(startMs: number, endMs: number): SummaryStats {
    const sessions = this.allSessionsInRange(startMs, endMs);
    const totalActiveMs = sessions.reduce((s, r) => s + Math.max(0, Math.min(r.endMs, endMs) - Math.max(r.startMs, startMs)), 0);
    const coding = codingMs(sessions, startMs, endMs);
    const focusRows = this.focus.history(startMs, endMs).filter((f) => f.status === 'completed');
    const focusMs = focusRows.reduce((s, f) => s + (f.actualMs ?? 0), 0);
    const appSet = new Set(sessions.map((s) => s.appName));
    const projectSet = new Set(sessions.map((s) => s.projectId).filter((p) => p !== null));
    return {
      rangeStartMs: startMs,
      rangeEndMs: endMs,
      totalActiveMs,
      codingMs: coding,
      codingEstimateMs: coding,
      sessionCount: sessions.length,
      appCount: appSet.size,
      commits: this.commits.countInRange(startMs, endMs),
      activeProjects: projectSet.size,
      focusMs,
      focusCount: focusRows.length,
      idleMs: this.idleMsInRange(startMs, endMs),
    };
  }

  private idleMsInRange(startMs: number, endMs: number): number {
    const events = this.events.listInRange(startMs, endMs, undefined, 5000);
    let total = 0;
    let idleStart: number | null = null;
    const chronological = [...events].reverse();
    for (const e of chronological) {
      if (e.type === 'idle_start') idleStart = e.timestampMs;
      else if (e.type === 'idle_end' && idleStart !== null) {
        total += Math.max(0, e.timestampMs - idleStart);
        idleStart = null;
      }
    }
    return total;
  }

  getTimeline(args: {
    startMs: number;
    endMs: number;
    search?: string;
    appId?: number;
    projectId?: number;
    kind?: string;
    limit?: number;
  }): TimelineItem[] {
    const items: TimelineItem[] = [];
    const sessions = this.sessions.listInRange(args.startMs, args.endMs, args.appId, args.projectId, args.limit ?? 1000);
    for (const s of sessions) {
      items.push({
        kind: 'session',
        id: s.id,
        timestampMs: s.startMs,
        endMs: s.endMs,
        title: s.appName,
        subtitle: `${s.category} · ${s.projectName ?? 'Unassigned'}${s.manual ? ' · manual' : ''}`,
        category: s.category,
        projectName: s.projectName,
        manual: s.manual,
      });
    }
    const events = this.events.listInRange(args.startMs, args.endMs, undefined, 1000);
    const labels: Record<string, string> = {
      idle_start: 'Idle period started',
      idle_end: 'Active again',
      sleep: 'Computer slept',
      wake: 'Computer woke',
      lock: 'Screen locked',
      unlock: 'Screen unlocked',
      tracking_paused: 'Tracking paused',
      tracking_resumed: 'Tracking resumed',
    };
    for (const e of events) {
      if (!labels[e.type]) continue;
      items.push({
        kind: 'event',
        id: e.id,
        timestampMs: e.timestampMs,
        title: labels[e.type]!,
        subtitle: e.metadata ?? '',
      });
    }
    for (const c of this.commits.list(undefined, '', args.startMs, args.endMs, 500)) {
      items.push({
        kind: 'commit',
        id: c.id,
        timestampMs: c.commitMs,
        title: c.message.split('\n')[0] ?? c.message,
        subtitle: `${c.repoName} · ${c.authorName} · ${c.hash.slice(0, 7)}`,
      });
    }
    for (const f of this.focus.history(args.startMs, args.endMs)) {
      items.push({
        kind: 'focus',
        id: f.id,
        timestampMs: f.startMs,
        endMs: f.endMs ?? undefined,
        title: `Focus session (${f.status})`,
        subtitle: f.projectName ?? 'No project',
        projectName: f.projectName,
      });
    }
    let filtered = items;
    if (args.kind) filtered = filtered.filter((i) => i.kind === args.kind);
    if (args.search) {
      const q = args.search.toLowerCase();
      filtered = filtered.filter((i) => `${i.title} ${i.subtitle}`.toLowerCase().includes(q));
    }
    filtered.sort((a, b) => b.timestampMs - a.timestampMs);
    return filtered.slice(0, args.limit ?? 500);
  }

  getSessions(startMs: number, endMs: number, appId?: number, projectId?: number, limit = 2000) {
    return this.sessions.listInRange(startMs, endMs, appId, projectId, limit);
  }

  updateSession(id: number, projectId: number | null | undefined, notes: string | undefined): void {
    this.sessions.update(id, projectId, notes);
    this.misc.audit('session_updated', 'session', id, null);
  }

  deleteSession(id: number): void {
    this.sessions.delete(id);
    this.misc.audit('session_deleted', 'session', id, null);
  }

  mergeSessions(firstId: number, secondId: number): void {
    this.sessions.merge(firstId, secondId);
    this.misc.audit('sessions_merged', 'session', firstId, null);
  }

  splitSession(id: number, atMs: number): number {
    const newId = this.sessions.split(id, atMs);
    this.misc.audit('session_split', 'session', id, null);
    return newId;
  }

  createManualSession(appId: number, projectId: number | null, startMs: number, endMs: number, notes?: string): number {
    const app = this.apps.getById(appId);
    if (!app) throw new Error('Application not found.');
    const id = this.sessions.insert(appId, projectId, startMs, 'manual', 1.0, true);
    this.sessions.close(id, endMs);
    if (notes) this.sessions.update(id, undefined, notes);
    this.misc.audit('session_created_manual', 'session', id, null);
    return id;
  }

  getHourly(startMs: number, endMs: number) {
    return hourlyDistribution(this.allSessionsInRange(startMs, endMs), startMs, endMs);
  }

  getWeekday(startMs: number, endMs: number) {
    return weekdayDistribution(this.allSessionsInRange(startMs, endMs), startMs, endMs);
  }

  getHeatmap(startMs: number, endMs: number) {
    return dailySeries(this.allSessionsInRange(startMs, endMs), startMs, endMs);
  }

  // ---- Applications -------------------------------------------------------
  listApplications(search = '', category = '') {
    const now = Date.now();
    const totals = new Map<number, { ms: number; sessions: number }>();
    for (const t of this.sessions.totalsByApp(0, now)) totals.set(t.appId, { ms: t.ms, sessions: t.sessions });
    return this.apps.list(search, category).map((a) => ({
      ...a,
      totalMs: totals.get(a.id)?.ms ?? 0,
      sessions: totals.get(a.id)?.sessions ?? 0,
    }));
  }

  getApplicationDetail(id: number, startMs: number, endMs: number) {
    const app = this.apps.getById(id);
    if (!app) throw new Error('Application not found.');
    const sessions = this.sessions.listInRange(startMs, endMs, id, undefined, 100000);
    const rows = sessions.map((s) => ({ startMs: s.startMs, endMs: s.endMs, category: s.category }));
    const stats = sessionStats(rows, startMs, endMs);
    return {
      app,
      totalMs: stats.totalMs,
      sessions: stats.count,
      avgMs: stats.avgMs,
      longestMs: stats.longestMs,
      daily: dailySeries(rows, startMs, endMs),
    };
  }

  setAppCategory(id: number, category: string, classification: string): void {
    this.apps.setCategory(id, category as never, classification as never);
  }

  setAppExcluded(id: number, excluded: boolean): void {
    this.apps.setExcluded(id, excluded);
  }

  listAppRules() {
    return this.apps.listRules();
  }

  createAppRule(match: string, category: string, classification: string): number {
    return this.apps.addRule(match, category as never, classification as never);
  }

  classify(processName: string, appName: string) {
    const rules = this.apps.listRules().map((r) => ({ match: r.match, category: r.category, classification: r.classification }));
    return classifyApp(processName, appName, rules);
  }

  // ---- Projects -----------------------------------------------------------
  listProjects(includeArchived = false) {
    const now = Date.now();
    const totals = new Map<number | null, number>();
    for (const t of this.sessions.totalsByProject(0, now)) totals.set(t.projectId, t.ms);
    return this.projects.list(includeArchived).map((p) => ({
      ...p,
      repositoryCount: this.projects.repoIds(p.id).length,
      totalMs: totals.get(p.id) ?? 0,
    }));
  }

  createProject(name: string, description = '', category = '', color = '#286844'): number {
    const id = this.projects.create(name, description, category, color);
    this.misc.audit('project_created', 'project', id, null);
    return id;
  }

  updateProject(id: number, patch: { name?: string; description?: string; category?: string; color?: string }): void {
    this.projects.update(id, patch);
  }

  setProjectArchived(id: number, archived: boolean): void {
    this.projects.setArchived(id, archived);
  }

  removeProject(id: number): void {
    this.projects.remove(id);
    this.misc.audit('project_deleted', 'project', id, null);
  }

  linkRepo(projectId: number, repoId: number): void {
    this.projects.linkRepo(projectId, repoId);
  }

  unlinkRepo(projectId: number, repoId: number): void {
    this.projects.unlinkRepo(projectId, repoId);
  }

  getProjectStats(id: number, startMs: number, endMs: number) {
    const sessions = this.sessions.listInRange(startMs, endMs, undefined, id, 100000);
    const rows = sessions.map((s) => ({ startMs: s.startMs, endMs: s.endMs, category: s.category, appName: s.appName }));
    const stats = sessionStats(rows, startMs, endMs);
    const coding = codingMs(rows, startMs, endMs);
    const repoIds = this.projects.repoIds(id);
    let commits = 0;
    for (const repoId of repoIds) {
      commits += this.commits.list(repoId, '', startMs, endMs, 100000).length;
    }
    return {
      totalMs: stats.totalMs,
      codingMs: coding,
      sessions: stats.count,
      commits,
      daily: dailySeries(rows, startMs, endMs),
      apps: totalsByApp(rows, startMs, endMs),
    };
  }

  // ---- Repositories & Git -------------------------------------------------
  listRepositories() {
    return this.repos.list();
  }

  addRepository(pathValue: string, projectId: number | null): number {
    validateRepoPath(pathValue);
    const name = path.basename(pathValue);
    const id = this.repos.add(pathValue, name, projectId);
    if (projectId !== null) this.projects.linkRepo(projectId, id);
    this.misc.audit('repo_added', 'repository', id, null);
    return id;
  }

  removeRepository(id: number): void {
    this.repos.remove(id);
    this.misc.audit('repo_removed', 'repository', id, null);
  }

  setRepositoryEnabled(id: number, enabled: boolean): void {
    this.repos.setEnabled(id, enabled);
  }

  async scanRepository(id: number): Promise<{ added: number; total: number; error?: string }> {
    const repo = this.repos.list().find((r) => r.id === id);
    if (!repo) throw new Error('Repository not found.');
    if (!(await isGitAvailable())) {
      this.repos.setScanResult(id, Date.now(), 'Git is not installed or not on PATH.');
      return { added: 0, total: 0, error: 'Git is not installed or not on PATH.' };
    }
    try {
      const result = await scanRepository(repo.path);
      const added = this.commits.insertMany(id, result.commits);
      this.repos.setScanResult(id, Date.now(), null);
      this.misc.setRepoLanguages(id, result.languages);
      return { added, total: result.commits.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed.';
      this.repos.setScanResult(id, Date.now(), message);
      this.notify('Repository scan failed', `${repo.name}: scan failed. See Repositories for details.`);
      return { added: 0, total: 0, error: message };
    }
  }

  async scanAllRepositories(): Promise<{ scanned: number; added: number; errors: string[] }> {
    const enabled = this.repos.list().filter((r) => r.enabled);
    let added = 0;
    const errors: string[] = [];
    for (const repo of enabled) {
      const result = await this.scanRepository(repo.id);
      added += result.added;
      if (result.error) errors.push(`${repo.name}: ${result.error}`);
    }
    return { scanned: enabled.length, added, errors };
  }

  async scanAllIfDue(): Promise<void> {
    const settings = this.getSettings();
    if (!settings.gitEnabled) return;
    const repos = this.repos.list().filter((r) => r.enabled);
    const intervalMs = settings.gitScanIntervalMin * 60 * 1000;
    const now = Date.now();
    for (const repo of repos) {
      if (repo.lastScanMs === null || now - repo.lastScanMs >= intervalMs) {
        await this.scanRepository(repo.id);
      }
    }
  }

  discoverRepositories(root: string) {
    return discoverRepositories(root);
  }

  listCommits(repoId?: number, search = '', startMs?: number, endMs?: number, limit = 500) {
    return this.commits.list(repoId, search, startMs, endMs, limit);
  }

  getRepoLanguages(repoId: number) {
    return this.misc.getRepoLanguages(repoId);
  }

  // ---- Focus & goals ------------------------------------------------------
  getCurrentFocus() {
    const current = this.focus.current();
    if (!current) return null;
    return {
      id: current.id,
      startMs: current.startMs,
      endMs: null,
      plannedMs: current.plannedMs,
      actualMs: null,
      status: 'running' as const,
      projectId: current.projectId,
      projectName: current.projectName,
      notes: current.notes,
    };
  }

  startFocus(plannedMin: number, projectId: number | null, notes = ''): number {
    if (this.focus.current()) throw new Error('A focus session is already running.');
    const id = this.focus.start(plannedMin * 60 * 1000, projectId, notes);
    this.tracker.setFocusProject(projectId);
    return id;
  }

  stopFocus(id: number, status: 'completed' | 'cancelled'): void {
    this.focus.stop(id, status);
    this.tracker.setFocusProject(null);
    if (status === 'completed') this.notify('Focus session complete', 'Your focus session finished.');
  }

  getFocusHistory(startMs: number, endMs: number) {
    return this.focus.history(startMs, endMs);
  }

  getFocusStats(startMs: number, endMs: number) {
    const rows = this.focus.history(startMs, endMs).filter((f) => f.status === 'completed' && f.actualMs !== null);
    const totalMs = rows.reduce((s, f) => s + (f.actualMs ?? 0), 0);
    return {
      count: rows.length,
      totalMs,
      avgMs: rows.length ? totalMs / rows.length : 0,
      longestMs: rows.length ? Math.max(...rows.map((f) => f.actualMs ?? 0)) : 0,
      completed: rows.length,
    };
  }

  listGoals() {
    return this.goals.list();
  }

  createGoal(name: string, type: string, targetMin: number, projectId: number | null): number {
    const period = type.endsWith('_daily') ? 'daily' : 'weekly';
    const id = this.goals.create(name, type, targetMin * 60 * 1000, projectId);
    void period;
    return id;
  }

  removeGoal(id: number): void {
    this.goals.remove(id);
  }

  getGoalProgress(startMs: number, endMs: number) {
    const day = localDayRange(new Date(startMs));
    const week = localWeekRange(new Date(startMs), this.getSettings().firstDayOfWeek);
    void endMs;
    return this.goals.list().filter((g) => g.enabled).map((g) => {
      let currentMs = 0;
      if (g.type === 'coding_daily') {
        currentMs = codingMs(this.allSessionsInRange(day.startMs, day.endMs), day.startMs, day.endMs);
      } else if (g.type === 'coding_weekly') {
        currentMs = codingMs(this.allSessionsInRange(week.startMs, week.endMs), week.startMs, week.endMs);
      } else if (g.type === 'focus_daily') {
        currentMs = this.getFocusStats(day.startMs, day.endMs).totalMs;
      } else if (g.type === 'project_weekly' && g.projectId !== null) {
        const rows = this.sessions.listInRange(week.startMs, week.endMs, undefined, g.projectId, 100000);
        currentMs = rows.reduce((s, r) => s + Math.max(0, Math.min(r.endMs, week.endMs) - Math.max(r.startMs, week.startMs)), 0);
      }
      return {
        goal: {
          id: g.id,
          name: g.name,
          type: g.type as 'coding_daily' | 'coding_weekly' | 'focus_daily' | 'project_weekly',
          targetMs: g.targetMs,
          period: g.type.endsWith('_daily') ? 'daily' : 'weekly',
          projectId: g.projectId,
          projectName: g.projectName,
          enabled: g.enabled,
          createdAt: '',
        },
        currentMs,
        pct: goalProgress(currentMs, g.targetMs),
      };
    });
  }

  // ---- Insights -----------------------------------------------------------
  generateInsights(startMs: number, endMs: number) {
    const span = endMs - startMs;
    const prevStartMs = startMs - span;
    const prevEndMs = startMs;
    const current = this.allSessionsInRange(startMs, endMs);
    const previous = this.allSessionsInRange(prevStartMs, prevEndMs);
    const period = `${new Date(startMs).toISOString().slice(0, 10)}_${new Date(endMs).toISOString().slice(0, 10)}`;
    const goals = this.getGoalProgress(startMs, endMs).map((g) => ({
      name: g.goal.name,
      currentMs: g.currentMs,
      targetMs: g.goal.targetMs,
    }));
    const projectLastActive = this.projects.list(true).map((p) => {
      const rows = this.sessions.listInRange(0, endMs, undefined, p.id, 1);
      return { name: p.name, lastActiveMs: rows.length ? rows[0]!.endMs : null };
    });
    const focusAvg = this.getFocusStats(startMs, endMs).avgMs;
    const prevFocusAvg = this.getFocusStats(prevStartMs, prevEndMs).avgMs;
    const generated = generateInsights({
      current,
      previous,
      startMs,
      endMs,
      prevStartMs,
      prevEndMs,
      period,
      goals,
      projectLastActive,
      focusAvgMs: focusAvg,
      prevFocusAvgMs: prevFocusAvg,
    });
    for (const g of generated) {
      this.insightsRepo.upsert(g.type, g.period, g.title, g.detail, g.metrics);
    }
    return this.insightsRepo.list();
  }

  listInsights() {
    return this.insightsRepo.list();
  }

  dismissInsight(id: number): void {
    this.insightsRepo.dismiss(id);
  }

  // ---- Reports ------------------------------------------------------------
  buildReport(kind: string, startMs: number, endMs: number): ReportData {
    const summary = this.getSummary(startMs, endMs);
    const sessions = this.allSessionsInRange(startMs, endMs);
    return {
      kind,
      startMs,
      endMs,
      summary: {
        totalActiveMs: summary.totalActiveMs,
        codingMs: summary.codingMs,
        sessions: summary.sessionCount,
        appsUsed: summary.appCount,
        commits: summary.commits,
        focusMs: summary.focusMs,
        focusSessions: summary.focusCount,
      },
      apps: totalsByApp(sessions, startMs, endMs),
      projects: totalsByProject(sessions, startMs, endMs).map((p) => ({ name: p.name, ms: p.ms, sessions: p.sessions })),
      daily: dailySeries(sessions, startMs, endMs),
      commitsDaily: gitDailyCounts(this.commits.list(undefined, '', startMs, endMs, 100000).map((c) => ({ commitMs: c.commitMs })), startMs, endMs),
      goals: this.getGoalProgress(startMs, endMs).map((g) => ({
        name: g.goal.name,
        currentMs: g.currentMs,
        targetMs: g.goal.targetMs,
        pct: g.pct,
      })),
    };
  }

  exportCsv(kind: string, startMs: number, endMs: number): string {
    return reportToCsv(this.buildReport(kind, startMs, endMs));
  }

  exportJson(kind: string, startMs: number, endMs: number): string {
    return JSON.stringify(this.buildReport(kind, startMs, endMs), null, 2);
  }

  exportHtml(kind: string, startMs: number, endMs: number): string {
    return reportToHtml(this.buildReport(kind, startMs, endMs));
  }

  // ---- Data management ----------------------------------------------------
  getDataInfo() {
    const bounds = this.sessions.bounds();
    return {
      path: this.db.path,
      sizeBytes: this.db.sizeBytes(),
      sessions: this.sessions.countAll(),
      apps: this.apps.list().length,
      projects: this.projects.list(true).length,
      repos: this.repos.list().length,
      earliestMs: bounds.earliest,
      latestMs: bounds.latest,
      lastBackupMs: this.misc.lastBackupMs(),
    };
  }

  async createBackup(): Promise<{ path: string; bytes: number }> {
    const dir = path.join(path.dirname(this.db.path), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest = path.join(dir, `telemetry-backup-${stamp}.db`);
    const bytes = await this.db.backup(dest);
    this.notify('Backup complete', `Backup saved (${Math.round(bytes / 1024)} KB).`);
    return { path: dest, bytes };
  }

  integrity() {
    return this.db.integrity();
  }

  maintenance(): void {
    this.db.maintenance();
  }

  deleteRange(startMs: number, endMs: number): number {
    const handle = this.db.handle;
    const count = (handle.prepare('SELECT COUNT(*) AS c FROM activity_sessions WHERE start_ms < ? AND end_ms >= ?').get(endMs, startMs) as { c: number }).c;
    const tx = handle.transaction(() => {
      handle.prepare('DELETE FROM activity_sessions WHERE start_ms < ? AND end_ms >= ?').run(endMs, startMs);
      handle.prepare('DELETE FROM activity_events WHERE timestamp_ms >= ? AND timestamp_ms < ?').run(startMs, endMs);
    });
    tx();
    this.misc.audit('activity_deleted_range', 'session', null, `${count} sessions`);
    return count;
  }

  deleteAllActivity(): void {
    const handle = this.db.handle;
    const tx = handle.transaction(() => {
      handle.prepare('DELETE FROM activity_sessions').run();
      handle.prepare('DELETE FROM activity_events').run();
      handle.prepare('DELETE FROM focus_sessions').run();
      handle.prepare('DELETE FROM insights').run();
      handle.prepare('DELETE FROM notifications').run();
    });
    tx();
    this.misc.audit('activity_deleted_all', 'session', null, null);
  }

  applyRetention(): number {
    const days = this.getSettings().retentionDays;
    if (days <= 0) return 0;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return this.deleteRange(0, cutoff);
  }

  // ---- Integrations & plugins ----------------------------------------------
  listIntegrations() {
    const settings = this.getSettings();
    return [
      { id: 'git', name: 'Git CLI', enabled: settings.gitEnabled, detail: 'Commit scanning via the local Git CLI. Repositories are never modified.' },
      { id: 'browser', name: 'Browser extension', enabled: false, detail: 'Not shipped in this release. Browser apps are tracked by foreground time only; tabs and domains are never inferred.' },
      { id: 'editor', name: 'Editor integrations', enabled: false, detail: 'Not shipped in this release. Editor time is measured by foreground application time.' },
      { id: 'local-api', name: 'Local read-only API', enabled: settings.localApiEnabled, detail: 'Localhost only (127.0.0.1:48123), token-protected, read-only.' },
      { id: 'local-ai', name: 'Local AI analysis', enabled: false, detail: 'Provider interface is implemented, but no model ships with the app. Deterministic insights are always available.' },
    ];
  }

  getLocalApiToken(): string {
    const settings = this.getSettings();
    if (settings.localApiToken) return settings.localApiToken;
    const token = crypto.randomUUID();
    this.settingsRepo.set('localApiToken', token);
    return token;
  }

  rotateLocalApiToken(): string {
    const token = crypto.randomUUID();
    this.settingsRepo.set('localApiToken', token);
    if (this.apiServer?.running) {
      this.stopLocalApi();
      this.startLocalApi();
    }
    return token;
  }

  setLocalApiEnabled(enabled: boolean): void {
    this.updateSettings({ localApiEnabled: enabled });
  }

  startLocalApi(): void {
    if (this.apiServer?.running) return;
    const token = this.getLocalApiToken();
    this.apiServer = new LocalApiServer(
      {
        getStatus: () => this.tracker.getStatus(),
        getSummary: (s, e) => this.getSummary(s, e),
        listApps: () => this.listApplications(),
        listProjects: () => this.listProjects(),
        listRepos: () => this.listRepositories(),
        listCommits: (limit) => this.listCommits(undefined, '', undefined, undefined, limit),
      },
      () => token,
    );
    this.apiServer.start(48123);
  }

  stopLocalApi(): void {
    this.apiServer?.stop();
    this.apiServer = null;
  }

  listPlugins() {
    const stored = this.settingsRepo.getAll();
    const builtins = [
      { id: 'export-csv', name: 'CSV exporter', version: '1.0.0', description: 'Exports reports and sessions as CSV.' },
      { id: 'export-json', name: 'JSON exporter', version: '1.0.0', description: 'Exports reports as structured JSON.' },
      { id: 'export-html', name: 'HTML report exporter', version: '1.0.0', description: 'Exports printable HTML reports.' },
      { id: 'export-pdf', name: 'PDF exporter', version: '1.0.0', description: 'Exports reports as PDF via the built-in print engine.' },
    ];
    return builtins.map((p) => ({
      ...p,
      enabled: stored[`plugin.${p.id}`] !== false,
    }));
  }

  setPlugin(id: string, enabled: boolean): void {
    this.settingsRepo.set(`plugin.${id}`, enabled);
  }

  // ---- Notifications --------------------------------------------------------
  notify(title: string, body: string): void {
    const settings = this.getSettings();
    if (!settings.notificationsEnabled) return;
    if (settings.quietHoursEnabled) {
      const hour = new Date().getHours();
      const { quietStartHour, quietEndHour } = settings;
      const inQuiet = quietStartHour <= quietEndHour
        ? hour >= quietStartHour && hour < quietEndHour
        : hour >= quietStartHour || hour < quietEndHour;
      if (inQuiet) return;
    }
    this.misc.notify('info', title, body);
    this.host.notify?.(title, body);
  }
}
