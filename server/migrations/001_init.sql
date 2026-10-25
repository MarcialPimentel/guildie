-- Guildie migration 001: initial tables (M0 Foundation, issue #3)
-- Apply once in phpMyAdmin (see docs/deploy.md). Safe to re-run: every statement is IF NOT EXISTS / INSERT IGNORE.
-- All times are stored in UTC.

-- Players: one row per account.
CREATE TABLE IF NOT EXISTS players (
    id             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    name           VARCHAR(20)     NOT NULL,             -- unique, case-insensitive
    password_hash  VARCHAR(255)    NOT NULL,             -- password_hash() output, never plain text
    gold           BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at  DATETIME        NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_players_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sessions: login tokens. Only a SHA-256 hash of each token is stored,
-- so a leaked database can't be used to log in as anyone.
CREATE TABLE IF NOT EXISTS sessions (
    token_hash    CHAR(64)     NOT NULL,
    player_id     INT UNSIGNED NOT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (token_hash),
    KEY idx_sessions_player (player_id),
    CONSTRAINT fk_sessions_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inventory: how many of each item (at each quality) a player owns.
-- quality: 1 = Common, 2 = Fine, 3 = Masterwork (GDD 5.2)
CREATE TABLE IF NOT EXISTS inventory (
    player_id  INT UNSIGNED     NOT NULL,
    item_id    VARCHAR(64)      NOT NULL,   -- matches an id in content/items.json
    quality    TINYINT UNSIGNED NOT NULL DEFAULT 1,
    quantity   INT UNSIGNED     NOT NULL DEFAULT 0,
    PRIMARY KEY (player_id, item_id, quality),
    CONSTRAINT fk_inventory_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Game state: small server-wide key/value settings, e.g. when the market last ticked.
CREATE TABLE IF NOT EXISTS game_state (
    k           VARCHAR(64)  NOT NULL,
    v           VARCHAR(255) NOT NULL,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO game_state (k, v) VALUES ('last_tick_at', '0');
INSERT IGNORE INTO game_state (k, v) VALUES ('tick_count', '0');
INSERT IGNORE INTO game_state (k, v) VALUES ('schema_version', '1');

-- Tick log: one row per market tick, so you can see the tick running (recent rows only are kept).
CREATE TABLE IF NOT EXISTS tick_log (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ran_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source       VARCHAR(16)  NOT NULL,   -- 'cron', 'catchup', or 'manual'
    duration_ms  INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_tick_log_ran_at (ran_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Failed logins: used to slow down password guessing.
CREATE TABLE IF NOT EXISTS login_failures (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ip            VARCHAR(45)  NOT NULL,
    name          VARCHAR(20)  NOT NULL,
    attempted_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_login_failures_ip_time (ip, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
