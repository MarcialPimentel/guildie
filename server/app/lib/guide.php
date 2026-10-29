<?php
declare(strict_types=1);

/**
 * The new-player guide (0.14.0, systems.md 8.3, content/guide.json): a short chain of first steps shown one at
 * a time. The server checks each step from what really happened (or, for the Palazzo and a slap, from what the
 * client reports, since the server can't see them), pays its ducats when claimed, and pays the final purse when
 * the last step is claimed or skipped. Players who joined before 0.14.0 have a finished row (migration 010).
 */

function guide_content(): array
{
    return content_file('guide.json');
}

/** The player's guide row, or a fresh one for a new player (not saved until something changes). */
function guide_row(PDO $pdo, int $playerId, bool $lock = false): array
{
    $stmt = $pdo->prepare('SELECT step, done, palazzo_at, slapped_at FROM guide_progress WHERE player_id = ?' . ($lock ? ' FOR UPDATE' : ''));
    $stmt->execute([$playerId]);
    $row = $stmt->fetch();
    if (!$row) {
        return ['step' => 0, 'done' => 0, 'palazzo_at' => null, 'slapped_at' => null, 'new' => true];
    }
    return ['step' => (int) $row['step'], 'done' => (int) $row['done'], 'palazzo_at' => $row['palazzo_at'], 'slapped_at' => $row['slapped_at'], 'new' => false];
}

function guide_save(PDO $pdo, int $playerId, array $row): void
{
    $pdo->prepare('INSERT INTO guide_progress (player_id, step, done, palazzo_at, slapped_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
                   ON DUPLICATE KEY UPDATE step = VALUES(step), done = VALUES(done), palazzo_at = VALUES(palazzo_at),
                   slapped_at = VALUES(slapped_at), updated_at = VALUES(updated_at)')
        ->execute([$playerId, $row['step'], $row['done'], $row['palazzo_at'], $row['slapped_at'], game_now()]);
}

/** Has the player done what this step asks? */
function guide_step_done(PDO $pdo, int $playerId, array $step, array $row): bool
{
    [$kind, $what] = array_pad(explode(':', (string) $step['check'], 2), 2, '');
    if ($kind === 'activity') {
        $stmt = $pdo->prepare('SELECT 1 FROM activity WHERE player_id = ? AND type = ? LIMIT 1');
        $stmt->execute([$playerId, $what]);
        return (bool) $stmt->fetchColumn();
    }
    if ($kind === 'skill') {
        return (int) (progression_row($pdo, $playerId)['skill'] ?? 1) >= (int) $what;
    }
    if ($kind === 'learned') {
        $stmt = $pdo->prepare("SELECT 1 FROM player_recipes WHERE player_id = ? AND source = 'trainer' LIMIT 1");
        $stmt->execute([$playerId]);
        return (bool) $stmt->fetchColumn();
    }
    if ($kind === 'mark') {
        return $row[$what === 'slap' ? 'slapped_at' : 'palazzo_at'] !== null;
    }
    return false;
}

/** What the guide card shows: the current step (and whether it's ready to claim), or finished. */
function guide_status(PDO $pdo, int $playerId): array
{
    $g = guide_content();
    $steps = $g['steps'];
    $row = guide_row($pdo, $playerId);
    if ($row['done'] || $row['step'] >= count($steps)) {
        return ['finished' => true];
    }
    $step = $steps[$row['step']];
    return [
        'finished' => false,
        'index'    => $row['step'] + 1,
        'total'    => count($steps),
        'final_reward' => (int) $g['final_reward'],
        'step'     => [
            'id'       => $step['id'],
            'title'    => $step['title'],
            'hint'     => $step['hint'],
            'reward'   => (int) $step['reward'],
            'target'   => $step['target'] ?? null,
            'optional' => !empty($step['optional']),
            'ready'    => guide_step_done($pdo, $playerId, $step, $row),
        ],
    ];
}

/** Claim the current step's ducats (or skip it, when it's optional). The last one also pays the final purse. */
function guide_advance(int $playerId, string $stepId, bool $skip): array
{
    return tx(function (PDO $pdo) use ($playerId, $stepId, $skip) {
        gold_get($pdo, $playerId, true);   // lock the player first (the order every action uses)
        $g = guide_content();
        $steps = $g['steps'];
        $row = guide_row($pdo, $playerId, true);
        if ($row['done'] || $row['step'] >= count($steps)) {
            throw new ApiError('guide_finished', 'You have finished the guide.', 409);
        }
        $step = $steps[$row['step']];
        if ($step['id'] !== $stepId) {
            throw new ApiError('guide_wrong_step', 'That is not your current step.', 409);
        }
        $paid = 0;
        if ($skip) {
            if (empty($step['optional'])) {
                throw new ApiError('guide_not_optional', 'This step can\'t be skipped.');
            }
        } else {
            if (!guide_step_done($pdo, $playerId, $step, $row)) {
                throw new ApiError('guide_not_done', 'Finish this step first.');
            }
            $paid = (int) $step['reward'];
        }
        $row['step']++;
        $final = 0;
        if ($row['step'] >= count($steps)) {
            $row['done'] = 1;
            $final = (int) $g['final_reward'];
        }
        if ($paid + $final > 0) {
            gold_add($pdo, $playerId, $paid + $final);
        }
        guide_save($pdo, $playerId, $row);
        activity_log($pdo, $playerId, 'guide_step', ['title' => $step['title'], 'gold' => $paid, 'final' => $final, 'skipped' => $skip]);
        return ['step' => $step['id'], 'gold' => $paid, 'final' => $final, 'finished' => (bool) $row['done'], 'guide' => guide_status($pdo, $playerId)];
    });
}

/** The client reports something the server can't see: reaching the Palazzo, or a slap. Only the first time counts. */
function guide_mark(int $playerId, string $what): array
{
    if (!in_array($what, ['palazzo', 'slap'], true)) {
        throw new ApiError('bad_request', 'Mark must be palazzo or slap.');
    }
    return tx(function (PDO $pdo) use ($playerId, $what) {
        gold_get($pdo, $playerId, true);
        $row = guide_row($pdo, $playerId, true);
        $col = $what === 'slap' ? 'slapped_at' : 'palazzo_at';
        if ($row[$col] === null) {
            $row[$col] = game_now();
            guide_save($pdo, $playerId, $row);
        }
        return guide_status($pdo, $playerId);
    });
}
