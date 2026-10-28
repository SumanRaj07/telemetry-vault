// Focus & Goals: focus timer, focus history, goal CRUD and progress.
import { useEffect, useState } from 'react';
import { api, useAsync, useRange } from '../api';
import {
  Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field,
  PageHeader, ProgressBar, RangePicker, Spinner, StatCard, useToast,
} from '../components/ui';
import { formatDateTime, formatDuration } from '../../main/utils/time';
import type { GoalRecord } from '../../shared/types';

const GOAL_TYPES: { value: GoalRecord['type']; label: string }[] = [
  { value: 'coding_daily', label: 'Daily coding time' },
  { value: 'coding_weekly', label: 'Weekly coding time' },
  { value: 'focus_daily', label: 'Daily focus time' },
  { value: 'project_weekly', label: 'Weekly project time' },
];

export default function FocusGoals() {
  const toast = useToast();
  const { preset, setPreset, setCustom, range } = useRange('week');
  const [plannedMin, setPlannedMin] = useState(25);
  const [focusProject, setFocusProject] = useState<number | null>(null);
  const [focusNotes, setFocusNotes] = useState('');
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalType, setGoalType] = useState<GoalRecord['type']>('coding_daily');
  const [goalTargetMin, setGoalTargetMin] = useState(120);
  const [goalProject, setGoalProject] = useState<number | null>(null);
  const [deleteGoalId, setDeleteGoalId] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const current = useAsync(() => api().focus.current(), []);
  const history = useAsync(() => api().focus.history(range), [range.startMs, range.endMs]);
  const stats = useAsync(() => api().focus.stats(range), [range.startMs, range.endMs]);
  const goals = useAsync(() => api().goals.list(), []);
  const progress = useAsync(() => api().goals.progress(range), [range.startMs, range.endMs]);
  const projects = useAsync(() => api().projects.list(), []);

  useEffect(() => {
    if (!current.data) return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [current.data]);

  const startFocus = async () => {
    try {
      await api().focus.start({ plannedMin, projectId: focusProject, notes: focusNotes });
      toast('success', 'Focus session started.');
      current.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not start focus session.');
    }
  };

  const stopFocus = async (status: 'completed' | 'cancelled') => {
    if (!current.data) return;
    try {
      await api().focus.stop({ id: current.data.id, status });
      toast('success', status === 'completed' ? 'Focus session completed.' : 'Focus session cancelled.');
      current.refresh();
      history.refresh();
      stats.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not stop focus session.');
    }
  };

  const createGoal = async () => {
    if (!goalName.trim()) {
      toast('error', 'Goal name is required.');
      return;
    }
    try {
      await api().goals.create({
        name: goalName.trim(),
        type: goalType,
        targetMin: goalTargetMin,
        projectId: goalType === 'project_weekly' ? goalProject : null,
      });
      toast('success', 'Goal created.');
      setGoalOpen(false);
      goals.refresh();
      progress.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not create goal.');
    }
  };

  const running = current.data;
  const elapsed = running ? nowTick - running.startMs : 0;
  const remaining = running ? Math.max(0, running.plannedMs - elapsed) : 0;

  return (
    <div>
      <PageHeader
        title="Focus & Goals"
        subtitle="Focus sessions are never graded. Breaks are not failures, and nothing here pressures you to maximize computer usage."
      />
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card title="Focus timer" subtitle="Coding sessions during a focus block are attributed to its project">
          {running ? (
            <div className="space-y-3">
              <div className="text-center py-4">
                <div className="text-4xl font-semibold tabular-nums">{formatDuration(remaining)}</div>
                <div className="text-sm text-muted mt-1">
                  remaining of {formatDuration(running.plannedMs)}
                  {running.projectName ? ` · ${running.projectName}` : ''}
                </div>
                <ProgressBar pct={running.plannedMs > 0 ? (elapsed / running.plannedMs) * 100 : 0} />
              </div>
              <div className="flex gap-2 justify-center">
                <Button variant="primary" onClick={() => void stopFocus('completed')}>Finish</Button>
                <Button onClick={() => void stopFocus('cancelled')}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Duration (minutes)">
                  <input type="number" min={1} max={480} value={plannedMin} onChange={(e) => setPlannedMin(Number(e.target.value))} />
                </Field>
                <Field label="Project (optional)">
                  <select value={focusProject ?? ''} onChange={(e) => setFocusProject(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">No project</option>
                    {(projects.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Notes (optional)">
                <input type="text" value={focusNotes} onChange={(e) => setFocusNotes(e.target.value)} maxLength={1000} />
              </Field>
              <Button variant="primary" onClick={() => void startFocus()}>Start focus session</Button>
            </div>
          )}
        </Card>
        <Card title="Focus statistics" subtitle="Selected range" actions={<RangePicker range={range} preset={preset} onPreset={setPreset} onCustom={setCustom} />}>
          {stats.loading ? (
            <Spinner />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Sessions" value={String(stats.data?.count ?? 0)} />
              <StatCard label="Total focus" value={formatDuration(stats.data?.totalMs ?? 0)} />
              <StatCard label="Average" value={formatDuration(stats.data?.avgMs ?? 0)} />
              <StatCard label="Longest" value={formatDuration(stats.data?.longestMs ?? 0)} />
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Goals" subtitle="Daily and weekly targets you set yourself" actions={<Button variant="primary" onClick={() => setGoalOpen(true)}>New goal</Button>}>
          {(progress.data ?? []).length === 0 ? (
            <EmptyState title="No goals yet" text="Set a daily coding goal or a weekly project goal. Progress is computed from real tracked time." />
          ) : (
            <ul className="space-y-3">
              {(progress.data ?? []).map((g) => (
                <li key={g.goal.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium truncate">{g.goal.name}</span>
                      <span className="text-muted shrink-0">{formatDuration(g.currentMs)} / {formatDuration(g.goal.targetMs)} · {g.pct}%</span>
                    </div>
                    <ProgressBar pct={g.pct} />
                  </div>
                  <Button size="sm" variant="danger" onClick={() => setDeleteGoalId(g.goal.id)}>Delete</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Focus history" subtitle="Recent focus sessions">
          {(history.data ?? []).length === 0 ? (
            <EmptyState title="No focus sessions in this range" text="Start a focus session above. Completed sessions count toward focus goals." />
          ) : (
            <ul className="divide-y divide-pale max-h-80 overflow-y-auto">
              {(history.data ?? []).slice(0, 30).map((f) => (
                <li key={f.id} className="py-2 flex items-center gap-2 text-sm">
                  <Badge tone={f.status === 'completed' ? 'green' : 'gray'}>{f.status}</Badge>
                  <span className="flex-1 truncate">{f.projectName ?? 'No project'}</span>
                  <span className="text-muted">{f.actualMs !== null ? formatDuration(f.actualMs) : '—'}</span>
                  <span className="text-xs text-muted">{formatDateTime(f.startMs)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Dialog open={goalOpen} onClose={() => setGoalOpen(false)} title="New goal">
        <div className="space-y-3">
          <Field label="Goal name">
            <input type="text" value={goalName} onChange={(e) => setGoalName(e.target.value)} maxLength={100} />
          </Field>
          <Field label="Type">
            <select value={goalType} onChange={(e) => setGoalType(e.target.value as GoalRecord['type'])}>
              {GOAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Target (minutes)">
            <input type="number" min={1} max={10080} value={goalTargetMin} onChange={(e) => setGoalTargetMin(Number(e.target.value))} />
          </Field>
          {goalType === 'project_weekly' && (
            <Field label="Project">
              <select value={goalProject ?? ''} onChange={(e) => setGoalProject(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Select a project…</option>
                {(projects.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setGoalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void createGoal()}>Create goal</Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleteGoalId !== null}
        onClose={() => setDeleteGoalId(null)}
        title="Delete goal?"
        text="The goal and its progress history are removed."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (deleteGoalId === null) return;
          await api().goals.remove({ id: deleteGoalId });
          toast('success', 'Goal deleted.');
          goals.refresh();
          progress.refresh();
        }}
      />
    </div>
  );
}
