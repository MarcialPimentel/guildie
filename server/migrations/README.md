# Migrations

SQL files that build and change the database. From 0.2.1 the server applies them itself: the first API request or cron tick after a deploy runs every file numbered higher than `game_state.schema_version`, in order, once, under a database lock (`server/app/lib/migrate.php`).

- `001_init.sql`: players, sessions, inventory, game_state, tick_log, login_failures (M0)
- `002_m1_market.sql`: professions, gathering, crafting, Exchange, market, activity (M1)
- `003_guild_sale_feedback.sql`: listing deposit from the sale, Sell to guild, feedback (0.2.2)
- `004_trade_offers.sql`: direct trades (0.3.0)
- `005_fun_core.sql`: orders, price history, world events (0.5.0)
- `006_progression.sql`: XP and the daily bonus on `player_professions`, known recipes (`player_recipes`), rare recipes on orders (0.8.0). Players from before 0.8.0 are upgraded by the server code (`progression.php`), not the SQL

Rules:
- Name files `NNN_short_name.sql`, numbered in order. Never edit a migration that has already been applied; add a new file instead.
- Every statement must be safe to re-run (`CREATE TABLE IF NOT EXISTS`, `INSERT IGNORE`, ...): MySQL can't roll back table changes if a file fails halfway.
- Keep changes backward-compatible: the old code may run for a minute while a deploy uploads.
- End each statement with `;` at the end of a line, and never put `;` at a line end inside a string or comment. Every table uses InnoDB and utf8mb4.
- **From 006 on, the last line of every file must be `-- END NNN`** (its own number, e.g. `-- END 006`). Deploys upload files one by one, so the server only applies a migration once this line is there, which means the whole file has arrived. `tools/check_migrations.py` checks this in CI.
- Don't gate data fixes on "the column was just added" (as 003 does): if the file fails halfway, the re-run skips them. Write each data fix so it's safe on its own (e.g. a `WHERE` that only matches rows still needing it).
