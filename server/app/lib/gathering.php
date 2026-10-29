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

/** The skill at which a new player starts gathering this output (raw 2 at 15, 0.8.0). */
function gathering_unlock_skill(array $output): int
{
    return max(1, (int) ($output['unlock_skill'] ?? 1));
}

/** Create station rows when a profession is chosen, starting partly full. Locked raws come later (gathering_unlock). */
function gathering_init(PDO $pdo, int $playerId, array $profession, int $now): void
{
    $fill = (float) econ('new_player.station_start_fill', 0.5);
    foreach ($profession['station']['outputs'] as $output) {
        if (gathering_unlock_skill($output) > 1) {
            continue;
        }
        $head = (int) floor($fill * $output['cap'] * gathering_seconds_per_unit($output));
        $pdo->prepare('INSERT INTO gathering (player_id, item_id, last_at) VALUES (?, ?, ?)')
            ->execute([$playerId, $output['item_id'], $now - $head]);
    }
}

/**
 * Start gathering every output the player's skill now reaches (empty, from now). A station row is the
 * player's right to gather that raw, so players from before 0.8.0 keep both raws. Returns new item names.
 */
function gathering_unlock(PDO $pdo, int $playerId, array $profession, int $skill, int $now): array
{
    $new = [];
    $stmt = $pdo->prepare('INSERT IGNORE INTO gathering (player_id, item_id, last_at) VALUES (?, ?, ?)');
    foreach ($profession['station']['outputs'] as $output) {
        if (gathering_unlock_skill($output) <= $skill) {
            $stmt->execute([$playerId, $output['item_id'], $now]);
            if ($stmt->rowCount() === 1) {
                $new[] = item_name($output['item_id']);
            }
        }
    }
    return $new;
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
    $locked = [];
    foreach (workshop_station_outputs($profession, workshop_level(db(), $playerId)) as $output) {
        if (!isset($lastAt[$output['item_id']])) {
            $locked[] = ['item_id' => $output['item_id'], 'name' => item_name($output['item_id']), 'unlock_skill' => gathering_unlock_skill($output)];
            continue;
        }
        $last = (int) $lastAt[$output['item_id']];
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
    return ['id' => $profession['station']['id'], 'name' => $profession['station']['name'], 'outputs' => $outputs, 'locked' => $locked];
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
        foreach (workshop_station_outputs($profession, workshop_level($pdo, $playerId)) as $output) {
            $itemId = $output['item_id'];
            if (!isset($lastAt[$itemId])) {
                continue;   // not unlocked yet
            }
            $last = (int) $lastAt[$itemId];
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

        // Small surprises (#48): a rich find adds extra of the common raw; a rare find adds the rarest raw
        // this player has unlocked (not the station's last raw, which may still be locked: raws 3 and 4 come at 40 and 65).
        $surprises = [];
        $outputs = $profession['station']['outputs'];
        $label = (string) ($profession['station']['find_label'] ?? 'A lucky find!');
        if (rand_between(0, 1) < (float) econ('surprises.rich_find_chance', 0.15)) {
            $common = $outputs[0]['item_id'];
            $got = 0;
            foreach ($collected as $c) {
                $got += $c['item_id'] === $common ? $c['quantity'] : 0;
            }
            $bonus = max(2, (int) ceil($got * (float) econ('surprises.rich_find_bonus', 0.5)));
            inventory_add($pdo, $playerId, $common, $bonus);
            $surprises[] = ['text' => sprintf('%s +%d %s', $label, $bonus, item_name($common)), 'item_id' => $common, 'quantity' => $bonus];
        }
        $rare = null;
        foreach (array_slice($outputs, 1) as $o) {
            if (isset($lastAt[$o['item_id']])) {
                $rare = $o['item_id'];
            }
        }
        if ($rare !== null && rand_between(0, 1) < (float) econ('surprises.rare_find_chance', 0.08)) {
            $bonus = mt_rand(1, (int) econ('surprises.rare_find_max', 2));
            inventory_add($pdo, $playerId, $rare, $bonus);
            $surprises[] = ['text' => sprintf('Rare find! +%d %s', $bonus, item_name($rare)), 'item_id' => $rare, 'quantity' => $bonus];
        }
        foreach ($surprises as $sp) {
            activity_log($pdo, $playerId, 'surprise', ['text' => $sp['text']]);
        }
        return ['collected' => $collected, 'surprises' => $surprises];
    });
}
