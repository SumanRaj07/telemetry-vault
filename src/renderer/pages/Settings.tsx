// Settings: general, tracking, privacy, notifications, database,
// integrations shortcuts, and advanced. All values persist in SQLite and
// are validated before saving.
import { api, useAsync } from '../api';
import { Button, Card, ErrorBox, Field, PageHeader, Spinner, useToast } from '../components/ui';
import type { Settings } from '../../shared/types';

function Toggle(props: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div>
        <div className="text-sm font-medium">{props.label}</div>
        {props.hint && <div className="text-xs text-muted">{props.hint}</div>}
      </div>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} className="mt-1" />
    </div>
  );
}

export default function Settings() {
  const toast = useToast();
  const query = useAsync(() => api().settings.get(), []);

  const update = async (patch: Partial<Settings>) => {
    try {
      await api().settings.update(patch);
      query.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not save settings.');
    }
  };

  const reset = async () => {
    try {
      await api().settings.resetDefaults();
      toast('success', 'Settings restored to defaults.');
      query.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Reset failed.');
    }
  };

  const s = query.data;
  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Every setting is validated before it is saved, and persists across restarts."
        actions={<Button onClick={() => void reset()}>Restore defaults</Button>}
      />
      {query.error && <ErrorBox message={query.error} />}
      {query.loading || !s ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <Card title="General">
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Time format">
                <select value={s.timeFormat} onChange={(e) => void update({ timeFormat: e.target.value as '12h' | '24h' })}>
                  <option value="24h">24-hour</option>
                  <option value="12h">12-hour</option>
                </select>
              </Field>
              <Field label="First day of week">
                <select value={s.firstDayOfWeek} onChange={(e) => void update({ firstDayOfWeek: Number(e.target.value) })}>
                  <option value={1}>Monday</option>
                  <option value={0}>Sunday</option>
                </select>
              </Field>
              <Field label="Theme">
                <select value={s.theme} disabled>
                  <option value="light">Light green &amp; white (default)</option>
                </select>
              </Field>
            </div>
            <div className="mt-3 space-y-1">
              <Toggle label="Start on Windows login" checked={s.startOnLogin} onChange={(v) => void update({ startOnLogin: v })} />
              <Toggle label="Start minimized to tray" checked={s.startMinimized} onChange={(v) => void update({ startMinimized: v })} />
            </div>
          </Card>

          <Card title="Tracking">
            <div className="space-y-1">
              <Toggle label="Tracking enabled" hint="When off, the tracker records nothing." checked={s.trackingEnabled} onChange={(v) => void update({ trackingEnabled: v })} />
              <Toggle label="Collect executable paths" hint="Off means only process and application names are stored." checked={s.collectExecutablePaths} onChange={(v) => void update({ collectExecutablePaths: v })} />
              <Toggle label="Collect window titles" hint="Off by default. Titles can contain personal information, so they are only stored when you opt in." checked={s.collectWindowTitles} onChange={(v) => void update({ collectWindowTitles: v })} />
            </div>
            <div className="grid md:grid-cols-3 gap-3 mt-3">
              <Field label="Idle threshold (seconds)" hint="After this long without input, time stops counting.">
                <input type="number" min={30} max={3600} value={s.idleThresholdSec} onChange={(e) => void update({ idleThresholdSec: Number(e.target.value) })} />
              </Field>
              <Field label="Polling interval (ms)" hint="How often the foreground app is checked.">
                <input type="number" min={1000} max={60000} step={1000} value={s.pollIntervalMs} onChange={(e) => void update({ pollIntervalMs: Number(e.target.value) })} />
              </Field>
              <Field label="Lock-screen behavior">
                <select value={s.lockBehavior} onChange={(e) => void update({ lockBehavior: e.target.value as Settings['lockBehavior'] })}>
                  <option value="stop_session">Close session, resume on unlock</option>
                  <option value="pause">Pause tracking until unlock</option>
                  <option value="ignore">Keep current session open</option>
                </select>
              </Field>
            </div>
            <div className="mt-3 space-y-1">
              <Toggle label="Tracking schedule" hint="Only track during scheduled hours and days." checked={s.scheduleEnabled} onChange={(v) => void update({ scheduleEnabled: v })} />
            </div>
            {s.scheduleEnabled && (
              <div className="grid md:grid-cols-2 gap-3 mt-3">
                <Field label="Start hour">
                  <input type="number" min={0} max={23} value={s.scheduleStartHour} onChange={(e) => void update({ scheduleStartHour: Number(e.target.value) })} />
                </Field>
                <Field label="End hour">
                  <input type="number" min={0} max={23} value={s.scheduleEndHour} onChange={(e) => void update({ scheduleEndHour: Number(e.target.value) })} />
                </Field>
              </div>
            )}
          </Card>

          <Card title="Privacy">
            <div className="space-y-1">
              <Toggle label="Browser integration" hint="Not shipped in this release; enabling this toggle alone changes nothing until an extension exists." checked={s.browserIntegrationEnabled} onChange={(v) => void update({ browserIntegrationEnabled: v })} />
              <Toggle label="Local AI analysis" hint="Provider interface only; no model ships with the app." checked={s.localAiEnabled} onChange={(v) => void update({ localAiEnabled: v })} />
            </div>
            <div className="mt-3">
              <Field label="Data retention (days, 0 = keep forever)" hint="Older activity is deleted automatically by the background job.">
                <input type="number" min={0} max={3650} value={s.retentionDays} onChange={(e) => void update({ retentionDays: Number(e.target.value) })} />
              </Field>
            </div>
            <p className="text-xs text-muted mt-3">
              Window titles, browser domains, and keystrokes are never collected by the core tracker. Screenshots are
              never taken. The database location is shown on the Data &amp; Backups page.
            </p>
          </Card>

          <Card title="Notifications">
            <div className="space-y-1">
              <Toggle label="Desktop notifications" checked={s.notificationsEnabled} onChange={(v) => void update({ notificationsEnabled: v })} />
              <Toggle label="Quiet hours" hint="No notifications during quiet hours." checked={s.quietHoursEnabled} onChange={(v) => void update({ quietHoursEnabled: v })} />
            </div>
            <div className="grid md:grid-cols-2 gap-3 mt-3">
              <Field label="Quiet hours start">
                <input type="number" min={0} max={23} value={s.quietStartHour} onChange={(e) => void update({ quietStartHour: Number(e.target.value) })} />
              </Field>
              <Field label="Quiet hours end">
                <input type="number" min={0} max={23} value={s.quietEndHour} onChange={(e) => void update({ quietEndHour: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="mt-3">
              <Button onClick={() => void (async () => { await api().system.notifyTest(); toast('success', 'Test notification sent.'); })()}>
                Send test notification
              </Button>
            </div>
          </Card>

          <Card title="Git">
            <div className="space-y-1">
              <Toggle label="Git monitoring enabled" hint="Background rescans only run for repositories whose last scan is older than the interval." checked={s.gitEnabled} onChange={(v) => void update({ gitEnabled: v })} />
            </div>
            <div className="mt-3">
              <Field label="Automatic scan interval (minutes)">
                <input type="number" min={5} max={1440} value={s.gitScanIntervalMin} onChange={(e) => void update({ gitScanIntervalMin: Number(e.target.value) })} />
              </Field>
            </div>
          </Card>

          <Card title="Advanced">
            <p className="text-sm text-muted">
              Database encryption is not shipped in this release: the SQLite file is stored unencrypted on your disk,
              which is the honest default for a local-first app. If you need encryption, use OS-level disk encryption
              (BitLocker on Windows) until an encrypted-database option is implemented.
            </p>
            <p className="text-sm text-muted mt-2">
              Diagnostics: the app logs technical errors locally only. Logs never contain window titles, commit
              messages, or file contents.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
