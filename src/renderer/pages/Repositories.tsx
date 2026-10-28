// Git Repositories: add, discover, scan, inspect commits and languages.
import { useState } from 'react';
import { api, useAsync } from '../api';
import {
  Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorBox,
  PageHeader, Spinner, useToast,
} from '../components/ui';
import { formatDateTime } from '../../main/utils/time';
import type { RepositoryRecord } from '../../shared/types';

export default function Repositories() {
  const toast = useToast();
  const [pathInput, setPathInput] = useState('');
  const [discoverRoot, setDiscoverRoot] = useState('');
  const [discovered, setDiscovered] = useState<{ path: string; name: string }[]>([]);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [detailRepo, setDetailRepo] = useState<RepositoryRecord | null>(null);
  const [scanning, setScanning] = useState(false);

  const repos = useAsync(() => api().repos.list(), []);
  const commits = useAsync(
    () => (detailRepo === null ? Promise.resolve([]) : api().repos.commits({ repoId: detailRepo.id, limit: 200 })),
    [detailRepo],
  );
  const languages = useAsync(
    () => (detailRepo === null ? Promise.resolve([]) : api().repos.languages({ repoId: detailRepo.id })),
    [detailRepo],
  );

  const pickFolder = async (setter: (v: string) => void) => {
    const folder = await api().repos.pickFolder();
    if (folder) setter(folder);
  };

  const addRepo = async (repoPath: string) => {
    if (!repoPath.trim()) return;
    try {
      await api().repos.add({ path: repoPath.trim() });
      toast('success', 'Repository added. Scan it to collect commits.');
      setPathInput('');
      setDiscovered((prev) => prev.filter((d) => d.path !== repoPath));
      repos.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not add repository.');
    }
  };

  const discover = async () => {
    if (!discoverRoot.trim()) return;
    try {
      const found = await api().repos.discover({ root: discoverRoot.trim() });
      setDiscovered(found);
      if (found.length === 0) toast('error', 'No repositories found under that folder.');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Discovery failed.');
    }
  };

  const scan = async (id: number) => {
    setScanning(true);
    try {
      const result = await api().repos.scan({ id });
      if (result.error) toast('error', result.error);
      else toast('success', `Scan complete: ${result.added} new commits.`);
      repos.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Scan failed.');
    } finally {
      setScanning(false);
    }
  };

  const scanAll = async () => {
    setScanning(true);
    try {
      const result = await api().repos.scanAll();
      toast('success', `Scanned ${result.scanned} repositories, ${result.added} new commits.`);
      if (result.errors.length) toast('error', result.errors[0]!);
      repos.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Scan failed.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Git Repositories"
        subtitle="Commit history is read with the local Git CLI. Repositories are never modified and source code is never read for commit tracking."
        actions={<Button variant="primary" onClick={() => void scanAll()} disabled={scanning}>Scan all</Button>}
      />
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card title="Add a repository" subtitle="Pick a folder that contains a .git directory">
          <div className="flex gap-2">
            <input type="text" placeholder="C:\Users\you\code\my-project" value={pathInput} onChange={(e) => setPathInput(e.target.value)} />
            <Button onClick={() => void pickFolder(setPathInput)}>Browse…</Button>
            <Button variant="primary" onClick={() => void addRepo(pathInput)}>Add</Button>
          </div>
        </Card>
        <Card title="Discover repositories" subtitle="Scans a folder (up to 3 levels deep) for Git repositories">
          <div className="flex gap-2">
            <input type="text" placeholder="C:\Users\you\code" value={discoverRoot} onChange={(e) => setDiscoverRoot(e.target.value)} />
            <Button onClick={() => void pickFolder(setDiscoverRoot)}>Browse…</Button>
            <Button variant="primary" onClick={() => void discover()}>Discover</Button>
          </div>
          {discovered.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {discovered.map((d) => (
                <li key={d.path} className="flex items-center gap-2">
                  <span className="flex-1 truncate">{d.path}</span>
                  <Button size="sm" onClick={() => void addRepo(d.path)}>Add</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {repos.error && <ErrorBox message={repos.error} />}
      {repos.loading ? (
        <Spinner />
      ) : (repos.data ?? []).length === 0 ? (
        <EmptyState title="No repositories tracked yet" text="Add a repository above, or discover all repositories under a folder you choose. Scanning is read-only and bounded — the whole disk is never scanned." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted">
                  <th className="py-2 pr-3">Repository</th>
                  <th className="py-2 pr-3">Project</th>
                  <th className="py-2 pr-3">Commits</th>
                  <th className="py-2 pr-3">Last scan</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pale">
                {(repos.data ?? []).map((r) => (
                  <tr key={r.id} className="hover:bg-pale/60">
                    <td className="py-2 pr-3">
                      <button className="font-medium hover:underline text-left" onClick={() => setDetailRepo(r)}>{r.name}</button>
                      <div className="text-xs text-muted truncate max-w-xs">{r.path}</div>
                      {r.lastError && <div className="text-xs text-danger truncate max-w-xs">{r.lastError}</div>}
                    </td>
                    <td className="py-2 pr-3">{r.projectName ?? '—'}</td>
                    <td className="py-2 pr-3">{r.commitCount ?? 0}</td>
                    <td className="py-2 pr-3 text-muted">{r.lastScanMs ? formatDateTime(r.lastScanMs) : 'Never'}</td>
                    <td className="py-2">
                      <span className="flex gap-1 flex-wrap">
                        <Button size="sm" onClick={() => void scan(r.id)} disabled={scanning || !r.enabled}>Scan</Button>
                        <Button size="sm" onClick={() => void (async () => { await api().repos.setEnabled({ id: r.id, enabled: !r.enabled }); repos.refresh(); })()}>
                          {r.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => setDeleteId(r.id)}>Remove</Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted mt-3">Commit counts are activity records, not a measure of code quality or productivity.</p>
        </Card>
      )}

      <Dialog open={detailRepo !== null} onClose={() => setDetailRepo(null)} title={detailRepo?.name ?? 'Repository'} wide>
        {detailRepo && (
          <div className="space-y-4">
            <p className="text-sm text-muted break-all">{detailRepo.path}</p>
            <div>
              <h3 className="font-semibold text-sm mb-2">Languages (file counts)</h3>
              {(languages.data ?? []).length === 0 ? (
                <p className="text-sm text-muted">Scan the repository to compute language composition.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(languages.data ?? []).map((l) => (
                    <Badge key={l.language} tone="green">{l.language}: {l.files} files</Badge>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-2">Recent commits</h3>
              <ul className="divide-y divide-pale max-h-96 overflow-y-auto">
                {(commits.data ?? []).map((c) => (
                  <li key={c.id} className="py-2 text-sm">
                    <div className="font-medium truncate">{c.message.split('\n')[0]}</div>
                    <div className="text-xs text-muted">
                      {c.authorName} · {c.hash.slice(0, 7)} · {formatDateTime(c.commitMs)}
                      {c.branch ? ` · ${c.branch}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Remove repository?"
        text="The repository and its stored commits are removed from Telemetry Vault. Your files on disk are untouched."
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          if (deleteId === null) return;
          await api().repos.remove({ id: deleteId });
          toast('success', 'Repository removed.');
          repos.refresh();
        }}
      />
    </div>
  );
}
