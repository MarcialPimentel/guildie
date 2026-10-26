-- Guildie migration 002: M1 Market Prototype (professions, gathering, crafting, Exchange, market, activity).
-- Apply once in phpMyAdmin after 001 (see docs/deploy.md). Safe to re-run: IF NOT EXISTS everywhere.
-- Game timestamps are stored as Unix seconds (INT UNSIGNED, UTC).

-- Professions: which profession each player chose (systems.md 5.1).
CREATE TABLE IF NOT EXISTS player_professions (
    player_id      INT UNSIGNED     NOT NULL,
    profession_id  VARCHAR(32)      NOT NULL,
    skill          SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    chosen_at      INT UNSIGNED     NOT NULL,
    PRIMARY KEY (player_id),
    CONSTRAINT fk_prof_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Gathering: one row per station output per player; progress is resolved lazily (systems.md 5.2).
CREATE TABLE IF NOT EXISTS gathering (
    player_id   INT UNSIGNED NOT NULL,
    item_id     VARCHAR(64)  NOT NULL,
    last_at     INT UNSIGNED NOT NULL,   -- time production is counted from
    PRIMARY KEY (player_id, item_id),
    CONSTRAINT fk_gathering_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Crafting jobs: inputs are removed at start; outputs added when collected (systems.md 5.3).
CREATE TABLE IF NOT EXISTS craft_jobs (
    id            INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    player_id     INT UNSIGNED      NOT NULL,
    recipe_id     VARCHAR(64)       NOT NULL,
    quantity      SMALLINT UNSIGNED NOT NULL,
    started_at    INT UNSIGNED      NOT NULL,
    ends_at       INT UNSIGNED      NOT NULL,
    collected_at  INT UNSIGNED      NULL,
    PRIMARY KEY (id),
    KEY idx_jobs_player_open (player_id, collected_at),
    CONSTRAINT fk_jobs_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exchange listings. A listing is owned by a player OR by an NPC persona (systems.md 6.1).
CREATE TABLE IF NOT EXISTS listings (
    id                INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    seller_player_id  INT UNSIGNED     NULL,
    seller_persona    VARCHAR(32)      NULL,
    item_id           VARCHAR(64)      NOT NULL,
    quality           TINYINT UNSIGNED NOT NULL DEFAULT 1,
    quantity          INT UNSIGNED     NOT NULL,           -- remaining
    original_quantity INT UNSIGNED     NOT NULL,
    unit_price        INT UNSIGNED     NOT NULL,
    deposit           INT UNSIGNED     NOT NULL DEFAULT 0,
    created_at        INT UNSIGNED     NOT NULL,
    expires_at        INT UNSIGNED     NOT NULL,
    status            ENUM('active','sold','cancelled','expired') NOT NULL DEFAULT 'active',
    PRIMARY KEY (id),
    KEY idx_listings_item (status, item_id, unit_price),
    KEY idx_listings_seller (seller_player_id, status),
    KEY idx_listings_expiry (status, expires_at),
    CONSTRAINT fk_listings_player FOREIGN KEY (seller_player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trade ledger: append-only, one row per purchase (also the source of price history).
CREATE TABLE IF NOT EXISTS trades (
    id                INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    listing_id        INT UNSIGNED     NOT NULL,
    item_id           VARCHAR(64)      NOT NULL,
    quality           TINYINT UNSIGNED NOT NULL DEFAULT 1,
    quantity          INT UNSIGNED     NOT NULL,
    unit_price        INT UNSIGNED     NOT NULL,
    buyer_player_id   INT UNSIGNED     NULL,
    buyer_persona     VARCHAR(32)      NULL,
    seller_player_id  INT UNSIGNED     NULL,
    seller_persona    VARCHAR(32)      NULL,
    created_at        INT UNSIGNED     NOT NULL,
    PRIMARY KEY (id),
    KEY idx_trades_item_time (item_id, created_at),
    KEY idx_trades_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Market state per item: reference value and demand carry-over (systems.md 6.2).
CREATE TABLE IF NOT EXISTS market_items (
    item_id          VARCHAR(64)    NOT NULL,
    reference_value  DECIMAL(12,2)  NOT NULL,
    updated_at       INT UNSIGNED   NOT NULL,
    PRIMARY KEY (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fractional NPC demand carried between ticks, per persona and item.
CREATE TABLE IF NOT EXISTS market_demand (
    persona  VARCHAR(32)   NOT NULL,
    item_id  VARCHAR(64)   NOT NULL,
    carry    DECIMAL(10,4) NOT NULL DEFAULT 0,
    PRIMARY KEY (persona, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Activity log: what happened, for the player and the world (systems.md 4.5).
CREATE TABLE IF NOT EXISTS activity (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    player_id   INT UNSIGNED NULL,          -- NULL = world event
    type        VARCHAR(32)  NOT NULL,
    payload     JSON         NOT NULL,
    created_at  INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_activity_player_time (player_id, created_at),
    CONSTRAINT fk_activity_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE game_state SET v = '2' WHERE k = 'schema_version';
