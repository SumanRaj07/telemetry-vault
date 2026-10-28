// Time helpers. All stored timestamps are UTC milliseconds since epoch.
// Ranges are half-open [startMs, endMs) so adjacent sessions never
// double-count a boundary. Display conversion happens in the renderer.

export function nowMs(): number {
  return Date.now();
}

export function startOfDayUtc(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function addDaysUtc(ms: number, days: number): number {
  return ms + days * 24 * 60 * 60 * 1000;
}

/** Local calendar day range for a Date, returned as UTC ms bounds. */
export function localDayRange(date: Date): { startMs: number; endMs: number } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

/** Monday-first week range containing `date` (local time). */
export function localWeekRange(date: Date, firstDayOfWeek = 1): { startMs: number; endMs: number } {
  const day = date.getDay();
  const diff = (day - firstDayOfWeek + 7) % 7;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - diff);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function localMonthRange(date: Date): { startMs: number; endMs: number } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function localYearRange(date: Date): { startMs: number; endMs: number } {
  const start = new Date(date.getFullYear(), 0, 1);
  const end = new Date(date.getFullYear() + 1, 0, 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function toISODate(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function formatDurationPrecise(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export function formatTime(ms: number, timeFormat: '12h' | '24h' = '24h'): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  });
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(ms: number): string {
  return `${formatDate(ms)} ${formatTime(ms)}`;
}

/** Clamp a session to a range using half-open intervals; returns 0 when outside. */
export function overlapMs(startMs: number, endMs: number, rangeStart: number, rangeEnd: number): number {
  const s = Math.max(startMs, rangeStart);
  const e = Math.min(endMs, rangeEnd);
  return Math.max(0, e - s);
}
