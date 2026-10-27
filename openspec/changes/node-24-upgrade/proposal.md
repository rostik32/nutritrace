# Proposal

## Why

The fork runs on Node 20, which reached end of life on 2026-04-30 and no longer gets security fixes. Node 20 was
pinned because `better-sqlite3@9.6.0` (our lockfile) does not compile on newer Node (`DEVELOPMENT.md`), and
`@capacitor/cli@8`, already in the project, requires Node ≥ 22, so `npx cap` runs on an unsupported Node today.

## What Changes

- Runtime moves from Node 20 to **Node 24** (current LTS "Krypton", supported until 2028-04) everywhere the version
  is pinned: `.nvmrc`, both stages of `Dockerfile`, `server/Dockerfile`, `diaitika/docker-compose.dev.yml`, the
  CI `setup-node` step in `.github/workflows/ci.yml`, and the version check in `diaitika/dev.sh`.
- `better-sqlite3` goes from `^9.4.3` to `^12` in `server/package.json` (+ lockfile). 12.11.1 builds and passes the
  suite on Node 24; 9.6.0 fails with C++20 errors from the Node 24 headers. Its bundled SQLite is newer; the
  database file format stays compatible both ways, so an older image can still open the database.
- Docs that say "Node 20" follow: `AGENTS.md` (PR checks), `DEVELOPMENT.md`, `openspec/config.yaml` context;
  in diaitika-infra `docs/onboarding.md`, ADR 0005, a new ADR (why 24 and not 26), the update runbook's rollback list.
- No change to app behaviour, API, database schema or UI. Node 24 changes that could matter (removed `util.is*`,
  import assertions, `url.parse` warnings) were checked: our code uses none of them.

Upstream: yes — Node 20 is EOL for every NutriTrace user and upstream ships the same Dockerfiles; offer the generic
part (Dockerfiles, CI, `better-sqlite3`) as a PR against upstream `dev` after it runs here, with the owner's OK.

Out of scope:
- Node 26: released 2026-04, not LTS yet on 2026-10-27 (26.12.1 has no LTS codename); revisit once it is.
- Other dependency upgrades (`undici`, `openid-client`, `vite` majors) and `npm audit` fixes.
- The Android app's own build (Gradle/JDK); only the Capacitor CLI runs on Node.
- Upstream's `docker.yml` publish workflow (no Node version in it; skipped in the fork).

## Capabilities

### New Capabilities
<!-- none: runtime/tooling upgrade, no behaviour change (skip_specs: true) -->

### Modified Capabilities
<!-- none -->

## Impact

- Files: `.nvmrc`, `Dockerfile`, `server/Dockerfile`, `diaitika/docker-compose.dev.yml`, `diaitika/dev.sh`,
  `.github/workflows/ci.yml`, `server/package.json`, `server/package-lock.json`, `AGENTS.md`, `DEVELOPMENT.md`,
  `openspec/config.yaml`; diaitika-infra docs and runbook.
- Developers: `nvm install` (24) and reinstall `server/node_modules` (native modules are rebuilt for the new ABI);
  the dev compose volumes `node_modules` / `server_node_modules` must be recreated.
- Production: new image on the next deploy; the DB is backed up first (runbook), rollback to the current `:sha-*`.
