// Insights: deterministic observations with their supporting numbers.
// Nothing here is AI-generated; every insight shows how it was calculated.
import { useState } from 'react';
import { api, useAsync, useRange } from '../api';
import { Badge, Button, Card, EmptyState, ErrorBox, PageHeader, RangePicker, Spinner, useToast } from '../components/ui';

const TYPE_LABELS: Record<string, string> = {
  coding_trend: 'Coding trend',
  project_concentration: 'Project concentration',
  browser_increase: 'Browser usage',
  goal_achieved: 'Goal achieved',
  project_inactive: 'Inactive project',
  peak_hours: 'Peak hours',
  focus_change: 'Focus change',
};

export default function Insights() {
  const toast = useToast();
  const { preset, setPreset, setCustom, range } = useRange('week');
  const [disabledTypes, setDisabledTypes] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<number | null>(null);
  const insights = useAsync(() => api().insights.list(), []);

  const generate = async () => {
    try {
      await api().insights.generate(range);
      toast('success', 'Insights refreshed from real records.');
      insights.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Generation failed.');
    }
  };

  const dismiss = async (id: number) => {
    await api().insights.dismiss({ id });
    insights.refresh();
  };

  const visible = (insights.data ?? []).filter((i) => !i.dismissed && !disabledTypes.has(i.type));

  return (
    <div>
      <PageHeader
        title="Insights"
        subtitle="Deterministic observations from your actual records. No AI, no labels about your work ethic — just numbers and what changed."
        actions={
          <>
            <RangePicker range={range} preset={preset} onPreset={setPreset} onCustom={setCustom} />
            <Button variant="primary" onClick={() => void generate()}>Generate for range</Button>
          </>
        }
      />
      <Card title="Insight categories" subtitle="Disable a category to hide its insights" className="mb-4">
        <div className="flex flex-wrap gap-2">
          {Object.entries(TYPE_LABELS).map(([type, label]) => {
            const disabled = disabledTypes.has(type);
            return (
              <button
                key={type}
                onClick={() => setDisabledTypes((prev) => {
                  const next = new Set(prev);
                  if (next.has(type)) next.delete(type);
                  else next.add(type);
                  return next;
                })}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border ${disabled ? 'bg-white text-muted border-border line-through' : 'bg-light text-deep border-primary'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Card>
      {insights.loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No insights yet"
          text="Generate insights for the selected range. Insights only appear when a change is material (for example, coding time moving at least 20% and 30 minutes), so an empty list can simply mean a steady period."
          action={<Button variant="primary" onClick={() => void generate()}>Generate insights</Button>}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((i) => (
            <Card key={i.id}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone="green">{TYPE_LABELS[i.type] ?? i.type}</Badge>
                    <span className="text-xs text-muted">{i.period}</span>
                  </div>
                  <h3 className="font-semibold mt-1">{i.title}</h3>
                  <p className="text-sm text-muted mt-0.5">{i.detail}</p>
                  {expanded === i.id && (
                    <pre className="mt-2 bg-pale rounded-lg p-3 text-xs overflow-x-auto">{JSON.stringify(JSON.parse(i.metricsJson), null, 2)}</pre>
                  )}
                </div>
                <span className="flex gap-1 shrink-0">
                  <Button size="sm" onClick={() => setExpanded((prev) => (prev === i.id ? null : i.id))}>
                    {expanded === i.id ? 'Hide numbers' : 'Show numbers'}
                  </Button>
                  <Button size="sm" onClick={() => void dismiss(i.id)}>Dismiss</Button>
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
      {insights.error && <ErrorBox message={insights.error} />}
    </div>
  );
}
