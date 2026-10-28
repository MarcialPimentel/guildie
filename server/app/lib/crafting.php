<?php
declare(strict_types=1);

/*
 * Crafting (systems.md 5.3). Inputs are removed when a craft starts; outputs arrive when collected.
 * A job holds one queue slot until collected. A batch crafts several of one recipe in a single slot.
 */

/** Recipes for the craft screen, with what the player has of each input. */
function crafting_recipes(int $playerId, string $professionId): array
{
    $inventory = [];
    foreach (inventory_list($playerId) as $row) {
        if ($row['quality'] === QUALITY_COMMON) {
            $inventory[$row['item_id']] = $row['quantity'];
        }
    }

    $out = [];
    foreach (content_recipes_for($professionId) as $recipe) {
        $inputs = [];
        $maxBatch = (int) econ('crafting.max_batch', 10);
        foreach ($recipe['inputs'] as $in) {
            $have = $inventory[$in['item_id']] ?? 0;
            $inputs[] = [
                'item_id'  => $in['item_id'],
                'name'     => item_name($in['item_id']),
                'quantity' => (int) $in['quantity'],
                'have'     => $have,
                'from_other_profession' => (content_item($in['item_id'])['profession'] ?? '') !== $professionId,
            ];
            $maxBatch = min($maxBatch, intdiv($have, (int) $in['quantity']));
        }
        $out[] = [
            'id'           => $recipe['id'],
            'name'         => item_name($recipe['output']['item_id']),
            'output'       => ['item_id' => $recipe['output']['item_id'], 'quantity' => (int) $recipe['output']['quantity']],
            'value'        => (int) round(market_reference_value($recipe['output']['item_id'])),
            'inputs'       => $inputs,
            'seconds_each' => (int) ceil($recipe['time_seconds'] * pace()),
            'can_make'     => max(0, $maxBatch),
        ];
    }
    return $out;
}

/** Open (uncollected) jobs, oldest first. */
function crafting_jobs(int $playerId): array
{
    $stmt = db()->prepare(
        'SELECT id, recipe_id, quantity, started_at, ends_at FROM craft_jobs
         WHERE player_id = ? AND collected_at IS NULL ORDER BY id'
    );
    $stmt->execute([$playerId]);
    $now = game_now();
    return array_map(function ($job) use ($now) {
        $recipe = content_recipe($job['recipe_id']);
        return [
            'id'           => (int) $job['id'],
            'recipe_id'    => $job['recipe_id'],
            'name'         => item_name($recipe['output']['item_id'] ?? $job['recipe_id']),
            'quantity'     => (int) $job['quantity'] * (int) ($recipe['output']['quantity'] ?? 1),
            'started_at'   => (int) $job['started_at'],
            'ends_at'      => (int) $job['ends_at'],
            'seconds_left' => max(0, (int) $job['ends_at'] - $now),
            'done'         => (int) $job['ends_at'] <= $now,
        ];
    }, $stmt->fetchAll());
}

function crafting_start(int $playerId, string $recipeId, int $quantity): void
{
    $recipe = content_recipe($recipeId);
    if ($recipe === null) {
        throw new ApiError('unknown_recipe', 'That recipe does not exist.');
    }
    $maxBatch = (int) econ('crafting.max_batch', 10);
    if ($quantity < 1 || $quantity > $maxBatch) {
        throw new ApiError('bad_request', "You can craft 1 to $maxBatch at a time.");
    }

    tx(function (PDO $pdo) use ($playerId, $recipe, $quantity) {
        $profession = require_profession($pdo, $playerId);
        if ($recipe['profession'] !== $profession['id']) {
            throw new ApiError('wrong_profession', 'That recipe belongs to another profession.');
        }

        // Lock the player's open jobs so two quick taps can't both take the last slot.
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM craft_jobs WHERE player_id = ? AND collected_at IS NULL FOR UPDATE');
        $stmt->execute([$playerId]);
        $slots = (int) econ('crafting.slots', 1);
        if ((int) $stmt->fetchColumn() >= $slots) {
            throw new ApiError('no_free_slot', "All $slots crafting slots are busy. Collect a finished craft first.");
        }

        foreach ($recipe['inputs'] as $in) {
            inventory_remove($pdo, $playerId, $in['item_id'], (int) $in['quantity'] * $quantity);
        }

        $now = game_now();
        $duration = (int) ceil($recipe['time_seconds'] * $quantity * pace());
        $pdo->prepare('INSERT INTO craft_jobs (player_id, recipe_id, quantity, started_at, ends_at) VALUES (?, ?, ?, ?, ?)')
            ->execute([$playerId, $recipe['id'], $quantity, $now, $now + $duration]);
        activity_log($pdo, $playerId, 'craft_started', [
            'item_id' => $recipe['output']['item_id'], 'quantity' => $quantity * (int) $recipe['output']['quantity'],
        ]);
    });
}

/** Collect every finished craft. Returns what was collected. */
function crafting_collect(int $playerId): array
{
    return tx(function (PDO $pdo) use ($playerId) {
        $now = game_now();
        $stmt = $pdo->prepare(
            'SELECT id, recipe_id, quantity FROM craft_jobs
             WHERE player_id = ? AND collected_at IS NULL AND ends_at <= ? FOR UPDATE'
        );
        $stmt->execute([$playerId, $now]);
        $jobs = $stmt->fetchAll();
        if (!$jobs) {
            throw new ApiError('nothing_to_collect', 'No crafts are finished yet.');
        }

        $collected = [];
        $surprises = [];
        foreach ($jobs as $job) {
            $recipe = content_recipe($job['recipe_id']);
            $qty = (int) $job['quantity'] * (int) $recipe['output']['quantity'];
            inventory_add($pdo, $playerId, $recipe['output']['item_id'], $qty);
            $pdo->prepare('UPDATE craft_jobs SET collected_at = ? WHERE id = ?')->execute([$now, $job['id']]);
            activity_log($pdo, $playerId, 'crafted', ['item_id' => $recipe['output']['item_id'], 'quantity' => $qty]);
            $collected[] = ['item_id' => $recipe['output']['item_id'], 'quantity' => $qty];

            // Small surprise (#48): sometimes a batch yields an extra item.
            if (rand_between(0, 1) < (float) econ('surprises.bonus_craft_chance', 0.1)) {
                inventory_add($pdo, $playerId, $recipe['output']['item_id'], 1);
                $text = sprintf('Bonus craft! +1 %s', item_name($recipe['output']['item_id']));
                activity_log($pdo, $playerId, 'surprise', ['text' => $text]);
                $surprises[] = ['text' => $text, 'item_id' => $recipe['output']['item_id'], 'quantity' => 1];
            }
        }
        return ['collected' => $collected, 'surprises' => $surprises];
    });
}
