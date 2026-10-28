// Integrations: Git, browser extension, editor integrations, local API,
// local AI, and the plugin list. Optional integrations stay disabled until
// the user explicitly enables them; unshipped ones say so plainly.
import { api, useAsync } from '../api';
import { Badge, Button, Card, EmptyState, ErrorBox, PageHeader, Spinner, useToast } from '../components/ui';

export default function Integrations() {
  const toast = useToast();
  const integrations = useAsync(() => api().integrations.list(), []);
  const plugins = useAsync(() => api().integrations.listPlugins(), []);
  const token = useAsync(() => api().integrations.getLocalApiToken(), []);

  const toggleLocalApi = async (enabled: boolean) => {
    try {
      const result = await api().integrations.setLocalApi({ enabled });
      if (enabled && typeof result === 'object') {
        toast('success', 'Local API enabled on http://127.0.0.1:48123 (localhost only).');
        token.refresh();
      } else {
        toast('success', 'Local API disabled.');
      }
      integrations.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const rotateToken = async () => {
    try {
      await api().integrations.rotateLocalApiToken();
      toast('success', 'API token rotated. Old tokens no longer work.');
      token.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Rotation failed.');
    }
  };

  const togglePlugin = async (id: string, enabled: boolean) => {
    try {
      await api().integrations.setPlugin({ id, enabled });
      plugins.refresh();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const localApi = (integrations.data ?? []).find((i) => i.id === 'local-api');

  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle="Optional connections are off by default. Nothing here sends data anywhere — the local API only answers on this computer."
      />
      {integrations.error && <ErrorBox message={integrations.error} />}
      {integrations.loading ? (
        <Spinner />
      ) : (
        <div className="space-y-3 mb-6">
          {(integrations.data ?? []).map((item) => (
            <Card key={item.id}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{item.name}</h3>
                    <Badge tone={item.enabled ? 'green' : 'gray'}>{item.enabled ? 'Enabled' : 'Disabled'}</Badge>
                  </div>
                  <p className="text-sm text-muted mt-0.5">{item.detail}</p>
                  {item.id === 'local-api' && item.enabled && (
                    <div className="mt-3 text-sm">
                      <p className="text-muted">
                        Endpoints (GET only, Bearer token required): <code className="text-xs bg-pale px-1 rounded">/health</code>{' '}
                        <code className="text-xs bg-pale px-1 rounded">/status</code>{' '}
                        <code className="text-xs bg-pale px-1 rounded">/summary/daily</code>{' '}
                        <code className="text-xs bg-pale px-1 rounded">/summary/weekly</code>{' '}
                        <code className="text-xs bg-pale px-1 rounded">/apps</code>{' '}
                        <code className="text-xs bg-pale px-1 rounded">/projects</code>{' '}
                        <code className="text-xs bg-pale px-1 rounded">/repos</code>{' '}
                        <code className="text-xs bg-pale px-1 rounded">/commits</code>
                      </p>
                      <p className="mt-2">
                        Token: <code className="text-xs bg-pale px-2 py-1 rounded break-all">{token.data ?? '…'}</code>
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" onClick={() => void rotateToken()}>Rotate token</Button>
                      </div>
                    </div>
                  )}
                </div>
                {item.id === 'local-api' && (
                  <Button size="sm" variant={localApi?.enabled ? 'outline' : 'primary'} onClick={() => void toggleLocalApi(!localApi?.enabled)}>
                    {localApi?.enabled ? 'Disable' : 'Enable'}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Card title="Plugins" subtitle="Built-in exporters are plugins: disabling one removes that export option">
        {plugins.loading ? (
          <Spinner />
        ) : (plugins.data ?? []).length === 0 ? (
          <EmptyState title="No plugins" text="No plugins are registered." />
        ) : (
          <ul className="divide-y divide-pale">
            {(plugins.data ?? []).map((p) => (
              <li key={p.id} className="py-2.5 flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{p.name} <span className="text-muted font-normal">v{p.version}</span></div>
                  <div className="text-muted">{p.description}</div>
                </div>
                <Button size="sm" onClick={() => void togglePlugin(p.id, !p.enabled)}>
                  {p.enabled ? 'Disable' : 'Enable'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
