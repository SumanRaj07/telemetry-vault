// End-to-end flow: tracker writes sessions -> services summarize -> analytics
// agree with the stored rows. Uses an in-memory database and a scripted
// provider, so it runs anywhere (no Windows APIs involved).
import { describe, expect, it, vi } from 'vitest';
import { TelemetryDatabase } from '../../src/main/db/database';
import { AppRepository, EventRepository, SessionRepository } from '../../src/main/db/repositories';
import { TrackerService } from '../../src/main/tracking/tracker';
import { MockActivityProvider } from '../../src/main/tracking/providers';
import { AppServices } from '../../src/main/services/services';
import { classifyApp } from '../../src/main/tracking/classify';

describe('tracker -> database -> analytics', () => {
  it('produces summaries consistent with stored sessions', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 28, 9, 0, 0));
    const db = new TelemetryDatabase(':memory:');
    db.open();
    const handle = db.handle;
    const holder: { get: () => ReturnType<AppServices['getSettings']> } = {
      get: () => services.getSettings(),
    };
    const provider = new MockActivityProvider([
      { window: { processName: 'Code.exe', appName: 'Code' }, idleSeconds: 0 },
      { window: { processName: 'chrome.exe', appName: 'Chrome' }, idleSeconds: 0 },
    ]);
    const tracker = new TrackerService({
      sessions: new SessionRepository(handle),
      apps: new AppRepository(handle),
      events: new EventRepository(handle),
      getSettings: () => holder.get(),
      classify: (p, a) => classifyApp(p, a),
      activityProvider: provider,
      idleProvider: provider,
    });
    const services = new AppServices(db, tracker, {});
    tracker.start();
    await tracker.tick(); // Code session starts at t0
    // Async advance: each poll tick completes (touching Code) before the next
    // fires, so the clock genuinely reaches t0 + 30 min.
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    provider.advance(); // foreground switches to Chrome
    await tracker.tick(); // Chrome starts, Code session closes at t0 + 30 min
    tracker.stop();

    const dayStart = new Date(2026, 9, 28).getTime();
    const summary = services.getSummary(dayStart, dayStart + 24 * 60 * 60 * 1000);
    expect(summary.sessionCount).toBe(2);
    expect(summary.codingMs).toBe(30 * 60 * 1000);
    expect(summary.appCount).toBe(2);
    expect(summary.totalActiveMs).toBe(30 * 60 * 1000);

    const apps = services.listApplications();
    expect(apps.find((a) => a.displayName === 'Code')?.category).toBe('development');
    expect(apps.find((a) => a.displayName === 'Chrome')?.category).toBe('browser');

    const timeline = services.getTimeline({ startMs: dayStart, endMs: dayStart + 24 * 60 * 60 * 1000 });
    expect(timeline.filter((t) => t.kind === 'session')).toHaveLength(2);
    db.close();
    vi.useRealTimers();
  });
});
