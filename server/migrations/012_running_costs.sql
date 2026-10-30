-- Guildie migration 012 (0.16.0, machine running costs): docs/palazzo.md §2, #52.
-- Applied automatically by the server after a deploy. Safe to re-run; only adds a column, so the old code keeps
-- working while a deploy uploads.
--
-- player_professions.wages_day: the last game day (UTC day number) the bottega's hired hands were paid. Expert and
-- Master machines (levels 3-4) pay their wages on the first powered craft of each day. 0 = never paid.

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'player_professions' AND COLUMN_NAME = 'wages_day');
SET @sql := IF(@has_col = 0,
    'ALTER TABLE player_professions ADD COLUMN wages_day INT UNSIGNED NOT NULL DEFAULT 0',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE game_state SET v = '12' WHERE k = 'schema_version' AND CAST(v AS UNSIGNED) < 12;
-- END 012
