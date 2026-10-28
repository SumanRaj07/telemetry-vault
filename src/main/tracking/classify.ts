// Application classification: user rules first, then built-in rules, then
// Uncategorized. Classification never invents precision it does not have:
// anything unknown stays 'uncategorized' until the user assigns it.
import { APP_RULES, LANGUAGE_EXTENSIONS } from '../../shared/constants';
import type { AppCategory, Classification } from '../../shared/types';

export function normalizeProcessName(raw: string): string {
  const base = raw.replace(/\\/g, '/').split('/').pop() ?? raw;
  return base.toLowerCase().replace(/\.exe$/, '');
}

export interface UserRule {
  match: string;
  category: AppCategory;
  classification: Classification;
}

export function classifyApp(
  processName: string,
  appName: string,
  userRules: UserRule[] = [],
): { category: AppCategory; classification: Classification } {
  const proc = normalizeProcessName(processName);
  const app = appName.toLowerCase();
  for (const rule of userRules) {
    const m = rule.match.toLowerCase();
    if (proc.includes(m) || app.includes(m)) {
      return { category: rule.category, classification: rule.classification };
    }
  }
  for (const rule of APP_RULES) {
    if (proc.includes(rule.match) || app.includes(rule.match)) {
      return { category: rule.category, classification: rule.classification };
    }
  }
  return { category: 'uncategorized', classification: 'neutral' };
}

export function isCodingCategory(category: AppCategory): boolean {
  return category === 'development';
}

export function languageFromExtension(ext: string): string | null {
  return LANGUAGE_EXTENSIONS[ext.toLowerCase()] ?? null;
}

/**
 * Coding-time estimate, explained honestly in the UI: time with a development
 * tool in the foreground while the user was active. Idle time is already
 * excluded by the tracker, so this is an estimate, not a keystroke count.
 * It intentionally includes reading and reviewing inside the tool.
 */
export function estimateCodingMs(devToolActiveMs: number): number {
  return devToolActiveMs;
}
