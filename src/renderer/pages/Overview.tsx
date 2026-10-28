// Overview: summary cards, trend charts, distributions, heatmap, goals.
import { AppWindow, Code2, FolderKanban, GitBranch, Timer } from 'lucide-react';
import { api, useAsync, useRange } from '../api';
import { Badge, Card, EmptyState, PageHeader, ProgressBar, RangePicker, Spinner, StatCard, ErrorBox } from '../components/ui';
import { AreaChartCard, Heatmap } from '../components/charts';
import { formatDuration, formatDateTime, localDayRange } from '../../main/utils/time';
import { Link } from 'react-router-dom';

export default function Overview() {
  const { preset, setPreset, setCustom, range } = useRange('week');
  const summary = useAsync(() => api().activity.getSummary(range), [range.startMs, range.endMs]);
  const today = useAsync(() => {
    const day = localDayRange(new Date());
    return api().activity.getSummary(day);
  }, []);
  const heatmap = useAsync(() => api().activity.getHeatmap(range), [range.startMs, range.endMs]);
  const timeline = useAsync(() => api().activity.getTimeline({ startMs: range.startMs, endMs: range.endMs, limit: 8 }), [range.startMs, range.endMs]);
  const goals = useAsync(() => api().goals.progress(range), [range.startMs, range.endMs]);

  const hasData = (summary.data?.sessionCount ?? 0) > 0;
  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="Your tracked activity, coding time, and projects — all computed locally."
        actions={<RangePicker range={range} preset={preset} onPreset={setPreset} onCustom={setCustom} />}
      />
      {summary.error && <ErrorBox message={summary.error} />}
      {summary.loading ? (
        <Spinner />
      ) : !hasData ? (
        <EmptyState
          title="No activity recorded yet"
          text="Start tracking from the status pill in the top-right, or add a manual session from the Timeline page. Your dashboard will fill in as activity is recorded — nothing here is sample data."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
            <StatCard label="Coding today (est.)" value={formatDuration(today.data?.codingMs ?? 0)} icon={<Code2 size={16} />} />
            <StatCard label="Active time" value={formatDuration(summary.data!.totalActiveMs)} sub="in selected range" />
            <StatCard label="Coding sessions" value={String(summary.data!.sessionCount)} icon={<Timer size={16} />} />
            <StatCard label="Applications" value={String(summary.data!.appCount)} icon={<AppWindow size={16} />} />
            <StatCard label="Git commits" value={String(summary.data!.commits)} icon={<GitBranch size={16} />} />
            <StatCard label="Active projects" value={String(summary.data!.activeProjects)} icon={<FolderKanban size={16} />} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <Card title="Daily activity trend" subtitle="Tracked time per day in the selected range">
              <AreaChartCard data={(heatmap.data ?? []).map((d) => ({ label: d.date.slice(5), value: d.ms }))} />
            </Card>
            <Card title="Activity heatmap" subtitle="Darker green means more tracked time that day">
              <Heatmap data={heatmap.data ?? []} />
            </Card>
          </div>
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <Card title="Goals" subtitle="Progress for the selected period">
              {!goals.data || goals.data.length === 0 ? (
                <p className="text-sm text-muted py-4">No goals yet. Create one on the Focus &amp; Goals page.</p>
              ) : (
                <ul className="space-y-3">
                  {goals.data.map((g) => (
                    <li key={g.goal.id}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{g.goal.name}</span>
                        <span className="text-muted">
                          {formatDuration(g.currentMs)} / {formatDuration(g.goal.targetMs)} · {g.pct}%
                        </span>
                      </div>
                      <ProgressBar pct={g.pct} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Recent activity" subtitle="Latest sessions, commits, and focus time">
              <ul className="divide-y divide-pale">
                {(timeline.data ?? []).slice(0, 8).map((item) => (
                  <li key={`${item.kind}-${item.id}`} className="py-2 flex items-center gap-2 text-sm">
                    <Badge tone={item.kind === 'commit' ? 'green' : item.kind === 'focus' ? 'amber' : 'gray'}>{item.kind}</Badge>
                    <span className="flex-1 truncate">{item.title}</span>
                    <span className="text-xs text-muted shrink-0">{formatDateTime(item.timestampMs)}</span>
                  </li>
                ))}
              </ul>
              <Link to="/timeline" className="text-sm font-medium">View full timeline →</Link>
            </Card>
          </div>
          <Card title="How coding time is estimated" subtitle="Read this before quoting a number">
            <p className="text-sm text-muted">
              Coding time is the time a development tool was in the foreground while you were active (idle time is
              excluded by the tracker). It includes reading and reviewing inside the tool and is not a keystroke
              count. If a number looks wrong, correct it from the Timeline page — manual entries are marked as manual.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
