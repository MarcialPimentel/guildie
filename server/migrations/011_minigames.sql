-- Guildie migration 011 (0.15.0, minigames): docs/systems.md 5.5.
-- Applied automatically by the server after a deploy. Safe to re-run; only a new table, so the old code
-- keeps working while a deploy uploads.
--
-- minigame_rounds: one row per round a player starts (content/minigames.json).
--   target       what the round is played on: 'station' (extra raws); later 'craft' (Focus)
--   kind         the game's rules, e.g. 'strike'
--   plan         what the server rolled for the round (sent to the client to draw; the server scores against it)
--   status       open (being played), done (scored and paid), abandoned (a new round replaced it), expired
--   score        0..1 once done
--   reward       JSON [{item_id, quantity}] once done
-- Tiredness is read from the recent 'done' rows, so no other table is needed.

CREATE TABLE IF NOT EXISTS minigame_rounds (
    id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    player_id    INT UNSIGNED  NOT NULL,
    target       VARCHAR(32)   NOT NULL,
    kind         VARCHAR(32)   NOT NULL,
    plan         JSON          NOT NULL,
    status       VARCHAR(12)   NOT NULL DEFAULT 'open',
    score        DECIMAL(5,4)  NULL,
    reward       JSON          NULL,
    started_at   INT UNSIGNED  NOT NULL,
    finished_at  INT UNSIGNED  NULL,
    PRIMARY KEY (id),
    KEY idx_minigame_rounds_player (player_id, status, finished_at),
    CONSTRAINT fk_minigame_rounds_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE game_state SET v = '11' WHERE k = 'schema_version' AND CAST(v AS UNSIGNED) < 11;
-- END 011
