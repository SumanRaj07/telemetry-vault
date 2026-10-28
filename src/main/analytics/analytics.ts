// Pure analytics functions: no database, no UI, no Electron. Every function
// takes plain records and a half-open range [startMs, endMs) and returns
// plain data, so each one is unit-testable and reusable by the CLI and API.
import { overlapMs } from '../utils/time';

export interface SessionLike {
  startMs: number;
  endMs: number;
  category: string;
  appName?: string;
  projectId?: number | null;
  projectName?: string | null;
}

export function clippedMs(s: SessionLike, startMs: number, endMs: number): number {
  return overlapMs(s.startMs, s.endMs, startMs, endMs);
}

export function totalMs(sessions: SessionLike[], startMs: number, endMs: number): number {
  return sessions.reduce((sum, s) => sum + clippedMs(s, startMs, endMs), 0);
}

export function codingMs(sessions: SessionLike[], startMs: number, endMs: number): number {
  return sessions
    .filter((s) => s.category === 'development')
    .reduce((sum, s) => sum + clippedMs(s, startMs, endMs), 0);
}

export function totalsByApp(
  sessions: SessionLike[],
  startMs: number,
  endMs: number,
): { name: string; category: string; ms: number; sessions: number }[] {
  const map = new Map<string, { name: string; category: string; ms: number; sessions: number }>();
  for (const s of sessions) {
    const ms = clippedMs(s, startMs, endMs);
    if (ms <= 0) continue;
    const key = s.appName ?? 'Unknown';
    const entry = map.get(key) ?? { name: key, category: s.category, ms: 0, sessions: 0 };
    entry.ms += ms;
    entry.sessions += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.ms - a.ms);
}

export function totalsByProject(
  sessions: SessionLike[],
  startMs: number,
  endMs: number,
): { projectId: number | null; name: string; ms: number; sessions: number }[] {
  const map = new Map<string, { projectId: number | null; name: string; ms: number; sessions: number }>();
  for (const s of sessions) {
    const ms = clippedMs(s, startMs, endMs);
    if (ms <= 0) continue;
    const key = s.projectId === null || s.projectId === undefined ? 'null' : String(s.projectId);
    const entry = map.get(key) ?? {
      projectId: s.projectId ?? null,
      name: s.projectName ?? 'Unassigned',
      ms: 0,
      sessions: 0,
    };
    entry.ms += ms;
    entry.sessions += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.ms - a.ms);
}

/** Daily series, splitting sessions that cross midnight between days. */
export function dailySeries(
  sessions: SessionLike[],
  startMs: number,
  endMs: number,
): { date: string; ms: number }[] {
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    let cursor = Math.max(s.startMs, startMs);
    const end = Math.min(s.endMs, endMs);
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

export function hourlyDistribution(
  sessions: SessionLike[],
  startMs: number,
  endMs: number,
): { hour: number; ms: number }[] {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, ms: 0 }));
  for (const s of sessions) {
    let cursor = Math.max(s.startMs, startMs);
    const end = Math.min(s.endMs, endMs);
    while (cursor < end) {
      const d = new Date(cursor);
      const hourEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
      const sliceEnd = Math.min(end, hourEnd);
      hours[d.getHours()]!.ms += sliceEnd - cursor;
      cursor = sliceEnd;
    }
  }
  return hours;
}

export function weekdayDistribution(
  sessions: SessionLike[],
  startMs: number,
  endMs: number,
): { weekday: number; ms: number }[] {
  const days = Array.from({ length: 7 }, (_, weekday) => ({ weekday, ms: 0 }));
  for (const s of sessions) {
    let cursor = Math.max(s.startMs, startMs);
    const end = Math.min(s.endMs, endMs);
    while (cursor < end) {
      const d = new Date(cursor);
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      const sliceEnd = Math.min(end, dayEnd);
      days[d.getDay()]!.ms += sliceEnd - cursor;
      cursor = sliceEnd;
    }
  }
  return days;
}

export function sessionStats(
  sessions: SessionLike[],
  startMs: number,
  endMs: number,
): { count: number; totalMs: number; avgMs: number; longestMs: number } {
  const durations = sessions
    .map((s) => clippedMs(s, startMs, endMs))
    .filter((ms) => ms > 0);
  const totalMs = durations.reduce((a, b) => a + b, 0);
  return {
    count: durations.length,
    totalMs,
    avgMs: durations.length ? totalMs / durations.length : 0,
    longestMs: durations.length ? Math.max(...durations) : 0,
  };
}

export function trendCompare(
  currentMs: number,
  previousMs: number,
): { deltaMs: number; pct: number | null } {
  const deltaMs = currentMs - previousMs;
  const pct = previousMs > 0 ? (deltaMs / previousMs) * 100 : null;
  return { deltaMs, pct };
}

export function goalProgress(currentMs: number, targetMs: number): number {
  if (targetMs <= 0) return 0;
  return Math.min(100, Math.round((currentMs / targetMs) * 100));
}

export function gitDailyCounts(
  commits: { commitMs: number }[],
  startMs: number,
  endMs: number,
): { date: string; count: number }[] {
  const byDay = new Map<string, number>();
  for (const c of commits) {
    if (c.commitMs < startMs || c.commitMs >= endMs) continue;
    const d = new Date(c.commitMs);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  return [...byDay.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
}
