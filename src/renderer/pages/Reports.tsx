// Reports: daily, weekly, monthly, annual, and custom-range reports with
// CSV, JSON, printable HTML, and PDF export — all from the same report object.
import { useState } from 'react';
import { api, useAsync } from '../api';
import { Button, Card, EmptyState, ErrorBox, PageHeader, Spinner, useToast } from '../components/ui';
import { BarChartCard, DonutCard } from '../components/charts';
import { formatDuration, localDayRange, localMonthRange, localWeekRange, localYearRange } from '../../main/utils/time';

type Kind = 'daily' | 'weekly' | 'monthly' | 'annual' | 'custom';

function kindRange(kind: Kind): { startMs: number; endMs: number } {
  const now = new Date();
  if (kind === 'daily') return localDayRange(now);
  if (kind === 'weekly') return localWeekRange(now, 1);
  if (kind === 'monthly') return localMonthRange(now);
  if (kind === 'annual') return localYearRange(now);
  const end = localDayRange(now).endMs;
  return { startMs: end - 30 * 24 * 60 * 60 * 1000, endMs: end };
}

export default function Reports() {
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('weekly');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const range = kind === 'custom' && customStart && customEnd
    ? { startMs: new Date(`${customStart}T00:00:00`).getTime(), endMs: new Date(`${customEnd}T00:00:00`).getTime() + 24 * 60 * 60 * 1000 }
    : kindRange(kind);

  const report = useAsync(
    () => api().reports.build({ kind, startMs: range.startMs, endMs: range.endMs }),
    [kind, range.startMs, range.endMs],
  );

  const save = async (format: 'csv' | 'json' | 'html' | 'pdf') => {
    try {
      if (format === 'pdf') {
        const ok = await api().reports.exportPdf({ kind, startMs: range.startMs, endMs: range.endMs });
        toast(ok ? 'success' : 'error', ok ? 'PDF saved.' : 'PDF export cancelled.');
        return;
      }
      const content = format === 'csv'
        ? await api().reports.exportCsv({ kind, startMs: range.startMs, endMs: range.endMs })
        : format === 'json'
          ? await api().reports.exportJson({ kind, startMs: range.startMs, endMs: range.endMs })
          : await api().reports.exportHtml({ kind, startMs: range.startMs, endMs: range.endMs });
      const ok = await api().reports.saveFile({ content, defaultName: `telemetry-${kind}-report.${format}` });
      toast(ok ? 'success' : 'error', ok ? 'Report saved.' : 'Export cancelled.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Export failed.');
    }
  };

  const data = report.data as unknown as {
    summary?: { totalActiveMs: number; codingMs: number; sessions: number; appsUsed: number; commits: number; focusMs: number; focusSessions: number };
    apps?: { name: string; ms: number }[];
    projects?: { name: string; ms: number }[];
    daily?: { date: string; ms: number }[];
    goals?: { name: string; currentMs: number; targetMs: number; pct: number }[];
  } | null;

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Reports reflect real records only. Exports use the same data as the on-screen report."
        actions={
          <>
            <Button onClick={() => void save('csv')}>Export CSV</Button>
            <Button onClick={() => void save('json')}>Export JSON</Button>
            <Button onClick={() => void save('html')}>Export HTML</Button>
            <Button variant="primary" onClick={() => void save('pdf')}>Export PDF</Button>
          </>
        }
      />
      <Card className="mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          {(['daily', 'weekly', 'monthly', 'annual', 'custom'] as Kind[]).map((k) => (
            <Button key={k} size="sm" variant={kind === k ? 'primary' : 'outline'} onClick={() => setKind(k)}>
              {k[0]!.toUpperCase() + k.slice(1)}
            </Button>
          ))}
          {kind === 'custom' && (
            <span className="flex items-center gap-2 text-sm">
              <input type="date" className="!w-auto" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              <span>to</span>
              <input type="date" className="!w-auto" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </span>
          )}
        </div>
      </Card>
      {report.error && <ErrorBox message={report.error} />}
      {report.loading ? (
        <Spinner />
      ) : !data || (data.summary?.sessions ?? 0) === 0 ? (
        <EmptyState title="No activity in this period" text="Reports are built from recorded sessions, commits, and focus time. Nothing is fabricated for empty periods." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Card className="!p-0"><div className="px-4 py-3"><div className="text-xs text-muted uppercase">Active time</div><div className="text-xl font-semibold">{formatDuration(data.summary!.totalActiveMs)}</div></div></Card>
            <Card className="!p-0"><div className="px-4 py-3"><div className="text-xs text-muted uppercase">Coding (est.)</div><div className="text-xl font-semibold">{formatDuration(data.summary!.codingMs)}</div></div></Card>
            <Card className="!p-0"><div className="px-4 py-3"><div className="text-xs text-muted uppercase">Sessions</div><div className="text-xl font-semibold">{data.summary!.sessions}</div></div></Card>
            <Card className="!p-0"><div className="px-4 py-3"><div className="text-xs text-muted uppercase">Commits</div><div className="text-xl font-semibold">{data.summary!.commits}</div></div></Card>
          </div>
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <Card title="Daily totals">
              <BarChartCard data={(data.daily ?? []).map((d) => ({ label: d.date.slice(5), value: d.ms }))} />
            </Card>
            <Card title="Application distribution">
              <DonutCard data={(data.apps ?? []).map((a) => ({ name: a.name, value: a.ms }))} />
            </Card>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Project distribution">
              <DonutCard data={(data.projects ?? []).map((p) => ({ name: p.name, value: p.ms }))} />
            </Card>
            <Card title="Goals in this period">
              {(data.goals ?? []).length === 0 ? (
                <p className="text-sm text-muted py-4">No goals configured.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {(data.goals ?? []).map((g) => (
                    <li key={g.name} className="flex justify-between">
                      <span className="font-medium">{g.name}</span>
                      <span className="text-muted">{formatDuration(g.currentMs)} / {formatDuration(g.targetMs)} · {g.pct}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
