# Development (diaitika fork)

## Get the code

```bash
mkdir -p ~/Projects/diaitika && cd ~/Projects/diaitika
git clone git@github.com:rostik32/nutritrace.git
cd nutritrace
git checkout diaitika
git remote add upstream https://github.com/TraceApps/nutritrace.git
git config core.hooksPath diaitika/githooks   # gitleaks pre-commit (brew install gitleaks)
git fetch upstream
```

## Run locally — option A: Docker (nothing else to install)

Needs Docker Desktop (or OrbStack/colima).

```bash
docker compose -f diaitika/docker-compose.dev.yml up            # first start installs deps (~1–2 min)
docker compose -f diaitika/docker-compose.dev.yml exec dev diaitika/seed-dev.sh   # once, creates test admin
```

After a Node major change (`node:<major>-bookworm` in the compose file), recreate the module volumes once:
`docker compose -f diaitika/docker-compose.dev.yml down -v`.

## Run locally — option B: Node on the host

Needs Node **24** (see `.nvmrc`; the Dockerfiles and CI use the same major). Native modules
(`better-sqlite3`, DuckDB) are built for one Node version, so after switching Node reinstall them:
`npm ci && npm ci --prefix server`.

```bash
nvm install && nvm use        # picks Node 24 from .nvmrc
diaitika/dev.sh               # API on :3001 (auto-restart) + Vite on :5173 (hot reload)
diaitika/seed-dev.sh          # in a second terminal, once
```

Open http://localhost:5173 and log in as `dev` with the password from `.dev-data/dev-credentials`.

> **Known issue (2026-10-24):** the Vite dev server currently renders a blank page (also on unmodified
> upstream code; the API on :3001 works). Until that is fixed, check UI changes with a production build:
>
> ```bash
> npx vite build && rm -rf server/dist && cp -r dist server/dist
> cd server && DB_PATH=../.dev-data/db/nutritrace.db UPLOADS_PATH=../.dev-data/uploads \
>   JWT_SECRET=local-dev-only-not-a-secret INSECURE_COOKIES=1 node index.js   # → http://localhost:3001
> ```
>
> Remove `dist/` and `server/dist/` afterwards (both are git-ignored).

Data lives in `.dev-data/` (git-ignored, throwaway). Delete the folder to start from scratch.
Both options share it. Never point local dev at production data.

Optional: a realistic food catalog — import CIQUAL with the scripts in `diaitika-infra/scripts/ciqual/`
(or paste a CSV into Settings → Import & Export → Bulk Import).

## Checks (same as CI)

```bash
npm test               # node --test, ~900 tests, a couple of minutes
npm run i18n:check     # every user-facing string must be a key in src/i18n/en.json
npm run build          # production bundle
```

## Code map

Upstream `ARCHITECTURE.md` is the reference. In short: `server/` Express + better-sqlite3 API
(`server/routes/*`), `src/` Svelte 5 PWA (`src/routes`, `src/components`, `src/lib`), `android/`
Capacitor app, `scripts/*.test.js` tests.

## Workflow

1. Branch from `diaitika`: `git checkout -b feat/<topic> diaitika`.
2. Non-trivial change? Plan it with OpenSpec in Claude Code: `/opsx:propose <topic>`; the proposal
   lands in `openspec/changes/<topic>/` and is reviewed before coding (`/opsx:apply`).
3. Commit (Conventional Commits), push, open a PR into `diaitika`. CI runs tests on the PR.
4. After review + merge, GitHub Actions publishes `ghcr.io/rostik32/nutritrace:diaitika`
   (+ `:sha-<short>`), linux/arm64.
5. Deployment to the server is done by the owner per `diaitika-infra/docs/runbooks/update-nutritrace.md`.
6. Generic improvements: re-apply them on a branch from `upstream/dev` (no fork-only files) and open
   a PR against `TraceApps/nutritrace:dev`.

## Syncing upstream

```bash
git fetch upstream
git checkout main && git merge --ff-only upstream/main && git push origin main
git checkout -b chore/sync-upstream diaitika && git merge main   # resolve, test, PR into diaitika
```

## OpenSpec

CLI: `npm install -g @fission-ai/openspec@1.14.3` (Node ≥ 20.19). Project config:
`openspec/config.yaml`; Claude Code commands in `.claude/commands/opsx/`.
