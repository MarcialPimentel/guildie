# Guildie — notes for AI working sessions

Guildie is a mobile-first browser crafting and trading game (Godot 4 client, PHP 8 + MySQL server on SiteGround).

## Before building anything

- **`docs/GDD.md` and `docs/systems.md` are the source of truth.** `systems.md` says which system a feature belongs to, what data it owns, and its rules.
- **`docs/GDD.md` is the vision.** Read the sections relevant to the task before proposing or writing code. If a change conflicts with the GDD, raise it rather than silently diverging, and update the GDD (and its Decision Log) in the same PR when a design decision changes.
- Work is tracked as GitHub milestones (M0–M4) and issues. One PR per issue where practical, with `Closes #N` in the description.
- Marz (the owner) does not write code. He reviews PRs, playtests, and does the SiteGround steps by hand, so any manual step must come with clear, click-by-click instructions in `docs/`.

## Non-negotiable rules

- **The server is authoritative.** The client never decides gold, inventory, craft results, procs, timers, or trades.
- **Every game action runs in one database transaction.** Use PDO prepared statements only; never build SQL from strings.
- **No secrets in the repo.** Real credentials live only in `guildie-private/config.php` on the server.
- **Static game data lives in `/content` as JSON**, shared by server and client.
- **Bump the `VERSION` file** for every deploy. `tools/package.sh` stamps it into the server (`app/version.php`) and the client (`build_info.gd`).
- **Test before opening a PR:** `tools/smoke_test.py` against a local server and `client/tests/client_smoke.gd` headless. Deploy steps live in `docs/deploy.md`.

## Layout

```
/client            Godot 4 project
/server/api        public entry point  -> public_html/games/guildie/api/
/server/app        private game logic  -> guildie-private/app/
/server/config     config template     -> guildie-private/config.php
/server/migrations SQL, applied in order via phpMyAdmin
/server/tools      one-off helpers (upload, use, delete)
/tools             package.sh (builds upload zips), smoke_test.py (API test)
/content           JSON game data
/docs              GDD, setup and deploy guides
```
