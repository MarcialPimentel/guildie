<?php
declare(strict_types=1);

/*
 * Inventory & Wallet (systems.md 4.4). The only code that changes inventory rows or gold.
 * Every function must be called inside the calling action's transaction.
 */

/** Money as players read it: "1 ducat", "1,250 ducats" (0.6.0). The database and API still call it gold. */
function ducats(int $n): string
{
    return number_format($n) . ($n === 1 ? ' ducat' : ' ducats');
}

const QUALITY_COMMON = 1;
const QUALITY_FINE = 2;
const QUALITY_MASTERWORK = 3;

/*
 * Quality tiers (0.18.0, #79, GDD 5.2). Inventory rows are kept per quality. Quality never blocks a player:
 * counting and removing without a quality covers every tier, lowest first, so Fine goods still fill a recipe
 * or an order. Only selling picks a quality, because the price depends on it.
 */

function quality_valid(int $quality): bool
{
    return $quality >= QUALITY_COMMON && $quality <= QUALITY_MASTERWORK;
}

function quality_name(int $quality): string
{
    return (string) (econ('quality.names', ['Common', 'Fine', 'Masterwork'])[$quality - 1] ?? 'Common');
}

/** What quality does to an item's value: Fine 1.5x, Masterwork 2.5x [tune]. */
function quality_multiplier(int $quality): float
{
    return (float) (econ('quality.value_multiplier', [1.0, 1.5, 2.5])[$quality - 1] ?? 1.0);
}

/** "Fine Iron Sword", or just "Iron Sword" for Common goods. */
function item_name_q(string $itemId, int $quality): string
{
    return $quality > QUALITY_COMMON ? quality_name($quality) . ' ' . item_name($itemId) : item_name($itemId);
}

function inventory_add(PDO $pdo, int $playerId, string $itemId, int $quantity, int $quality = QUALITY_COMMON): void
{
    if (content_item($itemId) === null) {
        throw new ApiError('unknown_item', "Unknown item: $itemId");
    }
    if ($quantity <= 0) {
        throw new ApiError('bad_request', 'Quantity must be positive.');
    }
    if (!quality_valid($quality)) {
        throw new ApiError('bad_request', 'Unknown quality.');
    }
    $pdo->prepare(
        'INSERT INTO inventory (player_id, item_id, quality, quantity) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)'
    )->execute([$playerId, $itemId, $quality, $quantity]);
}

/** Add items that came out of inventory_remove() (quality => quantity), keeping their quality. */
function inventory_add_each(PDO $pdo, int $playerId, string $itemId, array $byQuality): void
{
    foreach ($byQuality as $quality => $quantity) {
        if ((int) $quantity > 0) {
            inventory_add($pdo, $playerId, $itemId, (int) $quantity, (int) $quality);
        }
    }
}

/** Each quality's quantity of an item (quality => quantity, lowest quality first). */
function inventory_by_quality(PDO $pdo, int $playerId, string $itemId, bool $lock = false): array
{
    $stmt = $pdo->prepare(
        'SELECT quality, quantity FROM inventory WHERE player_id = ? AND item_id = ? AND quantity > 0 ORDER BY quality'
        . ($lock ? ' FOR UPDATE' : '')
    );
    $stmt->execute([$playerId, $itemId]);
    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $out[(int) $row['quality']] = (int) $row['quantity'];
    }
    return $out;
}

/**
 * How many of an item a player has: of one quality, or of every quality when $quality is null.
 * Pass $lock = true inside a transaction before removing.
 */
function inventory_count(PDO $pdo, int $playerId, string $itemId, ?int $quality = null, bool $lock = false): int
{
    $rows = inventory_by_quality($pdo, $playerId, $itemId, $lock);
    return $quality === null ? array_sum($rows) : ($rows[$quality] ?? 0);
}

/**
 * Remove items, or throw if the player doesn't have enough. With no quality, any quality counts and the lowest
 * goes first (0.18.0). Returns what was taken (quality => quantity), so a transfer can keep the quality.
 */
function inventory_remove(PDO $pdo, int $playerId, string $itemId, int $quantity, ?int $quality = null): array
{
    if ($quantity <= 0) {
        throw new ApiError('bad_request', 'Quantity must be positive.');
    }
    $rows = inventory_by_quality($pdo, $playerId, $itemId, true);
    if ($quality !== null) {
        $rows = isset($rows[$quality]) ? [$quality => $rows[$quality]] : [];
    }
    $have = array_sum($rows);
    if ($have < $quantity) {
        $what = $quality !== null && $quality > QUALITY_COMMON ? item_name_q($itemId, $quality) : item_name($itemId);
        throw new ApiError('not_enough_items', sprintf('You need %d %s but have %d.', $quantity, $what, $have));
    }
    $taken = [];
    $left = $quantity;
    foreach ($rows as $q => $n) {
        if ($left <= 0) {
            break;
        }
        $take = min($n, $left);
        if ($take === $n) {
            $pdo->prepare('DELETE FROM inventory WHERE player_id = ? AND item_id = ? AND quality = ?')
                ->execute([$playerId, $itemId, $q]);
        } else {
            $pdo->prepare('UPDATE inventory SET quantity = quantity - ? WHERE player_id = ? AND item_id = ? AND quality = ?')
                ->execute([$take, $playerId, $itemId, $q]);
        }
        $taken[$q] = $take;
        $left -= $take;
    }
    return $taken;
}

function gold_get(PDO $pdo, int $playerId, bool $lock = false): int
{
    $stmt = $pdo->prepare('SELECT gold FROM players WHERE id = ?' . ($lock ? ' FOR UPDATE' : ''));
    $stmt->execute([$playerId]);
    return (int) $stmt->fetchColumn();
}

function gold_add(PDO $pdo, int $playerId, int $amount): void
{
    if ($amount > 0) {
        $pdo->prepare('UPDATE players SET gold = gold + ? WHERE id = ?')->execute([$amount, $playerId]);
    }
}

/** Spend gold, or throw if the player can't afford it. */
function gold_spend(PDO $pdo, int $playerId, int $amount, string $what = 'that'): void
{
    if ($amount <= 0) {
        return;
    }
    $have = gold_get($pdo, $playerId, true);
    if ($have < $amount) {
        throw new ApiError('not_enough_gold', sprintf('%s costs %s; you have %s.', ucfirst($what), ducats($amount), ducats($have)));
    }
    $pdo->prepare('UPDATE players SET gold = gold - ? WHERE id = ?')->execute([$amount, $playerId]);
}

/** A player's inventory as a list, with names and current reference values. */
function inventory_list(int $playerId): array
{
    $stmt = db()->prepare('SELECT item_id, quality, quantity FROM inventory WHERE player_id = ? AND quantity > 0');
    $stmt->execute([$playerId]);
    $refs = market_reference_values();
    $order = array_flip(array_keys(content_items()));

    $items = [];
    foreach ($stmt->fetchAll() as $row) {
        $def = content_item($row['item_id']);
        $items[] = [
            'item_id'   => $row['item_id'],
            'name'      => $def['name'] ?? $row['item_id'],
            'type'      => $def['type'] ?? '',
            'quality'   => (int) $row['quality'],
            'quantity'  => (int) $row['quantity'],
            // today's value of one unit at this quality (0.18.0)
            'reference' => (int) round(($refs[$row['item_id']] ?? ($def['reference_value'] ?? 0)) * quality_multiplier((int) $row['quality'])),
        ];
    }
    usort($items, fn($a, $b) => [$order[$a['item_id']] ?? 999, $a['quality']] <=> [$order[$b['item_id']] ?? 999, $b['quality']]);
    return $items;
}
