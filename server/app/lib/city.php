<?php
declare(strict_types=1);

/*
 * The living city (0.9.0, docs/living-city.md): the presence pass for the realtime rooms, city preferences
 * (slaps on/off, your look), friends, and the guild quarters (stalls and echoes). Presence is cosmetic (systems.md 7.5):
 * nothing here changes gold or items. Owns: friends, city_prefs.
 */

const CITY_STALLS = 12;              // bottegas around a piazza
const CITY_ECHO_SECONDS = 1800;      // crafters who acted in the last 30 minutes show as echoes
const CITY_TOKEN_SECONDS = 600;      // a presence pass lasts 10 minutes
const FRIENDS_MAX = 50;
const CITY_LOOKS = 6;                // body colors (client/src/world/blobs.ts BODY_COLORS)
const CITY_PALAZZO = 'palazzo';      // the shared square with the city hall (0.11.0): a room like a quarter, open to every guild

/** The quarters: one per guild in content/professions.json. */
function city_quarters(): array
{
    return array_keys(content_professions());
}

/**
 * How many hats a guild has (its guild.hats names in content/professions.json; the client draws one per name).
 * With no guild: the most any guild has, for checking a request before the guild is known.
 */
function city_hat_count(?string $professionId): int
{
    if ($professionId !== null && ($p = content_profession($professionId)) !== null) {
        return max(1, count($p['guild']['hats'] ?? []));
    }
    $most = 1;
    foreach (content_professions() as $p) {
        $most = max($most, count($p['guild']['hats'] ?? []));
    }
    return $most;
}

/** The look a player has before choosing one: a body color picked from their id (the 0.9.0 look). */
function city_look(int $playerId): int
{
    return $playerId % CITY_LOOKS;
}

/**
 * Looks of several players (0.10.0, migration 008): [id => ['color', 'hat', 'chosen', 'rank']].
 * Players who never chose keep the 0.9.0 look. rank is 0 (Apprentice) .. 3 (Master), from their skill.
 */
function city_looks(PDO $pdo, array $playerIds): array
{
    if (!$playerIds) {
        return [];
    }
    $in = implode(',', array_fill(0, count($playerIds), '?'));
    $stmt = $pdo->prepare(
        "SELECT p.id, cp.look_color, cp.look_hat, pp.skill, pp.profession_id FROM players p
         LEFT JOIN city_prefs cp ON cp.player_id = p.id
         LEFT JOIN player_professions pp ON pp.player_id = p.id
         WHERE p.id IN ($in)"
    );
    $stmt->execute(array_values($playerIds));
    $out = [];
    foreach ($stmt->fetchAll() as $r) {
        $id = (int) $r['id'];
        $chosen = $r['look_color'] !== null;
        $out[$id] = [
            'color'  => $chosen ? ((int) $r['look_color']) % CITY_LOOKS : city_look($id),
            'hat'    => $r['look_hat'] !== null ? ((int) $r['look_hat']) % city_hat_count($r['profession_id']) : 0,
            'chosen' => $chosen,
            'rank'   => $r['skill'] !== null ? progression_rank_index((int) $r['skill']) : 0,
        ];
    }
    return $out;
}

/** Check a look sent by the client: a body color 0-5 and one of the guild's hats. */
function city_check_look(int $color, int $hat, ?string $professionId): void
{
    $hats = city_hat_count($professionId);
    if ($color < 0 || $color >= CITY_LOOKS || $hat < 0 || $hat >= $hats) {
        throw new ApiError('bad_request', sprintf('Pick a body color from 0 to %d and a hat from 0 to %d.', CITY_LOOKS - 1, $hats - 1));
    }
}

/** Save a look inside a transaction that's already open (also used when joining a guild). */
function city_save_look(PDO $pdo, int $playerId, int $color, int $hat): void
{
    city_check_look($color, $hat, player_profession_id($pdo, $playerId));
    $pdo->prepare('INSERT INTO city_prefs (player_id, slaps, look_color, look_hat, updated_at) VALUES (?, 1, ?, ?, ?)
                   ON DUPLICATE KEY UPDATE look_color = VALUES(look_color), look_hat = VALUES(look_hat), updated_at = VALUES(updated_at)')
        ->execute([$playerId, $color, $hat, game_now()]);
}

/** Choose your look (the "Your look" sheet in the 3D city). Cosmetic: nothing else changes. */
function city_set_look(int $playerId, int $color, int $hat): array
{
    city_check_look($color, $hat, player_profession_id(db(), $playerId));
    tx(function (PDO $pdo) use ($playerId, $color, $hat) {
        city_save_look($pdo, $playerId, $color, $hat);
    });
    return city_looks(db(), [$playerId])[$playerId];
}

function city_slaps_on(PDO $pdo, int $playerId): bool
{
    $stmt = $pdo->prepare('SELECT slaps FROM city_prefs WHERE player_id = ?');
    $stmt->execute([$playerId]);
    $v = $stmt->fetchColumn();
    return $v === false ? true : (int) $v === 1;
}

/** Turn slaps on or off. */
function city_set_prefs(int $playerId, bool $slaps): array
{
    tx(function (PDO $pdo) use ($playerId, $slaps) {
        $pdo->prepare('INSERT INTO city_prefs (player_id, slaps, updated_at) VALUES (?, ?, ?)
                       ON DUPLICATE KEY UPDATE slaps = VALUES(slaps), updated_at = VALUES(updated_at)')
            ->execute([$playerId, $slaps ? 1 : 0, game_now()]);
    });
    return ['slaps' => $slaps];
}

function b64url(string $raw): string
{
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

/**
 * A short-lived signed pass for the realtime rooms (realtime/room.js verifies it). The room takes the
 * player's identity from the pass, never from the client. No realtime_url in config = presence is off.
 */
function city_presence_token(int $playerId): array
{
    $pdo = db();
    $stmt = $pdo->prepare('SELECT p.id, p.name, pp.profession_id FROM players p JOIN player_professions pp ON pp.player_id = p.id WHERE p.id = ?');
    $stmt->execute([$playerId]);
    $p = $stmt->fetch();
    if (!$p) {
        throw new ApiError('no_profession', 'Join a guild first.', 409);
    }
    $look = city_looks($pdo, [$playerId])[$playerId];
    $me = [
        'id'          => (int) $p['id'],
        'name'        => $p['name'],
        'profession'  => $p['profession_id'],
        'look'        => $look['color'],
        'hat'         => $look['hat'],
        'rank'        => $look['rank'],
        'look_chosen' => $look['chosen'],
        'slaps'       => city_slaps_on($pdo, $playerId),
    ];
    $url = (string) config('realtime_url', '');
    $secret = (string) config('realtime_secret', '');
    if ($url === '' || strlen($secret) < 16) {
        return ['enabled' => false, 'me' => $me];
    }
    $exp = time() + CITY_TOKEN_SECONDS;   // real time, not game time: the room checks it against its own clock
    $payload = b64url(json_encode([
        'pid' => $me['id'], 'n' => $me['name'], 'p' => $me['profession'], 'l' => $me['look'], 'ht' => $me['hat'], 'r' => $me['rank'],
        's' => $me['slaps'] ? 1 : 0, 'exp' => $exp,
        'q' => [...city_quarters(), CITY_PALAZZO],   // the rooms a pass may open: one per guild, plus the Palazzo
    ], JSON_UNESCAPED_UNICODE));
    $sig = b64url(hash_hmac('sha256', $payload, $secret, true));
    return ['enabled' => true, 'url' => $url, 'token' => "$payload.$sig", 'expires_in' => CITY_TOKEN_SECONDS, 'me' => $me];
}

// ---------------------------------------------------------------- friends

function friends_ids(PDO $pdo, int $playerId): array
{
    $stmt = $pdo->prepare('SELECT friend_id FROM friends WHERE player_id = ? ORDER BY created_at');
    $stmt->execute([$playerId]);
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function friends_add(int $playerId, int $friendId): void
{
    if ($friendId === $playerId) {
        throw new ApiError('bad_request', "You can't add yourself as a friend.");
    }
    tx(function (PDO $pdo) use ($playerId, $friendId) {
        gold_get($pdo, $playerId, true);   // one change at a time per player (keeps the limit exact)
        $stmt = $pdo->prepare('SELECT p.name FROM players p JOIN player_professions pp ON pp.player_id = p.id WHERE p.id = ?');
        $stmt->execute([$friendId]);
        $name = $stmt->fetchColumn();
        if ($name === false) {
            throw new ApiError('not_found', 'Player not found.', 404);
        }
        if (in_array($friendId, friends_ids($pdo, $playerId), true)) {
            return;
        }
        if (count(friends_ids($pdo, $playerId)) >= FRIENDS_MAX) {
            throw new ApiError('too_many_friends', sprintf('You can have up to %d friends. Remove one first.', FRIENDS_MAX), 409);
        }
        $pdo->prepare('INSERT IGNORE INTO friends (player_id, friend_id, created_at) VALUES (?, ?, ?)')
            ->execute([$playerId, $friendId, game_now()]);
    });
}

function friends_remove(int $playerId, int $friendId): void
{
    tx(function (PDO $pdo) use ($playerId, $friendId) {
        $pdo->prepare('DELETE FROM friends WHERE player_id = ? AND friend_id = ?')->execute([$playerId, $friendId]);
    });
}

/** The Friends list: each friend's guild, last seen and stall. */
function friends_list(int $playerId): array
{
    $pdo = db();
    $ids = friends_ids($pdo, $playerId);
    return ['friends' => array_values(city_stalls($pdo, $playerId, $ids, $ids))];
}

// ---------------------------------------------------------------- quarters, stalls and echoes

/** Active listings for several sellers: [seller id => [listing, ...]] (cheapest first, at most 4 each). */
function city_listings(PDO $pdo, array $playerIds): array
{
    if (!$playerIds) {
        return [];
    }
    $in = implode(',', array_fill(0, count($playerIds), '?'));
    $stmt = $pdo->prepare(
        "SELECT seller_player_id, id, item_id, quantity, unit_price FROM listings
         WHERE seller_player_id IN ($in) AND status = 'active' AND expires_at > ? ORDER BY item_id, unit_price"
    );
    $stmt->execute([...$playerIds, game_now()]);
    $out = [];
    foreach ($stmt->fetchAll() as $l) {
        $out[(int) $l['seller_player_id']][] = [
            'id' => (int) $l['id'], 'item_id' => $l['item_id'], 'name' => item_name($l['item_id']),
            'quantity' => (int) $l['quantity'], 'unit_price' => (int) $l['unit_price'],
        ];
    }
    return $out;
}

/** "listed 3 Iron Ingots": what a crafter did, told to other players (the activity text is second person). */
function city_echo_text(string $type, array $p): ?string
{
    $n = (int) ($p['quantity'] ?? 0);
    $item = item_name((string) ($p['item_id'] ?? ''));
    return match ($type) {
        'crafted'      => "crafted $n $item",
        'craft_started' => "is crafting $n $item",
        'listed'       => "listed $n $item",
        'sold'         => "sold $n $item",
        'gathered'     => 'brought in fresh materials',
        'order_filled' => 'filled an order for ' . ($p['customer'] ?? 'a customer'),
        'duke_contributed' => "gave $n $item to the Duke",
        default        => null,
    };
}

/** Latest public deed of each player in the last 30 minutes: [player id => ['text', 'ago']]. */
function city_echoes(PDO $pdo, array $playerIds): array
{
    if (!$playerIds) {
        return [];
    }
    $now = game_now();
    $in = implode(',', array_fill(0, count($playerIds), '?'));
    $stmt = $pdo->prepare(
        "SELECT player_id, type, payload, created_at FROM activity
         WHERE player_id IN ($in) AND created_at >= ? ORDER BY id DESC LIMIT 400"
    );
    $stmt->execute([...$playerIds, $now - CITY_ECHO_SECONDS]);
    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $pid = (int) $row['player_id'];
        if (isset($out[$pid])) {
            continue;
        }
        $text = city_echo_text($row['type'], json_decode($row['payload'], true) ?: []);
        if ($text !== null) {
            $out[$pid] = ['text' => $text, 'ago' => max(0, $now - (int) $row['created_at'])];
        }
    }
    return $out;
}

/** Stall cards for these players, in this order. */
function city_stalls(PDO $pdo, int $viewerId, array $playerIds, array $friendIds): array
{
    if (!$playerIds) {
        return [];
    }
    $in = implode(',', array_fill(0, count($playerIds), '?'));
    $stmt = $pdo->prepare("SELECT p.id, p.name, pp.profession_id, pp.workshop_level FROM players p JOIN player_professions pp ON pp.player_id = p.id WHERE p.id IN ($in)");
    $stmt->execute($playerIds);
    $rows = array_column($stmt->fetchAll(), null, 'id');
    $listings = city_listings($pdo, $playerIds);
    $looks = city_looks($pdo, $playerIds);
    $echoes = city_echoes($pdo, $playerIds);
    $seen = players_last_seen($pdo);
    $out = [];
    foreach ($playerIds as $id) {
        if (!isset($rows[$id])) {
            continue;
        }
        $r = $rows[$id];
        $out[] = [
            'id'            => $id,
            'name'          => $r['name'],
            'profession_id' => $r['profession_id'],
            'profession'    => content_profession($r['profession_id'])['name'] ?? $r['profession_id'],
            'look'          => $looks[$id]['color'] ?? city_look($id),
            'hat'           => $looks[$id]['hat'] ?? 0,
            'rank'          => $looks[$id]['rank'] ?? 0,
            'level'         => max(1, (int) $r['workshop_level']),
            'me'            => $id === $viewerId,
            'friend'        => in_array($id, $friendIds, true),
            'seen_ago'      => $seen[$id] ?? null,
            'listing_count' => count($listings[$id] ?? []),
            'listings'      => array_slice($listings[$id] ?? [], 0, 4),
            'echo'          => $echoes[$id] ?? null,
        ];
    }
    return $out;
}

/**
 * One guild quarter: up to 12 stalls, friends first (from any guild), then this guild's crafters
 * by who was seen most recently. You get a stall in your own guild's quarter.
 */
function city_quarter(int $viewerId, string $quarter): array
{
    if (!in_array($quarter, city_quarters(), true)) {
        throw new ApiError('bad_request', 'Quarter must be one of: ' . implode(', ', city_quarters()) . '.');
    }
    $pdo = db();
    $friendIds = friends_ids($pdo, $viewerId);
    $stmt = $pdo->prepare('SELECT player_id FROM player_professions WHERE profession_id = ?');
    $stmt->execute([$quarter]);
    $guild = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    $seen = players_last_seen($pdo);
    usort($guild, fn($a, $b) => ($seen[$a] ?? PHP_INT_MAX) <=> ($seen[$b] ?? PHP_INT_MAX) ?: $a <=> $b);

    $ids = [];
    foreach ($friendIds as $id) {
        $ids[] = $id;
    }
    if (in_array($viewerId, $guild, true) && !in_array($viewerId, $ids, true)) {
        $ids[] = $viewerId;
    }
    foreach ($guild as $id) {
        if (count($ids) >= CITY_STALLS) {
            break;
        }
        if (!in_array($id, $ids, true)) {
            $ids[] = $id;
        }
    }
    $ids = array_slice($ids, 0, CITY_STALLS);
    $def = content_profession($quarter);
    return [
        'quarter'  => $quarter,
        'name'     => city_quarter_name($quarter),
        'guild'    => $def['name'] ?? $quarter,
        'crafters' => count($guild),
        'stalls'   => city_stalls($pdo, $viewerId, $ids, $friendIds),
    ];
}

function city_quarter_name(string $quarter): string
{
    $g = content_profession($quarter)['guild'] ?? null;   // content/professions.json
    return $g ? sprintf('%s quarter · %s', $g['quarter'], $g['piazza']) : $quarter;
}
