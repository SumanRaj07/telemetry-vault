# Security

## Electron hardening

- `contextIsolation: true`, `nodeIntegration: false` on every window,
  including the hidden PDF print window.
- Strict Content Security Policy in production (set via
  `webRequest.onHeadersReceived`): `default-src 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';
  connect-src 'self'`. (`unsafe-inline` styles are required by Recharts'
  inline styles; no inline scripts are used.)
- No remote content is ever loaded. No `eval`, no `new Function`, no
  dynamic code execution from user data.
- The preload script exposes exactly one object, `window.telemetry`, with
  the typed methods in `src/shared/types.ts`. Nothing else reaches the
  renderer.

## IPC validation

- Every `ipcMain.handle` callback validates its arguments with a zod schema
  (`src/main/utils/validate.ts`) before any work. Unknown settings keys are
  rejected (strict schema). Invalid input returns a plain error string.
- Error messages sent to the renderer contain no stack traces, file paths,
  or SQL.
- The renderer cannot: read/write arbitrary files (only save/open dialogs
  the user drives), execute commands, or touch the database directly.

## Filesystem safety

- Repository paths must be absolute, exist, be directories, and must not be
  a filesystem root. Discovery never descends into hidden directories,
  `node_modules`, or `.git` internals, and is bounded by depth (3) and
  count (200).
- Git is invoked with `execFile` and an argument array — never a shell
  string — so paths cannot inject commands. Every call has a timeout
  (10–60s) and an output cap (64KB–10MB).
- Backup/restore paths come from save/open dialogs or explicit CLI
  arguments. Restore validates the file (integrity check, schema version,
  required tables) before replacing anything.
- Imported data is never executed. CSV/JSON exports escape values
  (including leading `=`, `+`, `-`, `@` handling via quoting).

## Local API safety

- Disabled by default. When enabled: binds to `127.0.0.1` only (never
  `0.0.0.0`), requires `Authorization: Bearer <token>`, accepts GET only,
  rate-limits to 60 requests/minute per IP, caps lists at 500 rows.
- Tokens are random UUIDs stored in the settings table, revocable and
  rotatable from Integrations. Disabling the API stops the server.
- The API is read-only by construction: no POST/PUT/DELETE route exists.

## Data handling

- Logs contain technical errors only — never window titles, commit
  messages, file contents, or paths beyond the database location.
- Notifications never include window titles or commit messages.
- Backups are plain SQLite files by default and are NOT encrypted; the app
  says so in the UI instead of implying otherwise. Use BitLocker for
  at-rest encryption until a database-encryption option is implemented.
- No secrets are hardcoded. The only credential material is the local API
  token, generated on first enablement and stored locally.

## Dependency notes

- `better-sqlite3` and `active-win` are native modules. `active-win` is an
  optional dependency: if its prebuild cannot be installed, npm continues
  and the tracker reports "unavailable" instead of breaking the install.
- `electron-builder` downloads platform tools at package time (documented
  in README packaging notes). No dependency performs network requests at
  runtime except the optional update mechanism — which is not implemented
  (no update checking ships in this release).
