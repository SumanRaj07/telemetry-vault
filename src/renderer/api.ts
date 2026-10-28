// Renderer-side helpers: typed access to the preload API plus small hooks.
import { useCallback, useEffect, useState } from 'react';
import type { Settings, DateRange } from '../shared/types';
import { localDayRange, localMonthRange, localWeekRange } from '../main/utils/time';

export function api() {
  if (!window.telemetry) throw new Error('Telemetry API is not available (preload did not load).');
  return window.telemetry;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    setLoading(true);
    fn()
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load.'))
      .finally(() => setLoading(false));
  }, deps);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { data, loading, error, refresh };
}

export function useSettings() {
  const { data, loading, error, refresh } = useAsync(() => api().settings.get(), []);
  return { settings: data as Settings | null, loading, error, refresh };
}

export type RangePreset = 'today' | 'week' | 'month' | '30d';

export function presetRange(preset: RangePreset, firstDayOfWeek = 1): DateRange {
  const now = new Date();
  if (preset === 'today') return localDayRange(now);
  if (preset === 'week') return localWeekRange(now, firstDayOfWeek);
  if (preset === 'month') return localMonthRange(now);
  const end = localDayRange(now).endMs;
  return { startMs: end - 30 * 24 * 60 * 60 * 1000, endMs: end };
}

export function useRange(initial: RangePreset = 'week') {
  const [preset, setPreset] = useState<RangePreset>(initial);
  const [custom, setCustom] = useState<DateRange | null>(null);
  const range = custom ?? presetRange(preset);
  return { preset, setPreset, custom, setCustom, range };
}
