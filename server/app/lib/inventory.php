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

function inventory_add(PDO $pdo, int $playerId, string $itemId, int $quantity, int $quality = QUALITY_COMMON): void
{
    if (content_item($itemId) === null) {
        throw new ApiError('unknown_item', "Unknown item: $itemId");
    }
    if ($quantity <= 0) {
        throw new ApiError('bad_request', 'Quantity must be positive.');
    }
    $pdo->prepare(
        'INSERT INTO inventory (player_id, item_id, quality, quantity) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)'
    )->execute([$playerId, $itemId, $quality, $quantity]);
}

/** How many of an item a player has. Pass $lock = true inside a transaction before removing. */
function inventory_count(PDO $pdo, int $playerId, string $itemId, int $quality = QUALITY_COMMON, bool $lock = false): int
{
    $stmt = $pdo->prepare(
        'SELECT quantity FROM inventory WHERE player_id = ? AND item_id = ? AND quality = ?' . ($lock ? ' FOR UPDATE' : '')
    );
    $stmt->execute([$playerId, $itemId, $quality]);
    return (int) ($stmt->fetchColumn() ?: 0);
}

/** Remove items, or throw if the player doesn't have enough. */
function inventory_remove(PDO $pdo, int $playerId, string $itemId, int $quantity, int $quality = QUALITY_COMMON): void
{
    if ($quantity <= 0) {
        throw new ApiError('bad_request', 'Quantity must be positive.');
    }
    $have = inventory_count($pdo, $playerId, $itemId, $quality, true);
    if ($have < $quantity) {
        throw new ApiError('not_enough_items', sprintf('You need %d %s but have %d.', $quantity, item_name($itemId), $have));
    }
    if ($have === $quantity) {
        $pdo->prepare('DELETE FROM inventory WHERE player_id = ? AND item_id = ? AND quality = ?')
            ->execute([$playerId, $itemId, $quality]);
    } else {
        $pdo->prepare('UPDATE inventory SET quantity = quantity - ? WHERE player_id = ? AND item_id = ? AND quality = ?')
            ->execute([$quantity, $playerId, $itemId, $quality]);
    }
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
            'reference' => (int) round($refs[$row['item_id']] ?? ($def['reference_value'] ?? 0)),
        ];
    }
    usort($items, fn($a, $b) => ($order[$a['item_id']] ?? 999) <=> ($order[$b['item_id']] ?? 999));
    return $items;
}
