<?php
declare(strict_types=1);

/*
 * Player directory and profiles (systems.md 7.3, #31). The City tab: every player who has joined a guild,
 * ranked by Wealth (total gold) or Mastery (crafts made, until skill points arrive in M2).
 * Read-only: derived from other systems' tables, owns no data.
 */

const DIRECTORY_LIMIT = 200;

/** Crafts made and recipes discovered per player, from collected craft jobs. */
function players_craft_stats(PDO $pdo, ?int $playerId = null): array
{
    $sql = 'SELECT player_id, SUM(quantity) AS crafted, COUNT(DISTINCT recipe_id) AS recipes
            FROM craft_jobs WHERE collected_at IS NOT NULL' . ($playerId ? ' AND player_id = ?' : '') . ' GROUP BY player_id';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($playerId ? [$playerId] : []);
    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $out[(int) $row['player_id']] = ['crafted' => (int) $row['crafted'], 'recipes' => (int) $row['recipes']];
    }
    return $out;
}

/** Seconds since each player was last active (latest session use, else last login). */
function players_last_seen(PDO $pdo, ?int $playerId = null): array
{
    $sql = 'SELECT p.id, TIMESTAMPDIFF(SECOND, COALESCE(MAX(s.last_seen_at), p.last_login_at, p.created_at), UTC_TIMESTAMP()) AS ago
            FROM players p LEFT JOIN sessions s ON s.player_id = p.id'
         . ($playerId ? ' WHERE p.id = ?' : '') . ' GROUP BY p.id';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($playerId ? [$playerId] : []);
    return array_map(fn($v) => max(0, (int) $v), array_column($stmt->fetchAll(), 'ago', 'id'));
}

/** The directory, sorted by 'wealth' (gold) or 'mastery' (crafts made). */
function players_directory(int $viewerId, string $sort): array
{
    if (!in_array($sort, ['wealth', 'mastery'], true)) {
        throw new ApiError('bad_request', 'Sort must be wealth or mastery.');
    }
    $pdo = db();
    $rows = $pdo->query(
        'SELECT p.id, p.name, p.gold, pp.profession_id FROM players p JOIN player_professions pp ON pp.player_id = p.id'
    )->fetchAll();
    $crafts = players_craft_stats($pdo);
    $seen = players_last_seen($pdo);

    $players = array_map(function ($p) use ($crafts, $seen, $viewerId) {
        $id = (int) $p['id'];
        return [
            'id'          => $id,
            'name'        => $p['name'],
            'profession'  => content_profession($p['profession_id'])['name'] ?? $p['profession_id'],
            'gold'        => (int) $p['gold'],
            'crafted'     => $crafts[$id]['crafted'] ?? 0,
            'seen_ago'    => $seen[$id] ?? null,
            'me'          => $id === $viewerId,
        ];
    }, $rows);

    $key = $sort === 'wealth' ? 'gold' : 'crafted';
    usort($players, fn($a, $b) => [$b[$key], $a['name']] <=> [$a[$key], $b['name']]);
    foreach ($players as $i => &$p) {
        $p['rank'] = $i + 1;
    }
    unset($p);
    $mine = array_values(array_filter($players, fn($p) => $p['me']));
    return [
        'sort'    => $sort,
        'total'   => count($players),
        'players' => array_slice($players, 0, DIRECTORY_LIMIT),
        'me'      => $mine[0] ?? null,
    ];
}

/** One player's profile: stats, recipes discovered, and their Exchange listings (buyable). */
function player_profile(int $viewerId, int $playerId): array
{
    $pdo = db();
    $stmt = $pdo->prepare('SELECT p.id, p.name, p.gold, pp.profession_id FROM players p JOIN player_professions pp ON pp.player_id = p.id WHERE p.id = ?');
    $stmt->execute([$playerId]);
    $p = $stmt->fetch();
    if (!$p) {
        throw new ApiError('not_found', 'Player not found.', 404);
    }
    $crafts = players_craft_stats($pdo, $playerId)[$playerId] ?? ['crafted' => 0, 'recipes' => 0];
    $seen = players_last_seen($pdo, $playerId)[$playerId] ?? null;

    $stmt = $pdo->prepare(
        "SELECT id, item_id, quantity, unit_price FROM listings
         WHERE seller_player_id = ? AND status = 'active' AND expires_at > ? ORDER BY item_id, unit_price"
    );
    $stmt->execute([$playerId, game_now()]);

    return [
        'id'             => (int) $p['id'],
        'name'           => $p['name'],
        'profession'     => content_profession($p['profession_id'])['name'] ?? $p['profession_id'],
        'gold'           => (int) $p['gold'],
        'crafted'        => $crafts['crafted'],
        'recipes_known'  => $crafts['recipes'],
        'recipes_total'  => count(content_recipes_for($p['profession_id'])),
        'seen_ago'       => $seen,
        'me'             => (int) $p['id'] === $viewerId,
        'can_trade'      => (int) $p['id'] !== $viewerId && player_profession_id($pdo, $viewerId) !== null,
        'listings'       => array_map(fn($l) => [
            'id'         => (int) $l['id'],
            'item_id'    => $l['item_id'],
            'name'       => item_name($l['item_id']),
            'quantity'   => (int) $l['quantity'],
            'unit_price' => (int) $l['unit_price'],
        ], $stmt->fetchAll()),
    ];
}
