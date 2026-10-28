import { describe, expect, it } from 'vitest';
import { formatDuration, localDayRange, localWeekRange, overlapMs, toISODate } from '../../src/main/utils/time';

describe('time helpers', () => {
  it('localDayRange spans exactly one local day', () => {
    const { startMs, endMs } = localDayRange(new Date(2026, 9, 28, 15, 30));
    expect(endMs - startMs).toBe(24 * 60 * 60 * 1000);
    expect(new Date(startMs).getHours()).toBe(0);
  });

  it('localWeekRange starts on Monday by default', () => {
    const { startMs, endMs } = localWeekRange(new Date(2026, 9, 28)); // Wednesday
    expect(new Date(startMs).getDay()).toBe(1);
    expect(endMs - startMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('overlapMs uses half-open intervals (no double-counted boundaries)', () => {
    expect(overlapMs(1000, 2000, 2000, 3000)).toBe(0);
    expect(overlapMs(1000, 3000, 2000, 4000)).toBe(1000);
    expect(overlapMs(0, 1000, 2000, 3000)).toBe(0);
    expect(overlapMs(500, 1500, 0, 10000)).toBe(1000);
  });

  it('formatDuration renders hours and minutes', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45 * 60 * 1000)).toBe('45m');
    expect(formatDuration(90 * 60 * 1000)).toBe('1h 30m');
    expect(formatDuration(-5000)).toBe('0m');
  });

  it('toISODate formats local dates', () => {
    expect(toISODate(new Date(2026, 0, 5).getTime())).toBe('2026-01-05');
  });
});
