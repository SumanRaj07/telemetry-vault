// Tracking engine: polls the foreground window, applies idle detection,
// owns the lifecycle of activity sessions, and survives crashes.
//
// Session accuracy model: a session row is created with end = start and its
// end time is extended on every tick ("heartbeat"). A crash therefore leaves
// the session ending at the last successful tick instead of losing the whole
// session. On startup, orphaned open sessions are closed at their last
// heartbeat. Durations are recomputed from start/end, never accumulated, so
// adjacent sessions never double-count a boundary (half-open intervals).
import type { AppRepository, EventRepository, SessionRepository } from '../db/repositories';
import type { Settings, TrackingStatusInfo } from '../../shared/types';
import type { IActivityProvider, IIdleProvider } from './providers';
import { isCodingCategory } from './classify';
import type { AppCategory, Classification } from '../../shared/types';

export interface TrackerDeps {
  sessions: SessionRepository;
  apps: AppRepository;
  events: EventRepository;
  getSettings: () => Settings;
  classify: (processName: string, appName: string) => { category: AppCategory; classification: Classification };
  activityProvider: IActivityProvider;
  idleProvider: IIdleProvider | null;
  onStatusChange?: (status: TrackingStatusInfo) => void;
}

export class TrackerService {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ticking = false;
  private stopped = true;
  private paused = false;
  private currentSessionId: number | null = null;
  private currentKey: string | null = null;
  private currentAppId: number | null = null;
  private idleSinceMs: number | null = null;
  private focusProjectId: number | null = null;
  private lockPaused = false;

  constructor(private deps: TrackerDeps) {}

  /** Close orphaned open sessions left by a crash, at their last heartbeat. */
  recover(): void {
    this.deps.sessions.closeAllOpen(0, 'recovered');
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.paused = false;
    this.recover();
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stopped = true;
    this.closeCurrent(Date.now());
    this.emitStatus();
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.closeCurrent(Date.now());
    this.deps.events.insert('tracking_paused', Date.now(), null, null, null);
    this.emitStatus();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.deps.events.insert('tracking_resumed', Date.now(), null, null, null);
    this.emitStatus();
  }

  setFocusProject(projectId: number | null): void {
    this.focusProjectId = projectId;
  }

  /** The currently open session with its end time projected to now. */
  getOpenSession(): import('../db/repositories').SessionRow | null {
    if (this.currentSessionId === null) return null;
    const session = this.deps.sessions.getById(this.currentSessionId);
    if (!session || session.status !== 'open') return null;
    const now = Date.now();
    return { ...session, endMs: now, durationMs: Math.max(0, now - session.startMs) };
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  /** Single tick, also callable directly by tests with a mocked provider. */
  async tick(): Promise<void> {
    if (this.ticking || this.stopped || this.paused) return;
    this.ticking = true;
    try {
      const settings = this.deps.getSettings();
      if (!settings.trackingEnabled) return;
      const now = Date.now();
      if (settings.scheduleEnabled && !this.withinSchedule(settings, now)) {
        this.closeCurrent(now);
        return;
      }
      const idleSeconds = this.deps.idleProvider?.isAvailable()
        ? this.deps.idleProvider.getIdleSeconds()
        : 0;
      if (idleSeconds >= settings.idleThresholdSec) {
        if (this.idleSinceMs === null) {
          // The user went idle (now - idleSeconds) ago: the session must end
          // there, not now, so idle time is never counted as usage. Clamp to
          // the current session's start: the OS idle counter can exceed the
          // session's age (e.g. tracking started while already idle).
          this.idleSinceMs = now - idleSeconds * 1000;
          if (this.currentSessionId !== null) {
            const current = this.deps.sessions.getById(this.currentSessionId);
            if (current && this.idleSinceMs < current.startMs) {
              this.idleSinceMs = current.startMs;
            }
          }
          this.closeCurrent(this.idleSinceMs);
          this.deps.events.insert('idle_start', this.idleSinceMs, null, null, { idleSeconds });
        }
        return;
      }
      if (this.idleSinceMs !== null) {
        this.deps.events.insert('idle_end', now, null, null, { idleMs: now - this.idleSinceMs });
        this.idleSinceMs = null;
      }
      const win = await this.deps.activityProvider.getActiveWindow();
      if (!win) {
        this.closeCurrent(now);
        return;
      }
      const key = `${win.processName}::${win.appName}`;
      if (this.currentSessionId !== null && this.currentKey === key) {
        this.deps.sessions.touch(this.currentSessionId, now);
        return;
      }
      this.closeCurrent(now);
      const { category, classification } = this.deps.classify(win.processName, win.appName);
      const appId = this.deps.apps.upsert(
        win.processName,
        win.appName,
        settings.collectExecutablePaths ? (win.executablePath ?? null) : null,
        category,
        classification,
      );
      const app = this.deps.apps.getById(appId);
      if (!app || !app.trackingEnabled || app.excluded) {
        this.currentSessionId = null;
        this.currentKey = null;
        this.currentAppId = null;
        return;
      }
      const projectId = isCodingCategory(category) ? this.focusProjectId : null;
      const id = this.deps.sessions.insert(appId, projectId, now, 'foreground', 1.0, false);
      this.currentSessionId = id;
      this.currentKey = key;
      this.currentAppId = appId;
    } finally {
      this.ticking = false;
    }
  }

  handleSystemEvent(event: 'suspend' | 'resume' | 'lock-screen' | 'unlock-screen'): void {
    const now = Date.now();
    const settings = this.deps.getSettings();
    if (event === 'suspend') {
      this.closeCurrent(now);
      this.deps.events.insert('sleep', now, null, null, null);
    } else if (event === 'resume') {
      this.deps.events.insert('wake', now, null, null, null);
    } else if (event === 'lock-screen') {
      this.deps.events.insert('lock', now, null, null, null);
      if (settings.lockBehavior === 'pause') {
        this.lockPaused = true;
        this.pause();
      } else if (settings.lockBehavior === 'stop_session') {
        this.closeCurrent(now);
      }
    } else if (event === 'unlock-screen') {
      this.deps.events.insert('unlock', now, null, null, null);
      if (this.lockPaused) {
        this.lockPaused = false;
        this.resume();
      }
    }
  }

  getStatus(): TrackingStatusInfo {
    const settings = this.deps.getSettings();
    const idleSeconds = this.deps.idleProvider?.isAvailable()
      ? this.deps.idleProvider.getIdleSeconds()
      : 0;
    let status: TrackingStatusInfo['status'];
    let reason: string | null = null;
    if (this.stopped) {
      status = 'stopped';
    } else if (this.paused) {
      status = 'paused';
      reason = 'Tracking is paused.';
    } else if (!this.deps.activityProvider.isAvailable()) {
      status = 'unavailable';
      reason = 'No foreground-window provider is available on this system.';
    } else if (!settings.trackingEnabled) {
      status = 'paused';
      reason = 'Tracking is disabled in settings.';
    } else {
      status = 'active';
    }
    let currentApp: string | null = null;
    let currentProcess: string | null = null;
    let sessionStartMs: number | null = null;
    if (this.currentSessionId !== null && this.currentAppId !== null) {
      const session = this.deps.sessions.getById(this.currentSessionId);
      const app = this.deps.apps.getById(this.currentAppId);
      if (session) {
        currentApp = app?.displayName ?? null;
        currentProcess = app?.processName ?? null;
        sessionStartMs = session.startMs;
      }
    }
    return { status, currentApp, currentProcess, sessionStartMs, idleSeconds, reason };
  }

  private withinSchedule(settings: Settings, nowMs: number): boolean {
    const d = new Date(nowMs);
    const day = d.getDay();
    if (!settings.scheduleDays.includes(day)) return false;
    const hour = d.getHours();
    if (settings.scheduleStartHour <= settings.scheduleEndHour) {
      return hour >= settings.scheduleStartHour && hour < settings.scheduleEndHour;
    }
    // Overnight schedule, e.g. 22:00-06:00.
    return hour >= settings.scheduleStartHour || hour < settings.scheduleEndHour;
  }

  private closeCurrent(endMs: number): void {
    if (this.currentSessionId !== null) {
      this.deps.sessions.close(this.currentSessionId, endMs);
    }
    this.currentSessionId = null;
    this.currentKey = null;
    this.currentAppId = null;
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    const interval = Math.max(1000, this.deps.getSettings().pollIntervalMs || 5000);
    this.timer = setTimeout(async () => {
      await this.tick();
      this.emitStatus();
      this.scheduleNext();
    }, interval);
  }

  private emitStatus(): void {
    this.deps.onStatusChange?.(this.getStatus());
  }
}
