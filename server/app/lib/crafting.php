<?php
declare(strict_types=1);

/*
 * Crafting (systems.md 5.3). Inputs are removed when a craft starts; outputs arrive when collected.
 * A job holds one queue slot until collected. A batch crafts several of one recipe in a single slot.
 */

/**
 * Known recipes for the craft screen, with what the player has of each input, and each recipe's colour and
 * XP per craft at the player's skill (0.8.0: only known recipes can be crafted).
 */
function crafting_recipes(int $playerId, string $professionId): array
{
    $inventory = [];
    foreach (inventory_list($playerId) as $row) {
        $inventory[$row['item_id']] = ($inventory[$row['item_id']] ?? 0) + $row['quantity'];   // any quality works (0.18.0)
    }
    $pdo = db();
    $row = progression_row($pdo, $playerId);
    $skill = $row['skill'] ?? 1;
    $level = $row['workshop_level'] ?? 1;
    $known = progression_known($pdo, $playerId);

    $out = [];
    foreach (content_recipes_for($professionId) as $recipe) {
        if (!isset($known[$recipe['id']])) {
            continue;
        }
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
        $colour = recipe_colour($recipe, $skill);
        $out[] = [
            'id'           => $recipe['id'],
            'name'         => recipe_name($recipe),
            'output'       => ['item_id' => $recipe['output']['item_id'], 'quantity' => (int) $recipe['output']['quantity']],
            'value'        => (int) round(market_reference_value($recipe['output']['item_id']) * (int) $recipe['output']['quantity']),
            'inputs'       => $inputs,
            'seconds_each' => workshop_craft_seconds(recipe_craft_seconds($recipe), $level),
            'seconds_each_by_hand' => workshop_running($level) !== null ? workshop_craft_seconds(recipe_craft_seconds($recipe), $level, false) : null,
            'lamp_oil_each' => workshop_oil_for($level, $recipe, 1) > 0 ? (float) $recipe['time_seconds'] / 60 * (float) (workshop_running($level)['lamp_oil_per_minute'] ?? 0) : 0,
            'can_make'     => max(0, $maxBatch),
            'skill'        => recipe_skill($recipe),
            'colour'       => $colour['id'],
            'xp_each'      => recipe_xp_each($recipe, $skill),
            'quality'      => [   // what you'd make at this colour (0.18.0): at least this tier, a chance of one better
                'floor' => $colour['quality_floor'],
                'up'    => $colour['quality_floor'] < QUALITY_MASTERWORK ? $colour['quality_up'] : 0,
            ],
            'trade_bonus'  => (bool) recipe_import_guilds($recipe),
            'rare'         => recipe_is_rare($recipe),
            'discovered'   => $known[$recipe['id']]['first_crafted_at'] !== null,
        ];
    }
    return $out;
}

/**
 * A recipe's craft time in seconds before the bottega's speed: its listed time x the game's pace x its rank's pace
 * (economy.json pace.craft_by_rank, #52: Apprentice crafts stay quick, Expert and Master crafts take hours).
 */
function recipe_craft_seconds(array $recipe): float
{
    $byRank = (array) econ('pace.craft_by_rank', []);
    $factor = (float) ($byRank[progression_rank_index(recipe_skill($recipe))] ?? 1.0);
    return (float) $recipe['time_seconds'] * pace() * ($factor > 0 ? $factor : 1.0);
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
            'item_id'      => $recipe['output']['item_id'] ?? $job['recipe_id'],
            'name'         => $recipe ? recipe_name($recipe) : $job['recipe_id'],
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
        gold_get($pdo, $playerId, true);   // player row first, the same lock order as every action (wages may be paid)
        $profession = require_profession($pdo, $playerId);
        if ($recipe['profession'] !== $profession['id']) {
            throw new ApiError('wrong_profession', 'That recipe belongs to another profession.');
        }
        if (!progression_knows($pdo, $playerId, $recipe['id'])) {
            $name = recipe_name($recipe);
            throw new ApiError('recipe_not_known', recipe_is_rare($recipe)
                ? "$name is a rare recipe you haven't been taught. Customers sometimes teach rare recipes."
                : sprintf("You haven't learned %s yet. The guild trainer teaches it from skill %d.", $name, recipe_skill($recipe)));
        }

        // Lock the player's open jobs so two quick taps can't both take the last slot.
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM craft_jobs WHERE player_id = ? AND collected_at IS NULL FOR UPDATE');
        $stmt->execute([$playerId]);
        $level = workshop_level($pdo, $playerId);
        $slots = workshop_slots($level);
        if ((int) $stmt->fetchColumn() >= $slots) {
            throw new ApiError('no_free_slot', "All $slots crafting slots are busy. Collect a finished craft first.");
        }

        foreach ($recipe['inputs'] as $in) {
            inventory_remove($pdo, $playerId, $in['item_id'], (int) $in['quantity'] * $quantity);
        }

        $now = game_now();
        // Expert and Master machines (#52): burn lamp oil and pay the day's wages, or craft by hand (slower).
        $power = workshop_power_craft($pdo, $playerId, $level, $recipe, $quantity, $now);
        $duration = workshop_craft_seconds(recipe_craft_seconds($recipe) * $quantity, $level, $power['powered'] !== false);
        $pdo->prepare('INSERT INTO craft_jobs (player_id, recipe_id, quantity, started_at, ends_at) VALUES (?, ?, ?, ?, ?)')
            ->execute([$playerId, $recipe['id'], $quantity, $now, $now + $duration]);
        activity_log($pdo, $playerId, 'craft_started', [
            'item_id' => $recipe['output']['item_id'], 'quantity' => $quantity * (int) $recipe['output']['quantity'],
            'powered' => $power['powered'], 'oil' => $power['oil'], 'wages' => $power['wages'],
        ]);
    });
}

/**
 * Collect every finished craft. Each batch pays XP (recipe XP x its colour at the current skill, trade bonus
 * included); the first batch with XP each day pays double; the first craft of each recipe adds a skill point.
 * Returns what was collected and what changed (progress).
 */
function crafting_collect(int $playerId): array
{
    return tx(function (PDO $pdo) use ($playerId) {
        gold_get($pdo, $playerId, true);   // player row first, the same lock order as every action
        $now = game_now();
        $stmt = $pdo->prepare(
            'SELECT id, recipe_id, quantity FROM craft_jobs
             WHERE player_id = ? AND collected_at IS NULL AND ends_at <= ? ORDER BY id FOR UPDATE'
        );
        $stmt->execute([$playerId, $now]);
        $jobs = $stmt->fetchAll();
        if (!$jobs) {
            throw new ApiError('nothing_to_collect', 'No crafts are finished yet.');
        }

        $row = progression_row($pdo, $playerId, true);
        $today = progression_day($now);
        $progress = null;
        $xpTotal = 0;
        $doubled = false;
        $discoveries = [];
        $mark = $pdo->prepare('UPDATE player_recipes SET first_crafted_at = ? WHERE player_id = ? AND recipe_id = ? AND first_crafted_at IS NULL');

        $collected = [];
        $surprises = [];
        foreach ($jobs as $job) {
            $recipe = content_recipe($job['recipe_id']);
            $itemId = $recipe['output']['item_id'];
            $qty = (int) $job['quantity'] * (int) $recipe['output']['quantity'];
            // Quality (0.18.0, #79): each unit rolls from the recipe's colour at your skill before this batch's XP.
            $colour = recipe_colour($recipe, (int) ($row['skill'] ?? 1));
            $byQuality = [];
            for ($i = 0; $i < $qty; $i++) {
                $q = recipe_roll_quality($colour);
                $byQuality[$q] = ($byQuality[$q] ?? 0) + 1;
            }
            ksort($byQuality);
            inventory_add_each($pdo, $playerId, $itemId, $byQuality);
            $pdo->prepare('UPDATE craft_jobs SET collected_at = ? WHERE id = ?')->execute([$now, $job['id']]);
            activity_log($pdo, $playerId, 'crafted', ['item_id' => $itemId, 'quantity' => $qty, 'qualities' => $byQuality]);
            $collected[] = ['item_id' => $itemId, 'name' => item_name($itemId), 'quantity' => $qty, 'qualities' => $byQuality];

            // Skill and XP (#30), worked out here on the server at collection.
            if ($row !== null) {
                $xp = (int) round((int) $job['quantity'] * recipe_base_xp($recipe) * recipe_colour($recipe, $row['skill'])['factor']);
                if (progression_at_cap($row)) {
                    $xp = 0;   // at the bottega's cap (#51): no XP until the next upgrade is built
                }
                if ($xp > 0 && $row['bonus_day'] < $today) {
                    $xp *= (int) prog('first_craft_of_day', 2);
                    $row['bonus_day'] = $today;
                    $doubled = true;
                }
                $mark->execute([$now, $playerId, $recipe['id']]);
                $discovery = $mark->rowCount() === 1 ? (int) prog('discovery_skill', 1) : 0;
                if ($discovery > 0) {
                    $discoveries[] = recipe_name($recipe);
                }
                $report = progression_apply($pdo, $playerId, $row, $xp, $discovery, $now);
                $progress = $progress === null ? $report : progression_merge($progress, $report);
                $xpTotal += $xp;
            }

            // Small surprise (#48): sometimes a batch yields an extra item.
            if (rand_between(0, 1) < (float) econ('surprises.bonus_craft_chance', 0.1)) {
                $q = recipe_roll_quality($colour);
                inventory_add($pdo, $playerId, $itemId, 1, $q);
                $text = sprintf('Bonus craft! +1 %s', item_name_q($itemId, $q));
                activity_log($pdo, $playerId, 'surprise', ['text' => $text]);
                $surprises[] = ['text' => $text, 'item_id' => $itemId, 'quantity' => 1, 'quality' => $q];
            }
        }

        if ($progress !== null) {
            $progress += ['xp' => $xpTotal, 'doubled' => $doubled, 'discoveries' => $discoveries];
            progression_log_gain($pdo, $playerId, $row, $progress);
        }
        return ['collected' => $collected, 'surprises' => $surprises, 'progress' => $progress];
    });
}
