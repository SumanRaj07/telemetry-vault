import { describe, expect, it } from 'vitest';
import {
  manualSessionSchema,
  settingsPatchSchema,
} from '../../src/main/utils/validate';
import { validateRepoPath } from '../../src/main/tracking/git';
import { reportToCsv } from '../../src/main/analytics/reports';

describe('security validation', () => {
  it('rejects settings below safe minimums', () => {
    expect(() => settingsPatchSchema.parse({ idleThresholdSec: 5 })).toThrow();
    expect(() => settingsPatchSchema.parse({ pollIntervalMs: 100 })).toThrow();
    expect(() => settingsPatchSchema.parse({ retentionDays: -1 })).toThrow();
  });

  it('rejects unknown settings keys (strict schema)', () => {
    expect(() => settingsPatchSchema.parse({ evilKey: true })).toThrow();
  });

  it('accepts a valid partial settings patch', () => {
    const parsed = settingsPatchSchema.parse({ idleThresholdSec: 600, trackingEnabled: false });
    expect(parsed.idleThresholdSec).toBe(600);
    expect(parsed.trackingEnabled).toBe(false);
  });

  it('rejects manual sessions with end before start', () => {
    expect(() =>
      manualSessionSchema.parse({ appId: 1, startMs: 5000, endMs: 1000 }),
    ).toThrow();
  });

  it('rejects repository paths that could escape the intended folder', () => {
    expect(() => validateRepoPath('relative/path')).toThrow();
    expect(() => validateRepoPath('/tmp/x\0y')).toThrow();
  });

  it('escapes CSV injection characters in report exports', () => {
    const csv = reportToCsv({
      kind: 'daily',
      startMs: 0,
      endMs: 1000,
      summary: { totalActiveMs: 0, codingMs: 0, sessions: 0, appsUsed: 0, commits: 0, focusMs: 0, focusSessions: 0 },
      apps: [{ name: 'Evil"=cmd|', category: 'other', ms: 1000, sessions: 1 }],
      projects: [],
      daily: [],
      commitsDaily: [],
      goals: [],
    });
    expect(csv).toContain('"Evil""=cmd|"');
  });
});
