// Telemetry Vault CLI: reuses the same services and data layer as the
// desktop app. Usage:
//   telemetry-vault status | today | week | projects
//   telemetry-vault export <csv|json> <start YYYY-MM-DD> <end YYYY-MM-DD> [outfile]
//   telemetry-vault backup
// The CLI never starts tracking; it only reads (and backs up) local data.
import fs from 'node:fs';
import { TelemetryDatabase, resolveDbPath } from './db/database';
import { AppServices } from './services/services';
import { TrackerService } from './tracking/tracker';
import { NullActivityProvider } from './tracking/providers';
import { AppRepository, EventRepository, SessionRepository } from './db/repositories';
import { localDayRange } from './utils/time';

const USAGE = `Telemetry Vault CLI
  status                          Show tracking status and database path
  today                           Today's summary
  week                            This week's summary
  projects                        List projects with total tracked time
  export <csv|json> <start> <end> [outfile]   Export a report (dates: YYYY-MM-DD)
  backup                          Create a database backup
  help                            Show this help`;

function parseDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) throw new Error(`Invalid date: ${value} (expected YYYY-MM-DD)`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fmt(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const min = Math.round((ms % 3600000) / 60000);
  return h ? `${h}h ${String(min).padStart(2, '0')}m` : `${min}m`;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === 'help') {
    console.log(USAGE);
    return;
  }
  const db = new TelemetryDatabase(resolveDbPath());
  db.open();
  try {
    // Settings holder breaks the tracker <-> services construction cycle.
    const holder: { get: () => ReturnType<AppServices['getSettings']> } = {
      get: () => services.getSettings(),
    };
    const handle = db.handle;
    const tracker: TrackerService = new TrackerService({
      sessions: new SessionRepository(handle),
      apps: new AppRepository(handle),
      events: new EventRepository(handle),
      getSettings: () => holder.get(),
      classify: (p, a) => services.classify(p, a),
      activityProvider: new NullActivityProvider(),
      idleProvider: null,
    });
    const services: AppServices = new AppServices(db, tracker, {});

    if (cmd === 'status') {
      const settings = services.getSettings();
      console.log(`Database: ${db.path}`);
      console.log(`Tracking enabled in settings: ${settings.trackingEnabled}`);
      console.log(`Foreground provider: none in CLI mode (tracking runs in the desktop app)`);
      console.log(`Sessions recorded: ${services.getDataInfo().sessions}`);
    } else if (cmd === 'today') {
      const day = localDayRange(new Date());
      const s = services.getSummary(day.startMs, day.endMs);
      console.log(`Today: active ${fmt(s.totalActiveMs)}, coding (est.) ${fmt(s.codingMs)}, ${s.sessionCount} sessions, ${s.appCount} apps, ${s.commits} commits, focus ${fmt(s.focusMs)}`);
    } else if (cmd === 'week') {
      const now = new Date();
      const day = now.getDay();
      const diff = (day - 1 + 7) % 7;
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      const s = services.getSummary(start.getTime(), end.getTime());
      console.log(`This week: active ${fmt(s.totalActiveMs)}, coding (est.) ${fmt(s.codingMs)}, ${s.sessionCount} sessions, ${s.appCount} apps, ${s.commits} commits, focus ${fmt(s.focusMs)}`);
    } else if (cmd === 'projects') {
      for (const p of services.listProjects(true)) {
        console.log(`${p.name} — ${fmt(p.totalMs ?? 0)}${p.archived ? ' (archived)' : ''}`);
      }
    } else if (cmd === 'export') {
      const [format, startStr, endStr, outfile] = rest;
      if (format !== 'csv' && format !== 'json') throw new Error('Format must be csv or json.');
      if (!startStr || !endStr) throw new Error('Start and end dates required.');
      const startMs = localDayRange(parseDate(startStr)).startMs;
      const endMs = localDayRange(parseDate(endStr)).endMs;
      const content = format === 'csv' ? services.exportCsv('custom', startMs, endMs) : services.exportJson('custom', startMs, endMs);
      if (outfile) {
        fs.writeFileSync(outfile, content);
        console.log(`Wrote ${outfile}`);
      } else {
        console.log(content);
      }
    } else if (cmd === 'backup') {
      const result = await services.createBackup();
      console.log(`Backup saved: ${result.path} (${result.bytes} bytes)`);
    } else {
      console.error(`Unknown command: ${cmd}\n${USAGE}`);
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : 'CLI failed.');
  process.exit(1);
});
