// Coding Analytics: coding time, hour/weekday patterns, session stats,
// and repository language composition (kept separate from time estimates).
import { api, useAsync, useRange } from '../api';
import { Badge, Card, EmptyState, ErrorBox, PageHeader, RangePicker, Spinner, StatCard } from '../components/ui';
import { BarChartCard, DonutCard } from '../components/charts';
import { formatDuration } from '../../main/utils/time';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Coding() {
  const { preset, setPreset, setCustom, range } = useRange('week');
  const summary = useAsync(() => api().activity.getSummary(range), [range.startMs, range.endMs]);
  const hourly = useAsync(() => api().activity.getHourly(range), [range.startMs, range.endMs]);
  const weekday = useAsync(() => api().activity.getWeekday(range), [range.startMs, range.endMs]);
  const sessions = useAsync(
    () => api().activity.getSessions({ startMs: range.startMs, endMs: range.endMs, limit: 5000 }),
    [range.startMs, range.endMs],
  );
  const repos = useAsync(() => api().repos.list(), []);
  const languages = useAsync(async () => {
    const all = (repos.data ?? []).map((r) => api().repos.languages({ repoId: r.id }));
    const results = await Promise.all(all);
    const map = new Map<string, number>();
    for (const list of results) {
      for (const l of list) map.set(l.language, (map.get(l.language) ?? 0) + l.files);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [repos.data]);

  const codingSessions = (sessions.data ?? []).filter((s) => s.category === 'development');
  const codingMs = codingSessions.reduce((sum, s) => sum + Math.max(0, Math.min(s.endMs, range.endMs) - Math.max(s.startMs, range.startMs)), 0);
  const avg = codingSessions.length ? codingMs / codingSessions.length : 0;
  const longest = codingSessions.length ? Math.max(...codingSessions.map((s) => s.durationMs)) : 0;

  return (
    <div>
      <PageHeader
        title="Coding Analytics"
        subtitle="Estimated coding time is foreground time in development tools while you were active — not a keystroke count."
        actions={<RangePicker range={range} preset={preset} onPreset={setPreset} onCustom={setCustom} />}
      />
      {summary.error && <ErrorBox message={summary.error} />}
      {summary.loading ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard label="Coding time (est.)" value={formatDuration(codingMs)} />
            <StatCard label="Coding sessions" value={String(codingSessions.length)} />
            <StatCard label="Average session" value={formatDuration(avg)} />
            <StatCard label="Longest session" value={formatDuration(longest)} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <Card title="Coding by hour of day" subtitle="When you code, across the selected range">
              <BarChartCard data={(hourly.data ?? []).map((h) => ({ label: `${h.hour}:00`, value: h.ms }))} />
            </Card>
            <Card title="Coding by weekday" subtitle="Which days carry the most coding time">
              <BarChartCard
                data={(weekday.data ?? []).map((d) => ({ label: WEEKDAYS[d.weekday]!.slice(0, 3), value: d.ms }))}
              />
            </Card>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Recent coding sessions" subtitle="Development-tool sessions in this range">
              {codingSessions.length === 0 ? (
                <EmptyState title="No coding sessions yet" text="Coding sessions appear when a development tool is in the foreground. Unknown tools can be classified as Development from the Applications page." />
              ) : (
                <ul className="divide-y divide-pale max-h-80 overflow-y-auto">
                  {codingSessions.slice(0, 30).map((s) => (
                    <li key={s.id} className="py-2 flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate font-medium">{s.appName}</span>
                      {s.projectName && <Badge tone="green">{s.projectName}</Badge>}
                      {s.manual && <Badge tone="amber">manual</Badge>}
                      <span className="text-muted">{formatDuration(s.durationMs)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Repository language composition" subtitle="File counts from scanned repositories — composition, not time spent">
              {languages.loading ? (
                <Spinner />
              ) : (languages.data ?? []).length === 0 ? (
                <EmptyState title="No language data yet" text="Add a Git repository on the Repositories page and scan it. Language statistics count source files and deliberately exclude build outputs and dependency folders." />
              ) : (
                <DonutCard data={(languages.data ?? []).map((l) => ({ name: l.name, value: l.value }))} format={(v) => `${v} files`} />
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
