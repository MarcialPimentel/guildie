<?php
declare(strict_types=1);

const QUALITY_COMMON = 1;
const QUALITY_FINE = 2;
const QUALITY_MASTERWORK = 3;

/**
 * Add items to a player's inventory. Must be called inside tx() by the action that causes it.
 */
function inventory_add(PDO $pdo, int $playerId, string $itemId, int $quantity, int $quality = QUALITY_COMMON): void
{
    if (content_item($itemId) === null) {
        throw new ApiError('unknown_item', "Unknown item: $itemId");
    }
    if ($quantity <= 0) {
        throw new ApiError('bad_request', 'Quantity must be positive.');
    }
    $stmt = $pdo->prepare(
        'INSERT INTO inventory (player_id, item_id, quality, quantity) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = quantity + ?'
    );
    $stmt->execute([$playerId, $itemId, $quality, $quantity, $quantity]);
}

/** A player's inventory as a list, with display names from content. */
function inventory_list(int $playerId): array
{
    $stmt = db()->prepare('SELECT item_id, quality, quantity FROM inventory WHERE player_id = ? AND quantity > 0 ORDER BY item_id, quality');
    $stmt->execute([$playerId]);

    $items = [];
    foreach ($stmt->fetchAll() as $row) {
        $def = content_item($row['item_id']);
        $items[] = [
            'item_id'  => $row['item_id'],
            'name'     => $def['name'] ?? $row['item_id'],
            'quality'  => (int) $row['quality'],
            'quantity' => (int) $row['quantity'],
        ];
    }
    return $items;
}
