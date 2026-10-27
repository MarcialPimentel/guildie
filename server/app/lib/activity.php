<?php
declare(strict_types=1);

/*
 * Activity Log (systems.md 4.5). Append-only record of what happened, written in the same
 * transaction as the action that caused it. The client shows the text; M2 builds the
 * "While you were away" screen on top of it.
 */

function activity_log(PDO $pdo, ?int $playerId, string $type, array $payload): void
{
    $pdo->prepare('INSERT INTO activity (player_id, type, payload, created_at) VALUES (?, ?, ?, ?)')
        ->execute([$playerId, $type, json_encode($payload, JSON_UNESCAPED_UNICODE), game_now()]);
}

/** Recent activity for a player, newest first, with display text. */
function activity_list(int $playerId, int $limit = 30, int $since = 0): array
{
    $stmt = db()->prepare(
        'SELECT id, type, payload, created_at FROM activity
         WHERE player_id = ? AND created_at >= ? ORDER BY id DESC LIMIT ' . max(1, min(100, $limit))
    );
    $stmt->execute([$playerId, $since]);

    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $payload = json_decode($row['payload'], true) ?: [];
        $rows[] = [
            'id'         => (int) $row['id'],
            'type'       => $row['type'],
            'text'       => activity_text($row['type'], $payload),
            'created_at' => (int) $row['created_at'],
        ];
    }
    return $rows;
}

/** " Deposit 2g." or " Deposit waived." after a cancelled or expired listing. */
function deposit_note(array $p): string
{
    if ((int) ($p['deposit'] ?? 0) > 0) {
        return sprintf(' Deposit %dg.', (int) $p['deposit']);
    }
    return (int) ($p['waived'] ?? 0) > 0 ? ' Deposit waived.' : '';
}

function activity_text(string $type, array $p): string
{
    $n = fn($key) => (int) ($p[$key] ?? 0);
    $item = fn() => item_name((string) ($p['item_id'] ?? ''));
    return match ($type) {
        'profession_chosen' => sprintf('You joined the %s guild.', $p['profession_name'] ?? ''),
        'gathered'          => 'Collected ' . implode(', ', array_map(
                                   fn($i) => $i['quantity'] . ' ' . item_name($i['item_id']), $p['items'] ?? [])) . '.',
        'craft_started'     => sprintf('Started crafting %d %s.', $n('quantity'), $item()),
        'crafted'           => sprintf('Crafted %d %s.', $n('quantity'), $item()),
        'listed'            => sprintf('Listed %d %s at %dg each (deposit %dg, taken from the sale).', $n('quantity'), $item(), $n('unit_price'), $n('deposit')),
        'sold'              => sprintf('Sold %d %s to %s for %dg (after %dg cut%s).', $n('quantity'), $item(), $p['buyer'] ?? 'someone', $n('earned'), $n('cut'),
                                   $n('deposit') > 0 ? sprintf(' and %dg deposit', $n('deposit')) : ''),
        'sold_to_guild'     => sprintf('Sold %d %s to the guild for %dg.', $n('quantity'), $item(), $n('earned')),
        'bought'            => sprintf('Bought %d %s from %s for %dg.', $n('quantity'), $item(), $p['seller'] ?? 'someone', $n('total')),
        'listing_cancelled' => sprintf('Cancelled your listing: %d %s returned.', $n('quantity'), $item()) . deposit_note($p),
        'listing_expired'   => sprintf('Your listing expired: %d %s returned.', $n('quantity'), $item()) . deposit_note($p),
        default             => $type,
    };
}
