# Contributing

## Development setup

```powershell
npm install
npm run dev        # Vite dev server + Electron
```

Run `npm run rebuild:electron` before `npm run dev` on first setup if the
tracker reports "unavailable" (native module ABI mismatch — see README).

## Checks before submitting

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

All four must pass. Tests use an in-memory SQLite database and scripted
activity providers — no Windows APIs are required to run the suite.

## Conventions

- **No fake data.** Empty states must say so; never seed sample statistics
  to make a page look complete. (Development fixtures, if ever added, must
  be clearly labeled and never shipped in production paths.)
- **Analytics stay pure.** New statistics go in `src/main/analytics/` as
  pure functions with unit tests, not inside React components.
- **Validate at the boundary.** New IPC handlers get a zod schema in
  `src/main/utils/validate.ts` and a handler in `src/main/ipc.ts`.
- **Providers stay behind interfaces.** Windows-specific code lives in
  `src/main/tracking/providers.ts` and must degrade gracefully when
  unavailable.
- **Migrations are append-only.** Never edit an applied migration; add a
  new version in `src/main/db/migrations.ts` and document it in
  MIGRATIONS.md.
- **Security-sensitive code** (filesystem paths, child processes, IPC,
  local API) needs a security test in `tests/security/`.
- **Honest status.** If a feature cannot run in the current environment,
  mark it pending in FEATURE_STATUS.md instead of claiming it works.

## Release process (Windows)

```powershell
npm run build
npm run rebuild:electron
npm run package:win
```

The NSIS installer lands in `release/`. On Linux without Wine, use
`npx electron-builder --win dir` for an unpacked build (see README).
