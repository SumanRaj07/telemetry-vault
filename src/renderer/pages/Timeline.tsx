// Activity Timeline: searchable history with edit, delete, split, merge,
// and manual entry. Manual entries are flagged; edits are audited.
import { useState } from 'react';
import { api, useAsync, useRange } from '../api';
import {
  Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorBox, Field,
  PageHeader, RangePicker, Spinner, useToast,
} from '../components/ui';
import { formatDateTime, formatDuration } from '../../main/utils/time';
import type { TimelineItem } from '../../shared/types';

function toInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Timeline() {
  const toast = useToast();
  const { preset, setPreset, setCustom, range } = useRange('week');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [appId, setAppId] = useState<number | undefined>(undefined);
  const [projectId, setProjectId] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<number[]>([]);
  const [editItem, setEditItem] = useState<TimelineItem | null>(null);
  const [editProject, setEditProject] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [splitItem, setSplitItem] = useState<TimelineItem | null>(null);
  const [splitAt, setSplitAt] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualApp, setManualApp] = useState<number>(0);
  const [manualProject, setManualProject] = useState<number | null>(null);
  const [manualStart, setManualStart] = useState('');
  const [manualEnd, setManualEnd] = useState('');
  const [manualNotes, setManualNotes] = useState('');

  const timeline = useAsync(
    () => api().activity.getTimeline({ startMs: range.startMs, endMs: range.endMs, search, kind: kind || undefined, appId, projectId, limit: 500 }),
    [range.startMs, range.endMs, search, kind, appId, projectId],
  );
  const apps = useAsync(() => api().applications.list(), []);
  const projects = useAsync(() => api().projects.list(), []);

  const doEdit = async () => {
    if (!editItem) return;
    try {
      await api().activity.updateSession({ id: editItem.id, projectId: editProject, notes: editNotes });
      toast('success', 'Session updated.');
      setEditItem(null);
      timeline.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const doMerge = async () => {
    if (selected.length !== 2) return;
    try {
      await api().activity.mergeSessions({ firstId: selected[0]!, secondId: selected[1]! });
      toast('success', 'Sessions merged.');
      setSelected([]);
      timeline.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Merge failed (sessions must be the same application).');
    }
  };

  const doManual = async () => {
    if (!manualApp || !manualStart || !manualEnd) {
      toast('error', 'Application, start, and end are required.');
      return;
    }
    try {
      await api().activity.createManualSession({
        appId: manualApp,
        projectId: manualProject,
        startMs: new Date(manualStart).getTime(),
        endMs: new Date(manualEnd).getTime(),
      });
      toast('success', 'Manual session added.');
      setManualOpen(false);
      timeline.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not add session.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Activity Timeline"
        subtitle="Every session, commit, focus block, and system event in chronological order."
        actions={
          <>
            <Button onClick={() => setManualOpen(true)} variant="primary">Add manual session</Button>
            <Button disabled={selected.length !== 2} onClick={() => void doMerge()}>
              Merge selected ({selected.length})
            </Button>
          </>
        }
      />
      <Card className="mb-4">
        <div className="flex flex-wrap gap-2 items-end">
          <RangePicker range={range} preset={preset} onPreset={setPreset} onCustom={setCustom} />
          <input
            type="text"
            placeholder="Search titles, notes, commit messages…"
            className="!w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="!w-auto">
            <option value="">All types</option>
            <option value="session">Sessions</option>
            <option value="commit">Commits</option>
            <option value="focus">Focus</option>
            <option value="event">System events</option>
          </select>
          <select value={appId ?? ''} onChange={(e) => setAppId(e.target.value ? Number(e.target.value) : undefined)} className="!w-auto">
            <option value="">All applications</option>
            {(apps.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.displayName}</option>
            ))}
          </select>
          <select value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : undefined)} className="!w-auto">
            <option value="">All projects</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </Card>
      {timeline.error && <ErrorBox message={timeline.error} />}
      {timeline.loading ? (
        <Spinner />
      ) : (timeline.data ?? []).length === 0 ? (
        <EmptyState title="Nothing in this range" text="Tracking creates timeline entries automatically. Add a manual session to record time that was not tracked." />
      ) : (
        <Card>
          <ul className="divide-y divide-pale">
            {(timeline.data ?? []).map((item) => (
              <li key={`${item.kind}-${item.id}`} className="py-2.5 flex items-start gap-3 text-sm">
                {item.kind === 'session' && (
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.includes(item.id)}
                    onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id)))}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone={item.kind === 'commit' ? 'green' : item.kind === 'focus' ? 'amber' : item.kind === 'event' ? 'red' : 'gray'}>
                      {item.kind}
                    </Badge>
                    <span className="font-medium truncate">{item.title}</span>
                    {item.manual && <Badge tone="amber">manual</Badge>}
                  </div>
                  <div className="text-xs text-muted truncate mt-0.5">
                    {item.subtitle}
                    {item.endMs ? ` · ${formatDuration(item.endMs - item.timestampMs)}` : ''}
                  </div>
                </div>
                <span className="text-xs text-muted shrink-0">{formatDateTime(item.timestampMs)}</span>
                {item.kind === 'session' && (
                  <span className="flex gap-1 shrink-0">
                    <Button size="sm" onClick={() => { setEditItem(item); setEditProject(null); setEditNotes(''); }}>Edit</Button>
                    <Button size="sm" onClick={() => { setSplitItem(item); setSplitAt(toInputValue(item.timestampMs + 30 * 60 * 1000)); }}>Split</Button>
                    <Button size="sm" variant="danger" onClick={() => setDeleteId(item.id)}>Delete</Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted mt-3">Tip: select exactly two sessions of the same application, then Merge to combine them.</p>
        </Card>
      )}

      <Dialog open={editItem !== null} onClose={() => setEditItem(null)} title="Edit session">
        <div className="space-y-3">
          <Field label="Project">
            <select value={editProject ?? ''} onChange={(e) => setEditProject(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Unassigned</option>
              {(projects.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditItem(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => void doEdit()}>Save</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={splitItem !== null} onClose={() => setSplitItem(null)} title="Split session">
        <div className="space-y-3">
          <p className="text-sm text-muted">The session will be split at the chosen time into two sessions.</p>
          <Field label="Split at">
            <input type="datetime-local" value={splitAt} onChange={(e) => setSplitAt(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setSplitItem(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!splitItem || !splitAt) return;
                try {
                  await api().activity.splitSession({ id: splitItem.id, atMs: new Date(splitAt).getTime() });
                  toast('success', 'Session split.');
                  setSplitItem(null);
                  timeline.refresh();
                } catch (err) {
                  toast('error', err instanceof Error ? err.message : 'Split failed.');
                }
              }}
            >
              Split
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete session?"
        text="This session will be permanently removed from your history. Daily totals are recalculated from the remaining sessions."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (deleteId === null) return;
          await api().activity.deleteSession({ id: deleteId });
          toast('success', 'Session deleted.');
          timeline.refresh();
        }}
      />

      <Dialog open={manualOpen} onClose={() => setManualOpen(false)} title="Add manual session">
        <div className="space-y-3">
          <Field label="Application">
            <select value={manualApp} onChange={(e) => setManualApp(Number(e.target.value))}>
              <option value={0}>Select an application…</option>
              {(apps.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.displayName}</option>
              ))}
            </select>
          </Field>
          <Field label="Project (optional)">
            <select value={manualProject ?? ''} onChange={(e) => setManualProject(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Unassigned</option>
              {(projects.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <input type="datetime-local" value={manualStart} onChange={(e) => setManualStart(e.target.value)} />
            </Field>
            <Field label="End">
              <input type="datetime-local" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} />
            </Field>
          </div>
          <Field label="Notes (optional)">
            <textarea value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} rows={2} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setManualOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void doManual()}>Add session</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
