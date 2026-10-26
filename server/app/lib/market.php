<?php
declare(strict_types=1);

/*
 * Market Simulation (systems.md 6.2). Runs inside the market tick and keeps the Exchange alive:
 *   - Townsfolk and Adventurers buy finished goods and consume them (the main sink)
 *   - Traders buy anything listed cheaply (the floor) and resell some near the reference value
 *   - Guild Suppliers always offer a small stock at the ceiling, so nothing is ever unavailable
 *   - Reference values drift toward real trade prices
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
    $stats = ['expired' => 0, 'npc_bought' => [], 'unmet' => [], 'trader_bought' => [], 'consumed' => 0];

    $stats['expired'] = exchange_expire($pdo, $now);
    market_ensure_rows($pdo, $now);
    $refs = market_reference_values($pdo);

    market_consumers($pdo, $now, $elapsed, $refs, $stats);
    market_traders($pdo, $now, $refs, $stats);
    market_suppliers($pdo, $now, $refs);
    market_drift($pdo, $now, $elapsed, $refs);

    $pdo->prepare('DELETE FROM activity WHERE created_at < ?')->execute([$now - 30 * 86400]);
    return $stats;
}

/** Townsfolk and Adventurers: buy the cheapest acceptable listings, then consume the goods. */
function market_consumers(PDO $pdo, int $now, int $elapsed, array $refs, array &$stats): void
{
    $pace = pace();
    foreach (econ('personas', []) as $persona => $def) {
        foreach ($def['demand_per_hour'] ?? [] as $itemId => $perHour) {
            if (!isset($refs[$itemId])) {
                continue;
            }
            $pdo->prepare('INSERT IGNORE INTO market_demand (persona, item_id, carry) VALUES (?, ?, 0)')->execute([$persona, $itemId]);
            $stmt = $pdo->prepare('SELECT carry FROM market_demand WHERE persona = ? AND item_id = ? FOR UPDATE');
            $stmt->execute([$persona, $itemId]);
            $carry = (float) $stmt->fetchColumn() + (float) $perHour * $elapsed / 3600 / $pace;
            $units = (int) floor($carry);
            $pdo->prepare('UPDATE market_demand SET carry = ? WHERE persona = ? AND item_id = ?')
                ->execute([$carry - $units, $persona, $itemId]);

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

/** Guild Suppliers: keep a small stock of every item at the ceiling price. */
function market_suppliers(PDO $pdo, int $now, array $refs): void
{
    $ceiling = (float) econ('market.ceiling_multiplier', 1.5);
    $stockSize = (int) econ('market.ceiling_stock', 5);

    foreach ($refs as $itemId => $ref) {
        $price = max(1, (int) ceil($ref * $ceiling));
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

/** Move each reference value toward the last day's trade prices (or slowly back to base if there were none). */
function market_drift(PDO $pdo, int $now, int $elapsed, array $refs): void
{
    $rate = (float) econ('market.drift_rate', 0.05);
    $factor = 1 - pow(1 - $rate, $elapsed / 3600);
    $min = (float) econ('market.drift_min_multiplier', 0.5);
    $max = (float) econ('market.drift_max_multiplier', 2.0);

    $stmt = $pdo->prepare(
        "SELECT SUM(quantity * unit_price) / SUM(quantity) FROM trades
         WHERE item_id = ? AND created_at >= ? AND (seller_persona IS NULL OR seller_persona = 'traders')"
    );
    foreach ($refs as $itemId => $ref) {
        $base = (float) content_item($itemId)['reference_value'];
        $stmt->execute([$itemId, $now - 86400]);
        $avg = $stmt->fetchColumn();
        $target = ($avg !== null && $avg !== false) ? (float) $avg : $base;
        $step = ($avg !== null && $avg !== false) ? $factor : $factor * 0.25;
        $new = max($base * $min, min($base * $max, $ref + $step * ($target - $ref)));
        $pdo->prepare('UPDATE market_items SET reference_value = ?, updated_at = ? WHERE item_id = ?')
            ->execute([round($new, 2), $now, $itemId]);
    }
}
