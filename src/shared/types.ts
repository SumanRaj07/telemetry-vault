// Shared types used by main, preload, and renderer. No Node/Electron imports
// here so this file is safe to import anywhere.

export type AppCategory =
  | 'development'
  | 'browser'
  | 'communication'
  | 'productivity'
  | 'entertainment'
  | 'utilities'
  | 'other'
  | 'uncategorized';

export type Classification = 'productive' | 'neutral' | 'distracting';

export type TrackingStatus = 'active' | 'paused' | 'unavailable' | 'stopped';

export type SessionSource =
  | 'foreground'
  | 'manual'
  | 'focus'
  | 'recovered';

export interface ActiveWindowInfo {
  processId?: number;
  processName: string;
  appName: string;
  title?: string;
  executablePath?: string;
}

export interface AppRecord {
  id: number;
  displayName: string;
  processName: string;
  executablePath: string | null;
  category: AppCategory;
  classification: Classification;
  trackingEnabled: boolean;
  excluded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
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
  source: SessionSource;
  confidence: number;
  manual: boolean;
  notes: string | null;
  status: 'open' | 'closed';
}

export interface ActivityEventRecord {
  id: number;
  type: string;
  timestampMs: number;
  appId: number | null;
  projectId: number | null;
  metadata: string | null;
}

export interface ProjectRecord {
  id: number;
  name: string;
  description: string;
  category: string;
  color: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  repositoryCount?: number;
  totalMs?: number;
}

export interface RepositoryRecord {
  id: number;
  path: string;
  name: string;
  projectId: number | null;
  projectName: string | null;
  enabled: boolean;
  lastScanMs: number | null;
  lastError: string | null;
  commitCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface GitCommitRecord {
  id: number;
  repoId: number;
  repoName: string;
  hash: string;
  message: string;
  authorName: string;
  authorEmail: string | null;
  commitMs: number;
  branch: string | null;
  firstSeenMs: number;
}

export interface FocusSessionRecord {
  id: number;
  startMs: number;
  endMs: number | null;
  plannedMs: number;
  actualMs: number | null;
  status: 'running' | 'completed' | 'cancelled';
  projectId: number | null;
  projectName: string | null;
  notes: string | null;
}

export interface GoalRecord {
  id: number;
  name: string;
  type: 'coding_daily' | 'coding_weekly' | 'focus_daily' | 'project_weekly';
  targetMs: number;
  period: string;
  projectId: number | null;
  projectName: string | null;
  enabled: boolean;
  createdAt: string;
}

export interface InsightRecord {
  id: number;
  type: string;
  period: string;
  title: string;
  detail: string;
  metricsJson: string;
  dismissed: boolean;
  createdMs: number;
}

export interface Settings {
  trackingEnabled: boolean;
  idleThresholdSec: number;
  pollIntervalMs: number;
  collectWindowTitles: boolean;
  collectExecutablePaths: boolean;
  scheduleEnabled: boolean;
  scheduleStartHour: number;
  scheduleEndHour: number;
  scheduleDays: number[];
  lockBehavior: 'pause' | 'stop_session' | 'ignore';
  gitEnabled: boolean;
  gitScanIntervalMin: number;
  gitFoldersJson: string;
  browserIntegrationEnabled: boolean;
  localApiEnabled: boolean;
  localApiToken: string;
  localAiEnabled: boolean;
  notificationsEnabled: boolean;
  quietHoursEnabled: boolean;
  quietStartHour: number;
  quietEndHour: number;
  breakReminderMin: number;
  retentionDays: number;
  startOnLogin: boolean;
  startMinimized: boolean;
  timeFormat: '12h' | '24h';
  firstDayOfWeek: number;
  theme: 'light';
}

export interface SummaryStats {
  rangeStartMs: number;
  rangeEndMs: number;
  totalActiveMs: number;
  codingMs: number;
  codingEstimateMs: number;
  sessionCount: number;
  appCount: number;
  commits: number;
  activeProjects: number;
  focusMs: number;
  focusCount: number;
  idleMs: number;
}

export interface TimelineItem {
  kind: 'session' | 'event' | 'commit' | 'focus';
  id: number;
  timestampMs: number;
  endMs?: number;
  title: string;
  subtitle: string;
  category?: AppCategory;
  projectName?: string | null;
  manual?: boolean;
}

export interface DateRange {
  startMs: number;
  endMs: number;
}

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface TrackingStatusInfo {
  status: TrackingStatus;
  currentApp: string | null;
  currentProcess: string | null;
  sessionStartMs: number | null;
  idleSeconds: number;
  reason: string | null;
}

// Preload API exposed to the renderer (implemented in src/preload/index.ts).
export interface TelemetryApi {
  tracking: {
    getStatus: () => Promise<TrackingStatusInfo>;
    start: () => Promise<boolean>;
    pause: () => Promise<boolean>;
    resume: () => Promise<boolean>;
    stop: () => Promise<boolean>;
  };
  activity: {
    getSummary: (range: DateRange) => Promise<SummaryStats>;
    getTimeline: (args: {
      startMs: number;
      endMs: number;
      search?: string;
      appId?: number;
      projectId?: number;
      kind?: string;
      limit?: number;
    }) => Promise<TimelineItem[]>;
    getSessions: (args: {
      startMs: number;
      endMs: number;
      appId?: number;
      projectId?: number;
      limit?: number;
    }) => Promise<SessionRecord[]>;
    updateSession: (args: { id: number; projectId?: number | null; notes?: string }) => Promise<boolean>;
    deleteSession: (args: { id: number }) => Promise<boolean>;
    mergeSessions: (args: { firstId: number; secondId: number }) => Promise<boolean>;
    splitSession: (args: { id: number; atMs: number }) => Promise<boolean>;
    createManualSession: (args: {
      appId: number;
      projectId?: number | null;
      startMs: number;
      endMs: number;
      notes?: string;
    }) => Promise<number>;
    getHourly: (range: DateRange) => Promise<{ hour: number; ms: number }[]>;
    getWeekday: (range: DateRange) => Promise<{ weekday: number; ms: number }[]>;
    getHeatmap: (range: DateRange) => Promise<{ date: string; ms: number }[]>;
  };
  applications: {
    list: (args?: { search?: string; category?: string }) => Promise<(AppRecord & { totalMs: number; sessions: number })[]>;
    get: (args: { id: number; startMs: number; endMs: number }) => Promise<{
      app: AppRecord;
      totalMs: number;
      sessions: number;
      avgMs: number;
      longestMs: number;
      daily: { date: string; ms: number }[];
    }>;
    setCategory: (args: { id: number; category: AppCategory; classification: Classification }) => Promise<boolean>;
    setExcluded: (args: { id: number; excluded: boolean }) => Promise<boolean>;
    createRule: (args: { match: string; category: AppCategory; classification: Classification }) => Promise<number>;
    listRules: () => Promise<{ id: number; match: string; category: AppCategory; classification: Classification }[]>;
  };
  projects: {
    list: (args?: { includeArchived?: boolean }) => Promise<ProjectRecord[]>;
    create: (args: { name: string; description?: string; category?: string; color?: string }) => Promise<number>;
    update: (args: { id: number; name?: string; description?: string; category?: string; color?: string }) => Promise<boolean>;
    setArchived: (args: { id: number; archived: boolean }) => Promise<boolean>;
    remove: (args: { id: number }) => Promise<boolean>;
    linkRepo: (args: { projectId: number; repoId: number }) => Promise<boolean>;
    unlinkRepo: (args: { projectId: number; repoId: number }) => Promise<boolean>;
    stats: (args: { id: number; startMs: number; endMs: number }) => Promise<{
      totalMs: number;
      codingMs: number;
      sessions: number;
      commits: number;
      daily: { date: string; ms: number }[];
      apps: { name: string; ms: number }[];
    }>;
  };
  repos: {
    list: () => Promise<RepositoryRecord[]>;
    add: (args: { path: string; projectId?: number | null }) => Promise<number>;
    remove: (args: { id: number }) => Promise<boolean>;
    setEnabled: (args: { id: number; enabled: boolean }) => Promise<boolean>;
    scan: (args: { id: number }) => Promise<{ added: number; total: number; error?: string }>;
    scanAll: () => Promise<{ scanned: number; added: number; errors: string[] }>;
    discover: (args: { root: string }) => Promise<{ path: string; name: string }[]>;
    commits: (args: { repoId?: number; search?: string; startMs?: number; endMs?: number; limit?: number }) => Promise<GitCommitRecord[]>;
    languages: (args: { repoId: number }) => Promise<{ language: string; files: number }[]>;
    pickFolder: () => Promise<string | null>;
  };
  focus: {
    current: () => Promise<FocusSessionRecord | null>;
    start: (args: { plannedMin: number; projectId?: number | null; notes?: string }) => Promise<number>;
    stop: (args: { id: number; status: 'completed' | 'cancelled' }) => Promise<boolean>;
    history: (args: { startMs: number; endMs: number }) => Promise<FocusSessionRecord[]>;
    stats: (args: { startMs: number; endMs: number }) => Promise<{
      count: number;
      totalMs: number;
      avgMs: number;
      longestMs: number;
      completed: number;
    }>;
  };
  goals: {
    list: () => Promise<GoalRecord[]>;
    create: (args: { name: string; type: GoalRecord['type']; targetMin: number; projectId?: number | null }) => Promise<number>;
    remove: (args: { id: number }) => Promise<boolean>;
    progress: (args: { startMs: number; endMs: number }) => Promise<{ goal: GoalRecord; currentMs: number; pct: number }[]>;
  };
  insights: {
    generate: (args: { startMs: number; endMs: number }) => Promise<InsightRecord[]>;
    list: () => Promise<InsightRecord[]>;
    dismiss: (args: { id: number }) => Promise<boolean>;
  };
  reports: {
    build: (args: { kind: string; startMs: number; endMs: number }) => Promise<Record<string, unknown>>;
    exportCsv: (args: { kind: string; startMs: number; endMs: number }) => Promise<string>;
    exportJson: (args: { kind: string; startMs: number; endMs: number }) => Promise<string>;
    exportHtml: (args: { kind: string; startMs: number; endMs: number }) => Promise<string>;
    saveFile: (args: { content: string; defaultName: string }) => Promise<boolean>;
    exportPdf: (args: { kind: string; startMs: number; endMs: number }) => Promise<boolean>;
  };
  data: {
    info: () => Promise<{
      path: string;
      sizeBytes: number;
      sessions: number;
      apps: number;
      projects: number;
      repos: number;
      earliestMs: number | null;
      latestMs: number | null;
      lastBackupMs: number | null;
    }>;
    backup: () => Promise<{ path: string; bytes: number }>;
    restore: (args: { path: string }) => Promise<boolean>;
    validateBackup: (args: { path: string }) => Promise<{ ok: boolean; detail: string }>;
    integrity: () => Promise<{ ok: boolean; detail: string }>;
    maintenance: () => Promise<boolean>;
    deleteRange: (args: { startMs: number; endMs: number }) => Promise<number>;
    deleteAll: () => Promise<boolean>;
    pickFile: () => Promise<string | null>;
  };
  settings: {
    get: () => Promise<Settings>;
    update: (args: Partial<Settings>) => Promise<boolean>;
    resetDefaults: () => Promise<boolean>;
  };
  integrations: {
    list: () => Promise<{ id: string; name: string; enabled: boolean; detail: string }[]>;
    setLocalApi: (args: { enabled: boolean }) => Promise<{ token: string } | boolean>;
    getLocalApiToken: () => Promise<string>;
    rotateLocalApiToken: () => Promise<string>;
    listPlugins: () => Promise<{ id: string; name: string; version: string; enabled: boolean; description: string }[]>;
    setPlugin: (args: { id: string; enabled: boolean }) => Promise<boolean>;
  };
  system: {
    openDashboard: () => Promise<boolean>;
    notifyTest: () => Promise<boolean>;
  };
}

declare global {
  interface Window {
    telemetry: TelemetryApi;
  }
}
