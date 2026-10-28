// Report builders and exporters. Reports are plain JSON objects built from
// analytics results; CSV/JSON/HTML are renderings of the same object, so an
// export can never disagree with the on-screen report.
import { formatDuration } from '../utils/time';

export interface ReportData {
  kind: string;
  startMs: number;
  endMs: number;
  summary: {
    totalActiveMs: number;
    codingMs: number;
    sessions: number;
    appsUsed: number;
    commits: number;
    focusMs: number;
    focusSessions: number;
  };
  apps: { name: string; category: string; ms: number; sessions: number }[];
  projects: { name: string; ms: number; sessions: number }[];
  daily: { date: string; ms: number }[];
  commitsDaily: { date: string; count: number }[];
  goals: { name: string; currentMs: number; targetMs: number; pct: number }[];
}

export function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  return lines.join('\n');
}

export function reportToCsv(report: ReportData): string {
  const sections: string[] = [];
  sections.push('Telemetry Vault Report');
  sections.push(`Kind,${report.kind}`);
  sections.push(`From,${new Date(report.startMs).toISOString()}`);
  sections.push(`To,${new Date(report.endMs).toISOString()}`);
  sections.push('');
  sections.push('Summary');
  sections.push(rowsToCsv(['Metric', 'Value'], [
    ['Total active time', formatDuration(report.summary.totalActiveMs)],
    ['Coding time (estimate)', formatDuration(report.summary.codingMs)],
    ['Sessions', report.summary.sessions],
    ['Applications used', report.summary.appsUsed],
    ['Git commits', report.summary.commits],
    ['Focus time', formatDuration(report.summary.focusMs)],
    ['Focus sessions', report.summary.focusSessions],
  ]));
  sections.push('');
  sections.push('Applications');
  sections.push(rowsToCsv(['Application', 'Category', 'Time', 'Sessions'], report.apps.map((a) => [a.name, a.category, formatDuration(a.ms), a.sessions])));
  sections.push('');
  sections.push('Projects');
  sections.push(rowsToCsv(['Project', 'Time', 'Sessions'], report.projects.map((p) => [p.name, formatDuration(p.ms), p.sessions])));
  sections.push('');
  sections.push('Daily totals');
  sections.push(rowsToCsv(['Date', 'Time'], report.daily.map((d) => [d.date, formatDuration(d.ms)])));
  return sections.join('\n');
}

export function reportToHtml(report: ReportData): string {
  const rows = (cells: string[][], header: string[]) => `
    <table><thead><tr>${header.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${cells.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const from = new Date(report.startMs).toLocaleDateString();
  const to = new Date(report.endMs).toLocaleDateString();
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Telemetry Vault ${report.kind} report</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #24352A; background: #F7FAF7; margin: 40px; }
  h1 { color: #286844; font-size: 22px; }
  h2 { color: #286844; font-size: 16px; margin-top: 28px; }
  .card { background: #fff; border: 1px solid #E2EAE3; border-radius: 12px; padding: 16px 20px; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; color: #718074; font-size: 12px; text-transform: uppercase; padding: 8px; border-bottom: 1px solid #E2EAE3; }
  td { padding: 8px; border-bottom: 1px solid #F2FAF3; }
  .muted { color: #718074; }
</style></head><body>
<h1>Telemetry Vault — ${report.kind} report</h1>
<p class="muted">${from} to ${to} &middot; Generated locally, no data left this computer.</p>
<div class="card"><h2>Summary</h2>
<p>Total active time: <strong>${formatDuration(report.summary.totalActiveMs)}</strong><br>
Coding time (estimate): <strong>${formatDuration(report.summary.codingMs)}</strong><br>
Sessions: <strong>${report.summary.sessions}</strong> &middot; Applications used: <strong>${report.summary.appsUsed}</strong><br>
Git commits: <strong>${report.summary.commits}</strong> &middot; Focus time: <strong>${formatDuration(report.summary.focusMs)}</strong> (${report.summary.focusSessions} sessions)</p></div>
<div class="card"><h2>Applications</h2>
${rows(report.apps.map((a) => [a.name, a.category, formatDuration(a.ms), String(a.sessions)]), ['Application', 'Category', 'Time', 'Sessions'])}
</div>
<div class="card"><h2>Projects</h2>
${rows(report.projects.map((p) => [p.name, formatDuration(p.ms), String(p.sessions)]), ['Project', 'Time', 'Sessions'])}
</div>
<div class="card"><h2>Daily totals</h2>
${rows(report.daily.map((d) => [d.date, formatDuration(d.ms)]), ['Date', 'Time'])}
</div>
<div class="card"><h2>Goals</h2>
${report.goals.length
    ? rows(report.goals.map((g) => [g.name, formatDuration(g.currentMs), formatDuration(g.targetMs), `${g.pct}%`]), ['Goal', 'Current', 'Target', 'Progress'])
    : '<p class="muted">No goals configured for this period.</p>'}
</div>
<p class="muted">Coding time is an estimate: time with a development tool in the foreground while active. It is not a keystroke count.</p>
</body></html>`;
}
