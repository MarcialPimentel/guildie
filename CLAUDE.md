# Guildie — notes for AI working sessions

Guildie is a mobile-first browser crafting and trading game (TypeScript + Preact web client, PHP 8 + MySQL server on SiteGround).

## Before building anything

- **`docs/GDD.md` and `docs/systems.md` are the source of truth.** `systems.md` says which system a feature belongs to, what data it owns, and its rules.
- **`docs/GDD.md` is the vision.** Read the sections relevant to the task before proposing or writing code, and check every change against its **design pillars** (GDD §2). If a change conflicts with the GDD, raise it rather than silently diverging, and update the GDD (and its Decision Log) in the same PR when a design decision changes.
- Work is tracked as GitHub milestones (M0–M4) and issues. One PR per issue where practical, with `Closes #N` in the description.
- Marz (the owner) designs and playtests; he does not write code. He reviews PRs, playtests, and does the SiteGround steps by hand, so any manual step must come with clear, click-by-click instructions in `docs/`. Give him honest critique (say when an idea weakens a pillar or the economy), recommend an option, and let him make the final call.
- Workflow: a branch per change → a PR with playtest steps → Marz says "merge #N" → merge only that PR.

## Non-negotiable rules

- **The server is authoritative.** The client never decides gold, inventory, craft results, procs, timers, or trades.
- **Every game action runs in one database transaction.** Use PDO prepared statements only; never build SQL from strings.
- **No secrets in the repo.** Real credentials live only in `guildie-private/config.php` on the server.
- **Static game data lives in `/content` as JSON**, shared by server and client.
- **Merging to `main` deploys to marz.gg automatically** (`.github/workflows/deploy.yml`). Marz approves in chat by saying "merge #N"; merge only the PR named. Never push to `main` directly.
- **Bump the `VERSION` file** for each release. `tools/package.sh` stamps it (plus the CI run number) into the server and the client footer.
- **Database changes are new numbered files in `server/migrations/`** (never edit an applied one). The server applies them itself after a deploy, so they must be safe to re-run and backward-compatible, and **from 006 on must end with the line `-- END NNN`** (see `server/migrations/README.md`; `tools/check_migrations.py` checks it in CI).
- **Test before opening a PR:** `tools/smoke_test.py` against a local server, `npm run build` in `client/` (type check + build), and the Playwright browser tests in `client/tests/` (`play.spec.ts` plays the classic view, `world.spec.ts` the 3D harbor; CI runs all of them on every PR, on a phone and a desktop screen). Deploy details live in `docs/deploy.md`.
- **Private hosting details** (paths, account names, which secrets exist) are in Marz's private doc "Guildie — Hosting & Session Handoff (private)", never in the repo.

## Commands

```
cd client && npm install                                    # once
GUILDIE_API_TARGET=http://127.0.0.1:8080 npm run dev        # dev server (needs a local PHP API)
npm run build                                               # type check + build (client/)
GUILDIE_URL=http://127.0.0.1:8080/games/guildie/ npx playwright test   # browser tests (client/)
python3 tools/smoke_test.py URL                             # API smoke test against a local server
python3 tools/validate_content.py && python3 tools/check_migrations.py
```

Full local setup: `docs/deploy.md` "Local testing".

## Docs

See `docs/README.md` for every doc, its role and whether it's current or historical. Builds are listed in `CHANGELOG.md`; add an entry with each release PR.

## Layout

```
/client            web client: TypeScript + Preact, built by Vite (src/, tests/)
/server/api        public entry point  -> public_html/games/guildie/api/
/server/app        private game logic  -> guildie-private/app/
/server/config     config template     -> guildie-private/config.php
/server/migrations SQL, applied automatically by the server after a deploy
/server/tools      one-off helpers (upload, use, delete)
/tools             package.sh (builds upload zips), smoke_test.py (API test)
/content           JSON game data
/docs              GDD, setup and deploy guides
```
