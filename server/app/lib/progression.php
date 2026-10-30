<?php
declare(strict_types=1);

/*
 * Progression (systems.md 5.1, professions.md 4-5, #30 and #49): skill 1-100 in four ranks, crafting XP
 * that falls off on easy recipes, known recipes, and the guild trainer. Numbers: economy.json "progression".
 *
 * Skill and XP live on player_professions (xp = progress toward the next level). Known recipes live in
 * player_recipes. Everything here runs inside the calling action's transaction, except the read-only
 * helpers and progression_ensure().
 *
 * Players who joined before 0.8.0 (progress_version 0) are upgraded once, on their first request or the
 * next market tick: their collected crafts are replayed into skill and XP, and every recipe of their guild
 * is marked known (nobody loses a recipe, and their stations already gather both raws).
 */

const PROGRESS_VERSION = 1;
/** The recipes every guild had before 0.8.0, which players from then keep (progression_upgrade). */
const PRE_080_RECIPES = ['brass_fittings', 'copper_lantern', 'iron_ingot', 'iron_sword', 'healing_draught', 'smelting_flux',
    'tanning_solution', 'steam_tonic', 'leather_grip', 'hide_satchel', 'cured_leather', 'rugged_jerkin'];

function prog(string $key, mixed $default = null): mixed
{
    return econ('progression.' . $key, $default);
}

function progression_max_skill(): int
{
    return (int) prog('max_skill', 100);
}

/** Ranks in order: [{id, name, from}]. */
function progression_ranks(): array
{
    return prog('ranks', [['id' => 'apprentice', 'name' => 'Apprentice', 'from' => 1]]);
}

/** The highest skill in the rank a skill level is in (25 for an Apprentice, the max skill for a Master). */
function progression_rank_top(int $skill): int
{
    $ranks = progression_ranks();
    $next = $ranks[progression_rank_index($skill) + 1] ?? null;
    return $next !== null ? (int) $next['from'] - 1 : progression_max_skill();
}

/** Index (0 = Apprentice) of the rank a skill level is in. */
function progression_rank_index(int $skill): int
{
    $index = 0;
    foreach (progression_ranks() as $i => $rank) {
        if ($skill >= (int) $rank['from']) {
            $index = $i;
        }
    }
    return $index;
}

function progression_rank(int $skill): array
{
    return progression_ranks()[progression_rank_index($skill)];
}

function progression_rank_index_by_id(string $id): int
{
    foreach (progression_ranks() as $i => $rank) {
        if ($rank['id'] === $id) {
            return $i;
        }
    }
    return 0;
}

/** XP needed to go from level L to L+1 (0 at max skill). */
function progression_xp_needed(int $level): int
{
    if ($level >= progression_max_skill()) {
        return 0;
    }
    return (int) round((float) prog('xp_base', 20) * (1 + $level / (float) prog('xp_scale', 20)) ** 2);
}

/**
 * Turn banked XP into levels. Returns [skill, xp]. With a cap (the bottega's, 0.11.0 #51) skill stops there and
 * XP beyond it is dropped: at the cap, crafts give no XP until the next upgrade is built.
 */
function progression_level(int $skill, int $xp, ?int $cap = null): array
{
    $max = min(progression_max_skill(), $cap ?? PHP_INT_MAX);
    $skill = max(1, $skill);
    if ($skill >= $max) {
        return [$skill, 0];   // at (or, for a kept rank, above) the cap
    }
    while ($skill < $max && $xp >= progression_xp_needed($skill)) {
        $xp -= progression_xp_needed($skill);
        $skill++;
    }
    return [$skill, $skill >= $max ? 0 : max(0, $xp)];
}

/** The skill cap for a progression row (its bottega level and any rank kept from before 0.11.0). */
function progression_cap(array $row): int
{
    return workshop_skill_cap((int) ($row['workshop_level'] ?? 1), $row['legacy_rank'] ?? null);
}

/** At the cap: crafts and orders give no XP until the next upgrade is built. */
function progression_at_cap(?array $row): bool
{
    return $row !== null && $row['skill'] >= progression_cap($row) && progression_cap($row) < progression_max_skill();
}

// ---------------------------------------------------------------- recipes

function recipe_skill(array $recipe): int
{
    return max(1, (int) ($recipe['skill'] ?? 1));
}

function recipe_is_rare(array $recipe): bool
{
    return !empty($recipe['rare']);
}

function recipe_name(array $recipe): string
{
    return (string) ($recipe['name'] ?? item_name($recipe['output']['item_id']));
}

/** Names of the other guilds whose goods a recipe uses (e.g. ["Alchemist"]). */
function recipe_import_guilds(array $recipe): array
{
    $guilds = [];
    foreach ($recipe['inputs'] as $in) {
        $owner = content_item($in['item_id'])['profession'] ?? '';
        if ($owner !== '' && $owner !== $recipe['profession']) {
            $guilds[$owner] = content_profession($owner)['name'] ?? $owner;
        }
    }
    return array_values($guilds);
}

/** XP per craft before fall-off: by the recipe's rank, x a rare recipe's multiplier, + the trade bonus. */
function recipe_base_xp(array $recipe): float
{
    $byRank = prog('recipe_xp_by_rank', [10, 20, 40, 80]);
    $xp = (float) ($byRank[progression_rank_index(recipe_skill($recipe))] ?? end($byRank));
    $xp *= (float) ($recipe['xp_multiplier'] ?? 1);
    if (recipe_import_guilds($recipe)) {
        $xp *= 1 + (float) prog('trade_bonus', 0.25);
    }
    return $xp;
}

/** The recipe's colour for a player at $skill: ['id' => 'orange', 'factor' => 1.0]. */
function recipe_colour(array $recipe, int $skill): array
{
    $diff = $skill - recipe_skill($recipe);
    $colours = prog('colours', []);
    foreach ($colours as $c) {
        if ($diff < (int) $c['below']) {
            return ['id' => $c['id'], 'factor' => (float) $c['factor']];
        }
    }
    $last = end($colours);
    return ['id' => $last['id'] ?? 'grey', 'factor' => (float) ($last['factor'] ?? 0)];
}

/** XP one craft of the recipe gives at this skill (for display; collection rounds per batch). */
function recipe_xp_each(array $recipe, int $skill): float
{
    return round(recipe_base_xp($recipe) * recipe_colour($recipe, $skill)['factor'], 1);
}

/** Trainer price: by the recipe's rank. */
function recipe_price(array $recipe): int
{
    $byRank = prog('trainer_price_by_rank', [50, 200, 800, 3000]);
    return (int) ($byRank[progression_rank_index(recipe_skill($recipe))] ?? end($byRank));
}

/** XP an order pays per item (no fall-off): the rank XP of the plainest recipe that makes it. */
function item_order_xp(string $itemId): float
{
    $best = null;
    foreach (content_recipes() as $r) {
        if ($r['output']['item_id'] === $itemId && !recipe_is_rare($r)) {
            $best = $best === null ? recipe_skill($r) : min($best, recipe_skill($r));
        }
    }
    if ($best === null) {
        return 0.0;
    }
    $byRank = prog('recipe_xp_by_rank', [10, 20, 40, 80]);
    return (float) ($byRank[progression_rank_index($best)] ?? end($byRank));
}

// ---------------------------------------------------------------- per player

/** The player's progression row: profession_id, skill, xp, bonus_day, progress_version (or null). */
function progression_row(PDO $pdo, int $playerId, bool $lock = false): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM player_professions WHERE player_id = ?' . ($lock ? ' FOR UPDATE' : ''));
    $stmt->execute([$playerId]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    $row['wages_day'] = (int) ($row['wages_day'] ?? 0);   // added in migration 012 (#52); absent for a moment during a deploy
    foreach (['skill', 'xp', 'bonus_day', 'progress_version', 'workshop_level'] as $k) {
        $row[$k] = (int) $row[$k];
    }
    foreach (['legacy_rank', 'upgrade_to', 'upgrade_ready_at'] as $k) {
        $row[$k] = $row[$k] === null ? null : (int) $row[$k];
    }
    $row['workshop_level'] = max(1, $row['workshop_level']);
    return $row;
}

/** Known recipes: recipe_id => ['source' => ..., 'first_crafted_at' => int|null]. */
function progression_known(PDO $pdo, int $playerId): array
{
    $stmt = $pdo->prepare('SELECT recipe_id, source, first_crafted_at FROM player_recipes WHERE player_id = ?');
    $stmt->execute([$playerId]);
    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $out[$row['recipe_id']] = ['source' => $row['source'], 'first_crafted_at' => $row['first_crafted_at'] === null ? null : (int) $row['first_crafted_at']];
    }
    return $out;
}

function progression_knows(PDO $pdo, int $playerId, string $recipeId): bool
{
    $stmt = $pdo->prepare('SELECT 1 FROM player_recipes WHERE player_id = ? AND recipe_id = ?');
    $stmt->execute([$playerId, $recipeId]);
    return (bool) $stmt->fetchColumn();
}

/** Learn a recipe. Returns true if it was new. */
function progression_learn(PDO $pdo, int $playerId, string $recipeId, string $source, int $now): bool
{
    $stmt = $pdo->prepare('INSERT IGNORE INTO player_recipes (player_id, recipe_id, source, learned_at) VALUES (?, ?, ?, ?)');
    $stmt->execute([$playerId, $recipeId, $source, $now]);
    return $stmt->rowCount() === 1;
}

/** Learn the free starter recipes of every rank up to $rankIndex. Returns the names of new ones. */
function progression_learn_starters(PDO $pdo, int $playerId, string $professionId, int $rankIndex, int $now): array
{
    $learned = [];
    foreach (content_recipes_for($professionId) as $r) {
        if (!empty($r['starter']) && !recipe_is_rare($r) && progression_rank_index(recipe_skill($r)) <= $rankIndex
            && progression_learn($pdo, $playerId, $r['id'], 'starter', $now)) {
            $learned[] = recipe_name($r);
        }
    }
    return $learned;
}

/** Day number (UTC) for the first-craft-of-the-day bonus. */
function progression_day(int $now): int
{
    return intdiv($now, 86400);
}

/**
 * Add XP and skill to a locked progression row ($row is updated in place) and save it. Handles rank-ups
 * (free starter recipe, activity) and raw unlocks at the station. Returns what changed.
 */
function progression_apply(PDO $pdo, int $playerId, array &$row, int $xpGain, int $skillGain, int $now): array
{
    $from = $row['skill'];
    $cap = progression_cap($row);
    $skillGain = $from >= $cap ? 0 : min($skillGain, $cap - $from);
    [$skill, $xp] = progression_level($row['skill'] + $skillGain, $row['xp'] + max(0, $xpGain), $cap);
    $row['skill'] = $skill;
    $row['xp'] = $xp;
    $pdo->prepare('UPDATE player_professions SET skill = ?, xp = ?, bonus_day = ? WHERE player_id = ?')
        ->execute([$skill, $xp, $row['bonus_day'], $playerId]);

    $report = ['skill_from' => $from, 'skill_to' => $skill, 'rank_up' => null, 'learned' => [], 'unlocked' => [],
               'capped' => $skill >= $cap && $cap < progression_max_skill()];
    $profession = content_profession($row['profession_id']);
    $oldRank = progression_rank_index($from);
    $newRank = progression_rank_index($skill);
    if ($newRank > $oldRank) {
        $rank = progression_ranks()[$newRank];
        $report['rank_up'] = $rank['name'];
        $report['learned'] = progression_learn_starters($pdo, $playerId, $row['profession_id'], $newRank, $now);
        activity_log($pdo, $playerId, 'rank_up', ['rank' => $rank['name'], 'profession' => $profession['name'], 'learned' => $report['learned']]);
    }
    if ($skill > $from) {
        $report['unlocked'] = gathering_unlock($pdo, $playerId, $profession, $skill, $now);
        foreach ($report['unlocked'] as $name) {
            activity_log($pdo, $playerId, 'raw_unlocked', ['station' => $profession['station']['name'], 'item' => $name]);
        }
    }
    return $report;
}

/** Fold a later report into an earlier one (several batches collected at once). */
function progression_merge(array $a, array $b): array
{
    return [
        'skill_from' => $a['skill_from'],
        'skill_to'   => $b['skill_to'],
        'rank_up'    => $b['rank_up'] ?? $a['rank_up'],
        'learned'    => array_merge($a['learned'], $b['learned']),
        'unlocked'   => array_merge($a['unlocked'], $b['unlocked']),
        'capped'     => !empty($b['capped']),
    ];
}

/** One activity line for a gain that raised skill ("Blacksmith skill 12 → 14 (+38 XP)."). */
function progression_log_gain(PDO $pdo, int $playerId, array $row, array $progress): void
{
    if ($progress['skill_to'] <= $progress['skill_from']) {
        return;
    }
    activity_log($pdo, $playerId, 'skill_up', [
        'profession'  => content_profession($row['profession_id'])['name'] ?? '',
        'from'        => $progress['skill_from'],
        'to'          => $progress['skill_to'],
        'xp'          => (int) ($progress['xp'] ?? 0),
        'discoveries' => $progress['discoveries'] ?? [],
    ]);
}

/** What the client shows: skill, XP bar, rank, next rank, whether today's double XP is still waiting. */
function progression_status(array $row, int $now): array
{
    $skill = $row['skill'];
    $rank = progression_rank($skill);
    $next = progression_ranks()[progression_rank_index($skill) + 1] ?? null;
    return [
        'skill'             => $skill,
        'cap'               => progression_cap($row),
        'at_cap'            => progression_at_cap($row),
        'max_skill'         => progression_max_skill(),
        'xp'                => $row['xp'],
        'xp_needed'         => progression_xp_needed($skill),
        'rank'              => $rank['name'],
        'rank_id'           => $rank['id'],
        'next_rank'         => $next ? ['name' => $next['name'], 'at' => (int) $next['from']] : null,
        'first_craft_bonus' => $row['bonus_day'] < progression_day($now),
    ];
}

// ---------------------------------------------------------------- players from before 0.8.0

/**
 * Bring a pre-0.8.0 player up to date (inside a transaction, player row locked by the caller).
 * Replays their collected crafts into skill and XP (fall-off and trade bonus apply, plus the
 * discovery skill per recipe; no daily bonus) and marks every recipe of their guild as known.
 * Returns true if anything was done.
 */
function progression_upgrade(PDO $pdo, int $playerId): bool
{
    $row = progression_row($pdo, $playerId, true);
    if ($row === null || $row['progress_version'] >= PROGRESS_VERSION) {
        return false;
    }
    $now = game_now();
    $professionId = $row['profession_id'];
    // Players from before 0.8.0 knew every recipe of that time; they keep those, not the ladder added since (0.12.0).
    foreach (content_recipes_for($professionId) as $r) {
        if (!recipe_is_rare($r) && in_array($r['id'], PRE_080_RECIPES, true)) {
            progression_learn($pdo, $playerId, $r['id'], 'legacy', $now);
        }
    }

    $stmt = $pdo->prepare(
        'SELECT recipe_id, quantity, collected_at FROM craft_jobs WHERE player_id = ? AND collected_at IS NOT NULL ORDER BY collected_at, id'
    );
    $stmt->execute([$playerId]);
    $skill = 1;
    $xp = 0;
    $seen = [];
    $mark = $pdo->prepare('UPDATE player_recipes SET first_crafted_at = ? WHERE player_id = ? AND recipe_id = ? AND first_crafted_at IS NULL');
    foreach ($stmt->fetchAll() as $job) {
        $recipe = content_recipe($job['recipe_id']);
        if ($recipe === null || $recipe['profession'] !== $professionId) {
            continue;
        }
        $discovery = 0;
        if (!isset($seen[$recipe['id']])) {
            $seen[$recipe['id']] = true;
            $discovery = (int) prog('discovery_skill', 1);
            $mark->execute([(int) $job['collected_at'], $playerId, $recipe['id']]);
        }
        $gain = (int) round((int) $job['quantity'] * recipe_base_xp($recipe) * recipe_colour($recipe, $skill)['factor']);
        [$skill, $xp] = progression_level($skill + $discovery, $xp + $gain);
    }

    $profession = content_profession($professionId);
    gathering_unlock($pdo, $playerId, $profession, $skill, $now);
    progression_learn_starters($pdo, $playerId, $professionId, progression_rank_index($skill), $now);
    // They held this rank before bottega upgrades existed (0.11.0), so they keep it (migration 009).
    $pdo->prepare('UPDATE player_professions SET skill = ?, xp = ?, progress_version = ?, legacy_rank = GREATEST(COALESCE(legacy_rank, 0), ?) WHERE player_id = ?')
        ->execute([$skill, $xp, PROGRESS_VERSION, progression_rank_index($skill), $playerId]);
    activity_log($pdo, $playerId, 'skill_counted', [
        'profession' => $profession['name'], 'skill' => $skill, 'rank' => progression_rank($skill)['name'],
    ]);
    return true;
}

/** Upgrade the logged-in player if they joined before 0.8.0 (cheap when there's nothing to do). */
function progression_ensure(int $playerId): void
{
    $stmt = db()->prepare('SELECT progress_version FROM player_professions WHERE player_id = ?');
    $stmt->execute([$playerId]);
    $version = $stmt->fetchColumn();
    if ($version === false || (int) $version >= PROGRESS_VERSION) {
        return;
    }
    tx(function (PDO $pdo) use ($playerId) {
        gold_get($pdo, $playerId, true);   // player row first, the same lock order as every action
        progression_upgrade($pdo, $playerId);
    });
}

/** Market tick: upgrade a few pre-0.8.0 players who haven't been back, so the City shows their skill. */
function progression_upgrade_pending(PDO $pdo, int $limit = 25): int
{
    $stmt = $pdo->prepare('SELECT player_id FROM player_professions WHERE progress_version < ? ORDER BY player_id LIMIT ' . max(1, $limit));
    $stmt->execute([PROGRESS_VERSION]);
    $done = 0;
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $id) {
        gold_get($pdo, (int) $id, true);
        $done += progression_upgrade($pdo, (int) $id) ? 1 : 0;
    }
    return $done;
}

// ---------------------------------------------------------------- the guild trainer (#49)

/** One recipe as the client shows it (trainer list and the workbench). */
function recipe_view(array $recipe, int $skill, array $known): array
{
    $id = $recipe['id'];
    $rare = recipe_is_rare($recipe);
    $colour = recipe_colour($recipe, $skill);
    $status = isset($known[$id]) ? 'known' : ($rare ? 'rare' : ($skill >= recipe_skill($recipe) ? 'learn' : 'locked'));
    return [
        'id'            => $id,
        'name'          => recipe_name($recipe),
        'output'        => ['item_id' => $recipe['output']['item_id'], 'name' => item_name($recipe['output']['item_id']), 'quantity' => (int) $recipe['output']['quantity']],
        'inputs'        => array_map(function ($in) use ($recipe) {
            $owner = content_item($in['item_id'])['profession'] ?? '';
            return [
                'item_id'  => $in['item_id'],
                'name'     => item_name($in['item_id']),
                'quantity' => (int) $in['quantity'],
                'guild'    => $owner !== $recipe['profession'] ? (content_profession($owner)['name'] ?? $owner) : null,
            ];
        }, $recipe['inputs']),
        'imports_from'  => recipe_import_guilds($recipe),
        'skill'         => recipe_skill($recipe),
        'rank'          => progression_rank(recipe_skill($recipe))['name'],
        'rare'          => $rare,
        'starter'       => !empty($recipe['starter']),
        'price'         => $rare ? 0 : recipe_price($recipe),
        'status'        => $status,
        'colour'        => $colour['id'],
        'xp_each'       => recipe_xp_each($recipe, $skill),
        'value'         => (int) round(market_reference_value($recipe['output']['item_id']) * (int) $recipe['output']['quantity']),
        'seconds_each'  => (int) ceil(recipe_craft_seconds($recipe)),
    ];
}

function trainer_list(int $playerId): array
{
    $pdo = db();
    $row = progression_row($pdo, $playerId);
    if ($row === null) {
        throw new ApiError('no_profession', 'Choose a profession first.');
    }
    $known = progression_known($pdo, $playerId);
    $recipes = array_map(fn($r) => recipe_view($r, $row['skill'], $known), content_recipes_for($row['profession_id']));
    // Learnable first, then by skill; rare recipes the player doesn't have at the end.
    $order = ['learn' => 0, 'locked' => 1, 'known' => 2, 'rare' => 3];
    usort($recipes, fn($a, $b) => [$order[$a['status']], $a['skill']] <=> [$order[$b['status']], $b['skill']]);
    return [
        'trainer'  => content_profession($row['profession_id'])['trainer'] ?? 'The guild trainer',
        'skill'    => $row['skill'],
        'gold'     => gold_get($pdo, $playerId),
        'recipes'  => $recipes,
    ];
}

function trainer_learn(int $playerId, string $recipeId): array
{
    $recipe = content_recipe($recipeId);
    if ($recipe === null) {
        throw new ApiError('unknown_recipe', 'That recipe does not exist.');
    }
    return tx(function (PDO $pdo) use ($playerId, $recipe) {
        gold_get($pdo, $playerId, true);   // player row first
        $row = progression_row($pdo, $playerId, true);
        if ($row === null) {
            throw new ApiError('no_profession', 'Choose a profession first.');
        }
        $name = recipe_name($recipe);
        if ($recipe['profession'] !== $row['profession_id']) {
            throw new ApiError('wrong_profession', 'That recipe belongs to another guild.');
        }
        if (progression_knows($pdo, $playerId, $recipe['id'])) {
            throw new ApiError('already_known', "You already know $name.", 409);
        }
        if (recipe_is_rare($recipe)) {
            throw new ApiError('rare_recipe', "$name is a rare recipe. The trainer doesn't teach it; only customers' orders do.");
        }
        if ($row['skill'] < recipe_skill($recipe)) {
            throw new ApiError('skill_too_low', sprintf('%s needs skill %d. You are at %d.', $name, recipe_skill($recipe), $row['skill']));
        }
        $price = recipe_price($recipe);
        gold_spend($pdo, $playerId, $price, $name);
        progression_learn($pdo, $playerId, $recipe['id'], 'trainer', game_now());
        activity_log($pdo, $playerId, 'recipe_learned', ['recipe' => $name, 'price' => $price]);
        return ['recipe_id' => $recipe['id'], 'name' => $name, 'price' => $price];
    });
}
