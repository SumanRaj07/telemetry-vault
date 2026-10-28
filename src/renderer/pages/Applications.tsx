// Applications: inventory with totals, category assignment, exclusion,
// custom rules, and a per-application detail view.
import { useState } from 'react';
import { api, useAsync, useRange } from '../api';
import {
  Badge, Button, Card, Dialog, EmptyState, ErrorBox, Field, PageHeader,
  RangePicker, Spinner, useToast,
} from '../components/ui';
import { BarChartCard } from '../components/charts';
import { formatDuration } from '../../main/utils/time';
import { CATEGORIES } from '../../shared/constants';
import type { AppCategory, Classification } from '../../shared/types';

export default function Applications() {
  const toast = useToast();
  const { preset, setPreset, setCustom, range } = useRange('30d');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailCategory, setDetailCategory] = useState<AppCategory>('uncategorized');
  const [detailClassification, setDetailClassification] = useState<Classification>('neutral');
  const [ruleMatch, setRuleMatch] = useState('');
  const [ruleCategory, setRuleCategory] = useState<AppCategory>('development');

  const apps = useAsync(() => api().applications.list({ search, category: category || undefined }), [search, category]);
  const detail = useAsync(
    () => (detailId === null ? Promise.resolve(null) : api().applications.get({ id: detailId, startMs: range.startMs, endMs: range.endMs })),
    [detailId, range.startMs, range.endMs],
  );
  const rules = useAsync(() => api().applications.listRules(), []);

  const openDetail = (id: number, cat: AppCategory, cls: Classification) => {
    setDetailId(id);
    setDetailCategory(cat);
    setDetailClassification(cls);
  };

  const saveCategory = async () => {
    if (detailId === null) return;
    try {
      await api().applications.setCategory({ id: detailId, category: detailCategory, classification: detailClassification });
      toast('success', 'Category saved. Future sessions use the new classification.');
      apps.refresh();
      detail.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed.');
    }
  };

  const toggleExcluded = async (id: number, excluded: boolean) => {
    try {
      await api().applications.setExcluded({ id, excluded });
      toast('success', excluded ? 'Application excluded from analytics.' : 'Application included again.');
      apps.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const addRule = async () => {
    if (!ruleMatch.trim()) return;
    try {
      await api().applications.createRule({ match: ruleMatch.trim(), category: ruleCategory, classification: CATEGORIES[ruleCategory].classification });
      toast('success', 'Rule added. It applies to future sessions.');
      setRuleMatch('');
      rules.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not add rule.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Applications"
        subtitle="Everything the tracker has seen, with totals and classifications you control."
      />
      <Card className="mb-4">
        <div className="flex flex-wrap gap-2">
          <input type="text" placeholder="Search applications…" className="!w-64" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="!w-auto">
            <option value="">All categories</option>
            {Object.entries(CATEGORIES).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
        </div>
      </Card>
      {apps.error && <ErrorBox message={apps.error} />}
      {apps.loading ? (
        <Spinner />
      ) : (apps.data ?? []).length === 0 ? (
        <EmptyState title="No applications recorded yet" text="Applications appear here automatically once tracking observes them. Unknown applications start as Uncategorized until you assign them." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted">
                  <th className="py-2 pr-3">Application</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Classification</th>
                  <th className="py-2 pr-3">Total time</th>
                  <th className="py-2 pr-3">Sessions</th>
                  <th className="py-2">Tracked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pale">
                {(apps.data ?? []).map((a) => (
                  <tr key={a.id} className="hover:bg-pale/60">
                    <td className="py-2 pr-3">
                      <button className="font-medium hover:underline text-left" onClick={() => openDetail(a.id, a.category, a.classification)}>
                        {a.displayName}
                      </button>
                      <div className="text-xs text-muted">{a.processName}</div>
                    </td>
                    <td className="py-2 pr-3"><Badge tone="green">{CATEGORIES[a.category]?.label ?? a.category}</Badge></td>
                    <td className="py-2 pr-3 text-muted">{a.classification}</td>
                    <td className="py-2 pr-3">{formatDuration(a.totalMs)}</td>
                    <td className="py-2 pr-3">{a.sessions}</td>
                    <td className="py-2">
                      <Button size="sm" onClick={() => void toggleExcluded(a.id, !a.excluded)}>
                        {a.excluded ? 'Include' : 'Exclude'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Custom classification rules" subtitle="Rules apply to future sessions. Matching is case-insensitive and matches part of the process or application name." className="mt-4">
        <div className="flex flex-wrap gap-2 items-end">
          <input type="text" placeholder="Match text, e.g. figma" className="!w-56" value={ruleMatch} onChange={(e) => setRuleMatch(e.target.value)} />
          <select value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value as AppCategory)} className="!w-auto">
            {Object.entries(CATEGORIES).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
          <Button variant="primary" onClick={() => void addRule()}>Add rule</Button>
        </div>
        <ul className="mt-3 space-y-1 text-sm">
          {(rules.data ?? []).map((r) => (
            <li key={r.id} className="flex gap-2 text-muted">
              <span className="font-mono text-ink">{r.match}</span>
              <span>→ {CATEGORIES[r.category]?.label ?? r.category} ({r.classification})</span>
            </li>
          ))}
        </ul>
      </Card>

      <Dialog open={detailId !== null} onClose={() => setDetailId(null)} title={detail.data?.app.displayName ?? 'Application'} wide>
        <RangePicker range={range} preset={preset} onPreset={setPreset} onCustom={setCustom} />
        {detail.loading ? (
          <Spinner />
        ) : detail.data ? (
          <div className="space-y-4 mt-3">
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div><div className="text-xs text-muted">Total time</div><div className="font-semibold">{formatDuration(detail.data.totalMs)}</div></div>
              <div><div className="text-xs text-muted">Sessions</div><div className="font-semibold">{detail.data.sessions}</div></div>
              <div><div className="text-xs text-muted">Average</div><div className="font-semibold">{formatDuration(detail.data.avgMs)}</div></div>
              <div><div className="text-xs text-muted">Longest</div><div className="font-semibold">{formatDuration(detail.data.longestMs)}</div></div>
            </div>
            <BarChartCard data={detail.data.daily.map((d) => ({ label: d.date.slice(5), value: d.ms }))} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <select value={detailCategory} onChange={(e) => setDetailCategory(e.target.value as AppCategory)}>
                  {Object.entries(CATEGORIES).map(([key, meta]) => (
                    <option key={key} value={key}>{meta.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Classification">
                <select value={detailClassification} onChange={(e) => setDetailClassification(e.target.value as Classification)}>
                  <option value="productive">Productive</option>
                  <option value="neutral">Neutral</option>
                  <option value="distracting">Distracting</option>
                </select>
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setDetailId(null)}>Close</Button>
              <Button variant="primary" onClick={() => void saveCategory()}>Save classification</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted mt-3">No data.</p>
        )}
      </Dialog>
    </div>
  );
}
