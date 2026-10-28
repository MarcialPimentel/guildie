-- Guildie migration 007 (0.9.0, the living city, docs/living-city.md): friends, city preferences (slaps
-- on/off), and the Duke's order. Applied automatically by the server after a deploy. Safe to re-run.
-- Only new tables, so the old code keeps working while a deploy uploads.

-- Friends (systems.md 7.6): one-way, like a bookmark. friend_id is the player you follow.
CREATE TABLE IF NOT EXISTS friends (
    player_id   INT UNSIGNED NOT NULL,
    friend_id   INT UNSIGNED NOT NULL,
    created_at  INT UNSIGNED NOT NULL,
    PRIMARY KEY (player_id, friend_id),
    KEY idx_friends_friend (friend_id),
    CONSTRAINT fk_friends_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE,
    CONSTRAINT fk_friends_friend FOREIGN KEY (friend_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- City preferences (systems.md 7.5): slaps on (1) or off (0). No row = defaults.
CREATE TABLE IF NOT EXISTS city_prefs (
    player_id   INT UNSIGNED NOT NULL,
    slaps       TINYINT UNSIGNED NOT NULL DEFAULT 1,
    updated_at  INT UNSIGNED NOT NULL,
    PRIMARY KEY (player_id),
    CONSTRAINT fk_city_prefs_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The Duke's order (systems.md 6.5): one city-wide order at a time. order_lines is JSON
-- [{item_id, goal, delivered}]. order_key is the content/duke.json entry it was made from.
CREATE TABLE IF NOT EXISTS duke_orders (
    id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    order_key         VARCHAR(64)   NOT NULL,
    order_lines       JSON          NOT NULL,
    pay_multiplier    DECIMAL(6,3)  NOT NULL,
    bonus_multiplier  DECIMAL(6,3)  NOT NULL,
    max_share         DECIMAL(6,3)  NOT NULL,
    status            ENUM('open','fulfilled','expired') NOT NULL DEFAULT 'open',
    starts_at         INT UNSIGNED  NOT NULL,
    ends_at           INT UNSIGNED  NOT NULL,
    resolved_at       INT UNSIGNED  NULL,
    PRIMARY KEY (id),
    KEY idx_duke_orders_status (status, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Who gave what to which Duke's order: paid at once, bonus when the order is fulfilled.
CREATE TABLE IF NOT EXISTS duke_contributions (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    duke_order_id   INT UNSIGNED NOT NULL,
    player_id       INT UNSIGNED NOT NULL,
    item_id         VARCHAR(64)  NOT NULL,
    quantity        INT UNSIGNED NOT NULL,
    paid            INT UNSIGNED NOT NULL,
    bonus           INT UNSIGNED NOT NULL DEFAULT 0,
    created_at      INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_duke_contrib_order (duke_order_id, player_id),
    CONSTRAINT fk_duke_contrib_order FOREIGN KEY (duke_order_id) REFERENCES duke_orders (id) ON DELETE CASCADE,
    CONSTRAINT fk_duke_contrib_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The row the Duke's order locks so only one request at a time changes it (server/app/lib/duke.php).
INSERT IGNORE INTO game_state (k, v) VALUES ('duke_lock', '0');

UPDATE game_state SET v = '7' WHERE k = 'schema_version' AND CAST(v AS UNSIGNED) < 7;
-- END 007
