-- Guildie migration 009 (0.11.0, the Palazzo and the bottega upgrades): docs/palazzo.md.
-- Applied automatically by the server after a deploy. Safe to re-run; every change only adds.
--
-- player_professions:
--   workshop_level   1 (rundown shack) .. 4 (fine bottega). Building level L+1 opens the next rank (#51).
--   legacy_rank      the rank a player already held before 0.11.0 (0 = Apprentice .. 3 = Master). They keep it
--                    without building; NULL = joined after 0.11.0 (treated as 0).
--   upgrade_to       the level being built right now (NULL = nothing under construction).
--   upgrade_ready_at when that build is finished (game time).
-- wanted_posts: the Wanted board (players' paid requests for goods; the ducats are held on the post).
-- npc_favors:   one favor per player per Palazzo official per day.

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'player_professions' AND COLUMN_NAME = 'workshop_level');
SET @sql := IF(@has_col = 0,
    'ALTER TABLE player_professions ADD COLUMN workshop_level TINYINT UNSIGNED NOT NULL DEFAULT 1',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'player_professions' AND COLUMN_NAME = 'legacy_rank');
SET @sql := IF(@has_col = 0,
    'ALTER TABLE player_professions ADD COLUMN legacy_rank TINYINT UNSIGNED NULL',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'player_professions' AND COLUMN_NAME = 'upgrade_to');
SET @sql := IF(@has_col = 0,
    'ALTER TABLE player_professions ADD COLUMN upgrade_to TINYINT UNSIGNED NULL',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'player_professions' AND COLUMN_NAME = 'upgrade_ready_at');
SET @sql := IF(@has_col = 0,
    'ALTER TABLE player_professions ADD COLUMN upgrade_ready_at INT UNSIGNED NULL',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Everyone who already has a guild keeps the rank their skill gives them today (Marz, 2026-10-29: "keep rank,
-- build to get the look"). Only rows never set are touched, so a re-run changes nothing. Players from before
-- 0.8.0 whose skill hasn't been counted yet get their rank when it is (progression.php).
UPDATE player_professions
   SET legacy_rank = CASE WHEN skill >= 76 THEN 3 WHEN skill >= 51 THEN 2 WHEN skill >= 26 THEN 1 ELSE 0 END
 WHERE legacy_rank IS NULL;

CREATE TABLE IF NOT EXISTS wanted_posts (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    player_id   INT UNSIGNED NOT NULL,
    item_id     VARCHAR(64)  NOT NULL,
    quantity    INT UNSIGNED NOT NULL,
    filled      INT UNSIGNED NOT NULL DEFAULT 0,
    unit_price  INT UNSIGNED NOT NULL,
    held        INT UNSIGNED NOT NULL,
    status      ENUM('open','filled','cancelled','expired') NOT NULL DEFAULT 'open',
    created_at  INT UNSIGNED NOT NULL,
    expires_at  INT UNSIGNED NOT NULL,
    closed_at   INT UNSIGNED NULL,
    PRIMARY KEY (id),
    KEY idx_wanted_status (status, expires_at),
    KEY idx_wanted_player (player_id, status),
    CONSTRAINT fk_wanted_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS npc_favors (
    player_id   INT UNSIGNED NOT NULL,
    npc         VARCHAR(16)  NOT NULL,
    day         INT UNSIGNED NOT NULL,
    item_id     VARCHAR(64)  NOT NULL,
    quantity    INT UNSIGNED NOT NULL,
    reward      INT UNSIGNED NOT NULL,
    xp          INT UNSIGNED NOT NULL,
    done_at     INT UNSIGNED NULL,
    PRIMARY KEY (player_id, npc, day),
    CONSTRAINT fk_npc_favors_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE game_state SET v = '9' WHERE k = 'schema_version' AND CAST(v AS UNSIGNED) < 9;
-- END 009
