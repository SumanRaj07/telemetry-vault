# Architecture

## Layers

```
Renderer (React + Vite + Tailwind)
  │  window.telemetry (typed, preloaded only)
  ▼
Preload (contextBridge, no Node access)
  │  ipcRenderer.invoke(channel, validated args)
  ▼
IPC handlers (src/main/ipc.ts, zod-validated)
  │  { ok, data } | { ok: false, error }
  ▼
AppServices (src/main/services/services.ts)
  ├─ TrackerService (polling, idle, sleep/lock, pause/resume, recovery)
  ├─ GitScanner (execFile, argument-safe, bounded)
  ├─ Analytics (pure functions, no I/O)
  ├─ Insights engine (deterministic rules)
  ├─ Report builders + exporters (CSV/JSON/HTML, PDF via printToPDF)
  └─ LocalApiServer (127.0.0.1 only, token, GET-only, rate-limited)
  ▼
Repositories (src/main/db/repositories.ts, parameterized SQL)
  ▼
SQLite (better-sqlite3, WAL, foreign keys, migrations via user_version)
```

## Key design decisions

1. **Pure analytics.** Every statistic is computed by a pure function over
   plain records (`src/main/analytics/analytics.ts`). The UI, CLI, and API
   share them, so a number can never disagree between surfaces. All of them
   are unit-tested.
2. **Heartbeat sessions.** A session row is created with `end = start` and
   its end is extended on every tick. A crash leaves the session ending at
   the last successful tick instead of losing it; startup recovery closes
   orphaned open sessions at their last heartbeat. Durations are always
   recomputed from `start`/`end`, never accumulated.
3. **Half-open intervals.** Ranges are `[start, end)`. Adjacent sessions
   never double-count a boundary, and midnight splitting assigns each slice
   to the correct day.
4. **Idle time is never counted.** When idle exceeds the threshold, the
   session ends at `now - idleSeconds` (clamped to the session start, since
   the OS counter can exceed the session's age). Idle intervals are recorded
   as events, not as usage.
5. **Project attribution is conservative.** Sessions get a project only from
   manual assignment or an active focus session's project (development tools
   only). The app never infers a project from the most recent repository.
6. **Providers behind interfaces.** `IActivityProvider` / `IIdleProvider`
   isolate Windows specifics (`active-win`, Electron `powerMonitor`) from
   the tracker, which is fully tested with a scripted mock provider.
7. **Validation at the boundary.** Every IPC payload is zod-validated in
   `src/main/ipc.ts` before touching the database or filesystem. The
   renderer cannot run SQL, open files, or spawn processes.
8. **One database, three consumers.** Desktop app, CLI, and local API all
   use `AppServices` and the same repositories. No duplicated logic.

## Native modules and the two-binary problem

`better-sqlite3` is compiled per Node ABI. Plain Node (tests, CLI) and
Electron (desktop app) use different ABIs, so one binary cannot serve both:

- `npm install` → plain-Node prebuild (tests + CLI work).
- `npm run rebuild:electron` (`electron-builder install-app-deps`) →
  Electron prebuild (desktop app + packaging work).

`active-win` is an optional dependency for the same reason: its prebuild
exists for Windows/macOS; on other platforms install skips it and the
provider reports "unavailable" instead of failing the install. On Windows,
`npm install` pulls the win32 prebuild and `rebuild:electron` aligns it
with Electron's ABI.

## Database

- Engine: SQLite via `better-sqlite3` (synchronous API, transactions).
- Pragmas: `journal_mode = WAL`, `foreign_keys = ON`,
  `synchronous = NORMAL`, `busy_timeout = 5000`.
- Migrations: `PRAGMA user_version` + ordered SQL in
  `src/main/db/migrations.ts`. Never edit an applied migration; add a new
  version. See MIGRATIONS.md.
- Backup: `db.backup()` (SQLite online backup API), never a raw copy of a
  live file. Restore: validate (integrity + schema version + required
  tables) → replace file → relaunch the app so services start fresh.
- No cached aggregate tables: summaries are computed from session rows on
  demand (indexed queries), so aggregates can never drift from source data.

## Security model (summary)

- Renderer: context isolation on, node integration off, strict CSP in
  production, no remote content, no `eval`.
- Preload: a small typed API; no filesystem, no shell, no raw Node.
- IPC: zod validation, sanitized errors (message only, no stack/paths).
- Git: `execFile` with argument arrays, timeouts, output caps; paths
  validated (absolute, existing directory, never a filesystem root).
- Local API: loopback only, bearer token, GET-only, 60 req/min/IP cap,
  500-row response cap.
- Full audit: SECURITY.md. Privacy: PRIVACY.md.

## Performance notes

- Tracker polls at a configurable interval (default 5s) — one provider call
  plus at most one UPDATE per tick. No busy loops.
- Git scans are incremental by design (commit dedup via `UNIQUE(repo_id,
  hash)` + `INSERT OR IGNORE`) and background scans only run for repos
  whose last scan is older than the configured interval.
- Dashboard queries are indexed (`sessions(app, start)`,
  `sessions(project, start)`, `sessions(start)`, `commits(repo, time)`).
- Renderer tables paginate via query limits; charts aggregate before render.
