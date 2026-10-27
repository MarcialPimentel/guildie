<?php
declare(strict_types=1);

/**
 * Everything the client needs to draw the player's main screens. The server is the only source of truth.
 */
function player_state(int $playerId): array
{
    $pdo = db();
    $stmt = $pdo->prepare('SELECT id, name, gold FROM players WHERE id = ?');
    $stmt->execute([$playerId]);
    $player = $stmt->fetch();
    if (!$player) {
        throw new ApiError('not_logged_in', 'Player not found. Please log in again.', 401);
    }

    $professionId = player_profession_id($pdo, $playerId);
    $profession = null;
    if ($professionId !== null) {
        $def = content_profession($professionId);
        $profession = [
            'id'      => $professionId,
            'name'    => $def['name'],
            'tagline' => $def['tagline'],
            'station' => gathering_status($playerId, $professionId),
            'recipes' => crafting_recipes($playerId, $professionId),
        ];
    }

    $stmt = $pdo->prepare("SELECT COUNT(*) FROM listings WHERE seller_player_id = ? AND status = 'active'");
    $stmt->execute([$playerId]);

    return [
        'player' => [
            'id'   => (int) $player['id'],
            'name' => $player['name'],
            'gold' => (int) $player['gold'],
        ],
        'profession'      => $profession,
        'inventory'       => inventory_list($playerId),
        'crafts'          => $profession ? crafting_jobs($playerId) : [],
        'craft_slots'     => (int) econ('crafting.slots', 1),
        'max_batch'       => (int) econ('crafting.max_batch', 10),
        'active_listings' => (int) $stmt->fetchColumn(),
        'incoming_offers' => offers_incoming_count($playerId),
        'activity'        => activity_list($playerId, 15),
        'server_time'     => game_now(),
        'build'           => GUILDIE_BUILD,
    ];
}
