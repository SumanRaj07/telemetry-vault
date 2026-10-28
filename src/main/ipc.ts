// IPC registration: every renderer call lands here, is validated with zod,
// runs against AppServices, and returns { ok, data } or { ok: false, error }.
// Error messages are plain strings; stacks stay in the local log.
import { ipcMain } from 'electron';
import { TelemetryDatabase } from './db/database';
import type { AppServices } from './services/services';
import type { TrackerService } from './tracking/tracker';
import {
  dateRangeSchema,
  focusStartSchema,
  goalCreateSchema,
  idSchema,
  manualSessionSchema,
  projectCreateSchema,
  projectUpdateSchema,
  repoPathSchema,
  searchSchema,
  sessionUpdateSchema,
  settingsPatchSchema,
} from './utils/validate';

export interface IpcContext {
  services: AppServices;
  tracker: TrackerService;
  pickFolder: () => Promise<string | null>;
  pickFile: () => Promise<string | null>;
  saveFile: (content: string, defaultName: string) => Promise<boolean>;
  exportPdf: (html: string, defaultName: string) => Promise<boolean>;
  restore: (backupPath: string) => Promise<boolean>;
  openDashboard: () => void;
}

function parse<T>(schema: { parse: (v: unknown) => T }, value: unknown): T {
  return schema.parse(value);
}

export function registerIpcHandlers(ctx: IpcContext): void {
  const { services: s, tracker } = ctx;
  const h = (channel: string, fn: (args: never) => unknown | Promise<unknown>) => {
    ipcMain.handle(channel, async (_event, args) => {
      try {
        const data = await fn(args as never);
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Request failed.' };
      }
    });
  };

  // Tracking
  h('tracking:getStatus', () => tracker.getStatus());
  h('tracking:start', () => {
    if (tracker.isStopped) tracker.start();
    else if (tracker.isPaused) tracker.resume();
    return true;
  });
  h('tracking:pause', () => {
    tracker.pause();
    return true;
  });
  h('tracking:resume', () => {
    tracker.resume();
    return true;
  });
  h('tracking:stop', () => {
    tracker.stop();
    return true;
  });

  // Activity
  h('activity:getSummary', (a) => {
    const r = parse(dateRangeSchema, a);
    return s.getSummary(r.startMs, r.endMs);
  });
  h('activity:getTimeline', (a) => {
    const v = parse(searchSchema, a ?? {});
    return s.getTimeline({
      startMs: v.startMs ?? 0,
      endMs: v.endMs ?? Date.now(),
      search: v.search,
      appId: v.appId,
      projectId: v.projectId,
      kind: v.kind,
      limit: v.limit,
    });
  });
  h('activity:getSessions', (a) => {
    const v = parse(searchSchema, a ?? {});
    return s.getSessions(v.startMs ?? 0, v.endMs ?? Date.now(), v.appId, v.projectId, v.limit);
  });
  h('activity:updateSession', (a) => {
    const v = parse(sessionUpdateSchema, a);
    s.updateSession(v.id, v.projectId, v.notes);
    return true;
  });
  h('activity:deleteSession', (a) => {
    const v = parse(idSchema, a);
    s.deleteSession(v.id);
    return true;
  });
  h('activity:mergeSessions', (a) => {
    const v = a as { firstId: number; secondId: number };
    if (!Number.isInteger(v.firstId) || !Number.isInteger(v.secondId)) throw new Error('Invalid session ids.');
    s.mergeSessions(v.firstId, v.secondId);
    return true;
  });
  h('activity:splitSession', (a) => {
    const v = a as { id: number; atMs: number };
    if (!Number.isInteger(v.id) || !Number.isInteger(v.atMs)) throw new Error('Invalid split arguments.');
    return s.splitSession(v.id, v.atMs);
  });
  h('activity:createManualSession', (a) => {
    const v = parse(manualSessionSchema, a);
    return s.createManualSession(v.appId, v.projectId ?? null, v.startMs, v.endMs, v.notes);
  });
  h('activity:getHourly', (a) => {
    const r = parse(dateRangeSchema, a);
    return s.getHourly(r.startMs, r.endMs);
  });
  h('activity:getWeekday', (a) => {
    const r = parse(dateRangeSchema, a);
    return s.getWeekday(r.startMs, r.endMs);
  });
  h('activity:getHeatmap', (a) => {
    const r = parse(dateRangeSchema, a);
    return s.getHeatmap(r.startMs, r.endMs);
  });

  // Applications
  h('applications:list', (a) => {
    const v = parse(searchSchema, a ?? {});
    return s.listApplications(v.search ?? '', v.category ?? '');
  });
  h('applications:get', (a) => {
    const v = parse(searchSchema, a ?? {});
    if (v.appId === undefined || v.startMs === undefined || v.endMs === undefined) throw new Error('id and range required.');
    return s.getApplicationDetail(v.appId, v.startMs, v.endMs);
  });
  h('applications:setCategory', (a) => {
    const v = a as { id: number; category: string; classification: string };
    if (!Number.isInteger(v.id)) throw new Error('Invalid id.');
    s.setAppCategory(v.id, v.category, v.classification);
    return true;
  });
  h('applications:setExcluded', (a) => {
    const v = a as { id: number; excluded: boolean };
    if (!Number.isInteger(v.id) || typeof v.excluded !== 'boolean') throw new Error('Invalid arguments.');
    s.setAppExcluded(v.id, v.excluded);
    return true;
  });
  h('applications:createRule', (a) => {
    const v = a as { match: string; category: string; classification: string };
    if (!v.match || typeof v.match !== 'string') throw new Error('Match text required.');
    return s.createAppRule(v.match, v.category, v.classification);
  });
  h('applications:listRules', () => s.listAppRules());

  // Projects
  h('projects:list', (a) => {
    const v = (a ?? {}) as { includeArchived?: boolean };
    return s.listProjects(v.includeArchived ?? false);
  });
  h('projects:create', (a) => {
    const v = parse(projectCreateSchema, a);
    return s.createProject(v.name, v.description ?? '', v.category ?? '', v.color ?? '#286844');
  });
  h('projects:update', (a) => {
    const v = parse(projectUpdateSchema, a);
    s.updateProject(v.id, { name: v.name, description: v.description, category: v.category, color: v.color });
    return true;
  });
  h('projects:setArchived', (a) => {
    const v = a as { id: number; archived: boolean };
    if (!Number.isInteger(v.id) || typeof v.archived !== 'boolean') throw new Error('Invalid arguments.');
    s.setProjectArchived(v.id, v.archived);
    return true;
  });
  h('projects:remove', (a) => {
    const v = parse(idSchema, a);
    s.removeProject(v.id);
    return true;
  });
  h('projects:linkRepo', (a) => {
    const v = a as { projectId: number; repoId: number };
    if (!Number.isInteger(v.projectId) || !Number.isInteger(v.repoId)) throw new Error('Invalid ids.');
    s.linkRepo(v.projectId, v.repoId);
    return true;
  });
  h('projects:unlinkRepo', (a) => {
    const v = a as { projectId: number; repoId: number };
    if (!Number.isInteger(v.projectId) || !Number.isInteger(v.repoId)) throw new Error('Invalid ids.');
    s.unlinkRepo(v.projectId, v.repoId);
    return true;
  });
  h('projects:stats', (a) => {
    const v = parse(searchSchema, a ?? {});
    if (v.projectId === undefined || v.startMs === undefined || v.endMs === undefined) throw new Error('projectId and range required.');
    return s.getProjectStats(v.projectId, v.startMs, v.endMs);
  });

  // Repositories
  h('repos:list', () => s.listRepositories());
  h('repos:add', (a) => {
    const v = parse(repoPathSchema, a);
    return s.addRepository(v.path, v.projectId ?? null);
  });
  h('repos:remove', (a) => {
    const v = parse(idSchema, a);
    s.removeRepository(v.id);
    return true;
  });
  h('repos:setEnabled', (a) => {
    const v = a as { id: number; enabled: boolean };
    if (!Number.isInteger(v.id) || typeof v.enabled !== 'boolean') throw new Error('Invalid arguments.');
    s.setRepositoryEnabled(v.id, v.enabled);
    return true;
  });
  h('repos:scan', async (a) => {
    const v = parse(idSchema, a);
    return s.scanRepository(v.id);
  });
  h('repos:scanAll', async () => s.scanAllRepositories());
  h('repos:discover', (a) => {
    const v = a as { root: string };
    if (typeof v.root !== 'string' || !v.root) throw new Error('Root folder required.');
    return s.discoverRepositories(v.root);
  });
  h('repos:commits', (a) => {
    const v = parse(searchSchema, a ?? {});
    return s.listCommits(v.repoId, v.search ?? '', v.startMs, v.endMs, v.limit);
  });
  h('repos:languages', (a) => {
    const v = parse(idSchema, a);
    return s.getRepoLanguages(v.id);
  });
  h('repos:pickFolder', async () => ctx.pickFolder());

  // Focus
  h('focus:current', () => s.getCurrentFocus());
  h('focus:start', (a) => {
    const v = parse(focusStartSchema, a);
    return s.startFocus(v.plannedMin, v.projectId ?? null, v.notes ?? '');
  });
  h('focus:stop', (a) => {
    const v = a as { id: number; status: 'completed' | 'cancelled' };
    if (!Number.isInteger(v.id)) throw new Error('Invalid id.');
    s.stopFocus(v.id, v.status === 'cancelled' ? 'cancelled' : 'completed');
    return true;
  });
  h('focus:history', (a) => {
    const r = parse(dateRangeSchema, a);
    return s.getFocusHistory(r.startMs, r.endMs);
  });
  h('focus:stats', (a) => {
    const r = parse(dateRangeSchema, a);
    return s.getFocusStats(r.startMs, r.endMs);
  });

  // Goals
  h('goals:list', () => s.listGoals());
  h('goals:create', (a) => {
    const v = parse(goalCreateSchema, a);
    return s.createGoal(v.name, v.type, v.targetMin, v.projectId ?? null);
  });
  h('goals:remove', (a) => {
    const v = parse(idSchema, a);
    s.removeGoal(v.id);
    return true;
  });
  h('goals:progress', (a) => {
    const r = parse(dateRangeSchema, a);
    return s.getGoalProgress(r.startMs, r.endMs);
  });

  // Insights
  h('insights:generate', (a) => {
    const r = parse(dateRangeSchema, a);
    return s.generateInsights(r.startMs, r.endMs);
  });
  h('insights:list', () => s.listInsights());
  h('insights:dismiss', (a) => {
    const v = parse(idSchema, a);
    s.dismissInsight(v.id);
    return true;
  });

  // Reports
  h('reports:build', (a) => {
    const v = a as { kind: string; startMs: number; endMs: number };
    return s.buildReport(v.kind, v.startMs, v.endMs);
  });
  h('reports:exportCsv', (a) => {
    const v = a as { kind: string; startMs: number; endMs: number };
    return s.exportCsv(v.kind, v.startMs, v.endMs);
  });
  h('reports:exportJson', (a) => {
    const v = a as { kind: string; startMs: number; endMs: number };
    return s.exportJson(v.kind, v.startMs, v.endMs);
  });
  h('reports:exportHtml', (a) => {
    const v = a as { kind: string; startMs: number; endMs: number };
    return s.exportHtml(v.kind, v.startMs, v.endMs);
  });
  h('reports:saveFile', async (a) => {
    const v = a as { content: string; defaultName: string };
    return ctx.saveFile(v.content, v.defaultName);
  });
  h('reports:exportPdf', async (a) => {
    const v = a as { kind: string; startMs: number; endMs: number };
    const html = s.exportHtml(v.kind, v.startMs, v.endMs);
    return ctx.exportPdf(html, `${v.kind}-report.pdf`);
  });

  // Data
  h('data:info', () => s.getDataInfo());
  h('data:backup', async () => s.createBackup());
  h('data:restore', async (a) => {
    const v = a as { path: string };
    if (typeof v.path !== 'string' || !v.path) throw new Error('Backup path required.');
    return ctx.restore(v.path);
  });
  h('data:validateBackup', (a) => {
    const v = a as { path: string };
    if (typeof v.path !== 'string' || !v.path) throw new Error('Backup path required.');
    return TelemetryDatabase.validateBackupFile(v.path);
  });
  h('data:integrity', () => s.integrity());
  h('data:maintenance', () => {
    s.maintenance();
    return true;
  });
  h('data:deleteRange', (a) => {
    const r = parse(dateRangeSchema, a);
    return s.deleteRange(r.startMs, r.endMs);
  });
  h('data:deleteAll', () => {
    s.deleteAllActivity();
    return true;
  });
  h('data:pickFile', async () => ctx.pickFile());

  // Settings
  h('settings:get', () => s.getSettings());
  h('settings:update', (a) => {
    const v = parse(settingsPatchSchema, a ?? {});
    s.updateSettings(v);
    return true;
  });
  h('settings:resetDefaults', () => {
    s.resetSettings();
    return true;
  });

  // Integrations
  h('integrations:list', () => s.listIntegrations());
  h('integrations:setLocalApi', (a) => {
    const v = a as { enabled: boolean };
    if (typeof v.enabled !== 'boolean') throw new Error('Invalid arguments.');
    s.setLocalApiEnabled(v.enabled);
    return v.enabled ? { token: s.getLocalApiToken() } : true;
  });
  h('integrations:getLocalApiToken', () => s.getLocalApiToken());
  h('integrations:rotateLocalApiToken', () => s.rotateLocalApiToken());
  h('integrations:listPlugins', () => s.listPlugins());
  h('integrations:setPlugin', (a) => {
    const v = a as { id: string; enabled: boolean };
    if (typeof v.id !== 'string' || typeof v.enabled !== 'boolean') throw new Error('Invalid arguments.');
    s.setPlugin(v.id, v.enabled);
    return true;
  });

  // System
  h('system:openDashboard', () => {
    ctx.openDashboard();
    return true;
  });
  h('system:notifyTest', () => {
    s.notify('Telemetry Vault', 'Notifications are working.');
    return true;
  });
}
