<?php
/**
 * Loads configuration and all server libraries.
 * Expects GUILDIE_PRIVATE to be defined (the guildie-private folder).
 */
declare(strict_types=1);

if (!defined('GUILDIE_PRIVATE')) {
    exit('GUILDIE_PRIVATE is not defined.');
}

date_default_timezone_set('UTC');

$guildieConfigPath = GUILDIE_PRIVATE . '/config.php';
if (!is_file($guildieConfigPath)) {
    exit('config.php is missing from the private folder.');
}

/** @var array $GLOBALS['guildie_config'] */
$GLOBALS['guildie_config'] = require $guildieConfigPath;

// Build number comes from the deployed code, not from config, so it always matches what was uploaded.
define('GUILDIE_BUILD', (string) (require __DIR__ . '/version.php'));

// Static game data (items, economy). Overridable for local testing.
define('GUILDIE_CONTENT', getenv('GUILDIE_CONTENT') ?: GUILDIE_PRIVATE . '/content');

require __DIR__ . '/lib/config.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/migrate.php';
require __DIR__ . '/lib/http.php';
require __DIR__ . '/lib/content.php';
require __DIR__ . '/lib/clock.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/activity.php';
require __DIR__ . '/lib/inventory.php';
require __DIR__ . '/lib/professions.php';
require __DIR__ . '/lib/gathering.php';
require __DIR__ . '/lib/crafting.php';
require __DIR__ . '/lib/exchange.php';
require __DIR__ . '/lib/market.php';
require __DIR__ . '/lib/guild_sale.php';
require __DIR__ . '/lib/feedback.php';
require __DIR__ . '/lib/state.php';
require __DIR__ . '/lib/tick.php';
require __DIR__ . '/router.php';
