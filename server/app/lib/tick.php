<?php
declare(strict_types=1);

/*
 * The market tick (GDD 11.5). In M0 it only proves the schedule works and does housekeeping;
 * NPC market activity is added in M1 inside tick_work().
 *
 * Two ways a tick runs:
 *  - cron:    tick.php every few minutes (runs if one is due)
 *  - catchup: any API request runs an OVERDUE tick first, in case cron was delayed
 * A row lock on game_state.last_tick_at guarantees two ticks never run at the same time.
 */

const TICK_CRON_GRACE_SECONDS = 30;     // cron may fire slightly early; still counts as due
const TICK_CATCHUP_FACTOR = 1.5;        // API requests only step in once a tick is clearly overdue

function tick_interval(): int
{
    return max(60, (int) config('tick_interval_seconds', 600));
}

function last_tick_at(PDO $pdo, bool $lock = false): int
{
    $sql = "SELECT v FROM game_state WHERE k = 'last_tick_at'" . ($lock ? ' FOR UPDATE' : '');
    return (int) $pdo->query($sql)->fetchColumn();
}

function tick_is_due(int $lastTick, string $source, int $now): bool
{
    $elapsed = $now - $lastTick;
    return match ($source) {
        'manual'  => true,
        'catchup' => $elapsed >= (int) (tick_interval() * TICK_CATCHUP_FACTOR),
        default   => $elapsed >= tick_interval() - TICK_CRON_GRACE_SECONDS,
    };
}

/**
 * Run a tick if it's due for this source. Returns tick info, or null if nothing ran.
 */
function maybe_run_tick(string $source): ?array
{
    $pdo = db();

    // Cheap check first, without a lock, so normal requests stay fast.
    if (!tick_is_due(last_tick_at($pdo), $source, time())) {
        return null;
    }

    return tx(function (PDO $pdo) use ($source) {
        $now = time();
        // Lock the row and re-check: another request may have just run the tick.
        if (!tick_is_due(last_tick_at($pdo, true), $source, $now)) {
            return null;
        }

        $started = microtime(true);
        tick_work($pdo, $now);
        $durationMs = (int) round((microtime(true) - $started) * 1000);

        $pdo->prepare("UPDATE game_state SET v = ? WHERE k = 'last_tick_at'")->execute([(string) $now]);
        $pdo->exec("UPDATE game_state SET v = CAST(v AS UNSIGNED) + 1 WHERE k = 'tick_count'");
        $pdo->prepare('INSERT INTO tick_log (source, duration_ms) VALUES (?, ?)')->execute([$source, $durationMs]);

        $count = (int) $pdo->query("SELECT v FROM game_state WHERE k = 'tick_count'")->fetchColumn();
        return ['source' => $source, 'tick_count' => $count, 'ran_at' => $now, 'duration_ms' => $durationMs];
    });
}

/**
 * The work a tick does. M0: housekeeping only. M1 adds NPC buyers/sellers and price updates here.
 */
function tick_work(PDO $pdo, int $now): void
{
    $pdo->exec('DELETE FROM tick_log WHERE ran_at < UTC_TIMESTAMP() - INTERVAL 7 DAY');
    $pdo->exec('DELETE FROM login_failures WHERE attempted_at < UTC_TIMESTAMP() - INTERVAL 1 DAY');
    $pdo->prepare('DELETE FROM sessions WHERE last_seen_at < UTC_TIMESTAMP() - INTERVAL ? DAY')->execute([SESSION_IDLE_DAYS]);
}

/** Status for the ping endpoint, so the tick can be checked from a browser. */
function tick_status(): array
{
    $pdo = db();
    $last = last_tick_at($pdo);
    $count = (int) $pdo->query("SELECT v FROM game_state WHERE k = 'tick_count'")->fetchColumn();
    return [
        'last_tick_at'      => $last,
        'seconds_since'     => $last > 0 ? time() - $last : null,
        'tick_count'        => $count,
        'interval_seconds'  => tick_interval(),
    ];
}
