import { describe, expect, it } from 'vitest';
import {
  codingMs,
  dailySeries,
  gitDailyCounts,
  goalProgress,
  hourlyDistribution,
  sessionStats,
  totalsByApp,
  totalsByProject,
  trendCompare,
} from '../../src/main/analytics/analytics';

const H = 3600000;

describe('analytics', () => {
  const sessions = [
    { startMs: 0, endMs: 2 * H, category: 'development', appName: 'Code', projectId: 1, projectName: 'Alpha' },
    { startMs: 2 * H, endMs: 3 * H, category: 'browser', appName: 'Chrome', projectId: null, projectName: null },
    { startMs: 3 * H, endMs: 4 * H, category: 'development', appName: 'Code', projectId: 1, projectName: 'Alpha' },
  ];

  it('totalsByApp aggregates and sorts by time', () => {
    const totals = totalsByApp(sessions, 0, 4 * H);
    expect(totals[0]).toMatchObject({ name: 'Code', ms: 3 * H, sessions: 2 });
    expect(totals[1]).toMatchObject({ name: 'Chrome', ms: H, sessions: 1 });
  });

  it('codingMs only counts development sessions', () => {
    expect(codingMs(sessions, 0, 4 * H)).toBe(3 * H);
  });

  it('totalsByProject groups unassigned sessions', () => {
    const totals = totalsByProject(sessions, 0, 4 * H);
    expect(totals.find((t) => t.name === 'Alpha')?.ms).toBe(3 * H);
    expect(totals.find((t) => t.name === 'Unassigned')?.ms).toBe(H);
  });

  it('dailySeries splits sessions across midnight', () => {
    const day1End = new Date(2026, 9, 28).getTime() + 24 * H;
    const cross = [
      { startMs: day1End - H, endMs: day1End + H, category: 'development' },
    ];
    const series = dailySeries(cross, day1End - 24 * H, day1End + 24 * H);
    expect(series).toHaveLength(2);
    expect(series[0]!.ms).toBe(H);
    expect(series[1]!.ms).toBe(H);
  });

  it('hourlyDistribution attributes time to the correct hour', () => {
    const start = new Date(2026, 9, 28, 9, 0).getTime();
    const rows = [{ startMs: start, endMs: start + 90 * 60 * 1000, category: 'development' }];
    const hours = hourlyDistribution(rows, start, start + 24 * H);
    expect(hours[9]!.ms).toBe(H);
    expect(hours[10]!.ms).toBe(30 * 60 * 1000);
  });

  it('sessionStats computes count, average, and longest', () => {
    const stats = sessionStats(sessions, 0, 4 * H);
    expect(stats.count).toBe(3);
    expect(stats.totalMs).toBe(4 * H);
    expect(stats.longestMs).toBe(2 * H);
  });

  it('trendCompare handles a zero baseline', () => {
    expect(trendCompare(100, 0).pct).toBeNull();
    expect(trendCompare(150, 100).pct).toBe(50);
  });

  it('goalProgress caps at 100', () => {
    expect(goalProgress(30, 60)).toBe(50);
    expect(goalProgress(120, 60)).toBe(100);
    expect(goalProgress(10, 0)).toBe(0);
  });

  it('gitDailyCounts buckets commits by local day', () => {
    const day = new Date(2026, 9, 28, 10).getTime();
    const counts = gitDailyCounts([{ commitMs: day }, { commitMs: day + 1000 }], day - H, day + 24 * H);
    expect(counts).toHaveLength(1);
    expect(counts[0]!.count).toBe(2);
  });
});
