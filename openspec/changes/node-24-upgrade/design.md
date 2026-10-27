# Design

## Context

Node 20 is pinned in seven places (see proposal.md → Impact). The only code-level blocker is the native module
`better-sqlite3`: 9.6.0 compiles against Node's V8 headers with C++17, and Node 24's headers need C++20.
`@duckdb/node-api` uses Node-API (ABI-stable) and already works on Node 24. Checked on 2026-10-27 on a scratch
copy with Node 24.13.1 + `better-sqlite3@12.11.1`: `npm test` 1003/1003, `vite build` OK, server boots on an empty
DB, no deprecation warnings.

The fork's PR CI (`ci.yml`) runs tests only; the Docker image is built only after merge (`diaitika-image.yml`, push
to `diaitika`, linux/arm64), and that build already tags `:diaitika`. So a broken Dockerfile would only show up
after merge.

## Goals / Non-Goals

**Goals:**
- One Node major (24) for local dev, dev compose, CI and both images.
- The production image is proven to build and start before the PR is merged.
- Rollback stays a one-line image switch.

**Non-Goals:**
- Pinning an exact Node patch (`24.x.y`) or base-image digest: we follow `node:24-*` like we followed `node:20-*`.
- Adding an engines field to `package.json` (upstream file; `.nvmrc` + `dev.sh` already enforce it locally).

## Decisions

1. **Node 24, not 26.** 24 is Active LTS until 2026-10 and maintained until 2028-04-30; 26 has no LTS status yet
   and native modules lag on new majors. Not 22: maintenance-only since 2025-10, EOL 2027-04 — we'd repeat this
   work in six months. Recorded as an ADR in diaitika-infra.
2. **`better-sqlite3@^12` (12.11.1 today).** Smallest bump that supports Node 24; the API we use (`new Database`,
   `prepare/run/get/all`, `exec`, `pragma`, `transaction`) is unchanged across 9→12 (breaking changes there are
   dropped Node versions). Alternative `node:sqlite` (built in) would mean rewriting the data layer — out of scope.
   Lockfile updated with `npm install better-sqlite3@^12 --prefix server` on Node 24, then checked that only
   `better-sqlite3` (and its own deps) changed in `server/package-lock.json`.
3. **Base images by tag family, same variants:** build stage `node:24-alpine`, runtime `node:24-slim` (Debian,
   glibc — DuckDB bindings need glibc, see the Dockerfile comment), `server/Dockerfile` `node:24-alpine`, dev
   compose `node:24-bookworm`. Keeping the variants means only the version number changes.
4. **Prove the image locally before merge.** Build the production `Dockerfile` for linux/arm64 on the owner's Mac
   (Apple silicon = the server's arch, no emulation), run it on a throwaway data volume, check the version log
   line, HTTP 200 on `/`, DuckDB loads (OFF mirror code path starts) and a login round-trip works with the dev seed
   admin. Alternative — a PR-only image build job in CI — rejected for now: one more fork-only workflow to maintain
   for a one-off. Needs Docker Desktop running; the agent asks the owner to start it (Docker is installed, not
   running).
5. **`dev.sh` keeps a hard major check**, now `24`, so a stale shell on Node 20 fails fast instead of crashing on a
   native module ABI mismatch.

## Risks / Trade-offs

- [Native module ABI change: every existing `server/node_modules` breaks on switch (NODE_MODULE_VERSION 115 →
  137)] → `DEVELOPMENT.md` says to run `nvm install && npm ci --prefix server`; dev compose volumes recreated with
  `docker compose ... down -v`.
- [`better-sqlite3` 12 ships a newer SQLite; first open of the production DB happens on deploy] → runbook backup
  right before the switch; SQLite keeps file-format compatibility, so rolling back to the old image still opens the
  DB; restore from that backup only if data is damaged.
- [`node:24-slim` may be on a newer Debian than `node:20-slim`; apt packages (`python3`, `build-essential`) or glibc
  differ] → covered by the local image build/run (decision 4) and the arm64 CI build after merge.
- [`better-sqlite3` prebuilt binary missing for the image's platform → source build] → `python3` and
  `build-essential` stay in the runtime stage; Alpine `server/Dockerfile` keeps `python3 make g++`.
- [npm 11.19 (in `node:24` images) warns that `better-sqlite3`'s install script is "not yet covered by
  allowScripts"; today it still runs it (checked: prebuilt Linux binary in the image, SQLite 3.53.2). A future npm
  that enforces this would ship the image without the native binary] → the post-merge deploy check catches it
  (server won't start); fix then with an `allowScripts` entry, not now (no enforcing npm in our images yet).
- [`.dockerignore` has `node_modules`, which only matches the root folder, so a local `docker build .` copies the
  host's `server/node_modules` (macOS binaries) over the image's (seen in the first local check: "invalid ELF
  header"). CI checkouts have no `server/node_modules`, so production images are not affected] → local image checks
  build from a clean copy without `node_modules`; `**/node_modules` in `.dockerignore` is a separate small fix
  (upstream file), not part of this change.
- [Upstream merges later reintroduce `node:20`] → conflict is visible in the Dockerfiles; offering this upstream
  (proposal) removes the drift.

## Migration Plan

1. PR into `diaitika` with code + docs; CI `checks` green on Node 24; local arm64 image build/run (decision 4).
2. Merge → wait for "diaitika image" green.
3. Deploy strictly by `diaitika-infra/docs/runbooks/update-nutritrace.md` (backup → pull → up → log line + HTTP 200 +
   public check). Before deploying, add the current image (`:sha-1bed569`, the last Node 20 build) to the
   runbook's rollback list.
4. Extra post-deploy checks: log shows no `better-sqlite3`/DuckDB load errors, `[off-local] search index ready`
   appears, a food search and a diary read work on https://nutri.diaitika.com.
5. Rollback: `image: ghcr.io/rostik32/nutritrace:sha-1bed569` → `docker compose up -d`; restore the pre-deploy backup
   only if data was damaged (`restore-backup.md`).

## Open Questions

- Whether to also build linux/amd64 locally (QEMU) before offering the upstream PR — only matters for the upstream
  step, can be decided then.
