import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryDatabase } from '../../src/main/db/database';
import { AppRepository, EventRepository, SessionRepository } from '../../src/main/db/repositories';
import { TrackerService } from '../../src/main/tracking/tracker';
import { MockActivityProvider } from '../../src/main/tracking/providers';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';
import { classifyApp } from '../../src/main/tracking/classify';

function makeTracker(script: { window: { processName: string; appName: string } | null; idleSeconds: number }[], settingsOverride: Partial<typeof DEFAULT_SETTINGS> = {}) {
  const db = new TelemetryDatabase(':memory:');
  db.open();
  const handle = db.handle;
  const settings = { ...DEFAULT_SETTINGS, ...settingsOverride };
  const provider = new MockActivityProvider(
    script.map((s) => ({
      window: s.window ? { processName: s.window.processName, appName: s.window.appName } : null,
      idleSeconds: s.idleSeconds,
    })),
  );
  const tracker = new TrackerService({
    sessions: new SessionRepository(handle),
    apps: new AppRepository(handle),
    events: new EventRepository(handle),
    getSettings: () => settings,
    classify: (p, a) => classifyApp(p, a),
    activityProvider: provider,
    idleProvider: provider,
  });
  return { db, tracker, provider, sessions: new SessionRepository(handle), events: new EventRepository(handle) };
}

describe('TrackerService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 28, 9, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates one session per app and closes on switch', async () => {
    const { db, tracker, provider, sessions } = makeTracker([
      { window: { processName: 'Code.exe', appName: 'Code' }, idleSeconds: 0 },
      { window: { processName: 'chrome.exe', appName: 'Chrome' }, idleSeconds: 0 },
    ]);
    tracker.start();
    await tracker.tick(); // Code session starts
    provider.advance(); // foreground switches to Chrome
    vi.advanceTimersByTime(5000);
    await tracker.tick(); // Chrome session starts, Code session closed
    tracker.stop();
    const rows = sessions.listInRange(0, Date.now() + 100000);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.appName === 'Code')).toBeDefined();
    expect(rows.find((r) => r.appName === 'Chrome')).toBeDefined();
    db.close();
  });

  it('closes the session when the user went idle, at the idle start time', async () => {
    const { db, tracker, provider, sessions } = makeTracker(
      [
        { window: { processName: 'Code.exe', appName: 'Code' }, idleSeconds: 0 },
        { window: { processName: 'Code.exe', appName: 'Code' }, idleSeconds: 400 },
      ],
      { idleThresholdSec: 300 },
    );
    tracker.start();
    await tracker.tick(); // t0: session starts
    provider.advance();
    vi.advanceTimersByTime(400 * 1000);
    await tracker.tick(); // idle 400s >= 300s threshold
    tracker.stop();
    const rows = sessions.listInRange(0, Date.now() + 100000);
    expect(rows).toHaveLength(1);
    // Session must end when idleness began (t0), not at the tick time.
    expect(rows[0]!.endMs - rows[0]!.startMs).toBe(0);
    db.close();
  });

  it('pause closes the current session and resume starts a new one', async () => {
    const { db, tracker, sessions } = makeTracker([
      { window: { processName: 'Code.exe', appName: 'Code' }, idleSeconds: 0 },
    ]);
    tracker.start();
    await tracker.tick();
    tracker.pause();
    expect(tracker.getStatus().status).toBe('paused');
    tracker.resume();
    await tracker.tick();
    tracker.stop();
    const rows = sessions.listInRange(0, Date.now() + 100000);
    expect(rows).toHaveLength(2);
    db.close();
  });

  it('recovers orphaned open sessions at their last heartbeat', () => {
    const { db, tracker } = makeTracker([]);
    // Insert an open session directly (simulating a crash mid-session).
    const handle = db.handle;
    const appRepo = new AppRepository(handle);
    const sessionRepo = new SessionRepository(handle);
    const id = appRepo.upsert('Code.exe', 'Code', null, 'development', 'productive');
    const start = Date.now() - 60000;
    const sessionId = sessionRepo.insert(id, null, start, 'foreground', 1.0, false);
    sessionRepo.touch(sessionId, start + 30000); // last heartbeat
    tracker.recover();
    const recovered = sessionRepo.getById(sessionId);
    expect(recovered?.status).toBe('closed');
    expect(recovered?.endMs).toBe(start + 30000);
    expect(recovered?.durationMs).toBe(30000);
    db.close();
  });

  it('sleep closes the session and wake records an event', async () => {
    const { db, tracker, sessions, events } = makeTracker([
      { window: { processName: 'Code.exe', appName: 'Code' }, idleSeconds: 0 },
    ]);
    tracker.start();
    await tracker.tick();
    tracker.handleSystemEvent('suspend');
    tracker.handleSystemEvent('resume');
    tracker.stop();
    const rows = sessions.listInRange(0, Date.now() + 100000);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('closed');
    const eventTypes = events.listInRange(0, Date.now() + 100000).map((e) => e.type);
    expect(eventTypes).toContain('sleep');
    expect(eventTypes).toContain('wake');
    db.close();
  });
});
