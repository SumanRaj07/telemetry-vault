# Feature Implementation Status

Honest status for Local-First Personal Telemetry Vault v1.0.0, as of 2026-10-28.
Nothing in the "Not shipped" list is presented as working anywhere in the app.

## Legend

- ✅ Implemented and verified (test, smoke run, or build check passed)
- 🟡 Implemented, works in principle, but not verified on the target platform
- ❌ Not shipped — the UI says so where the feature would appear

## Core tracking

| Feature | Status | Notes |
|---|---|---|
| Foreground application tracking (Windows) | 🟡 | `active-win` provider, heartbeat session model, crash recovery. Verified only with a mock provider on Linux; real Windows detection is pending a Windows run. |
| Idle detection (Windows) | 🟡 | Power-monitor based idle + suspend/resume/lock/unlock handling. Logic unit-tested with mocks; real Windows idle timing pending. |
| Pause / resume / tracking schedule | ✅ | Unit-tested; status pill and tray menu control it. |
| Session accounting (half-open intervals, no double-count, no negative durations) | ✅ | Unit-tested incl. a real bug found and fixed (idle end clamped to session start). |
| Sleep / wake / lock / unlock handling | 🟡 | Implemented in tracker + power monitor; real Windows events pending. |
| System tray (hide-to-tray, pause/resume, today's summary, quit) | 🟡 | Implemented; verified only under Linux Xvfb (tray API exists, icon shown). Windows tray pending. |
| Startup on Windows login / start minimized | 🟡 | Implemented via Electron login-item settings; pending Windows verification. |
| Single-instance lock | ✅ | Electron single-instance lock; second launch focuses the existing window. |
| Dashboard survives closure (tracking continues) | 🟡 | Close hides to tray by design; pending Windows verification. |

## Coding, Git, projects

| Feature | Status | Notes |
|---|---|---|
| Coding-time estimation + classification rules | ✅ | ~50 built-in rules + user rules; method explained in UI; Unknown shown when unattributable. |
| Git repository discovery + commit scanning | ✅ | Tested against a real temporary Git repo (discovery depth 3, dedup by repo+hash, argument-safe execFile, timeouts, output caps). |
| Repository language statistics | ✅ | Extension mapping, build/dependency dirs excluded by default. |
| Projects (CRUD, archive, repo links, stats, goals) | ✅ | UI + repositories + tests for association rules. |
| Manual session entry / edit / split / merge / delete | ✅ | Repository-tested; timeline UI exposes all four. |

## Analytics, reports, insights

| Feature | Status | Notes |
|---|---|---|
| Overview, Timeline, Coding, Applications, Projects, Repositories, Focus & Goals, Insights, Reports, Data & Backups, Integrations, Settings pages | ✅ | All 12 pages render real database data with honest empty states (verified: Overview empty state test). |
| Daily / weekly / monthly / annual reports | ✅ | One report object rendered as CSV, JSON, printable HTML, and PDF (Electron printToPDF). |
| Deterministic local insights engine | ✅ | Rules with supporting metrics; dismissible; categories can be disabled; no shaming language. |
| Activity heatmaps, hour/weekday distributions, trends, goal progress | ✅ | Pure analytics functions, unit-tested. |
| Search + filters (apps, projects, repos, commits, notes) | ✅ | Timeline and Applications pages. |

## Data management, privacy, security

| Feature | Status | Notes |
|---|---|---|
| SQLite schema v1+v2, migrations, FKs, indexes, WAL | ✅ | Migration + rollback + integrity tests pass. |
| Backup (SQLite online backup API), validated restore, integrity check, maintenance, retention, delete range/all | ✅ | Backup/restore/validation tested; restore relaunches the app. |
| CSV / JSON export, printable HTML, PDF | ✅ | CSV escaping tested. |
| Privacy controls (exclusions, window-title toggle, retention, deletion) | ✅ | Controls wired to actual collection (excluded apps are not recorded). |
| Secure Electron setup (context isolation, no node integration, CSP, validated IPC, no arbitrary shell/filesystem access) | ✅ | IPC zod-validated; security tests for paths, imports, IPC args. |
| Local read-only API (localhost only, Bearer token, GET-only, rate-limited) | ✅ | Disabled by default; token shown/rotatable in Integrations. |
| CLI (status, today, week, projects, export, backup) | ✅ | Smoke-tested against a real database file. |
| Plugin architecture | 🟡 | Extension-point registry + enable/disable toggles only; no third-party plugins ship. |
| Optional browser extension | ❌ | Not shipped. Browser apps are tracked as normal foreground apps only; tabs/domains are NOT detected. UI says so. |
| Optional editor integrations | ❌ | Not shipped. Project attribution uses repository activity + manual assignment only. |
| Local AI | ❌ | Provider interface only; no model ships, no inference runs. Deterministic insights are the fallback and are fully functional. |
| Database encryption | ❌ | Not shipped. The SQLite file is NOT encrypted by default, and the app never claims otherwise. |

## Build and packaging

| Feature | Status | Notes |
|---|---|---|
| `npm run dev`, `typecheck`, `lint`, `test`, `build` | ✅ | typecheck clean, lint 0 errors, 48 tests pass, Vite + tsc build passes (one non-blocking chunk-size warning). |
| Electron launch (Linux, Xvfb) | ✅ | App runs, DB created at schema v2 with 18 tables, integrity ok. |
| Windows unpacked build (`release/win-unpacked/`, Electron 36.9.5) | ✅ | Built on Linux with `npmRebuild=false` and hand-placed Windows native binaries. Verified inside: `Telemetry Vault.exe`, `app.asar` (dist-main + dist-renderer), unpacked win32 `better-sqlite3.node` (1,918,976 bytes), unpacked `active-win` win32 binding at the exact path its loader expects. |
| Windows NSIS installer | ❌ | Not produced — needs Windows or Wine. Run `npm run package:win` on a Windows PC to produce it. On Windows, `npm install` fetches `active-win` normally and `npm run rebuild:electron` aligns native modules. |
| Code signing | ❌ | Not configured; Windows will show a SmartScreen prompt for the unsigned build. |

## Pending Windows verification (needs a real Windows machine)

1. Foreground window detection via `active-win` (real apps, real titles).
2. Idle threshold timing via the OS idle API.
3. Sleep/wake/lock/unlock event handling.
4. System tray icon + menu behaviour.
5. Startup-on-login registration.
6. NSIS installer install/uninstall + data persistence across upgrades.

Everything else in this file marked ✅ was verified in this Linux environment on 2026-10-28.
