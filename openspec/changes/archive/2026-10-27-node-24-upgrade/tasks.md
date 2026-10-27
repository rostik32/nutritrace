# Tasks

## 1. Runtime pins

- [x] 1.1 `.nvmrc` → `24`; `diaitika/dev.sh` major check and its message → `24`; verify `nvm use` picks 24 and
  `diaitika/dev.sh` refuses to start on Node 20 (run its check under `nvm exec 20`, no servers left running)
- [x] 1.2 `.github/workflows/ci.yml`: `node-version: 24` and the comment above it (`node:24-alpine`); verify with
  `grep -rn "node-version\|node:2" .github/workflows`
- [x] 1.3 `Dockerfile` (`node:24-alpine` build stage, `node:24-slim` runtime), `server/Dockerfile` (`node:24-alpine`),
  `diaitika/docker-compose.dev.yml` (`node:24-bookworm`); verify `grep -rn "node:20" --exclude-dir=node_modules .`
  finds nothing outside `CHANGELOG.md`

## 2. Native dependency

- [x] 2.1 On Node 24: `npm install better-sqlite3@^12 --prefix server`; verify `server/package.json` says `^12.x` and
  `git diff server/package-lock.json` touches only `better-sqlite3` and its own dependencies
- [x] 2.2 Rebuild local deps on Node 24 (`npm ci`, `npm ci --prefix server`); verify `npm test` passes in full (the
  MCP integration suite must run, not skip) and `npm run i18n:check` passes
- [x] 2.3 Verify `npm run build` succeeds and the server boots on Node 24 against the throwaway `.dev-data` DB
  (`diaitika/dev.sh` or `node index.js`): `/` returns 200 after `diaitika/seed-dev.sh`, login with the seed admin
  works, food search returns results; note the PIDs and stop them, `lsof -iTCP -sTCP:LISTEN -nP` shows none of ours
  (done: own catalog `GET /api/foods` 200; OFF search needs the local mirror, absent in `.dev-data`, so it is checked in 6.3)

## 3. Docs in this repo

- [x] 3.1 `AGENTS.md` "How to work" step 5 → "pass on Node 24"; `DEVELOPMENT.md` option B → Node 24 and how to switch
  (`nvm install && nvm use`, `npm ci --prefix server`, dev compose `down -v` to recreate module volumes); replace the
  old "better-sqlite3 does not build on newer Node" note; `openspec/config.yaml` context → "on Node 24"; verify
  `grep -rn "Node 20\|Node \*\*20" AGENTS.md DEVELOPMENT.md openspec/config.yaml` finds nothing

## 4. Production image check (before merge)

- [x] 4.1 Ask the owner to start Docker Desktop; `docker build --platform linux/arm64 -t nutritrace:node24-check .`
  from a clean copy without `node_modules` (see design → Risks, `.dockerignore`);
  verify the build finishes and `docker run --rm nutritrace:node24-check node -v` prints `v24.*`
- [x] 4.2 Run the image on a throwaway volume (`-e DB_PATH`/`UPLOADS_PATH` inside the volume, test `JWT_SECRET`,
  spare port); verify the log line `NutriTrace v… running on port`, HTTP 200 on `/`, no `better-sqlite3`/DuckDB load
  errors in `docker logs`; then remove the container, volume and image (`docker image rm nutritrace:node24-check`)

## 5. PR

- [x] 5.1 Commit (Conventional Commits, `chore:`), open the PR into `diaitika` with `gh --repo rostik32/nutritrace`;
  verify CI `checks` is green on Node 24 before merging

## 6. Deploy (diaitika-infra)

- [x] 6.1 New ADR `docs/decisions/0006-node-24-runtime.md` (24 vs 22 vs 26, `better-sqlite3` 12, the reason Node 20
  was pinned); update `docs/onboarding.md` (Node 24) and ADR 0005's local-dev line; add `:sha-0c05768` (Node 20 build in
  production) to the rollback list in `docs/runbooks/update-nutritrace.md`; verify `grep -rn "Node 20" docs/onboarding.md
  docs/decisions/0005-dev-workflow.md` finds nothing
- [x] 6.2 Merge after green CI; wait for "diaitika image" on the merge commit to be green (`gh run list --repo
  rostik32/nutritrace --branch diaitika`)
- [x] 6.3 Deploy by `docs/runbooks/update-nutritrace.md` step by step (backup → pull → up → log line → HTTP 200 →
  public check); verify the log shows `NutriTrace v…-diaitika`, `[off-local] search index ready`, no native-module
  errors, and a food search and a diary page load on https://nutri.diaitika.com
- [x] 6.4 History entry `docs/history/YYYY-MM-DD.md`: runbook followed, backup name, new and previous image IDs,
  checks done and not done (e.g. not checked on a real phone); verify it is pushed to diaitika-infra `main`

## Workflow follow-up

- `/opsx:archive node-24-upgrade` after the deploy.
- Ask the owner whether to offer the generic part upstream (PR against TraceApps `dev`, without fork-only files).
