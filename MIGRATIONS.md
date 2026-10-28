# Database migrations

Migrations live in `src/main/db/migrations.ts` and run in order at startup,
tracked by `PRAGMA user_version`. The runner applies each migration inside
a transaction and bumps `user_version` only after it succeeds.

| Version | Contents |
|---|---|
| 1 | Core schema: `categories`, `applications`, `activity_sessions`, `activity_events`, `projects`, `project_repositories`, `repositories`, `git_commits`, `focus_sessions`, `goals`, `settings`, `insights`, plus indexes on session/app/project/start and commit repo/time. |
| 2 | `app_rules`, `repo_languages`, `notifications`, `backups`, `audit_events`. |

## Rules

- Never edit an applied migration. Add a new version entry instead.
- Every migration must be idempotent where practical (`IF NOT EXISTS`).
- Seed data (default settings, default categories) is inserted with
  `INSERT OR IGNORE` after migrations, not inside them.
- Destructive migrations (dropping columns/tables) require a backup
  prompt in the UI before running; none exist yet.

## Verifying

```powershell
npm test -- tests/db/database.test.ts
```

covers migration application, seeding, rollback, backup validation, and
integrity checks against an in-memory database.
