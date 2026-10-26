# Migrations

SQL files that build and change the database. From 0.2.1 the server applies them itself: the first API request or cron tick after a deploy runs every file numbered higher than `game_state.schema_version`, in order, once, under a database lock (`server/app/lib/migrate.php`).

- `001_init.sql`: players, sessions, inventory, game_state, tick_log, login_failures (M0)
- `002_m1_market.sql`: professions, gathering, crafting, Exchange, market, activity (M1)

Rules:
- Name files `NNN_short_name.sql`, numbered in order. Never edit a migration that has already been applied; add a new file instead.
- Every statement must be safe to re-run (`CREATE TABLE IF NOT EXISTS`, `INSERT IGNORE`, ...): MySQL can't roll back table changes if a file fails halfway.
- Keep changes backward-compatible: the old code may run for a minute while a deploy uploads.
- End each statement with `;` at the end of a line. Every table uses InnoDB and utf8mb4.
