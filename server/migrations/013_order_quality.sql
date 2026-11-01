-- Guildie migration 013 (0.20.0, orders that ask for quality): GDD 5.2 and 5.3, systems.md orders, #80.
-- Applied automatically by the server after a deploy. Safe to re-run; only adds a column with a default that means
-- "any quality", so the old code keeps working while a deploy uploads.
--
-- orders.min_quality: the lowest quality the customer accepts (1 Common = any, 2 Fine or better, 3 Masterwork).

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'min_quality');
SET @sql := IF(@has_col = 0,
    'ALTER TABLE orders ADD COLUMN min_quality TINYINT UNSIGNED NOT NULL DEFAULT 1',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE game_state SET v = '13' WHERE k = 'schema_version' AND CAST(v AS UNSIGNED) < 13;
-- END 013
