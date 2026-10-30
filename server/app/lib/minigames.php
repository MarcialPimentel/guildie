<?php
declare(strict_types=1);

/*
 * Minigames (0.15.0, systems.md 5.5, content/minigames.json): short, optional games that pay for active play.
 *
 * Two registries keep it modular:
 * - KINDS are the rules of a game. Each kind has a plan function (rolls a round), a score function (replays the
 *   player's taps against the plan) and a min_ms function (the shortest time the round can honestly take).
 *   It also has a taps function that checks the taps the client sent are the right shape.
 *   Adding a kind = one minigame_<kind>.php file here + one screen in client/src/minigames/.
 * - TARGETS are what a game is played on and what it pays. 'station' pays extra raws today; crafting Focus
 *   (systems.md 5.4) will be a second target using the same kinds.
 * Each guild picks its kind and its look in professions.json -> station.minigame, so a new profession needs no code.
 *
 * The server decides everything: it rolls the round, keeps the plan, checks the round took at least as long as the
 * taps say, scores it, and pays in one transaction. The client only draws the plan and reports when you tapped.
 */

function minigame_kinds(): array
{
    return [
        'strike' => ['plan' => 'strike_plan', 'taps' => 'strike_clean_taps', 'score' => 'strike_score', 'min_ms' => 'strike_min_ms', 'max_ms' => 'strike_max_ms'],
    ];
}

function minigame_targets(): array
{
    return [
        'station' => ['config' => 'minigame_station_config', 'reward' => 'minigame_station_reward', 'preview' => 'minigame_station_preview'],
    ];
}

function minigame_content(): array
{
    return content_file('minigames.json');
}

/** A kind's params from minigames.json, with any overrides from the place that uses it. */
function minigame_params(string $kind, array $overrides = []): array
{
    $base = minigame_content()['kinds'][$kind]['params'] ?? null;
    if (!is_array($base) || !isset(minigame_kinds()[$kind])) {
        throw new RuntimeException("Unknown minigame kind: $kind");
    }
    return array_merge($base, $overrides);
}

function minigame_target(string $target): array
{
    $t = minigame_targets()[$target] ?? null;
    if ($t === null) {
        throw new ApiError('bad_request', 'There is no game to play there.');
    }
    return $t;
}

// ---------------------------------------------------------------- tiredness

function minigame_tiredness_settings(): array
{
    $t = minigame_content()['tiredness'] ?? [];
    return [
        'drop'      => (float) ($t['drop_per_round'] ?? 0.2),
        'floor'     => (float) ($t['floor'] ?? 0.1),
        'half_life' => max(1.0, (float) ($t['recovery_half_life_hours'] ?? 2) * 3600 * pace()),
    ];
}

/** How tired the player is from recent rounds on this target: each finished round adds 1, halving every half-life. */
function minigame_tiredness(PDO $pdo, int $playerId, string $target, int $now): float
{
    $s = minigame_tiredness_settings();
    $stmt = $pdo->prepare(
        "SELECT finished_at FROM minigame_rounds
         WHERE player_id = ? AND target = ? AND status = 'done' AND finished_at >= ?"
    );
    $stmt->execute([$playerId, $target, $now - (int) ceil($s['half_life'] * 10)]);
    $tired = 0.0;
    foreach ($stmt->fetchAll() as $row) {
        $tired += 0.5 ** (max(0, $now - (int) $row['finished_at']) / $s['half_life']);
    }
    return $tired;
}

/** The share of a full reward the next round pays (1 = fresh). */
function minigame_freshness(float $tiredness): float
{
    $s = minigame_tiredness_settings();
    return max($s['floor'], (1 - $s['drop']) ** $tiredness);
}

// ---------------------------------------------------------------- the station target (extra raws)

/** The station's game as set in professions.json (kind, skin and words). */
function minigame_station_config(array $profession): array
{
    $cfg = $profession['station']['minigame'] ?? null;
    if (!is_array($cfg)) {
        throw new ApiError('no_minigame', 'Your station has no game yet.');
    }
    return $cfg;
}

/** Full-reward units of the station's first raw: reward_minutes of its current rate (after pace and bottega level). */
function minigame_station_units(PDO $pdo, int $playerId, array $profession): array
{
    $outputs = workshop_station_outputs($profession, workshop_level($pdo, $playerId));
    $first = $outputs[0];
    $minutes = (float) (minigame_content()['targets']['station']['reward_minutes'] ?? 20);
    $units = (float) $first['rate_per_hour'] / pace() * $minutes / 60;
    return [$first['item_id'], $units];
}

/** The rarest raw this player gathers (raws unlock with skill), for the find on a great round. */
function minigame_station_find_item(PDO $pdo, int $playerId, array $profession): string
{
    $stmt = $pdo->prepare('SELECT item_id FROM gathering WHERE player_id = ?');
    $stmt->execute([$playerId]);
    $have = array_flip(array_column($stmt->fetchAll(), 'item_id'));
    $outputs = $profession['station']['outputs'];
    $best = $outputs[0]['item_id'];
    foreach (array_slice($outputs, 1) as $o) {
        if (isset($have[$o['item_id']])) {
            $best = $o['item_id'];
        }
    }
    return $best;
}

/** What a full-score round would pay right now (shown on the station card). */
function minigame_station_preview(PDO $pdo, int $playerId, array $profession, float $freshness): array
{
    [$itemId, $units] = minigame_station_units($pdo, $playerId, $profession);
    return ['item_id' => $itemId, 'name' => item_name($itemId), 'max_units' => max(1, (int) floor($units * $freshness))];
}

/** Pay a scored round: the first raw by score and freshness, plus a find on a great round. Returns [{item_id, quantity, find?}]. */
function minigame_station_reward(PDO $pdo, int $playerId, array $profession, float $score, float $freshness): array
{
    $cfg = minigame_content()['targets']['station'] ?? [];
    [$itemId, $units] = minigame_station_units($pdo, $playerId, $profession);
    $rewards = [];
    $got = (int) floor($units * $score * $freshness);
    if ($score > 0 && $got < 1) {
        $got = 1;   // anything landed pays at least one
    }
    if ($got > 0) {
        $rewards[] = ['item_id' => $itemId, 'quantity' => $got];
    }
    if ($score >= (float) ($cfg['find_at_score'] ?? 0.9)) {
        $find = (int) floor((float) ($cfg['find_units'] ?? 2) * $freshness);
        if ($find > 0) {
            $rewards[] = ['item_id' => minigame_station_find_item($pdo, $playerId, $profession), 'quantity' => $find, 'find' => true];
        }
    }
    foreach ($rewards as $r) {
        inventory_add($pdo, $playerId, $r['item_id'], $r['quantity']);
    }
    return $rewards;
}

// ---------------------------------------------------------------- what the client sees

/** The station's game for the state: its look and words, and what a perfect round pays now. Null if none. */
function minigame_station_status(PDO $pdo, int $playerId, array $profession): ?array
{
    $cfg = $profession['station']['minigame'] ?? null;
    if (!is_array($cfg)) {
        return null;
    }
    $freshness = minigame_freshness(minigame_tiredness($pdo, $playerId, 'station', game_now()));
    $preview = minigame_station_preview($pdo, $playerId, $profession, $freshness);
    return [
        'target'    => 'station',
        'kind'      => (string) $cfg['kind'],
        'skin'      => (string) ($cfg['skin'] ?? $cfg['kind']),
        'words'     => array_diff_key($cfg, ['kind' => 1, 'skin' => 1, 'params' => 1]),
        'freshness' => round($freshness, 3),
    ] + $preview;
}

// ---------------------------------------------------------------- playing a round

/** Start a round: roll its plan and keep it. Any round still open is abandoned (only one at a time). */
function minigame_start(int $playerId, string $target): array
{
    $t = minigame_target($target);
    return tx(function (PDO $pdo) use ($playerId, $target, $t) {
        $profession = require_profession($pdo, $playerId);
        $cfg = ($t['config'])($profession);
        $kind = (string) $cfg['kind'];
        $params = minigame_params($kind, is_array($cfg['params'] ?? null) ? $cfg['params'] : []);
        $plan = (minigame_kinds()[$kind]['plan'])($params);
        $now = game_now();

        $pdo->prepare("UPDATE minigame_rounds SET status = 'abandoned' WHERE player_id = ? AND status = 'open'")
            ->execute([$playerId]);
        $pdo->prepare('INSERT INTO minigame_rounds (player_id, target, kind, plan, status, started_at) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$playerId, $target, $kind, json_encode($plan), 'open', $now]);
        $roundId = (int) $pdo->lastInsertId();

        $freshness = minigame_freshness(minigame_tiredness($pdo, $playerId, $target, $now));
        return ['round_id' => $roundId, 'kind' => $kind, 'plan' => $plan, 'freshness' => round($freshness, 3)]
            + ($t['preview'])($pdo, $playerId, $profession, $freshness);
    });
}

/**
 * Finish a round with the player's taps (one per step of the plan: milliseconds after the step began, or null for none).
 * The server replays them against the plan it kept, so the score can't be made up; and a round that came back
 * faster than its taps add up to is refused.
 */
function minigame_finish(int $playerId, int $roundId, mixed $taps): array
{
    if (!is_array($taps) || !array_is_list($taps)) {
        throw new ApiError('bad_request', "Field 'taps' must be a list.");
    }
    return tx(function (PDO $pdo) use ($playerId, $roundId, $taps) {
        $stmt = $pdo->prepare('SELECT id, target, kind, plan, status, started_at FROM minigame_rounds WHERE id = ? AND player_id = ? FOR UPDATE');
        $stmt->execute([$roundId, $playerId]);
        $round = $stmt->fetch();
        if (!$round || $round['status'] !== 'open') {
            throw new ApiError('round_closed', 'That round is over. Start a new one.');
        }
        $kind = minigame_kinds()[$round['kind']] ?? null;
        $t = minigame_target((string) $round['target']);
        if ($kind === null) {
            throw new ApiError('round_closed', 'That game is no longer played. Start a new one.');
        }
        $plan = json_decode((string) $round['plan'], true);
        $now = game_now();
        $elapsedMs = ($now - (int) $round['started_at']) * 1000;

        $taps = ($kind['taps'])($plan, $taps);
        if ($elapsedMs > ($kind['max_ms'])($plan) + 120000) {
            // Left open (the error rolls this transaction back); the next start abandons it.
            throw new ApiError('round_closed', 'That round took too long. Start a new one.');
        }
        // Whole seconds on the server, so allow one second of rounding plus a little for clocks.
        if ($elapsedMs + 1500 < ($kind['min_ms'])($plan, $taps)) {
            throw new ApiError('too_fast', 'That round finished faster than it can be played.');
        }

        $result = ($kind['score'])($plan, $taps);
        $score = max(0.0, min(1.0, (float) $result['score']));
        $profession = require_profession($pdo, $playerId);
        $freshness = minigame_freshness(minigame_tiredness($pdo, $playerId, (string) $round['target'], $now));
        $rewards = ($t['reward'])($pdo, $playerId, $profession, $score, $freshness);

        $pdo->prepare("UPDATE minigame_rounds SET status = 'done', score = ?, reward = ?, finished_at = ? WHERE id = ?")
            ->execute([round($score, 4), json_encode($rewards), $now, $roundId]);
        $cfg = ($t['config'])($profession);
        activity_log($pdo, $playerId, 'worked', ['title' => (string) ($cfg['title'] ?? 'Worked'), 'score' => round($score, 2), 'items' => $rewards]);

        $label = (string) ($profession['station']['find_label'] ?? 'A lucky find!');
        $named = array_map(fn($r) => $r + ['name' => item_name($r['item_id']), 'text' => !empty($r['find']) ? $label : ''], $rewards);
        return [
            'score'     => round($score, 3),
            'steps'     => $result['steps'],
            'freshness' => round($freshness, 3),
            'rewards'   => $named,
            'next'      => ($t['preview'])($pdo, $playerId, $profession, minigame_freshness(minigame_tiredness($pdo, $playerId, (string) $round['target'], $now))),
        ];
    });
}
