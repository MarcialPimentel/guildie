<?php
declare(strict_types=1);

/*
 * Market Simulation (systems.md 6.2). Runs inside the market tick and keeps the Exchange alive:
 *   - Townsfolk and Adventurers buy finished goods and consume them (the main sink)
 *   - Traders buy anything listed cheaply (the floor) and resell some near the reference value
 *   - Guild Suppliers always offer a small stock at the ceiling, so nothing is ever unavailable
 *   - Guild Workshops buy a little of every component, so making components is never a dead end
 *   - Reference values move with scarcity for goods NPCs consume (unmet demand pushes up, a glut
 *     pushes down), and toward real trade prices for everything else
 *   - 0.5.0 (#45, #46): Guild Week and world events (calendar.php) multiply NPC demand and set where
 *     prices drift; every price drifts back toward its (event-adjusted) usual value with a little
 *     constant movement, and each tick records prices for the ticker's sparklines.
 */

/** Current reference value of every item (falls back to content before the first tick). */
function market_reference_values(?PDO $pdo = null): array
{
    $refs = [];
    foreach (content_items() as $id => $item) {
        $refs[$id] = (float) $item['reference_value'];
    }
    $rows = ($pdo ?? db())->query('SELECT item_id, reference_value FROM market_items')->fetchAll();
    foreach ($rows as $row) {
        if (isset($refs[$row['item_id']])) {
            $refs[$row['item_id']] = (float) $row['reference_value'];
        }
    }
    return $refs;
}

function market_reference_value(string $itemId): float
{
    return market_reference_values()[$itemId] ?? (float) (content_item($itemId)['reference_value'] ?? 1);
}

/** Make sure every content item has a market row. */
function market_ensure_rows(PDO $pdo, int $now): void
{
    $stmt = $pdo->prepare('INSERT IGNORE INTO market_items (item_id, reference_value, updated_at) VALUES (?, ?, ?)');
    foreach (content_items() as $id => $item) {
        $stmt->execute([$id, $item['reference_value'], $now]);
    }
}

/**
 * One market tick. $elapsed is the time since the previous tick (capped), so a late tick
 * produces proportionally more NPC demand. Returns stats (used by the economy simulator).
 */
function market_tick(PDO $pdo, int $now, int $elapsed): array
{
    $elapsed = max(0, min($elapsed, (int) econ('market.max_catchup_seconds', 3600)));
    $stats = ['expired' => 0, 'npc_bought' => [], 'unmet' => [], 'demanded' => [], 'trader_bought' => [], 'consumed' => 0];

    $stats['expired'] = exchange_expire($pdo, $now);
    market_ensure_rows($pdo, $now);
    $refs = market_reference_values($pdo);

    $stats['event_announced'] = calendar_tick($pdo, $now, $elapsed);
    $mods = calendar_modifiers($pdo, $now);
    $stats['demand_scale'] = market_demand_scale($pdo, $now);
    market_consumers($pdo, $now, $elapsed, $refs, $stats, $mods['demand']);
    market_traders($pdo, $now, $refs, $stats);
    market_suppliers($pdo, $now, $refs);
    market_drift($pdo, $now, $elapsed, $refs, $stats, $mods);
    market_record_history($pdo, $now);

    $pdo->prepare('DELETE FROM activity WHERE created_at < ?')->execute([$now - 30 * 86400]);
    return $stats;
}

/**
 * NPC demand scales with the number of players active in the last day, so the market stays
 * balanced for 3 friends or 30 (a simple first version of GDD 6.4). Demand rates in economy.json
 * are written for market.demand_reference_players active players.
 */
function market_demand_scale(PDO $pdo, int $now): float
{
    $stmt = $pdo->prepare('SELECT COUNT(DISTINCT player_id) FROM activity WHERE player_id IS NOT NULL AND created_at >= ?');
    $stmt->execute([$now - 86400]);
    $active = (int) $stmt->fetchColumn();
    $reference = max(1, (int) econ('market.demand_reference_players', 8));
    return max((float) econ('market.demand_min_scale', 0.25), $active / $reference);
}

/** Consumers (Townsfolk, Adventurers, Guild Workshops): buy the cheapest acceptable listings, then consume the goods. */
function market_consumers(PDO $pdo, int $now, int $elapsed, array $refs, array &$stats, array $demandMods = []): void
{
    $pace = pace();
    $scale = $stats['demand_scale'] ?? 1.0;
    foreach (econ('personas', []) as $persona => $def) {
        foreach ($def['demand_per_hour'] ?? [] as $itemId => $perHour) {
            if (!isset($refs[$itemId])) {
                continue;
            }
            $pdo->prepare('INSERT IGNORE INTO market_demand (persona, item_id, carry) VALUES (?, ?, 0)')->execute([$persona, $itemId]);
            $stmt = $pdo->prepare('SELECT carry FROM market_demand WHERE persona = ? AND item_id = ? FOR UPDATE');
            $stmt->execute([$persona, $itemId]);
            $perHour = (float) $perHour * ($demandMods[$itemId] ?? 1.0);   // Guild Week and events
            $carry = (float) $stmt->fetchColumn() + $perHour * $scale * $elapsed / 3600 / $pace;
            $units = (int) floor($carry);
            $pdo->prepare('UPDATE market_demand SET carry = ? WHERE persona = ? AND item_id = ?')
                ->execute([$carry - $units, $persona, $itemId]);
            $stats['demanded'][$itemId] = ($stats['demanded'][$itemId] ?? 0) + $units;

            for ($i = 0; $i < $units; $i++) {
                $willing = (int) floor($refs[$itemId] * rand_between((float) $def['willing_min'], (float) $def['willing_max']));
                $stmt = $pdo->prepare(
                    "SELECT * FROM listings WHERE status = 'active' AND item_id = ? AND unit_price <= ? AND expires_at > ?
                       AND (seller_persona IS NULL OR seller_persona <> 'suppliers')
                     ORDER BY unit_price, id LIMIT 1 FOR UPDATE"
                );
                $stmt->execute([$itemId, $willing, $now]);
                $listing = $stmt->fetch();
                if (!$listing) {
                    $stats['unmet'][$itemId] = ($stats['unmet'][$itemId] ?? 0) + 1;
                    continue;
                }
                exchange_execute($pdo, $listing, 1, null, $persona);
                $stats['npc_bought'][$itemId] = ($stats['npc_bought'][$itemId] ?? 0) + 1;
                $stats['consumed']++;
            }
        }
    }
}

/** Traders: buy anything players list at or below the trader price; resell some, consume the rest. */
function market_traders(PDO $pdo, int $now, array $refs, array &$stats): void
{
    $buyBelow = (float) econ('market.trader_buy_below', 0.8);
    $floor = (float) econ('market.floor_multiplier', 0.6);
    $relist = (float) econ('market.trader_relist_multiplier', 1.05);
    $maxStock = (int) econ('market.trader_max_stock', 15);

    foreach ($refs as $itemId => $ref) {
        $stmt = $pdo->prepare(
            "SELECT * FROM listings WHERE status = 'active' AND item_id = ? AND seller_player_id IS NOT NULL
               AND unit_price <= ? AND expires_at > ? ORDER BY unit_price, id FOR UPDATE"
        );
        $stmt->execute([$itemId, (int) floor($ref * $buyBelow), $now]);
        $cheap = $stmt->fetchAll();
        if (!$cheap) {
            continue;
        }

        $stmt = $pdo->prepare("SELECT COALESCE(SUM(quantity), 0) FROM listings WHERE status = 'active' AND item_id = ? AND seller_persona = 'traders'");
        $stmt->execute([$itemId]);
        $stock = (int) $stmt->fetchColumn();

        foreach ($cheap as $listing) {
            $qty = (int) $listing['quantity'];
            exchange_execute($pdo, $listing, $qty, null, 'traders');
            $stats['trader_bought'][$itemId] = ($stats['trader_bought'][$itemId] ?? 0) + $qty;

            // Bought above the floor and there's room: resell near the reference value. Otherwise the goods are consumed.
            $resell = (int) $listing['unit_price'] > $ref * $floor ? max(0, min($qty, $maxStock - $stock)) : 0;
            if ($resell > 0) {
                $price = max(1, (int) ceil($ref * $relist));
                $pdo->prepare(
                    "INSERT INTO listings (seller_persona, item_id, quantity, original_quantity, unit_price, created_at, expires_at)
                     VALUES ('traders', ?, ?, ?, ?, ?, ?)"
                )->execute([$itemId, $resell, $resell, $price, $now, $now + 48 * 3600]);
                $stock += $resell;
            }
            $stats['consumed'] += $qty - $resell;
        }
    }
}

/**
 * Guild Suppliers: keep a small stock of every item at the ceiling price. They never sell below
 * ceiling x the item's USUAL value, even when today's price has dipped, so supplier stock can't be
 * used to fill orders (priced from usual value) at a profit (0.5.1).
 */
function market_suppliers(PDO $pdo, int $now, array $refs): void
{
    $ceiling = (float) econ('market.ceiling_multiplier', 1.5);
    $stockSize = (int) econ('market.ceiling_stock', 5);

    foreach ($refs as $itemId => $ref) {
        $usual = (float) (content_item($itemId)['reference_value'] ?? $ref);
        $price = max(1, (int) ceil(max($ref, $usual) * $ceiling));
        $stmt = $pdo->prepare("SELECT id FROM listings WHERE status = 'active' AND item_id = ? AND seller_persona = 'suppliers' ORDER BY id LIMIT 1 FOR UPDATE");
        $stmt->execute([$itemId]);
        $id = $stmt->fetchColumn();
        if ($id) {
            $pdo->prepare('UPDATE listings SET unit_price = ?, quantity = ?, original_quantity = ?, expires_at = ? WHERE id = ?')
                ->execute([$price, $stockSize, $stockSize, $now + 48 * 3600, $id]);
        } else {
            $pdo->prepare(
                "INSERT INTO listings (seller_persona, item_id, quantity, original_quantity, unit_price, created_at, expires_at)
                 VALUES ('suppliers', ?, ?, ?, ?, ?, ?)"
            )->execute([$itemId, $stockSize, $stockSize, $price, $now, $now + 48 * 3600]);
        }
    }
}

/**
 * What players have been paying for an item, for raw materials' price drift (0.5.1). Resistant to
 * wash trading:
 *   - each trade's price is clamped to the NPC band around the item's USUAL value (floor..ceiling),
 *   - the result is the quantity-weighted MEDIAN, not the mean,
 *   - it only counts when at least trade_signal_min_traders different sellers AND buyers traded;
 *     otherwise null (the price just drifts back to usual).
 * So two friends trading one unit at 20x between themselves move nothing.
 */
function market_trade_signal(PDO $pdo, string $itemId, int $since, float $usual): ?float
{
    $stmt = $pdo->prepare(
        'SELECT unit_price, quantity, seller_player_id, buyer_player_id, buyer_persona FROM trades
         WHERE item_id = ? AND created_at >= ? AND seller_player_id IS NOT NULL'
    );
    $stmt->execute([$itemId, $since]);
    $rows = $stmt->fetchAll();
    $min = max(1, (int) econ('market.trade_signal_min_traders', 2));
    $sellers = array_unique(array_column($rows, 'seller_player_id'));
    $buyers = array_unique(array_map(fn($r) => $r['buyer_player_id'] !== null ? 'p' . $r['buyer_player_id'] : 'n' . $r['buyer_persona'], $rows));
    if (count($sellers) < $min || count($buyers) < $min) {
        return null;
    }
    $lo = $usual * (float) econ('market.floor_multiplier', 0.6);
    $hi = $usual * (float) econ('market.ceiling_multiplier', 1.5);
    $points = [];
    $total = 0;
    foreach ($rows as $r) {
        $points[] = [min($hi, max($lo, (float) $r['unit_price'])), (int) $r['quantity']];
        $total += (int) $r['quantity'];
    }
    usort($points, fn($a, $b) => $a[0] <=> $b[0]);
    $seen = 0;
    foreach ($points as [$price, $qty]) {
        $seen += $qty;
        if ($seen * 2 >= $total) {
            return $price;
        }
    }
    return null;
}

/** Save every item's price at this tick for the ticker's sparklines; keep 8 days. */
function market_record_history(PDO $pdo, int $now): void
{
    $pdo->prepare('INSERT IGNORE INTO market_history (item_id, at, reference_value) SELECT item_id, ?, reference_value FROM market_items')
        ->execute([$now]);
    $pdo->prepare('DELETE FROM market_history WHERE at < ?')->execute([$now - 8 * 86400]);
}

/**
 * Price history per item, one point per bucket (the last price in each), oldest first.
 * Returns [item_id => [float, ...]].
 */
function market_history(PDO $pdo, int $now, int $seconds, int $buckets, ?string $itemId = null): array
{
    $from = $now - $seconds;
    $sql = 'SELECT item_id, at, reference_value FROM market_history WHERE at >= ?' . ($itemId ? ' AND item_id = ?' : '') . ' ORDER BY at';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($itemId ? [$from, $itemId] : [$from]);
    $size = max(1, intdiv($seconds, $buckets));
    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $bucket = min($buckets - 1, intdiv((int) $row['at'] - $from, $size));
        $out[$row['item_id']][$bucket] = (float) $row['reference_value'];
    }
    foreach ($out as $id => $points) {
        ksort($points);
        $out[$id] = array_map(fn($v) => round($v, 1), array_values($points));
    }
    return $out;
}

/** Ticker fields for one item: usual value, % versus usual, hot flag. */
function market_ticker(string $itemId, float $ref): array
{
    $usual = (float) (content_item($itemId)['reference_value'] ?? $ref);
    $pct = $usual > 0 ? (int) round(($ref / $usual - 1) * 100) : 0;
    return ['usual' => (int) round($usual), 'change_pct' => $pct, 'hot' => abs($pct) >= (int) econ('market.hot_percent', 15)];
}

/** Items that NPC consumers (any persona with demand) want. */
function market_consumer_items(): array
{
    $items = [];
    foreach (econ('personas', []) as $def) {
        foreach (array_keys($def['demand_per_hour'] ?? []) as $itemId) {
            $items[$itemId] = true;
        }
    }
    return $items;
}

/**
 * Update reference values.
 *  - Goods NPCs consume: scarcity sets the price. Unmet demand pushes R up; when all demand was
 *    met and a glut of player listings at or below R (more than an hour of demand) remains, it
 *    eases down. Ticks where no NPC shopped change nothing. Undercutting alone doesn't drag
 *    prices down while demand is unmet.
 *  - Everything else (raw materials): move toward the last day's player trade prices,
 *    or slowly back to base if nothing traded.
 */
function market_drift(PDO $pdo, int $now, int $elapsed, array $refs, array $stats, array $mods = []): void
{
    $hours = $elapsed / 3600;
    $priceMods = $mods['price'] ?? [];
    // Every price drifts back toward its usual value (adjusted by Guild Week and events), with a little
    // constant movement, so the ticker always has something to show and "buy the dip" works (#45).
    $revert = 1 - pow(1 - (float) econ('market.reversion_per_hour', 0.1), $hours / pace());
    $noise = (float) econ('market.noise_per_hour', 0.02) * sqrt($hours / pace());
    $min = (float) econ('market.drift_min_multiplier', 0.5);
    $max = (float) econ('market.drift_max_multiplier', 2.0);
    $up = (float) econ('market.scarcity_up_per_hour', 0.04);
    $down = (float) econ('market.surplus_down_per_hour', 0.02);
    $factor = 1 - pow(1 - (float) econ('market.drift_rate', 0.05), $hours);
    $consumerItems = market_consumer_items();
    $demandPerHour = [];
    foreach (econ('personas', []) as $def) {
        foreach ($def['demand_per_hour'] ?? [] as $itemId => $rate) {
            $demandPerHour[$itemId] = ($demandPerHour[$itemId] ?? 0) + $rate * ($stats['demand_scale'] ?? 1.0) / pace();
        }
    }

    $glut = $pdo->prepare(
        "SELECT COALESCE(SUM(quantity), 0) FROM listings
         WHERE status = 'active' AND item_id = ? AND seller_player_id IS NOT NULL AND unit_price <= ?"
    );

    foreach ($refs as $itemId => $ref) {
        $usual = (float) content_item($itemId)['reference_value'];
        $base = $usual * ($priceMods[$itemId] ?? 1.0);   // where the price wants to be right now
        $new = $ref;

        if (isset($consumerItems[$itemId])) {
            $demanded = $stats['demanded'][$itemId] ?? 0;
            $unmet = $stats['unmet'][$itemId] ?? 0;
            if ($demanded > 0 && $unmet > 0) {
                $new = $ref * (1 + $up * $hours * ($unmet / $demanded));
            } elseif ($demanded > 0) {
                // All demand was met this tick; if a glut is still left over, prices ease.
                $glut->execute([$itemId, (int) floor($ref)]);
                if ((int) $glut->fetchColumn() > ($demandPerHour[$itemId] ?? 0)) {
                    $new = $ref * (1 - $down * $hours);
                }
            }
        } else {
            $avg = market_trade_signal($pdo, $itemId, $now - 86400, $usual);
            $traded = $avg !== null;
            $target = $traded ? $avg : $base;
            $new = $ref + ($traded ? $factor : $factor * 0.25) * ($target - $ref);
        }

        $new += $revert * ($base - $new);
        $new *= 1 + rand_between(-$noise, $noise);
        $new = max($usual * $min, min($usual * $max, $new));
        $pdo->prepare('UPDATE market_items SET reference_value = ?, updated_at = ? WHERE item_id = ?')
            ->execute([round($new, 2), $now, $itemId]);
    }
}
