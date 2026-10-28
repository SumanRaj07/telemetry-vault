# Privacy

Telemetry Vault is local-first by design: your activity data never leaves
your computer unless you explicitly export a file yourself.

## What is collected by default

| Data | Collected? |
|---|---|
| Process name and application name | Yes |
| Session start/end timestamps and durations | Yes |
| Application category and classification | Yes (from built-in + your rules) |
| Idle, sleep, wake, lock, unlock events | Yes (timestamps only) |
| Git commit metadata (hash, author, date, message, branch) | Yes, for repositories you add |
| Source file counts by language | Yes, for repositories you scan |
| Focus sessions and goals you create | Yes |
| Executable path | Yes, but can be turned off in Settings → Tracking |
| Window titles | **No** — off by default; only stored if you opt in |
| Keystrokes | Never |
| Window contents / screenshots | Never |
| Browser tabs, domains, URLs, search queries | Never (no browser extension ships) |
| File contents / source code | Never |
| Passwords, cookies, form contents | Never |

## What is never sent anywhere

- No cloud backend, account, or sync. No analytics SDK, no advertising SDK.
- No update checking in this release (nothing phones home).
- The optional local API answers only on `127.0.0.1` with a token.
- Exports (CSV/JSON/HTML/PDF) are files you save yourself via a dialog.

## Controls

- **Pause/resume** from the tray or the header pill — paused time is not
  recorded, and the tray tooltip shows the state.
- **Application exclusions** — excluded apps are not recorded and are left
  out of analytics.
- **Repository enable/disable and removal** — disabling stops scans;
  removal deletes stored commits for that repository.
- **Window-title and executable-path toggles** in Settings → Tracking.
- **Data retention** — automatic deletion of activity older than N days
  (0 = keep forever).
- **Delete a range / delete all activity** — audited, confirmed, and the
  definitions (apps, projects, repos, goals) are kept.
- **Full export** — CSV/JSON/HTML/PDF reports from real records.
- **Database location** — shown on Data & Backups, so you always know
  where the file lives.

## Git privacy notes

- Scanning reads commit metadata and counts files by extension. It does
  not read file contents for commit tracking and never modifies a repo.
- Author emails are stored only if present in commits (they are part of
  commit metadata) and are not displayed in notifications.
- Do not add repositories you do not want commit metadata stored for.

## If you need stronger at-rest protection

The SQLite file is not encrypted by this app. Until an encrypted-database
option is implemented, use OS-level full-disk encryption (BitLocker on
Windows) to protect the database file at rest.
