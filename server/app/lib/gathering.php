<?php
declare(strict_types=1);

/*
 * Gathering (systems.md 5.2). Each station output produces at a rate up to a cap.
 * Nothing runs in the background: progress = elapsed time × rate, resolved when read or collected.
 */

/** Effective seconds per unit for a station output, after pace. */
function gathering_seconds_per_unit(array $output): float
{
    return 3600.0 * pace() / max(0.0001, (float) $output['rate_per_hour']);
}

/** Create station rows when a profession is chosen, starting partly full. */
function gathering_init(PDO $pdo, int $playerId, array $profession, int $now): void
{
    $fill = (float) econ('new_player.station_start_fill', 0.5);
    foreach ($profession['station']['outputs'] as $output) {
        $head = (int) floor($fill * $output['cap'] * gathering_seconds_per_unit($output));
        $pdo->prepare('INSERT INTO gathering (player_id, item_id, last_at) VALUES (?, ?, ?)')
            ->execute([$playerId, $output['item_id'], $now - $head]);
    }
}

/** How many units are ready for one output. */
function gathering_ready(array $output, int $lastAt, int $now): int
{
    $units = (int) floor(max(0, $now - $lastAt) / gathering_seconds_per_unit($output));
    return min((int) $output['cap'], $units);
}

/** Station status for the client: what's ready, the cap, and time until full. */
function gathering_status(int $playerId, string $professionId): array
{
    $profession = content_profession($professionId);
    $stmt = db()->prepare('SELECT item_id, last_at FROM gathering WHERE player_id = ?');
    $stmt->execute([$playerId]);
    $lastAt = array_column($stmt->fetchAll(), 'last_at', 'item_id');
    $now = game_now();

    $outputs = [];
    foreach ($profession['station']['outputs'] as $output) {
        $last = (int) ($lastAt[$output['item_id']] ?? $now);
        $ready = gathering_ready($output, $last, $now);
        $spu = gathering_seconds_per_unit($output);
        $fullAt = $last + (int) ceil($output['cap'] * $spu);
        $outputs[] = [
            'item_id'         => $output['item_id'],
            'name'            => item_name($output['item_id']),
            'ready'           => $ready,
            'cap'             => (int) $output['cap'],
            'rate_per_hour'   => round($output['rate_per_hour'] / pace(), 2),
            'seconds_to_full' => max(0, $fullAt - $now),
        ];
    }
    return ['id' => $profession['station']['id'], 'name' => $profession['station']['name'], 'outputs' => $outputs];
}

/** Collect everything ready at the player's station. Returns what was collected. */
function gathering_collect(int $playerId): array
{
    return tx(function (PDO $pdo) use ($playerId) {
        $profession = require_profession($pdo, $playerId);
        $stmt = $pdo->prepare('SELECT item_id, last_at FROM gathering WHERE player_id = ? FOR UPDATE');
        $stmt->execute([$playerId]);
        $lastAt = array_column($stmt->fetchAll(), 'last_at', 'item_id');
        $now = game_now();

        $collected = [];
        foreach ($profession['station']['outputs'] as $output) {
            $itemId = $output['item_id'];
            $last = (int) ($lastAt[$itemId] ?? $now);
            $ready = gathering_ready($output, $last, $now);
            if ($ready <= 0) {
                continue;
            }
            inventory_add($pdo, $playerId, $itemId, $ready);
            // Keep partial progress toward the next unit, unless the station was full (overflow is lost).
            $newLast = $ready >= $output['cap'] ? $now : $last + (int) floor($ready * gathering_seconds_per_unit($output));
            $pdo->prepare('UPDATE gathering SET last_at = ? WHERE player_id = ? AND item_id = ?')
                ->execute([$newLast, $playerId, $itemId]);
            $collected[] = ['item_id' => $itemId, 'quantity' => $ready];
        }

        if (!$collected) {
            throw new ApiError('nothing_to_collect', 'Nothing is ready yet.');
        }
        activity_log($pdo, $playerId, 'gathered', ['items' => $collected]);
        return $collected;
    });
}
