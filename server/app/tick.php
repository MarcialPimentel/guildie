<?php
/**
 * Market tick, run by a SiteGround cron job (GDD 11.5, issue #7).
 *
 *   php /home/customer/www/marz.gg/guildie-private/app/tick.php
 *   php .../tick.php --force     run one tick now, even if not due (manual test)
 *
 * Lives in guildie-private, so it can't be opened from a browser. Refuses to run outside the command line.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}

define('GUILDIE_PRIVATE', getenv('GUILDIE_PRIVATE') ?: dirname(__DIR__));
require __DIR__ . '/bootstrap.php';

$source = in_array('--force', $argv, true) ? 'manual' : 'cron';

try {
    foreach (migrate_if_needed() as $n) {
        echo "Applied migration $n.\n";
    }
    $result = maybe_run_tick($source);
    $stamp = gmdate('Y-m-d H:i:s') . ' UTC';
    if ($result === null) {
        echo "[$stamp] Tick not due yet.\n";
    } else {
        echo "[$stamp] Tick #{$result['tick_count']} ran ({$result['source']}, {$result['duration_ms']} ms).\n";
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'Tick failed: ' . $e->getMessage() . "\n");
    exit(1);
}
