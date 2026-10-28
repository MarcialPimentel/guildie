<?php
declare(strict_types=1);

/*
 * The Duke's order (systems.md 6.5, docs/living-city.md section 5): one city-wide order at a time, with
 * lines from several guilds, that every player can contribute to. Owns duke_orders and duke_contributions.
 *
 * Resolved lazily like the order board: reading or contributing closes an overdue order and starts the
 * next one from content/duke.json. A contribution pays pay_multiplier x usual value per unit at once; when
 * the last line fills, every contributor is paid bonus_multiplier x usual value per unit they gave. The
 * validator keeps pay + bonus below the suppliers' ceiling (the 0.5.1 supplier rule).
 *
 * Locking: every write takes the global 'duke_lock' row FIRST, then player rows. Nothing else locks it,
 * so paying bonuses to other players while holding it can't deadlock with their own actions.
 */

const DUKE_FULFILLED_BOARD_HOURS = 12;   // a fulfilled order stays on the board this long (x pace) before the next

function duke_settings(): array
{
    return content_file('duke.json')['settings'];
}

function duke_defs(): array
{
    return content_index('duke.json', 'orders');
}

/** Take the global Duke's order lock (inside a transaction). */
function duke_lock(PDO $pdo): void
{
    // The row is made by migration 007. Only insert it if it's missing: INSERT IGNORE on an existing row
    // takes a shared lock, and two requests both upgrading theirs to FOR UPDATE would deadlock.
    if ($pdo->query("SELECT v FROM game_state WHERE k = 'duke_lock' FOR UPDATE")->fetchColumn() === false) {
        $pdo->exec("INSERT IGNORE INTO game_state (k, v) VALUES ('duke_lock', '0')");
        $pdo->query("SELECT v FROM game_state WHERE k = 'duke_lock' FOR UPDATE")->fetchColumn();
    }
}

function duke_lines(array $row): array
{
    return json_decode((string) $row['order_lines'], true) ?: [];
}

/** Active crafters in the last 7 days scale the goals. */
function duke_goal_scale(PDO $pdo, int $now): float
{
    $s = duke_settings();
    $stmt = $pdo->prepare('SELECT COUNT(DISTINCT player_id) FROM activity WHERE player_id IS NOT NULL AND created_at >= ?');
    $stmt->execute([$now - 7 * 86400]);
    $active = (int) $stmt->fetchColumn();
    return min((float) $s['max_goal_scale'], max(1.0, $active / max(1, (int) $s['players_per_goal_step'])));
}

/** Start the next order in content order (after the latest one). Runs under the lock. */
function duke_start_next(PDO $pdo, ?array $latest, int $now): array
{
    $s = duke_settings();
    $keys = array_keys(duke_defs());
    $index = 0;
    if ($latest !== null) {
        $pos = array_search($latest['order_key'], $keys, true);
        $index = $pos === false ? 0 : ($pos + 1) % count($keys);
    }
    $def = duke_defs()[$keys[$index]];
    $scale = duke_goal_scale($pdo, $now);
    $lines = array_map(fn($l) => [
        'item_id'   => $l['item_id'],
        'goal'      => (int) ceil($l['goal'] * $scale),
        'delivered' => 0,
    ], $def['lines']);
    $ends = $now + (int) round((float) $s['duration_hours'] * 3600 * pace());
    $pdo->prepare(
        'INSERT INTO duke_orders (order_key, order_lines, pay_multiplier, bonus_multiplier, max_share, starts_at, ends_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    )->execute([$def['id'], json_encode($lines), $s['pay_multiplier'], $s['bonus_multiplier'], $s['max_share'], $now, $ends]);
    $id = (int) $pdo->lastInsertId();
    $stmt = $pdo->prepare('SELECT * FROM duke_orders WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch();
}

/** The current order (open, or fulfilled and still on the board). Closes overdue ones. Runs under the lock. */
function duke_current(PDO $pdo, int $now): array
{
    $latest = $pdo->query('SELECT * FROM duke_orders ORDER BY id DESC LIMIT 1')->fetch() ?: null;
    if ($latest === null) {
        return duke_start_next($pdo, null, $now);
    }
    if ($latest['status'] === 'open' && (int) $latest['ends_at'] <= $now) {
        $pdo->prepare("UPDATE duke_orders SET status = 'expired', resolved_at = ? WHERE id = ?")->execute([$now, $latest['id']]);
        return duke_start_next($pdo, $latest, $now);
    }
    if ($latest['status'] !== 'open' && (int) $latest['ends_at'] <= $now) {
        return duke_start_next($pdo, $latest, $now);
    }
    return $latest;
}

/** When one player's share cap stops applying (Unix time). */
function duke_share_opens_at(array $row): int
{
    $start = (int) $row['starts_at'];
    return $start + (int) floor(((int) $row['ends_at'] - $start) * (float) duke_settings()['open_share_after']);
}

/** How many more of a line this player may give right now (the fair-share cap). */
function duke_allowed(PDO $pdo, array $row, array $line, int $playerId, int $now): int
{
    $remaining = max(0, $line['goal'] - $line['delivered']);
    if ($now >= duke_share_opens_at($row)) {
        return $remaining;
    }
    $stmt = $pdo->prepare('SELECT COALESCE(SUM(quantity), 0) FROM duke_contributions WHERE duke_order_id = ? AND player_id = ? AND item_id = ?');
    $stmt->execute([$row['id'], $playerId, $line['item_id']]);
    $mine = (int) $stmt->fetchColumn();
    $cap = max(1, (int) floor($line['goal'] * (float) $row['max_share']));
    return max(0, min($remaining, $cap - $mine));
}

/** Give goods to the Duke. Returns what was given and paid (quantity is reduced to what the line still takes). */
function duke_contribute(int $playerId, string $itemId, int $quantity): array
{
    return tx(function (PDO $pdo) use ($playerId, $itemId, $quantity) {
        duke_lock($pdo);
        gold_get($pdo, $playerId, true);
        require_profession($pdo, $playerId);
        $now = game_now();
        $row = duke_current($pdo, $now);
        if ($row['status'] !== 'open') {
            throw new ApiError('order_closed', "The Duke's order is already fulfilled. A new one is posted soon.", 409);
        }
        $lines = duke_lines($row);
        $i = array_search($itemId, array_column($lines, 'item_id'), true);
        if ($i === false) {
            throw new ApiError('bad_request', sprintf("The Duke isn't asking for %s.", item_name($itemId)));
        }
        $allowed = duke_allowed($pdo, $row, $lines[$i], $playerId, $now);
        if ($lines[$i]['delivered'] >= $lines[$i]['goal']) {
            throw new ApiError('line_full', sprintf('The Duke has all the %s he asked for.', item_name($itemId)), 409);
        }
        if ($allowed <= 0) {
            throw new ApiError('share_reached', sprintf(
                "You've given your share of %s. Let others help; anyone can finish it in %s.",
                item_name($itemId), orders_duration_text(duke_share_opens_at($row) - $now)
            ), 409);
        }
        $qty = min($quantity, $allowed);
        inventory_remove($pdo, $playerId, $itemId, $qty);   // the Duke keeps them: a sink
        $usual = orders_usual($itemId);
        $paid = (int) floor($qty * $usual * (float) $row['pay_multiplier']);
        gold_add($pdo, $playerId, $paid);
        $lines[$i]['delivered'] += $qty;
        $pdo->prepare('UPDATE duke_orders SET order_lines = ? WHERE id = ?')->execute([json_encode($lines), $row['id']]);
        $pdo->prepare('INSERT INTO duke_contributions (duke_order_id, player_id, item_id, quantity, paid, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$row['id'], $playerId, $itemId, $qty, $paid, $now]);
        $title = duke_defs()[$row['order_key']]['title'] ?? "the Duke's order";
        activity_log($pdo, $playerId, 'duke_contributed', ['item_id' => $itemId, 'quantity' => $qty, 'paid' => $paid, 'title' => $title]);

        $fulfilled = !array_filter($lines, fn($l) => $l['delivered'] < $l['goal']);
        if ($fulfilled) {
            duke_fulfil($pdo, $row, $title, $now);
        }
        return ['item_id' => $itemId, 'name' => item_name($itemId), 'quantity' => $qty, 'paid' => $paid, 'fulfilled' => $fulfilled];
    });
}

/** Every line is filled: pay each contributor's bonus and keep the order on the board for a while. */
function duke_fulfil(PDO $pdo, array $row, string $title, int $now): void
{
    $stmt = $pdo->prepare('SELECT id, player_id, item_id, quantity FROM duke_contributions WHERE duke_order_id = ? ORDER BY id');
    $stmt->execute([$row['id']]);
    $perPlayer = [];
    foreach ($stmt->fetchAll() as $c) {
        $bonus = (int) floor((int) $c['quantity'] * orders_usual($c['item_id']) * (float) $row['bonus_multiplier']);
        $pdo->prepare('UPDATE duke_contributions SET bonus = ? WHERE id = ?')->execute([$bonus, $c['id']]);
        $perPlayer[(int) $c['player_id']] = ($perPlayer[(int) $c['player_id']] ?? 0) + $bonus;
    }
    ksort($perPlayer);   // same lock order every time
    foreach ($perPlayer as $pid => $bonus) {
        gold_add($pdo, $pid, $bonus);
        activity_log($pdo, $pid, 'duke_fulfilled', ['title' => $title, 'bonus' => $bonus]);
    }
    $boardUntil = min((int) $row['ends_at'], $now + (int) round(DUKE_FULFILLED_BOARD_HOURS * 3600 * pace()));
    $pdo->prepare("UPDATE duke_orders SET status = 'fulfilled', resolved_at = ?, ends_at = ? WHERE id = ?")
        ->execute([$now, $boardUntil, $row['id']]);
}

/** The board: the current order, its lines, the top helpers, and what you gave. */
function duke_board(int $playerId): array
{
    $row = tx(function (PDO $pdo) {
        duke_lock($pdo);
        return duke_current($pdo, game_now());
    });
    $pdo = db();
    $now = game_now();
    $s = duke_settings();
    $def = duke_defs()[$row['order_key']] ?? ['title' => "The Duke's order", 'line' => ''];

    $stmt = $pdo->prepare(
        'SELECT c.player_id, p.name, c.item_id, SUM(c.quantity) AS q, SUM(c.paid) AS paid, SUM(c.bonus) AS bonus
         FROM duke_contributions c JOIN players p ON p.id = c.player_id
         WHERE c.duke_order_id = ? GROUP BY c.player_id, p.name, c.item_id'
    );
    $stmt->execute([$row['id']]);
    $helpers = [];
    $mine = [];
    foreach ($stmt->fetchAll() as $c) {
        $pid = (int) $c['player_id'];
        $h = &$helpers[$pid];
        $h ??= ['player_id' => $pid, 'name' => $c['name'], 'value' => 0, 'items' => 0, 'me' => $pid === $playerId];
        $h['value'] += (int) round((int) $c['q'] * orders_usual($c['item_id']));
        $h['items'] += (int) $c['q'];
        unset($h);
        if ($pid === $playerId) {
            $mine[$c['item_id']] = ['quantity' => (int) $c['q'], 'paid' => (int) $c['paid'], 'bonus' => (int) $c['bonus']];
        }
    }
    $helpers = array_values($helpers);
    usort($helpers, fn($a, $b) => [$b['value'], $a['name']] <=> [$a['value'], $b['name']]);
    $myRank = null;
    foreach ($helpers as $i => $h) {
        if ($h['me']) {
            $myRank = $i + 1;
        }
    }

    $lines = [];
    foreach (duke_lines($row) as $l) {
        $usual = orders_usual($l['item_id']);
        $lines[] = [
            'item_id'    => $l['item_id'],
            'name'       => item_name($l['item_id']),
            'guild'      => content_profession(content_item($l['item_id'])['profession'] ?? '')['name'] ?? '',
            'goal'       => (int) $l['goal'],
            'delivered'  => (int) $l['delivered'],
            'have'       => inventory_count($pdo, $playerId, $l['item_id']),
            'mine'       => $mine[$l['item_id']]['quantity'] ?? 0,
            'can_give'   => $row['status'] === 'open' ? duke_allowed($pdo, $row, $l, $playerId, $now) : 0,
            'unit_pay'   => (int) floor($usual * (float) $row['pay_multiplier']),
            'unit_bonus' => (int) floor($usual * (float) $row['bonus_multiplier']),
        ];
    }
    return [
        'id'            => (int) $row['id'],
        'title'         => $def['title'],
        'line'          => $def['line'],
        'status'        => $row['status'],
        'seconds_left'  => max(0, (int) $row['ends_at'] - $now),
        'share_open_in' => $row['status'] === 'open' ? max(0, duke_share_opens_at($row) - $now) : 0,
        'max_share'     => (float) $row['max_share'],
        'lines'         => $lines,
        'helpers'       => array_slice($helpers, 0, (int) $s['board_size']),
        'helper_count'  => count($helpers),
        'my_rank'       => $myRank,
        'my_paid'       => array_sum(array_column($mine, 'paid')),
        'my_bonus'      => array_sum(array_column($mine, 'bonus')),
    ];
}
