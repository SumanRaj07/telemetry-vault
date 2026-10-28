// Projects: CRUD, archive/restore, repository linking, per-project stats.
import { useState } from 'react';
import { api, useAsync, useRange } from '../api';
import {
  Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorBox, Field,
  PageHeader, RangePicker, Spinner, useToast,
} from '../components/ui';
import { BarChartCard, DonutCard } from '../components/charts';
import { formatDuration } from '../../main/utils/time';
import { PROJECT_COLORS } from '../../shared/constants';
import type { ProjectRecord } from '../../shared/types';

export default function Projects() {
  const toast = useToast();
  const { preset, setPreset, setCustom, range } = useRange('month');
  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<ProjectRecord | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]!);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [linkRepoId, setLinkRepoId] = useState<number>(0);
  const [showArchived, setShowArchived] = useState(false);

  const projects = useAsync(() => api().projects.list({ includeArchived: showArchived }), [showArchived]);
  const repos = useAsync(() => api().repos.list(), []);
  const stats = useAsync(
    () => (detailId === null ? Promise.resolve(null) : api().projects.stats({ id: detailId, startMs: range.startMs, endMs: range.endMs })),
    [detailId, range.startMs, range.endMs],
  );
  const detailProject = (projects.data ?? []).find((p) => p.id === detailId) ?? null;

  const openCreate = () => {
    setName('');
    setDescription('');
    setCategory('');
    setColor(PROJECT_COLORS[0]!);
    setEditProject(null);
    setCreateOpen(true);
  };

  const openEdit = (p: ProjectRecord) => {
    setName(p.name);
    setDescription(p.description);
    setCategory(p.category);
    setColor(p.color);
    setEditProject(p);
    setCreateOpen(true);
  };

  const saveProject = async () => {
    if (!name.trim()) {
      toast('error', 'Project name is required.');
      return;
    }
    try {
      if (editProject) {
        await api().projects.update({ id: editProject.id, name: name.trim(), description, category, color });
        toast('success', 'Project updated.');
      } else {
        await api().projects.create({ name: name.trim(), description, category, color });
        toast('success', 'Project created.');
      }
      setCreateOpen(false);
      projects.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed.');
    }
  };

  const linkRepo = async () => {
    if (!detailId || !linkRepoId) return;
    try {
      await api().projects.linkRepo({ projectId: detailId, repoId: linkRepoId });
      toast('success', 'Repository linked.');
      stats.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Link failed.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Group repositories and sessions into projects. Attribution is manual or focus-based — the app never guesses a project from the most recent repository."
        actions={
          <>
            <Button onClick={() => setShowArchived((v) => !v)}>{showArchived ? 'Hide archived' : 'Show archived'}</Button>
            <Button variant="primary" onClick={openCreate}>New project</Button>
          </>
        }
      />
      {projects.error && <ErrorBox message={projects.error} />}
      {projects.loading ? (
        <Spinner />
      ) : (projects.data ?? []).length === 0 ? (
        <EmptyState
          title="No projects yet"
          text="Create a project to group repositories and time. Projects without Git work too — assign sessions to them from the Timeline page."
          action={<Button variant="primary" onClick={openCreate}>Create your first project</Button>}
        />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(projects.data ?? []).map((p) => (
            <Card key={p.id} className="hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <span className="w-3.5 h-3.5 rounded-full mt-1 shrink-0" style={{ background: p.color }} />
                <div className="flex-1 min-w-0">
                  <button className="font-semibold hover:underline text-left truncate block" onClick={() => setDetailId(p.id)}>
                    {p.name}
                  </button>
                  <p className="text-sm text-muted truncate">{p.description || 'No description'}</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {p.category && <Badge tone="gray">{p.category}</Badge>}
                    <Badge tone="green">{p.repositoryCount ?? 0} repos</Badge>
                    <Badge tone="gray">{formatDuration(p.totalMs ?? 0)} total</Badge>
                    {p.archived && <Badge tone="amber">archived</Badge>}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => openEdit(p)}>Edit</Button>
                    <Button size="sm" onClick={() => setDetailId(p.id)}>Details</Button>
                    <Button size="sm" onClick={() => void (async () => { await api().projects.setArchived({ id: p.id, archived: !p.archived }); projects.refresh(); })()}>
                      {p.archived ? 'Restore' : 'Archive'}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setDeleteId(p.id)}>Delete</Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={editProject ? 'Edit project' : 'New project'}>
        <div className="space-y-3">
          <Field label="Name">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </Field>
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} />
          </Field>
          <Field label="Category (optional)">
            <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={50} />
          </Field>
          <Field label="Color">
            <div className="flex gap-2 flex-wrap">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-ink' : 'border-transparent'}`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void saveProject()}>Save</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={detailId !== null} onClose={() => setDetailId(null)} title={detailProject?.name ?? 'Project'} wide>
        <RangePicker range={range} preset={preset} onPreset={setPreset} onCustom={setCustom} />
        {stats.loading ? (
          <Spinner />
        ) : stats.data ? (
          <div className="space-y-4 mt-3">
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div><div className="text-xs text-muted">Total time</div><div className="font-semibold">{formatDuration(stats.data.totalMs)}</div></div>
              <div><div className="text-xs text-muted">Coding time</div><div className="font-semibold">{formatDuration(stats.data.codingMs)}</div></div>
              <div><div className="text-xs text-muted">Sessions</div><div className="font-semibold">{stats.data.sessions}</div></div>
              <div><div className="text-xs text-muted">Commits</div><div className="font-semibold">{stats.data.commits}</div></div>
            </div>
            <BarChartCard data={stats.data.daily.map((d) => ({ label: d.date.slice(5), value: d.ms }))} />
            <DonutCard data={stats.data.apps.map((a) => ({ name: a.name, value: a.ms }))} />
            <div className="flex gap-2 items-end">
              <select value={linkRepoId} onChange={(e) => setLinkRepoId(Number(e.target.value))} className="!w-auto flex-1">
                <option value={0}>Link a repository…</option>
                {(repos.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <Button variant="primary" onClick={() => void linkRepo()} disabled={!linkRepoId}>Link</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted mt-3">No data.</p>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete project?"
        text="The project is removed and its sessions become Unassigned. Repositories and their commits are kept."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (deleteId === null) return;
          await api().projects.remove({ id: deleteId });
          toast('success', 'Project deleted.');
          projects.refresh();
        }}
      />
    </div>
  );
}
