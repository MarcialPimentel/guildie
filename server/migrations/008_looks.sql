-- Guildie migration 008 (0.10.0, the people of Portovela): a merchant's chosen look.
-- Applied automatically by the server after a deploy. Safe to re-run; every change only adds.
--
-- look_color: one of the six body colors (0-5); look_hat: one of three hats for the player's guild (0-2).
-- Both NULL = never chosen (accounts from before 0.10.0): the server then uses the old look (a color from
-- the player number, the first hat) and the 3D city invites the player once to choose.

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'city_prefs' AND COLUMN_NAME = 'look_color');
SET @sql := IF(@has_col = 0,
    'ALTER TABLE city_prefs ADD COLUMN look_color TINYINT UNSIGNED NULL AFTER slaps',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'city_prefs' AND COLUMN_NAME = 'look_hat');
SET @sql := IF(@has_col = 0,
    'ALTER TABLE city_prefs ADD COLUMN look_hat TINYINT UNSIGNED NULL AFTER look_color',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE game_state SET v = '8' WHERE k = 'schema_version' AND CAST(v AS UNSIGNED) < 8;
-- END 008
