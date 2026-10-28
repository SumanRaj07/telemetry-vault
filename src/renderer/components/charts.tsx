// Chart primitives: Recharts wrappers plus a dependency-free heatmap.
import { Bar, BarChart, Cell, Pie, PieChart, Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDuration } from '../../main/utils/time';

const GREEN_SCALE = ['#65A878', '#286844', '#2E8B57', '#4A90A4', '#C28A35', '#8E6BBF', '#D97B29', '#3A7CA5'];

export function BarChartCard(props: { data: { label: string; value: number }[]; format?: (v: number) => string }) {
  const fmt = props.format ?? ((v: number) => formatDuration(v));
  if (props.data.length === 0) return <p className="text-sm text-muted py-6 text-center">No data for this period.</p>;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={props.data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2EAE3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#718074' }} />
          <YAxis tick={{ fontSize: 11, fill: '#718074' }} tickFormatter={(v: number) => fmt(v)} width={70} />
          <Tooltip formatter={(v) => [fmt(Number(v)), 'Time']} contentStyle={{ borderRadius: 10, border: '1px solid #E2EAE3' }} />
          <Bar dataKey="value" fill="#65A878" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutCard(props: { data: { name: string; value: number }[]; format?: (v: number) => string }) {
  const fmt = props.format ?? ((v: number) => formatDuration(v));
  const total = props.data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return <p className="text-sm text-muted py-6 text-center">No data for this period.</p>;
  return (
    <div className="flex items-center gap-4">
      <div className="h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={props.data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2}>
              {props.data.map((_, i) => (
                <Cell key={i} fill={GREEN_SCALE[i % GREEN_SCALE.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => [fmt(Number(v)), 'Time']} contentStyle={{ borderRadius: 10, border: '1px solid #E2EAE3' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-1.5 min-w-0">
        {props.data.slice(0, 7).map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: GREEN_SCALE[i % GREEN_SCALE.length] }} />
            <span className="truncate flex-1">{d.name}</span>
            <span className="text-muted shrink-0">{fmt(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AreaChartCard(props: { data: { label: string; value: number }[]; format?: (v: number) => string }) {
  const fmt = props.format ?? ((v: number) => formatDuration(v));
  if (props.data.length === 0) return <p className="text-sm text-muted py-6 text-center">No data for this period.</p>;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={props.data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2EAE3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#718074' }} />
          <YAxis tick={{ fontSize: 11, fill: '#718074' }} tickFormatter={(v: number) => fmt(v)} width={70} />
          <Tooltip formatter={(v) => [fmt(Number(v)), 'Time']} contentStyle={{ borderRadius: 10, border: '1px solid #E2EAE3' }} />
          <Area type="monotone" dataKey="value" stroke="#286844" fill="#E8F5E9" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Calendar heatmap: weeks as columns, weekdays as rows, green intensity scale. */
export function Heatmap(props: { data: { date: string; ms: number }[] }) {
  const byDate = new Map(props.data.map((d) => [d.date, d.ms]));
  const max = Math.max(0, ...props.data.map((d) => d.ms));
  const weeks: { date: string; ms: number }[][] = [];
  if (props.data.length === 0) return <p className="text-sm text-muted py-6 text-center">No activity in this period.</p>;
  const first = new Date(`${props.data[0]!.date}T00:00:00`);
  const last = new Date(`${props.data[props.data.length - 1]!.date}T00:00:00`);
  const cursor = new Date(first);
  cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7)); // back to Monday
  while (cursor <= last) {
    const week: { date: string; ms: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      week.push({ date: key, ms: byDate.get(key) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  const color = (ms: number): string => {
    if (ms <= 0) return '#EAF1EB';
    const ratio = max > 0 ? ms / max : 0;
    if (ratio < 0.25) return '#B7D8C2';
    if (ratio < 0.5) return '#65A878';
    if (ratio < 0.75) return '#286844';
    return '#1B4A2F';
  };
  return (
    <div className="overflow-x-auto py-1">
      <div className="flex gap-[3px] min-w-max">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${formatDuration(day.ms)}`}
                className="w-3.5 h-3.5 rounded-[4px]"
                style={{ background: color(day.ms) }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-xs text-muted">
        <span>Less</span>
        {['#EAF1EB', '#B7D8C2', '#65A878', '#286844', '#1B4A2F'].map((c) => (
          <span key={c} className="w-3.5 h-3.5 rounded-[4px]" style={{ background: c }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
