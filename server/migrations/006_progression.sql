-- Guildie migration 006 (0.8.0, M2 step 2): skill and XP (#30), known recipes and the trainer (#49).
-- Applied automatically by the server after a deploy. Safe to re-run; every change only adds.
--
-- Existing players are upgraded by the server code, not here: the first time they act (or the next
-- market tick), progression.php replays their past crafts from craft_jobs into skill and XP, and marks
-- every recipe of their guild as known, so nobody loses a recipe or a raw they already use.

-- XP toward the next skill level (player_professions.skill already exists, default 1).
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'player_professions' AND COLUMN_NAME = 'xp');
SET @sql := IF(@has_col = 0,
    'ALTER TABLE player_professions ADD COLUMN xp INT UNSIGNED NOT NULL DEFAULT 0 AFTER skill',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- The UTC day number (unix time / 86400) on which the first-craft-of-the-day XP bonus was last used.
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'player_professions' AND COLUMN_NAME = 'bonus_day');
SET @sql := IF(@has_col = 0,
    'ALTER TABLE player_professions ADD COLUMN bonus_day INT UNSIGNED NOT NULL DEFAULT 0 AFTER xp',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 0 = joined before 0.8.0 and not yet upgraded (skill counted from past crafts); 1 = up to date.
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'player_professions' AND COLUMN_NAME = 'progress_version');
SET @sql := IF(@has_col = 0,
    'ALTER TABLE player_professions ADD COLUMN progress_version TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER bonus_day',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Recipes each player knows. source: starter (free at a rank), trainer (bought), order (a rare recipe
-- from a customer), legacy (known before 0.8.0). first_crafted_at: when it was first collected
-- (the +1 skill discovery bonus is paid once per recipe).
CREATE TABLE IF NOT EXISTS player_recipes (
    player_id         INT UNSIGNED NOT NULL,
    recipe_id         VARCHAR(64)  NOT NULL,
    source            ENUM('starter','trainer','order','legacy') NOT NULL,
    learned_at        INT UNSIGNED NOT NULL,
    first_crafted_at  INT UNSIGNED NULL,
    PRIMARY KEY (player_id, recipe_id),
    CONSTRAINT fk_player_recipes_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A rare recipe an order teaches when filled (#49). NULL for most orders.
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'reward_recipe');
SET @sql := IF(@has_col = 0,
    'ALTER TABLE orders ADD COLUMN reward_recipe VARCHAR(64) NULL AFTER reward_items',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE game_state SET v = '6' WHERE k = 'schema_version';
-- END 006
