# Telemetry Vault — Local-First Personal Telemetry Vault

A private, offline-first personal activity tracking and developer analytics
platform for Windows. It automatically tracks foreground application usage,
estimates coding time, monitors Git repositories, organizes activity by
project, analyzes productivity patterns, and generates reports — all on your
own computer, with no account, subscription, cloud backend, or external API.

## Features

- **Automatic application tracking** — foreground window detection on Windows
  (via the maintained `active-win` integration), with configurable idle
  detection, sleep/wake/lock handling, pause/resume, and crash recovery.
- **Accurate session accounting** — heartbeat-extended sessions, half-open
  intervals (no double-counted boundaries), midnight splitting, and no
  negative durations.
- **Coding-time estimates** — foreground time in development tools while
  active. The UI explains the method honestly: it is not a keystroke count.
- **Git intelligence** — repository discovery, read-only commit scanning via
  the Git CLI (argument-safe, bounded, deduplicated), branch info, and
  language composition from source files.
- **Projects** — manual and focus-based attribution only. The app never
  guesses a project from the most recently active repository.
- **Analytics** — daily/weekly/monthly/annual summaries, hour and weekday
  patterns, heatmaps, application and project distributions, focus stats.
- **Focus sessions and goals** — timer, history, daily/weekly goals, streaks
  via goal history. Breaks are never treated as failures.
- **Deterministic insights** — rule-based observations with their supporting
  numbers. No AI, no labels about your work ethic.
- **Reports** — daily, weekly, monthly, annual, and custom-range reports with
  CSV, JSON, printable HTML, and PDF export (via Electron's print engine).
- **Data management** — SQLite-safe backup (backup API, not raw copies),
  restore with validation, integrity checks, VACUUM maintenance, retention,
  and audited deletion.
- **Privacy controls** — exclusions, optional window-title collection (off by
  default), optional executable-path collection, retention, full export,
  visible database location, and a local-only API (disabled by default).
- **System tray** — tracking continues while the dashboard is closed;
  pause/resume, today's summary, and quit from the tray. Optional login
  startup, no admin service required.
- **CLI** — `status`, `today`, `week`, `projects`, `export`, `backup`,
  reusing the same services as the desktop app.
- **Local read-only API** — optional, localhost-only, token-protected,
  GET-only, rate-limited.

## What is NOT shipped (stated plainly)

- **Browser extension** — not implemented. Browser apps are tracked by
  foreground time only; tabs and domains are never inferred.
- **Editor integrations** — not implemented. Editor time is foreground time.
- **Local AI** — the provider interface exists, but no model ships with the
  app. Deterministic insights are always available.
- **Database encryption** — not implemented. The SQLite file is stored
  unencrypted; use BitLocker until an encrypted option lands.
- **Windows installer (NSIS)** — requires a Windows machine or Wine; see
  [Packaging](#packaging). An unpacked Windows build can be produced on
  Linux (see `release/` notes in FEATURE_STATUS.md).

See **FEATURE_STATUS.md** for the verified vs. pending checklist.

## Quick start (Windows)

Requirements: Windows 10/11, Node.js 20+, Git (for repository scanning).

```powershell
npm install
npm run rebuild:electron   # swaps better-sqlite3 to the Electron build
npm run dev                # Vite dev server + Electron
```

> **Why `rebuild:electron`?** `better-sqlite3` is a native module. `npm install`
> gives you the plain-Node build (used by tests and the CLI). Electron runs a
> different Node version, so before running or packaging the desktop app, swap
> in the Electron build with `npm run rebuild:electron` (downloads a prebuilt
> binary, no compiler needed). After that, `npm test` needs the Node build
> back — reinstall with `npm install --force` or keep the two binaries apart
> as described in ARCHITECTURE.md.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev: Vite + Electron (renderer at http://localhost:5173) |
| `npm run build` | Production build (main + renderer) |
| `npm start` | Run the production build with Electron |
| `npm run typecheck` | TypeScript check (main + renderer) |
| `npm run lint` | ESLint |
| `npm test` | Vitest suite (unit, DB, security, integration, renderer) |
| `npm run cli -- <cmd>` | CLI (status, today, week, projects, export, backup) |
| `npm run rebuild:electron` | Swap native modules to the Electron build |
| `npm run package:win` | Build the Windows NSIS installer (needs Windows or Wine) |
| `npm run make-icon` | Regenerate the app icon (pure Node, no assets tooling) |

## CLI examples

```powershell
npm run cli -- status
npm run cli -- today
npm run cli -- week
npm run cli -- projects
npm run cli -- export csv 2026-10-01 2026-10-28 report.csv
npm run cli -- backup
```

The CLI reads the same database as the desktop app. Override the location
with `TELEMETRY_VAULT_DB` (used by tests too).

## Project structure

```
src/
  main/            Electron main process
    db/            SQLite: migrations, database class, repositories
    tracking/      providers, tracker service, classification, git
    analytics/     pure analytics, insights engine, report builders
    services/      AppServices (business logic), local API server
    utils/         time helpers, zod validation schemas
    ipc.ts         validated IPC handlers
    main.ts        window, tray, lifecycle, dialogs, PDF export
    cli.ts         CLI entry (same services, no Electron window)
  preload/         context-bridge API (the only renderer bridge)
  renderer/        React app: components, charts, 12 pages
  shared/          types + constants shared by main/renderer
tests/             unit, db, security, integration, renderer tests
assets/            icon.png / icon.ico (generated, no binary blobs)
```

## Database location

- Windows: `%APPDATA%\telemetry-vault\telemetry.db`
- The Data & Backups page shows the exact path, size, counts, and last
  backup. Backups live in `<database-dir>\backups\`.

## Privacy architecture (short version)

- Default collection: process name, application name, timestamps, durations.
  Nothing else unless you opt in.
- Window titles: off by default. Executable paths: on by default, can be
  turned off. Keystrokes, window contents, screenshots: never.
- Git scanning reads commit metadata (`hash, author, date, message, branch`)
  and file extensions for language stats. It never reads source code for
  commit tracking and never modifies a repository.
- No network calls by default. No analytics SDKs, no ads, no cloud sync.
  The optional local API binds to 127.0.0.1 only.
- Full details: **PRIVACY.md** and **SECURITY.md**.

## Troubleshooting

| Problem | Fix |
|---|---|
| Tracking shows "unavailable" | On Windows, run `npm run rebuild:electron` so `active-win` matches Electron; restart the app. |
| Git scans report "Git is not installed" | Install Git and ensure `git` is on PATH, then Scan again. |
| App opens but the dashboard is empty | That is the honest empty state: tracking creates data over time, or add a manual session from Timeline. |
| Port 48123 in use (local API) | Stop the other listener, or disable and re-enable the local API in Integrations. |
| Database locked / busy | Only one app instance runs (single-instance lock). Close the other copy. |
| Restore fails validation | The file is not a Telemetry Vault database or failed integrity check — pick a backup created by this app. |

## Known limitations

- Foreground detection, idle time via `powerMonitor`, tray, and startup
  registration are Windows/Electron features; on Linux/macOS the tracker
  reports "unavailable" and the rest of the app still works.
- `active-win` is an optional dependency: on platforms without a prebuilt
  binary it is skipped at install time and the provider reports unavailable
  instead of breaking the install.
- Reports and charts use recorded data only; a fresh install shows empty
  states rather than sample data.
- Large histories (100k+ sessions) are capped per query (100k rows) and
  paginated in the UI where practical; very large exports stream from the
  same queries.

## License

MIT.
