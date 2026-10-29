-- Guildie migration 010 (0.14.0, the new-player guide): docs/systems.md 8.3.
-- Applied automatically by the server after a deploy. Safe to re-run; every change only adds.
--
-- guide_progress: one row per player who has started or finished the guide (content/guide.json).
--   step        the index of the next step to claim (0 = the first)
--   done        1 once every step is claimed or skipped and the final purse is paid
--   palazzo_at  when the player first reached the Palazzo (the client reports it; the server can't see it)
--   slapped_at  when the player first slapped another merchant (reported by the client from the realtime room)
-- Players who joined before 0.14.0 have already done everything the guide teaches: they get a finished row
-- (only when this migration runs for the first time), so nobody collects the guide's ducats twice.

CREATE TABLE IF NOT EXISTS guide_progress (
    player_id   INT UNSIGNED NOT NULL,
    step        TINYINT UNSIGNED NOT NULL DEFAULT 0,
    done        TINYINT UNSIGNED NOT NULL DEFAULT 0,
    palazzo_at  INT UNSIGNED NULL,
    slapped_at  INT UNSIGNED NULL,
    updated_at  INT UNSIGNED NOT NULL,
    PRIMARY KEY (player_id),
    CONSTRAINT fk_guide_progress_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @schema := (SELECT CAST(v AS UNSIGNED) FROM game_state WHERE k = 'schema_version');
SET @sql := IF(@schema < 10,
    'INSERT IGNORE INTO guide_progress (player_id, step, done, updated_at) SELECT id, 255, 1, UNIX_TIMESTAMP() FROM players',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE game_state SET v = '10' WHERE k = 'schema_version' AND CAST(v AS UNSIGNED) < 10;
-- END 010
