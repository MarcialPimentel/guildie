<?php
declare(strict_types=1);

/**
 * Everything the client needs to draw the player's screen. The server is the only source of truth.
 */
function player_state(int $playerId): array
{
    $stmt = db()->prepare('SELECT id, name, gold FROM players WHERE id = ?');
    $stmt->execute([$playerId]);
    $player = $stmt->fetch();
    if (!$player) {
        throw new ApiError('not_logged_in', 'Player not found. Please log in again.', 401);
    }

    return [
        'player' => [
            'id'   => (int) $player['id'],
            'name' => $player['name'],
            'gold' => (int) $player['gold'],
        ],
        'inventory'   => inventory_list($playerId),
        'server_time' => time(),
        'build'       => GUILDIE_BUILD,
    ];
}
