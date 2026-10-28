<?php
declare(strict_types=1);

/*
 * Crafting Orders (systems.md 6.3, #44): the order board in each player's Workshop.
 * Named NPC customers ask for specific items with a deadline and pay rewards the market can't:
 * gold above market value and sometimes rare materials from another guild. Content: content/orders.json.
 *
 * Rewards are priced from each item's USUAL value (content reference_value), not today's price, and the
 * whole reward (gold + rare materials at their usual value) stays below what the Guild Suppliers charge
 * (ceiling_multiplier x usual or more). So an order can't be filled at a profit with supplier stock (0.5.1).
 *
 * The board is resolved lazily (like every timer in Guildie): reading or acting on it expires
 * overdue orders and fills empty slots. An open order whose created_at is in the future is a
 * customer on the way. Order kinds:
 *   standard  : your own goods
 *   bundle    : your goods plus another guild's (from Journeyman, economy.progression.bundle_orders_rank)
 *   collector : one item at a high price (more likely on Sunday, Market Day)
 *
 * 0.8.0 (#30, #49): orders ask only for goods from recipes you know or can learn now, pay XP (no fall-off,
 * the best XP for the time), and sometimes teach one of your guild's rare recipes.
 */

function orders_settings(): array
{
    return content_file('orders.json')['settings'];
}

function orders_customers(): array
{
    return content_index('orders.json', 'customers');
}

function order_items_from_json(string $json): array
{
    $out = [];
    foreach (json_decode($json, true) ?: [] as $e) {
        $out[$e['item_id']] = ($out[$e['item_id']] ?? 0) + (int) $e['quantity'];
    }
    return $out;
}

function order_items_to_json(array $items): string
{
    return json_encode(array_map(fn($id, $q) => ['item_id' => $id, 'quantity' => $q], array_keys($items), $items));
}

/** "3 Copper Lantern and 1 Smelting Flux" */
function order_items_text(array $items): string
{
    $parts = array_map(fn($id, $q) => $q . ' ' . item_name((string) $id), array_keys($items), $items);
    if (count($parts) <= 1) {
        return $parts[0] ?? '';
    }
    $last = array_pop($parts);
    return implode(', ', $parts) . ' and ' . $last;
}

/**
 * Items a profession can make (its recipe outputs). $selfSufficientOnly: only recipes with no other guild's inputs.
 * With $skill, only recipes the player knows ($known) or can learn now (skill reached, not rare).
 */
function orders_own_items(string $professionId, bool $selfSufficientOnly, ?int $skill = null, array $known = []): array
{
    $items = [];
    foreach (content_recipes_for($professionId) as $recipe) {
        $imports = array_filter($recipe['inputs'], fn($in) => (content_item($in['item_id'])['profession'] ?? '') !== $professionId);
        if ($selfSufficientOnly && $imports) {
            continue;
        }
        if ($skill !== null && !isset($known[$recipe['id']]) && (recipe_is_rare($recipe) || recipe_skill($recipe) > $skill)) {
            continue;
        }
        $items[] = $recipe['output']['item_id'];
    }
    return array_values(array_unique($items));
}

/** XP an order pays: xp_multiplier[kind] x each item's recipe XP (by rank), with no fall-off. */
function orders_xp(array $items, string $kind): int
{
    $xp = 0.0;
    foreach ($items as $id => $q) {
        $xp += $q * item_order_xp((string) $id);
    }
    return (int) round($xp * (float) (orders_settings()['xp_multiplier'][$kind] ?? 1));
}

/** A rare recipe this order could teach: one of the guild's rare recipes the player doesn't know and isn't already offered. */
function orders_pick_rare_recipe(PDO $pdo, int $playerId, string $professionId, int $skill, array $known): ?string
{
    $stmt = $pdo->prepare("SELECT reward_recipe FROM orders WHERE player_id = ? AND status = 'open' AND reward_recipe IS NOT NULL");
    $stmt->execute([$playerId]);
    $offered = array_flip($stmt->fetchAll(PDO::FETCH_COLUMN));
    $reach = (int) (orders_settings()['rare_recipe_reach'] ?? 10);
    $pool = [];
    foreach (content_recipes_for($professionId) as $r) {
        if (recipe_is_rare($r) && !isset($known[$r['id']]) && !isset($offered[$r['id']]) && recipe_skill($r) <= $skill + $reach) {
            $pool[] = $r['id'];
        }
    }
    return $pool ? orders_pick($pool) : null;
}

/** Crafted goods other guilds make with no imports (what a bundle may ask for from another guild). */
function orders_other_guild_items(string $professionId): array
{
    $items = [];
    foreach (content_professions() as $id => $p) {
        if ($id !== $professionId) {
            $items = array_merge($items, orders_own_items($id, true));
        }
    }
    return $items;
}

function orders_pick(array $list): mixed
{
    return $list[mt_rand(0, count($list) - 1)];
}

/** An item's usual value (its content reference value): what orders are priced from. */
function orders_usual(string $itemId): float
{
    return max(1.0, (float) (content_item($itemId)['reference_value'] ?? 1));
}

/** Quantity of an item worth roughly $target gold at its usual value (at least 1, at most max_quantity). */
function orders_quantity_for(string $itemId, float $target): int
{
    return max(1, min((int) orders_settings()['max_quantity'], (int) round($target / orders_usual($itemId))));
}

/** Generate one new order for a player. Returns the row values to insert (without slot/times). */
function orders_generate(PDO $pdo, int $playerId, string $professionId, int $now): array
{
    $s = orders_settings();
    $skill = (int) (progression_row($pdo, $playerId)['skill'] ?? 1);
    $known = progression_known($pdo, $playerId);
    $bundles = progression_rank_index($skill) >= progression_rank_index_by_id((string) prog('bundle_orders_rank', 'journeyman'));
    $sunday = calendar_weekday($now) === 7;

    $roll = rand_between(0, 1);
    $collectorChance = (float) ($sunday ? $s['collector_chance_sunday'] : $s['collector_chance']);
    $kind = 'standard';
    if ($roll < $collectorChance) {
        $kind = 'collector';
    } elseif ($bundles && $roll < $collectorChance + (float) $s['bundle_chance']) {
        $kind = 'bundle';
    }

    $target = rand_between((float) $s['target_value_min'], (float) $s['target_value_max']);
    $items = [];
    if ($kind === 'collector') {
        $item = orders_pick(orders_own_items($professionId, !$bundles, $skill, $known));
        $items[$item] = mt_rand(1, 2);
    } elseif ($kind === 'bundle') {
        $own = orders_pick(orders_own_items($professionId, false, $skill, $known));
        $other = orders_pick(orders_other_guild_items($professionId));
        $items[$own] = orders_quantity_for($own, $target * 0.65);
        $items[$other] = orders_quantity_for($other, $target * 0.35);
    } else {
        // Before bundles unlock (Journeyman), standard orders only ask for goods you can make on your own.
        $pool = orders_own_items($professionId, !$bundles, $skill, $known);
        $item = orders_pick($pool);
        $items[$item] = orders_quantity_for($item, $target);
    }

    // The whole reward is worth reward_multiplier x the items' usual value (validator: below the
    // suppliers' ceiling_multiplier). A rare material is paid out of that budget, not on top of it.
    $value = 0.0;
    foreach ($items as $id => $q) {
        $value += $q * orders_usual((string) $id);
    }
    $budget = $value * (float) $s['reward_multiplier'][$kind];

    // Sometimes a rare material from another guild's station (cross-pollination), up to max_rare_share of the budget.
    $rewardItems = [];
    $rareValue = 0.0;
    if (rand_between(0, 1) < (float) ($s['rare_material_chance'][$kind] ?? 0)) {
        $raws = [];
        foreach (content_professions() as $id => $p) {
            if ($id !== $professionId) {
                $outputs = $p['station']['outputs'];
                $raws[] = end($outputs)['item_id'];   // the station's rarer raw
            }
        }
        $raw = orders_pick($raws);
        $affordable = (int) floor($budget * (float) $s['max_rare_share'] / orders_usual($raw));
        $qty = min(mt_rand(1, (int) $s['rare_material_max']), $affordable);
        if ($qty > 0) {
            $rewardItems[$raw] = $qty;
            $rareValue = $qty * orders_usual($raw);
        }
    }
    $gold = max(1, (int) floor($budget - $rareValue));

    // Sometimes the customer also teaches a rare recipe (#49): a trophy the trainer doesn't sell.
    $recipe = null;
    if (rand_between(0, 1) < (float) ($s['rare_recipe_chance'][$kind] ?? 0)) {
        $recipe = orders_pick_rare_recipe($pdo, $playerId, $professionId, $skill, $known);
    }

    $customers = array_values(array_filter(orders_customers(), fn($c) => in_array($kind, $c['kinds'], true)));
    $customer = orders_pick($customers);
    return ['customer_id' => $customer['id'], 'kind' => $kind, 'items' => $items, 'reward_gold' => $gold, 'reward_items' => $rewardItems, 'reward_recipe' => $recipe];
}

/** Expire overdue orders and fill empty slots. Runs inside a transaction. */
function orders_refresh(PDO $pdo, int $playerId, string $professionId, int $now): void
{
    $s = orders_settings();
    $pdo->prepare("UPDATE orders SET status = 'expired', resolved_at = ? WHERE player_id = ? AND status = 'open' AND expires_at <= ?")
        ->execute([$now, $playerId, $now]);
    $stmt = $pdo->prepare("SELECT slot FROM orders WHERE player_id = ? AND status = 'open' FOR UPDATE");
    $stmt->execute([$playerId]);
    $taken = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    for ($slot = 0; $slot < (int) $s['board_size']; $slot++) {
        if (!in_array($slot, $taken, true)) {
            orders_insert($pdo, $playerId, $professionId, $slot, $now, $now);
        }
    }
}

function orders_insert(PDO $pdo, int $playerId, string $professionId, int $slot, int $arrivesAt, int $now): void
{
    $s = orders_settings();
    $o = orders_generate($pdo, $playerId, $professionId, $now);
    $hours = rand_between((float) $s['deadline_hours_min'], (float) $s['deadline_hours_max']);
    $expires = $arrivesAt + (int) round($hours * 3600 * pace());
    $pdo->prepare(
        'INSERT INTO orders (player_id, slot, customer_id, kind, items, reward_gold, reward_items, reward_recipe, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([$playerId, $slot, $o['customer_id'], $o['kind'], order_items_to_json($o['items']), $o['reward_gold'],
        order_items_to_json($o['reward_items']), $o['reward_recipe'], $arrivesAt, $expires]);
}

/** The board for the client. */
function orders_board(int $playerId): array
{
    $board = tx(function (PDO $pdo) use ($playerId) {
        // One board refresh at a time per player. Lock the player row FIRST, before any plain read:
        // InnoDB fixes a transaction's view of the data at its first plain read, so locking later would
        // still see an empty board and two requests at once would both fill it (duplicate orders, 0.5.2).
        gold_get($pdo, $playerId, true);
        $professionId = require_profession($pdo, $playerId)['id'];
        $now = game_now();
        orders_refresh($pdo, $playerId, $professionId, $now);
        $stmt = $pdo->prepare("SELECT * FROM orders WHERE player_id = ? AND status = 'open' ORDER BY slot");
        $stmt->execute([$playerId]);
        $rows = $stmt->fetchAll();
        $stmt = $pdo->prepare('SELECT skip_ready_at FROM order_boards WHERE player_id = ?');
        $stmt->execute([$playerId]);
        return ['rows' => $rows, 'skip_ready_at' => (int) ($stmt->fetchColumn() ?: 0), 'now' => $now];
    });

    $pdo = db();
    $now = $board['now'];
    $customers = orders_customers();
    $orders = [];
    foreach ($board['rows'] as $row) {
        $items = order_items_from_json($row['items']);
        $customer = $customers[$row['customer_id']] ?? ['name' => 'A customer', 'line' => 'Wants {items}.'];
        $arriving = (int) $row['created_at'] > $now;
        $orders[] = [
            'id'           => (int) $row['id'],
            'slot'         => (int) $row['slot'],
            'kind'         => $row['kind'],
            'customer'     => $customer['name'],
            'line'         => str_replace('{items}', order_items_text($items), $customer['line']),
            'arriving_in'  => $arriving ? (int) $row['created_at'] - $now : 0,
            'seconds_left' => max(0, (int) $row['expires_at'] - $now),
            'items'        => array_map(fn($id, $q) => [
                'item_id'  => $id,
                'name'     => item_name((string) $id),
                'quantity' => $q,
                'have'     => inventory_count($pdo, $playerId, (string) $id),
                'own_guild' => (content_item((string) $id)['profession'] ?? '') === player_profession_id($pdo, $playerId),
            ], array_keys($items), $items),
            'reward_gold'  => (int) $row['reward_gold'],
            'reward_items' => array_map(fn($id, $q) => ['item_id' => $id, 'name' => item_name((string) $id), 'quantity' => $q],
                array_keys(order_items_from_json($row['reward_items'])), order_items_from_json($row['reward_items'])),
            'reward_xp'    => orders_xp($items, $row['kind']),
            'reward_recipe' => orders_recipe_reward($row['reward_recipe'] ?? null),
        ];
    }
    return ['orders' => $orders, 'skip_in' => max(0, $board['skip_ready_at'] - $now)];
}

/** The rare recipe an order teaches, for the client: {id, name, output} or null. */
function orders_recipe_reward(?string $recipeId): ?array
{
    $recipe = $recipeId ? content_recipe($recipeId) : null;
    if ($recipe === null) {
        return null;
    }
    return ['id' => $recipe['id'], 'name' => recipe_name($recipe), 'output' => item_name($recipe['output']['item_id']),
        'quantity' => (int) $recipe['output']['quantity'], 'skill' => recipe_skill($recipe)];
}

/** Lock an open, arrived order of this player. */
function orders_lock(PDO $pdo, int $playerId, int $orderId, int $now): array
{
    $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ? AND player_id = ? FOR UPDATE');
    $stmt->execute([$orderId, $playerId]);
    $order = $stmt->fetch();
    if (!$order) {
        throw new ApiError('not_found', 'Order not found.', 404);
    }
    if ($order['status'] !== 'open' || (int) $order['expires_at'] <= $now) {
        throw new ApiError('order_closed', 'That order is no longer open.', 409);
    }
    if ((int) $order['created_at'] > $now) {
        throw new ApiError('order_closed', 'That customer hasn\'t arrived yet.', 409);
    }
    return $order;
}

/** Fill an order: hand over the items, get paid. A new customer arrives after refill_minutes. */
function orders_fill(int $playerId, int $orderId): array
{
    return tx(function (PDO $pdo) use ($playerId, $orderId) {
        gold_get($pdo, $playerId, true);   // same lock order as the board refresh: player first (no deadlocks)
        $professionId = require_profession($pdo, $playerId)['id'];
        $now = game_now();
        $order = orders_lock($pdo, $playerId, $orderId, $now);
        $items = order_items_from_json($order['items']);
        foreach ($items as $id => $q) {
            $have = inventory_count($pdo, $playerId, (string) $id, QUALITY_COMMON, true);
            if ($have < $q) {
                throw new ApiError('not_enough_items', sprintf('You need %d %s for this order but have %d.', $q, item_name((string) $id), $have));
            }
        }
        foreach ($items as $id => $q) {
            inventory_remove($pdo, $playerId, (string) $id, $q);   // consumed by the customer: a sink
        }
        gold_add($pdo, $playerId, (int) $order['reward_gold']);
        $rewardItems = order_items_from_json($order['reward_items']);
        foreach ($rewardItems as $id => $q) {
            inventory_add($pdo, $playerId, (string) $id, $q);
        }
        $pdo->prepare("UPDATE orders SET status = 'filled', resolved_at = ? WHERE id = ?")->execute([$now, $orderId]);

        $customer = orders_customers()[$order['customer_id']]['name'] ?? 'A customer';
        $rewardText = ducats((int) $order['reward_gold']) . ($rewardItems ? ' and ' . order_items_text($rewardItems) : '');
        activity_log($pdo, $playerId, 'order_filled', ['customer' => $customer, 'items' => order_items_text($items), 'reward' => $rewardText]);

        // XP (#30) and, sometimes, a rare recipe (#49).
        $row = progression_row($pdo, $playerId, true);
        $xp = orders_xp($items, $order['kind']);
        $progress = progression_apply($pdo, $playerId, $row, $xp, 0, $now) + ['xp' => $xp, 'doubled' => false, 'discoveries' => []];
        progression_log_gain($pdo, $playerId, $row, $progress);
        $taught = null;
        $recipe = !empty($order['reward_recipe']) ? content_recipe((string) $order['reward_recipe']) : null;
        if ($recipe !== null && $recipe['profession'] === $professionId && progression_learn($pdo, $playerId, $recipe['id'], 'order', $now)) {
            $taught = recipe_name($recipe);
            activity_log($pdo, $playerId, 'recipe_taught', ['customer' => $customer, 'recipe' => $taught]);
        }
        $progress['taught'] = $taught;

        // The next customer arrives after refill_minutes (generated after learning, so it can't offer the same recipe).
        $arrives = $now + (int) round((float) orders_settings()['refill_minutes'] * 60 * pace());
        orders_insert($pdo, $playerId, $professionId, (int) $order['slot'], $arrives, $now);
        return ['customer' => $customer, 'reward_gold' => (int) $order['reward_gold'], 'reward_text' => $rewardText, 'progress' => $progress];
    });
}

/** Turn an order down. A new customer arrives at once; the next skip waits skip_cooldown_minutes. */
function orders_skip(int $playerId, int $orderId): void
{
    tx(function (PDO $pdo) use ($playerId, $orderId) {
        gold_get($pdo, $playerId, true);   // same lock order as the board refresh: player first (no deadlocks)
        $professionId = require_profession($pdo, $playerId)['id'];
        $now = game_now();
        $pdo->prepare('INSERT IGNORE INTO order_boards (player_id, skip_ready_at) VALUES (?, 0)')->execute([$playerId]);
        $stmt = $pdo->prepare('SELECT skip_ready_at FROM order_boards WHERE player_id = ? FOR UPDATE');
        $stmt->execute([$playerId]);
        $ready = (int) $stmt->fetchColumn();
        if ($ready > $now) {
            throw new ApiError('skip_cooldown', sprintf('You can turn down another order in %s.', orders_duration_text($ready - $now)), 409);
        }
        $order = orders_lock($pdo, $playerId, $orderId, $now);
        $pdo->prepare("UPDATE orders SET status = 'skipped', resolved_at = ? WHERE id = ?")->execute([$now, $orderId]);
        orders_insert($pdo, $playerId, $professionId, (int) $order['slot'], $now, $now);
        $cooldown = (int) round((float) orders_settings()['skip_cooldown_minutes'] * 60 * pace());
        $pdo->prepare('UPDATE order_boards SET skip_ready_at = ? WHERE player_id = ?')->execute([$now + $cooldown, $playerId]);
    });
}

function orders_duration_text(int $seconds): string
{
    return $seconds >= 3600 ? sprintf('%dh %02dm', intdiv($seconds, 3600), intdiv($seconds % 3600, 60))
        : ($seconds >= 60 ? sprintf('%dm', intdiv($seconds, 60)) : sprintf('%ds', $seconds));
}
