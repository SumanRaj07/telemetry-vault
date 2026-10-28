// Deterministic insights engine: no AI, no guessing. Every insight carries
// the numbers it was computed from, compares equivalent date ranges, and is
// deduplicated by (type, period) in the insights table. Nothing here labels
// the user lazy, unproductive, or inefficient.
import {
  codingMs,
  goalProgress,
  hourlyDistribution,
  totalMs,
  totalsByApp,
  totalsByProject,
  trendCompare,
} from './analytics';
import type { SessionLike } from './analytics';

export interface InsightInput {
  current: SessionLike[];
  previous: SessionLike[];
  startMs: number;
  endMs: number;
  prevStartMs: number;
  prevEndMs: number;
  period: string;
  goals: { name: string; currentMs: number; targetMs: number }[];
  projectLastActive: { name: string; lastActiveMs: number | null }[];
  focusAvgMs: number;
  prevFocusAvgMs: number;
}

export interface GeneratedInsight {
  type: string;
  period: string;
  title: string;
  detail: string;
  metrics: Record<string, unknown>;
}

const HOUR = 3600000;

export function generateInsights(input: InsightInput): GeneratedInsight[] {
  const out: GeneratedInsight[] = [];
  const curTotal = totalMs(input.current, input.startMs, input.endMs);
  const prevTotal = totalMs(input.previous, input.prevStartMs, input.prevEndMs);
  const curCoding = codingMs(input.current, input.startMs, input.endMs);
  const prevCoding = codingMs(input.previous, input.prevStartMs, input.prevEndMs);

  // Coding time trend (only when the change is material: >= 20% and >= 30 min).
  const codingTrend = trendCompare(curCoding, prevCoding);
  if (codingTrend.pct !== null && Math.abs(codingTrend.pct) >= 20 && Math.abs(codingTrend.deltaMs) >= 30 * 60 * 1000) {
    const direction = codingTrend.deltaMs > 0 ? 'increased' : 'decreased';
    out.push({
      type: 'coding_trend',
      period: input.period,
      title: `Coding time ${direction} vs the previous period`,
      detail: `Coding time was ${fmt(curCoding)} this period vs ${fmt(prevCoding)} in the previous one (${codingTrend.pct.toFixed(0)}%).`,
      metrics: { currentMs: curCoding, previousMs: prevCoding, pct: codingTrend.pct },
    });
  }

  // Project concentration.
  const projects = totalsByProject(input.current, input.startMs, input.endMs);
  if (projects.length > 0 && curTotal > 0) {
    const top = projects[0]!;
    const share = (top.ms / curTotal) * 100;
    if (share >= 50) {
      out.push({
        type: 'project_concentration',
        period: input.period,
        title: `${top.name} accounted for most of your tracked time`,
        detail: `${top.name} took ${fmt(top.ms)} of ${fmt(curTotal)} tracked time (${share.toFixed(0)}%) in this period.`,
        metrics: { project: top.name, projectMs: top.ms, totalMs: curTotal, sharePct: share },
      });
    }
  }

  // Browser share increase.
  const curApps = totalsByApp(input.current, input.startMs, input.endMs);
  const prevApps = totalsByApp(input.previous, input.prevStartMs, input.prevEndMs);
  const browserShare = (apps: typeof curApps, total: number) => {
    const b = apps.filter((a) => a.category === 'browser').reduce((s, a) => s + a.ms, 0);
    return total > 0 ? (b / total) * 100 : 0;
  };
  const curBrowser = browserShare(curApps, curTotal);
  const prevBrowser = browserShare(prevApps, prevTotal);
  if (curBrowser - prevBrowser >= 10 && curTotal > 0) {
    out.push({
      type: 'browser_increase',
      period: input.period,
      title: 'Browser usage increased',
      detail: `Browser time was ${curBrowser.toFixed(0)}% of tracked time this period, up from ${prevBrowser.toFixed(0)}% in the previous one.`,
      metrics: { currentPct: curBrowser, previousPct: prevBrowser },
    });
  }

  // Goals achieved.
  for (const g of input.goals) {
    const pct = goalProgress(g.currentMs, g.targetMs);
    if (pct >= 100) {
      out.push({
        type: 'goal_achieved',
        period: input.period,
        title: `Goal reached: ${g.name}`,
        detail: `${g.name} reached ${fmt(g.currentMs)} against a target of ${fmt(g.targetMs)}.`,
        metrics: { goal: g.name, currentMs: g.currentMs, targetMs: g.targetMs },
      });
    }
  }

  // Inactive projects (no activity in the last 14 days, but activity before).
  const cutoff = input.endMs - 14 * 24 * HOUR;
  for (const p of input.projectLastActive) {
    if (p.lastActiveMs !== null && p.lastActiveMs < cutoff) {
      out.push({
        type: 'project_inactive',
        period: input.period,
        title: `${p.name} has had no recent activity`,
        detail: `Last recorded activity for ${p.name} was on ${new Date(p.lastActiveMs).toLocaleDateString()}.`,
        metrics: { project: p.name, lastActiveMs: p.lastActiveMs },
      });
    }
  }

  // Peak coding hours.
  const hourly = hourlyDistribution(input.current, input.startMs, input.endMs);
  const sorted = [...hourly].sort((a, b) => b.ms - a.ms);
  const top2 = (sorted[0]?.ms ?? 0) + (sorted[1]?.ms ?? 0);
  if (curCoding > 0 && top2 / curTotal >= 0.5 && sorted[0] && sorted[0].ms > 0) {
    out.push({
      type: 'peak_hours',
      period: input.period,
      title: 'Your activity is concentrated in a few hours',
      detail: `Hours ${sorted[0].hour}:00 and ${sorted[1]?.hour ?? 0}:00 together account for ${((top2 / curTotal) * 100).toFixed(0)}% of tracked time.`,
      metrics: { hours: [sorted[0].hour, sorted[1]?.hour], ms: top2, totalMs: curTotal },
    });
  }

  // Focus session length change.
  if (input.focusAvgMs > 0 && input.prevFocusAvgMs > 0) {
    const change = ((input.focusAvgMs - input.prevFocusAvgMs) / input.prevFocusAvgMs) * 100;
    if (Math.abs(change) >= 20) {
      out.push({
        type: 'focus_change',
        period: input.period,
        title: `Average focus session ${change > 0 ? 'grew' : 'shrank'}`,
        detail: `Average focus session was ${fmt(input.focusAvgMs)}, vs ${fmt(input.prevFocusAvgMs)} in the previous period (${change.toFixed(0)}%).`,
        metrics: { currentMs: input.focusAvgMs, previousMs: input.prevFocusAvgMs, pct: change },
      });
    }
  }

  return out;
}

function fmt(ms: number): string {
  const h = Math.floor(ms / HOUR);
  const m = Math.round((ms % HOUR) / 60000);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
