-- Guildie migration 004 (0.3.0): direct trade offers between players (#32).
-- Applied automatically by the server after a deploy. Safe to re-run.
--
-- An offer holds the sender's side (items and gold) until it's accepted, declined, cancelled or expires.
-- Item lists are JSON arrays of {"item_id": "...", "quantity": n} (Common quality).

CREATE TABLE IF NOT EXISTS trade_offers (
    id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    from_player_id  INT UNSIGNED  NOT NULL,
    to_player_id    INT UNSIGNED  NOT NULL,
    give_items      JSON          NOT NULL,
    give_gold       INT UNSIGNED  NOT NULL DEFAULT 0,
    ask_items       JSON          NOT NULL,
    ask_gold        INT UNSIGNED  NOT NULL DEFAULT 0,
    note            VARCHAR(140)  NOT NULL DEFAULT '',
    status          ENUM('open','accepted','declined','cancelled','expired') NOT NULL DEFAULT 'open',
    created_at      INT UNSIGNED  NOT NULL,
    expires_at      INT UNSIGNED  NOT NULL,
    resolved_at     INT UNSIGNED  NULL,
    PRIMARY KEY (id),
    KEY idx_offers_to (to_player_id, status),
    KEY idx_offers_from (from_player_id, status),
    KEY idx_offers_expiry (status, expires_at),
    CONSTRAINT fk_offers_from FOREIGN KEY (from_player_id) REFERENCES players (id) ON DELETE CASCADE,
    CONSTRAINT fk_offers_to FOREIGN KEY (to_player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE game_state SET v = '4' WHERE k = 'schema_version';
