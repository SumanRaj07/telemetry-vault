// Data & Backups: database facts, SQLite-safe backup/restore, integrity,
// maintenance, retention, and deletion with confirmation.
import { useState } from 'react';
import { api, useAsync } from '../api';
import {
  Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorBox, Field,
  PageHeader, Spinner, useToast,
} from '../components/ui';
import { formatDateTime } from '../../main/utils/time';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function DataBackups() {
  const toast = useToast();
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deleteRangeOpen, setDeleteRangeOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [restoring, setRestoring] = useState(false);

  const info = useAsync(() => api().data.info(), []);

  const backup = async () => {
    try {
      const result = await api().data.backup();
      toast('success', `Backup saved: ${result.path}`);
      info.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Backup failed.');
    }
  };

  const restore = async () => {
    try {
      const file = await api().data.pickFile();
      if (!file) return;
      const validation = await api().data.validateBackup({ path: file });
      if (!validation.ok) {
        toast('error', `Invalid backup: ${validation.detail}`);
        return;
      }
      setRestoring(true);
      await api().data.restore({ path: file });
      toast('success', 'Backup restored. The app will restart.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Restore failed.');
      setRestoring(false);
    }
  };

  const integrity = async () => {
    try {
      const result = await api().data.integrity();
      toast(result.ok ? 'success' : 'error', result.detail);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Check failed.');
    }
  };

  const maintenance = async () => {
    try {
      await api().data.maintenance();
      toast('success', 'Maintenance complete (VACUUM + ANALYZE).');
      info.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Maintenance failed.');
    }
  };

  const deleteRange = async () => {
    if (!rangeStart || !rangeEnd) return;
    try {
      const count = await api().data.deleteRange({
        startMs: new Date(`${rangeStart}T00:00:00`).getTime(),
        endMs: new Date(`${rangeEnd}T00:00:00`).getTime() + 24 * 60 * 60 * 1000,
      });
      toast('success', `Deleted ${count} sessions in the selected range.`);
      setDeleteRangeOpen(false);
      info.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Deletion failed.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Data & Backups"
        subtitle="Your database lives on this computer. Backups use SQLite's online backup API, never a raw copy of a live file."
      />
      {info.loading ? (
        <Spinner />
      ) : info.data ? (
        <>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <Card title="Database">
              <dl className="text-sm space-y-1.5">
                <div className="flex justify-between gap-4"><dt className="text-muted">Location</dt><dd className="truncate font-mono text-xs">{info.data.path}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Size</dt><dd>{formatBytes(info.data.sizeBytes)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Sessions</dt><dd>{info.data.sessions}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Applications</dt><dd>{info.data.apps}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Projects</dt><dd>{info.data.projects}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Repositories</dt><dd>{info.data.repos}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Earliest activity</dt><dd>{info.data.earliestMs ? formatDateTime(info.data.earliestMs) : '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Latest activity</dt><dd>{info.data.latestMs ? formatDateTime(info.data.latestMs) : '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Last backup</dt><dd>{info.data.lastBackupMs ? formatDateTime(info.data.lastBackupMs) : 'Never'}</dd></div>
              </dl>
            </Card>
            <Card title="Actions">
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => void backup()}>Create backup</Button>
                <Button onClick={() => void restore()} disabled={restoring}>{restoring ? 'Restoring…' : 'Restore backup…'}</Button>
                <Button onClick={() => void integrity()}>Check integrity</Button>
                <Button onClick={() => void maintenance()}>Run maintenance</Button>
              </div>
              <p className="text-xs text-muted mt-3">
                Restore replaces the live database and restarts the app. Backups are plain SQLite files by default —
                they are not encrypted unless you enable database encryption (not shipped in this release; see Settings).
              </p>
            </Card>
          </div>
          <Card title="Danger zone" subtitle="Destructive actions ask for confirmation and are audited">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setDeleteRangeOpen(true)}>Delete activity in a range…</Button>
              <Button variant="danger" onClick={() => setConfirmDeleteAll(true)}>Delete all activity…</Button>
            </div>
            <p className="text-xs text-muted mt-3">
              Deleting activity removes sessions, events, focus sessions, and insights. Applications, projects,
              repositories, and goals are kept.
            </p>
          </Card>
        </>
      ) : (
        <EmptyState title="Could not load database info" text="The database may not have initialized. Restart the app and try again." />
      )}
      {info.error && <ErrorBox message={info.error} />}

      <Dialog open={deleteRangeOpen} onClose={() => setDeleteRangeOpen(false)} title="Delete activity in a range">
        <div className="space-y-3">
          <p className="text-sm text-muted">Sessions and events overlapping this range are permanently deleted.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From"><input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} /></Field>
            <Field label="To"><input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} /></Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDeleteRangeOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => void deleteRange()}>Delete range</Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteAll}
        onClose={() => setConfirmDeleteAll(false)}
        title="Delete all activity?"
        text="All sessions, events, focus sessions, and insights are permanently deleted. This cannot be undone. Create a backup first if you might want the data back."
        confirmLabel="Delete everything"
        danger
        onConfirm={async () => {
          await api().data.deleteAll();
          toast('success', 'All activity deleted.');
          info.refresh();
        }}
      />
    </div>
  );
}
