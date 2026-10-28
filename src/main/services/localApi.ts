// Local read-only API. Disabled by default; when enabled it binds to
// 127.0.0.1 only (never 0.0.0.0), requires a bearer token, accepts GET only,
// rate-limits callers, and caps response sizes. No endpoint writes anything.
import http from 'node:http';
import type { SummaryStats, TrackingStatusInfo } from '../../shared/types';

export interface ApiDataProvider {
  getStatus: () => TrackingStatusInfo;
  getSummary: (startMs: number, endMs: number) => SummaryStats;
  listApps: () => { displayName: string; totalMs: number }[];
  listProjects: () => { name: string; totalMs?: number }[];
  listRepos: () => { name: string; path: string; commitCount?: number }[];
  listCommits: (limit: number) => { hash: string; message: string; commitMs: number; repoName: string }[];
}

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 1000;

export class LocalApiServer {
  private server: http.Server | null = null;
  private hits = new Map<string, number[]>();
  running = false;

  constructor(
    private data: ApiDataProvider,
    private getToken: () => string,
  ) {}

  start(port: number): boolean {
    if (this.server) return true;
    this.server = http.createServer((req, res) => {
      void this.handle(req, res);
    });
    this.server.on('error', () => {
      this.running = false;
    });
    this.server.listen(port, '127.0.0.1', () => {
      this.running = true;
    });
    return true;
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.running = false;
  }

  private send(res: http.ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const ip = req.socket.remoteAddress ?? 'unknown';
      const now = Date.now();
      const recent = (this.hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
      if (recent.length >= RATE_LIMIT) {
        this.send(res, 429, { ok: false, error: 'Rate limit exceeded.' });
        return;
      }
      recent.push(now);
      this.hits.set(ip, recent);

      if (req.method !== 'GET') {
        this.send(res, 405, { ok: false, error: 'Read-only API: GET only.' });
        return;
      }
      const token = this.getToken();
      const auth = req.headers.authorization ?? '';
      if (!token || auth !== `Bearer ${token}`) {
        this.send(res, 401, { ok: false, error: 'Unauthorized.' });
        return;
      }
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 100) || 100));
      const endMs = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      switch (url.pathname) {
        case '/health':
          this.send(res, 200, { ok: true, data: { status: 'ok' } });
          return;
        case '/status':
          this.send(res, 200, { ok: true, data: this.data.getStatus() });
          return;
        case '/summary/daily':
          this.send(res, 200, { ok: true, data: this.data.getSummary(endMs - dayMs, endMs) });
          return;
        case '/summary/weekly':
          this.send(res, 200, { ok: true, data: this.data.getSummary(endMs - 7 * dayMs, endMs) });
          return;
        case '/apps':
          this.send(res, 200, { ok: true, data: this.data.listApps().slice(0, limit) });
          return;
        case '/projects':
          this.send(res, 200, { ok: true, data: this.data.listProjects().slice(0, limit) });
          return;
        case '/repos':
          this.send(res, 200, { ok: true, data: this.data.listRepos().slice(0, limit) });
          return;
        case '/commits':
          this.send(res, 200, { ok: true, data: this.data.listCommits(limit) });
          return;
        default:
          this.send(res, 404, { ok: false, error: 'Unknown endpoint.' });
          return;
      }
    } catch {
      this.send(res, 500, { ok: false, error: 'Internal error.' });
    }
  }
}
