-- Guildie migration 003 (0.2.2): listing deposit taken from the sale (#27), Sell to guild (#28), feedback (#29).
-- Applied automatically by the server after a deploy. Safe to re-run.

-- #27: how much of each listing's deposit has been collected so far. The deposit is no longer
-- charged when listing; it comes out of the sale money (or on cancel/expiry if affordable).
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'listings' AND COLUMN_NAME = 'deposit_paid');
SET @sql := IF(@has_col = 0,
    'ALTER TABLE listings ADD COLUMN deposit_paid INT UNSIGNED NOT NULL DEFAULT 0 AFTER deposit',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Listings made before 0.2.2 already paid their deposit up front. Only runs when the column was just added.
SET @sql := IF(@has_col = 0, 'UPDATE listings SET deposit_paid = deposit', 'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- #28: how much each player has recently sold of each item to the guild. "pressure" is measured in
-- units and fades over time; it lowers that player's guild price for that item (systems.md 6.1).
CREATE TABLE IF NOT EXISTS guild_sales (
    player_id   INT UNSIGNED  NOT NULL,
    item_id     VARCHAR(64)   NOT NULL,
    pressure    DECIMAL(10,4) NOT NULL DEFAULT 0,
    updated_at  INT UNSIGNED  NOT NULL,
    PRIMARY KEY (player_id, item_id),
    CONSTRAINT fk_guild_sales_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- #29: in-game feedback from playtesters, read on a private page.
CREATE TABLE IF NOT EXISTS feedback (
    id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    player_id   INT UNSIGNED  NOT NULL,
    message     TEXT          NOT NULL,
    screen      VARCHAR(64)   NOT NULL DEFAULT '',
    build       VARCHAR(64)   NOT NULL DEFAULT '',
    gold        INT UNSIGNED  NOT NULL DEFAULT 0,
    profession  VARCHAR(32)   NOT NULL DEFAULT '',
    created_at  INT UNSIGNED  NOT NULL,
    PRIMARY KEY (id),
    KEY idx_feedback_player_time (player_id, created_at),
    CONSTRAINT fk_feedback_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE game_state SET v = '3' WHERE k = 'schema_version';
