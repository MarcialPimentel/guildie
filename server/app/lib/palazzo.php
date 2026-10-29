<?php
declare(strict_types=1);

/*
 * The Palazzo (0.11.0, docs/palazzo.md): the city hall on the shared square where all three guilds meet.
 *   - The Hall of honor: Il Factotum, the richest, the most skilled, the Duke's best helpers and the finest
 *     bottegas (derived views; no data of its own).
 *   - Three officials (content/palazzo.json): each tells a rumor built from real game data, gives one small
 *     favor per player per day, and has a few lines. Owns: npc_favors.
 * The Duke's order and the Wanted board also live here (duke.php, wanted.php).
 */

function palazzo_settings(): array
{
    return econ('palazzo', []) + ['favor_target_value' => 60, 'favor_reward_multiplier' => 1.2, 'honor_size' => 5];
}

/** The officials, by id. */
function palazzo_npcs(): array
{
    $out = [];
    foreach (content_file('palazzo.json')['npcs'] ?? [] as $n) {
        $out[$n['id']] = $n;
    }
    return $out;
}

function palazzo_npc_def(string $npcId): array
{
    $n = palazzo_npcs()[$npcId] ?? null;
    if ($n === null) {
        throw new ApiError('bad_request', 'Nobody by that name works at the Palazzo.');
    }
    return $n;
}

// ---------------------------------------------------------------- the Hall of honor

/** The boards: Il Factotum, richest, most skilled, the Duke's best helpers and the finest bottegas. */
function palazzo_honors(int $viewerId): array
{
    $pdo = db();
    $n = max(1, (int) palazzo_settings()['honor_size']);
    $row = fn(array $r, string $value) => [
        'id' => (int) $r['id'], 'name' => $r['name'], 'profession' => content_profession($r['profession_id'])['name'] ?? '',
        'value' => $value, 'me' => (int) $r['id'] === $viewerId,
    ];

    $gold = $pdo->query("SELECT p.id, p.name, p.gold, pp.profession_id FROM players p JOIN player_professions pp ON pp.player_id = p.id
                         WHERE p.gold > 0 ORDER BY p.gold DESC, p.name ASC LIMIT $n")->fetchAll();
    $skill = $pdo->query("SELECT p.id, p.name, pp.skill, pp.profession_id FROM players p JOIN player_professions pp ON pp.player_id = p.id
                          ORDER BY pp.skill DESC, p.name ASC LIMIT $n")->fetchAll();
    $duke = $pdo->query("SELECT p.id, p.name, pp.profession_id, SUM(dc.paid + dc.bonus) AS v FROM duke_contributions dc
                         JOIN players p ON p.id = dc.player_id JOIN player_professions pp ON pp.player_id = p.id
                         GROUP BY p.id, p.name, pp.profession_id ORDER BY v DESC, p.name ASC LIMIT $n")->fetchAll();
    $bottegas = $pdo->query("SELECT p.id, p.name, pp.profession_id, pp.workshop_level FROM players p JOIN player_professions pp ON pp.player_id = p.id
                             WHERE pp.workshop_level > 1 ORDER BY pp.workshop_level DESC, pp.skill DESC, p.name ASC LIMIT $n")->fetchAll();

    $factotum = $gold[0] ?? null;
    $fRow = null;
    if ($factotum) {
        // The Factotum's merchant (0.13.0): the statue in the middle of the Palazzo and the portrait over the door.
        $look = city_looks($pdo, [(int) $factotum['id']])[(int) $factotum['id']] ?? null;
        $fRow = $row($factotum, ducats((int) $factotum['gold'])) + ['look' => $look ? [
            'profession_id' => $factotum['profession_id'], 'color' => $look['color'], 'hat' => $look['hat'], 'rank' => $look['rank'],
        ] : null];
    }
    return [
        'title'    => city_top_title(),
        'factotum' => $fRow,
        'boards'   => [
            ['id' => 'gold', 'title' => 'The richest', 'rows' => array_map(fn($r) => $row($r, ducats((int) $r['gold'])), $gold)],
            ['id' => 'skill', 'title' => 'The most skilled', 'rows' => array_map(fn($r) => $row($r, sprintf('%s %d · %s',
                content_profession($r['profession_id'])['name'] ?? '', (int) $r['skill'], progression_rank((int) $r['skill'])['name'])), $skill)],
            ['id' => 'duke', 'title' => "The Duke's best helpers", 'rows' => array_map(fn($r) => $row($r, ducats((int) $r['v']) . ' delivered'), $duke)],
            ['id' => 'bottegas', 'title' => 'The finest bottegas', 'rows' => array_map(fn($r) => $row($r,
                workshop_upgrade_def($r['profession_id'], (int) $r['workshop_level'])['name'] ?? workshop_level_def((int) $r['workshop_level'])['name']), $bottegas)],
        ],
    ];
}

// ---------------------------------------------------------------- rumors (real game data, said in character)

/** The notary: the counting house's view of the biggest price moves right now. */
function palazzo_rumor_market(): string
{
    $moves = [];
    foreach (market_reference_values() as $itemId => $ref) {
        $t = market_ticker($itemId, $ref);
        if ($t['change_pct'] !== 0) {
            $moves[] = [$itemId, $t['change_pct']];
        }
    }
    usort($moves, fn($a, $b) => abs($b[1]) <=> abs($a[1]));
    if (!$moves) {
        return 'The counting house is dull today: every price sits at its usual.';
    }
    $parts = array_map(fn($m) => sprintf('%s %s%d%%', item_name($m[0]), $m[1] > 0 ? '+' : '', $m[1]), array_slice($moves, 0, 2));
    [$top, $pct] = $moves[0];
    return sprintf('Between us: %s. %s', implode(', ', $parts), $pct > 0
        ? sprintf('Whoever holds %s is smiling.', item_name($top))
        : sprintf('%s is cheap; a buyer with patience could do well.', item_name($top)));
}

/** The crier: tomorrow's Guild Week day and what it does to demand and prices. */
function palazzo_rumor_week(int $now): string
{
    $tomorrow = calendar_today($now + 86400);
    $items = array_keys(($tomorrow['demand'] ?? []) + ($tomorrow['price'] ?? []));
    $names = array_map('item_name', array_slice($items, 0, 3));
    if (!$names) {
        return sprintf('Tomorrow is %s. %s', $tomorrow['name'], $tomorrow['headline']);
    }
    return sprintf('I rehearse tomorrow\'s cry already: "%s!" Watch %s.', $tomorrow['name'], implode(', ', $names));
}

/** The steward: an announced event's goods before it starts, or the Duke's order line that's furthest behind. */
function palazzo_rumor_events(int $now): string
{
    foreach (calendar_events(db(), $now) as $row) {
        $def = calendar_event_def($row['event_id']);
        if (!$def) {
            continue;
        }
        $items = array_map('item_name', array_slice(array_keys(($def['demand'] ?? []) + ($def['price'] ?? [])), 0, 3));
        $soon = (int) $row['starts_at'] > $now;
        return sprintf('%s %s: %s will move. Be ready.', $soon ? 'In ' . orders_duration_text((int) $row['starts_at'] - $now) . ',' : 'Right now,', $def['name'], implode(', ', $items));
    }
    $duke = duke_board(0);
    $worst = null;
    foreach ($duke['lines'] ?? [] as $l) {
        $share = $l['goal'] > 0 ? $l['delivered'] / $l['goal'] : 1;
        if ($worst === null || $share < $worst[1]) {
            $worst = [$l, $share];
        }
    }
    if ($worst !== null && ($duke['status'] ?? '') === 'open' && $worst[1] < 1) {
        return sprintf('His Grace is still waiting on %s (%d of %d). Whoever brings them will be remembered.', $worst[0]['name'], $worst[0]['delivered'], $worst[0]['goal']);
    }
    return 'All is calm in the Duke\'s household. That never lasts.';
}

function palazzo_rumor(array $npc, int $now): string
{
    return match ($npc['rumor'] ?? '') {
        'market' => palazzo_rumor_market(),
        'week'   => palazzo_rumor_week($now),
        'events' => palazzo_rumor_events($now),
        default  => '',
    };
}

// ---------------------------------------------------------------- favors

/** Items an official may ask a player for. */
function palazzo_favor_pool(PDO $pdo, array $npc, int $playerId, array $row): array
{
    $professionId = $row['profession_id'];
    switch ($npc['favor'] ?? 'goods') {
        case 'raws':
            $stmt = $pdo->prepare('SELECT item_id FROM gathering WHERE player_id = ?');
            $stmt->execute([$playerId]);
            return array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
        case 'imports':
            return orders_other_guild_items($professionId, $row['skill']);
        default:
            return orders_own_items($professionId, true, $row['skill'], progression_known($pdo, $playerId));
    }
}

/** Today's favor from an official (made the first time it's asked for). */
function palazzo_favor(PDO $pdo, array $npc, int $playerId, array $row, int $day): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM npc_favors WHERE player_id = ? AND npc = ? AND day = ?');
    $stmt->execute([$playerId, $npc['id'], $day]);
    $f = $stmt->fetch();
    if (!$f) {
        $pool = palazzo_favor_pool($pdo, $npc, $playerId, $row);
        if (!$pool) {
            return null;
        }
        $set = palazzo_settings();
        $itemId = orders_pick($pool);
        $usual = orders_usual($itemId);
        $qty = max(1, min(40, (int) round((float) $set['favor_target_value'] / $usual)));
        $reward = (int) floor($qty * $usual * (float) $set['favor_reward_multiplier']);
        $xp = orders_xp([$itemId => $qty], 'favor');
        $pdo->prepare('INSERT IGNORE INTO npc_favors (player_id, npc, day, item_id, quantity, reward, xp) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([$playerId, $npc['id'], $day, $itemId, $qty, $reward, $xp]);
        $stmt->execute([$playerId, $npc['id'], $day]);
        $f = $stmt->fetch();
    }
    return [
        'item_id'  => $f['item_id'],
        'name'     => item_name($f['item_id']),
        'quantity' => (int) $f['quantity'],
        'reward'   => (int) $f['reward'],
        'xp'       => (int) $f['xp'],
        'done'     => $f['done_at'] !== null,
        'have'     => inventory_count($pdo, $playerId, $f['item_id']),
        'line'     => str_replace('{items}', sprintf('%d %s', (int) $f['quantity'], item_name($f['item_id'])), (string) ($npc['favor_line'] ?? '{items}')),
    ];
}

/** Talk to an official: who they are, a line, a rumor, and today's favor. */
function palazzo_talk(int $playerId, string $npcId): array
{
    $npc = palazzo_npc_def($npcId);
    $now = game_now();
    $favor = tx(function (PDO $pdo) use ($npc, $playerId, $now) {
        $row = progression_row($pdo, $playerId);
        return $row === null ? null : palazzo_favor($pdo, $npc, $playerId, $row, progression_day($now));
    });
    $lines = $npc['lines'] ?? [''];
    return [
        'id'        => $npc['id'],
        'name'      => $npc['name'],
        'title'     => $npc['title'],
        'character' => $npc['character'] ?? $npc['id'],
        'line'      => $lines[mt_rand(0, count($lines) - 1)],
        'rumor'     => palazzo_rumor($npc, $now),
        'favor'     => $favor,
        'resets_in' => 86400 - ($now % 86400),
    ];
}

/** Do today's favor: hand the goods over, get ducats and XP (no XP at your bottega's skill cap). */
function palazzo_favor_do(int $playerId, string $npcId): array
{
    $npc = palazzo_npc_def($npcId);
    return tx(function (PDO $pdo) use ($npc, $playerId) {
        gold_get($pdo, $playerId, true);
        $row = progression_row($pdo, $playerId, true);
        if ($row === null) {
            throw new ApiError('no_profession', 'Join a guild first.');
        }
        $now = game_now();
        $day = progression_day($now);
        $favor = palazzo_favor($pdo, $npc, $playerId, $row, $day);
        if ($favor === null) {
            throw new ApiError('no_favor', sprintf('%s has nothing for you today.', $npc['name']), 409);
        }
        $stmt = $pdo->prepare('SELECT done_at FROM npc_favors WHERE player_id = ? AND npc = ? AND day = ? FOR UPDATE');
        $stmt->execute([$playerId, $npc['id'], $day]);
        if ($stmt->fetchColumn() !== null) {
            throw new ApiError('favor_done', sprintf('You already helped %s today. Come back tomorrow.', $npc['name']), 409);
        }
        inventory_remove($pdo, $playerId, $favor['item_id'], $favor['quantity']);
        gold_add($pdo, $playerId, $favor['reward']);
        $pdo->prepare('UPDATE npc_favors SET done_at = ? WHERE player_id = ? AND npc = ? AND day = ?')->execute([$now, $playerId, $npc['id'], $day]);
        $xp = progression_at_cap($row) ? 0 : $favor['xp'];
        $progress = progression_apply($pdo, $playerId, $row, $xp, 0, $now) + ['xp' => $xp, 'doubled' => false, 'discoveries' => []];
        progression_log_gain($pdo, $playerId, $row, $progress);
        activity_log($pdo, $playerId, 'favor_done', ['npc' => $npc['name'], 'item_id' => $favor['item_id'], 'quantity' => $favor['quantity'], 'reward' => $favor['reward'], 'xp' => $xp]);
        return ['npc' => $npc['name'], 'item_id' => $favor['item_id'], 'quantity' => $favor['quantity'], 'reward' => $favor['reward'], 'progress' => $progress];
    });
}

/** All three officials at once (the Palazzo panel and the phone list): name, title and whether today's favor is done. */
function palazzo_overview(int $playerId): array
{
    $now = game_now();
    $day = progression_day($now);
    $stmt = db()->prepare('SELECT npc, done_at FROM npc_favors WHERE player_id = ? AND day = ?');
    $stmt->execute([$playerId, $day]);
    $done = array_column($stmt->fetchAll(), 'done_at', 'npc');
    return array_values(array_map(fn($n) => [
        'id' => $n['id'], 'name' => $n['name'], 'title' => $n['title'], 'character' => $n['character'] ?? $n['id'],
        'favor_done' => isset($done[$n['id']]) && $done[$n['id']] !== null,
    ], palazzo_npcs()));
}
