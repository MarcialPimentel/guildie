-- Guildie migration 005 (0.5.0, M2 step 1): order board (#44), price history for the ticker (#45),
-- world events (#46). Applied automatically by the server after a deploy. Safe to re-run.

-- Orders on each player's Workshop board. An open order with created_at in the future is a
-- customer "on the way" (shown as arriving). items / reward_items are JSON [{item_id, quantity}].
CREATE TABLE IF NOT EXISTS orders (
    id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    player_id     INT UNSIGNED  NOT NULL,
    slot          TINYINT UNSIGNED NOT NULL,
    customer_id   VARCHAR(64)   NOT NULL,
    kind          ENUM('standard','bundle','collector') NOT NULL DEFAULT 'standard',
    items         JSON          NOT NULL,
    reward_gold   INT UNSIGNED  NOT NULL DEFAULT 0,
    reward_items  JSON          NOT NULL,
    status        ENUM('open','filled','skipped','expired') NOT NULL DEFAULT 'open',
    created_at    INT UNSIGNED  NOT NULL,
    expires_at    INT UNSIGNED  NOT NULL,
    resolved_at   INT UNSIGNED  NULL,
    PRIMARY KEY (id),
    KEY idx_orders_player_status (player_id, status),
    CONSTRAINT fk_orders_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-player board state: when the next skip is allowed.
CREATE TABLE IF NOT EXISTS order_boards (
    player_id      INT UNSIGNED NOT NULL,
    skip_ready_at  INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (player_id),
    CONSTRAINT fk_order_boards_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reference value of every item at every market tick (the ticker's sparklines). Pruned after 8 days.
CREATE TABLE IF NOT EXISTS market_history (
    item_id          VARCHAR(64)   NOT NULL,
    at               INT UNSIGNED  NOT NULL,
    reference_value  DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (item_id, at),
    KEY idx_market_history_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- World events from content/calendar.json: announced on the news board, then active.
CREATE TABLE IF NOT EXISTS world_events (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id      VARCHAR(64)  NOT NULL,
    announced_at  INT UNSIGNED NOT NULL,
    starts_at     INT UNSIGNED NOT NULL,
    ends_at       INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_world_events_ends (ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE game_state SET v = '5' WHERE k = 'schema_version';
