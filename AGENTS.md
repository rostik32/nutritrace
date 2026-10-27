# AGENTS.md — diaitika fork of NutriTrace

Instructions for AI agents (and humans) working in this fork. Read before changing anything.

## What this repo is

Fork of [TraceApps/nutritrace](https://github.com/TraceApps/nutritrace) (AGPL-3.0), deployed at
https://nutri.diaitika.com. Server, deployment and ops docs live in the private repo
`rostik32/diaitika-infra` (checked out next to this one as `../diaitika-infra`); if you have it, read
its `AGENTS.md` too — its rules (no secrets, write history, back up first) apply here as well.

## Branches

| Branch | Meaning |
|---|---|
| `main` | Mirror of `upstream/main`. Never commit here. |
| `diaitika` | Our deployed branch (protected: changes only via pull request). |
| `feat/*`, `fix/*` | Work branches → PR into `diaitika`. |
| `upstream/<topic>` | Branched from `upstream/dev` for PRs to the original project; no fork-only files. |

## How to work

1. Before coding a behaviour change, check whether an existing setting already gives it (Settings pages,
   `src/stores/settings.js`, server env). If it does, tell the owner where it is and ask before changing code.
2. Read `DEVELOPMENT.md` (local run, tests) and the upstream `ARCHITECTURE.md` for the code layout.
3. Plan non-trivial changes with OpenSpec: `/opsx:explore` → `/opsx:propose <name>` → owner reviews
   `openspec/changes/<name>/` → `/opsx:apply` → `/opsx:archive` after merge. Trivial fixes may skip it.
4. Keep upstream merges cheap: minimal diffs in upstream files; fork-only tooling lives in `diaitika/`,
   `openspec/`, `.claude/`, this file and `DEVELOPMENT.md`.
5. Before opening a PR: `npm test` and `npm run i18n:check` pass on Node 20; every new user-facing
   string is a key in `src/i18n/en.json`.
6. Never touch production from here. Deploying is a separate step: follow
   `../diaitika-infra/docs/runbooks/update-nutritrace.md` step by step (rule 9 in `../diaitika-infra/AGENTS.md`).

## Rules

- No secrets or real user data in the repo, test fixtures, logs or chat. Local dev uses the throwaway
  DB in `.dev-data/` (git-ignored); never copy the production database to a laptop.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`).
- Talk to the owner in Russian; code, comments and docs in English.
- Leave no test servers behind: stop every dev/test server or watcher you started (`diaitika/dev.sh`,
  `node index.js`, Vite, scratch servers) as soon as the check is done, and delete the scratch data and
  builds you made. Details: rule 8 in `../diaitika-infra/AGENTS.md`.
