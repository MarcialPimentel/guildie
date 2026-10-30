<?php
declare(strict_types=1);

/*
 * The bottega and its upgrades (0.11.0, #51, docs/palazzo.md §2, systems.md 7.1). An upgrade is the exam for
 * the next rank: your skill stops at the top of the rank your bottega allows (25 in the rundown shack, 50 in
 * the repaired workshop, 75 in the two-storey bottega) and crafts give no XP there until you build the next
 * level with ducats plus goods from both other guilds. Each level also gives more craft slots, faster crafts
 * and a bigger, faster station, and the bottega visibly grows in the 3D harbor.
 *
 * Players who held a rank before 0.11.0 keep it (legacy_rank, migration 009) but start in the shack and build
 * to get the look and the bonuses. Owns: player_professions.workshop_level, legacy_rank, upgrade_to,
 * upgrade_ready_at. Numbers: economy.json "workshop"; costs: content/professions.json "workshop".
 */

const WORKSHOP_MAX_LEVEL = 4;

/** What each level gives: [level => ['level', 'name', 'slots', 'craft_speed', 'station_cap', 'station_rate']]. */
function workshop_levels(): array
{
    $out = [];
    foreach (econ('workshop.levels', []) as $l) {
        $out[(int) $l['level']] = $l;
    }
    if (!$out) {
        $out[1] = ['level' => 1, 'name' => 'Workshop', 'slots' => (int) econ('crafting.slots', 2), 'craft_speed' => 0, 'station_cap' => 1, 'station_rate' => 1];
    }
    return $out;
}

function workshop_level_def(int $level): array
{
    $levels = workshop_levels();
    return $levels[max(1, min($level, max(array_keys($levels))))];
}

/** The upgrade that builds $level for a guild (content/professions.json workshop), or null. */
function workshop_upgrade_def(string $professionId, int $level): ?array
{
    foreach (content_profession($professionId)['workshop'] ?? [] as $u) {
        if ((int) $u['level'] === $level) {
            return $u;
        }
    }
    return null;
}

/** The highest rank (0-3) a bottega level allows: level 1 = Apprentice, 2 = Journeyman, 3 = Expert, 4 = Master. */
function workshop_rank_allowed(int $level, ?int $legacyRank): int
{
    $last = count(progression_ranks()) - 1;
    return max(0, min($last, max($level - 1, (int) ($legacyRank ?? 0))));
}

/** The highest skill a player can reach with this bottega (the top of the allowed rank; 100 for a Master). */
function workshop_skill_cap(int $level, ?int $legacyRank): int
{
    $ranks = progression_ranks();
    $next = $ranks[workshop_rank_allowed($level, $legacyRank) + 1] ?? null;
    return $next !== null ? (int) $next['from'] - 1 : progression_max_skill();
}

/** The skill needed to start building the next level: the top of the rank the current level covers. */
function workshop_build_skill(int $level): int
{
    $ranks = progression_ranks();
    $next = $ranks[max(0, $level - 1) + 1] ?? null;
    return $next !== null ? (int) $next['from'] - 1 : progression_max_skill();
}

/** The player's bottega level (1 when they have no guild yet). */
function workshop_level(PDO $pdo, int $playerId): int
{
    $stmt = $pdo->prepare('SELECT workshop_level FROM player_professions WHERE player_id = ?');
    $stmt->execute([$playerId]);
    $v = $stmt->fetchColumn();
    return $v === false ? 1 : max(1, (int) $v);
}

/** A station output with the bottega's bigger cap and faster rate applied. */
function workshop_station_output(array $output, int $level): array
{
    $def = workshop_level_def($level);
    $output['cap'] = max(1, (int) round((float) $output['cap'] * (float) ($def['station_cap'] ?? 1)));
    $output['rate_per_hour'] = (float) $output['rate_per_hour'] * (float) ($def['station_rate'] ?? 1);
    return $output;
}

/** The guild's station outputs for a player's bottega level. */
function workshop_station_outputs(array $profession, int $level): array
{
    return array_map(fn($o) => workshop_station_output($o, $level), $profession['station']['outputs']);
}

function workshop_slots(int $level): int
{
    return max(1, (int) (workshop_level_def($level)['slots'] ?? econ('crafting.slots', 2)));
}

/**
 * Seconds a craft takes at this level (crafts finish craft_speed sooner). $powered = false: the machines are idle
 * (no lamp oil or wages, #52), so the craft gets only the speed of the best level without running costs.
 */
function workshop_craft_seconds(float $seconds, int $level, bool $powered = true): int
{
    $speed = $powered ? (float) (workshop_level_def($level)['craft_speed'] ?? 0) : workshop_unpowered_speed($level);
    return (int) ceil($seconds * (1 - $speed));
}

/**
 * Machine running costs (#52, docs/palazzo.md §2): what a level's machines need while they run, or null when the
 * level has none. ['lamp_oil_per_minute' => per minute of a recipe's listed craft time, 'wages_per_day' => ducats
 * paid on the first powered craft of each day (UTC)].
 */
function workshop_running(int $level): ?array
{
    $r = workshop_level_def($level)['running'] ?? null;
    return is_array($r) ? $r : null;
}

/** The craft speed without powered machines: that of the best level at or below $level with no running costs. */
function workshop_unpowered_speed(int $level): float
{
    for ($l = $level; $l >= 1; $l--) {
        if (workshop_running($l) === null) {
            return (float) (workshop_level_def($l)['craft_speed'] ?? 0);
        }
    }
    return 0.0;
}

/** The item machines burn (Lamp Oil: Alchemists craft it; the Guild Suppliers always sell some). */
function workshop_fuel_item(): string
{
    return (string) econ('workshop.fuel_item', 'lamp_oil');
}

/**
 * Lamp oil one craft of $quantity x $recipe burns at this level. Based on the recipe's listed time (before pace and
 * rank), so slowing the game doesn't make oil cost more per item.
 */
function workshop_oil_for(int $level, array $recipe, int $quantity): int
{
    $r = workshop_running($level);
    if ($r === null) {
        return 0;
    }
    return (int) ceil((float) $recipe['time_seconds'] * $quantity / 60 * (float) ($r['lamp_oil_per_minute'] ?? 0) - 1e-9);
}

/**
 * Run the machines for one craft, inside the craft's transaction: burn the lamp oil and, on the first powered craft
 * of the day, pay the wages. If the player is short of either, nothing is taken and the craft runs by hand (slower;
 * nothing is lost). Returns ['powered' => bool|null (null = no machines), 'oil' => burned, 'wages' => paid].
 */
function workshop_power_craft(PDO $pdo, int $playerId, int $level, array $recipe, int $quantity, int $now): array
{
    $r = workshop_running($level);
    if ($r === null) {
        return ['powered' => null, 'oil' => 0, 'wages' => 0];
    }
    $oil = workshop_oil_for($level, $recipe, $quantity);
    $today = progression_day($now);
    $stmt = $pdo->prepare('SELECT wages_day FROM player_professions WHERE player_id = ?');
    $stmt->execute([$playerId]);
    $wagesDay = (int) ($stmt->fetchColumn() ?: 0);
    $wages = $wagesDay >= $today ? 0 : (int) ($r['wages_per_day'] ?? 0);

    $fuel = workshop_fuel_item();
    if (inventory_count($pdo, $playerId, $fuel, null, true) < $oil || gold_get($pdo, $playerId) < $wages) {
        return ['powered' => false, 'oil' => 0, 'wages' => 0, 'oil_needed' => $oil, 'wages_needed' => $wages];
    }
    if ($oil > 0) {
        inventory_remove($pdo, $playerId, $fuel, $oil);
    }
    if ($wages > 0) {
        gold_spend($pdo, $playerId, $wages, 'the wages');
        $pdo->prepare('UPDATE player_professions SET wages_day = ? WHERE player_id = ?')->execute([$today, $playerId]);
    }
    return ['powered' => true, 'oil' => $oil, 'wages' => $wages];
}

/** What the client shows about a level's running costs (null = none). */
function workshop_running_view(int $level): ?array
{
    $r = workshop_running($level);
    if ($r === null) {
        return null;
    }
    return [
        'fuel_item_id'        => workshop_fuel_item(),
        'fuel_name'           => item_name(workshop_fuel_item()),
        'lamp_oil_per_minute' => (float) ($r['lamp_oil_per_minute'] ?? 0),
        'wages_per_day'       => (int) ($r['wages_per_day'] ?? 0),
        'unpowered_speed'     => workshop_unpowered_speed($level),
    ];
}

/** Goods and ducats an upgrade costs, with what the player has. */
function workshop_cost_view(PDO $pdo, int $playerId, array $up): array
{
    return [
        'gold'  => (int) $up['gold'],
        'items' => array_map(function ($in) use ($pdo, $playerId) {
            $owner = content_item($in['item_id'])['profession'] ?? '';
            return [
                'item_id'  => $in['item_id'],
                'name'     => item_name($in['item_id']),
                'quantity' => (int) $in['quantity'],
                'have'     => inventory_count($pdo, $playerId, $in['item_id']),
                'guild'    => content_profession($owner)['name'] ?? $owner,
            ];
        }, $up['items']),
        'seconds' => (int) ceil((float) $up['hours'] * 3600 * pace()),
    ];
}

/** What the client shows about the bottega (state.profession.workshop and the Bottega upgrade card). */
function workshop_status(PDO $pdo, int $playerId, array $row, int $now): array
{
    $level = $row['workshop_level'];
    $professionId = $row['profession_id'];
    $def = workshop_level_def($level);
    $cap = workshop_skill_cap($level, $row['legacy_rank']);
    $out = [
        'level'      => $level,
        'max_level'  => WORKSHOP_MAX_LEVEL,
        'name'       => $level === 1 ? $def['name'] : (workshop_upgrade_def($professionId, $level)['name'] ?? $def['name']),
        'look'       => $def['name'],
        'slots'      => workshop_slots($level),
        'craft_speed' => (float) ($def['craft_speed'] ?? 0),
        'skill_cap'  => $cap,
        'at_cap'     => $row['skill'] >= $cap && $cap < progression_max_skill(),
        'kept_rank'  => ($row['legacy_rank'] ?? 0) > $level - 1,
        'running'    => null,
        'building'   => null,
        'next'       => null,
    ];
    $running = workshop_running_view($level);
    if ($running !== null) {
        $running['wages_paid_today'] = (int) ($row['wages_day'] ?? 0) >= progression_day($now);
        $running['fuel_have'] = inventory_count($pdo, $playerId, $running['fuel_item_id']);
        $out['running'] = $running;
    }
    if ($row['upgrade_to'] !== null) {
        $up = workshop_upgrade_def($professionId, $row['upgrade_to']);
        $out['building'] = [
            'level'   => $row['upgrade_to'],
            'name'    => $up['name'] ?? 'Your new workshop',
            'ready_at' => $row['upgrade_ready_at'],
            'seconds' => max(0, $row['upgrade_ready_at'] - $now),
            'ready'   => $row['upgrade_ready_at'] <= $now,
        ];
    }
    $up = workshop_upgrade_def($professionId, $level + 1);
    if ($up !== null) {
        $nextDef = workshop_level_def($level + 1);
        $ranks = progression_ranks();
        $opens = $ranks[$level] ?? null;   // level L+1 opens rank index L
        $out['next'] = [
            'level'       => $level + 1,
            'name'        => $up['name'],
            'look'        => $nextDef['name'],
            'needs_skill' => workshop_build_skill($level),
            'opens_rank'  => $opens && ($row['legacy_rank'] ?? 0) < $level ? $opens['name'] : null,
            'slots'       => workshop_slots($level + 1),
            'craft_speed' => (float) ($nextDef['craft_speed'] ?? 0),
            'station_cap' => (float) ($nextDef['station_cap'] ?? 1),
            'station_rate' => (float) ($nextDef['station_rate'] ?? 1),
            'running'     => workshop_running_view($level + 1),
            'cost'        => workshop_cost_view($pdo, $playerId, $up),
        ];
    }
    return $out;
}

/** Start building the next level: pay the ducats and goods now; it's ready after the build time. */
function workshop_start(int $playerId): array
{
    return tx(function (PDO $pdo) use ($playerId) {
        gold_get($pdo, $playerId, true);   // player row first
        $row = progression_row($pdo, $playerId, true);
        if ($row === null) {
            throw new ApiError('no_profession', 'Join a guild first.');
        }
        if ($row['upgrade_to'] !== null) {
            throw new ApiError('already_building', 'Your builders are already at work. Open the new workshop when it is ready.', 409);
        }
        $level = $row['workshop_level'];
        $up = workshop_upgrade_def($row['profession_id'], $level + 1);
        if ($up === null) {
            throw new ApiError('max_level', 'Your bottega is already the finest in Portovela.', 409);
        }
        $needs = workshop_build_skill($level);
        if ($row['skill'] < $needs) {
            throw new ApiError('skill_too_low', sprintf('The guild lets you build the %s from skill %d. You are at %d.', $up['name'], $needs, $row['skill']));
        }
        $now = game_now();
        gold_spend($pdo, $playerId, (int) $up['gold'], $up['name']);
        foreach ($up['items'] as $in) {
            inventory_remove($pdo, $playerId, $in['item_id'], (int) $in['quantity']);
        }
        $seconds = (int) ceil((float) $up['hours'] * 3600 * pace());
        $pdo->prepare('UPDATE player_professions SET upgrade_to = ?, upgrade_ready_at = ? WHERE player_id = ?')
            ->execute([$level + 1, $now + $seconds, $playerId]);
        activity_log($pdo, $playerId, 'workshop_started', ['name' => $up['name'], 'level' => $level + 1, 'gold' => (int) $up['gold'], 'seconds' => $seconds]);
        return ['level' => $level + 1, 'name' => $up['name'], 'seconds' => $seconds];
    });
}

/**
 * Open the finished upgrade. If it opens a new rank and your skill is waiting at the old cap, you step into the
 * new rank at once (+1 skill: the rank-up dialog, the rank's free recipe, raws). Returns what changed.
 */
function workshop_finish(int $playerId): array
{
    return tx(function (PDO $pdo) use ($playerId) {
        gold_get($pdo, $playerId, true);
        $row = progression_row($pdo, $playerId, true);
        if ($row === null) {
            throw new ApiError('no_profession', 'Join a guild first.');
        }
        if ($row['upgrade_to'] === null) {
            throw new ApiError('nothing_building', 'Nothing is being built.', 409);
        }
        $now = game_now();
        if ($row['upgrade_ready_at'] > $now) {
            throw new ApiError('not_ready', sprintf('The builders need %s more.', orders_duration_text($row['upgrade_ready_at'] - $now)), 409);
        }
        $oldCap = workshop_skill_cap($row['workshop_level'], $row['legacy_rank']);
        $level = $row['upgrade_to'];
        $up = workshop_upgrade_def($row['profession_id'], $level);
        $pdo->prepare('UPDATE player_professions SET workshop_level = ?, upgrade_to = NULL, upgrade_ready_at = NULL WHERE player_id = ?')
            ->execute([$level, $playerId]);
        $row['workshop_level'] = $level;
        $row['upgrade_to'] = null;
        $row['upgrade_ready_at'] = null;
        activity_log($pdo, $playerId, 'workshop_built', ['name' => $up['name'] ?? 'Your workshop', 'level' => $level, 'look' => workshop_level_def($level)['name']]);

        $progress = null;
        $newCap = workshop_skill_cap($level, $row['legacy_rank']);
        if ($newCap > $oldCap && $row['skill'] >= $oldCap) {
            $progress = progression_apply($pdo, $playerId, $row, 0, 1, $now);
        }
        return ['level' => $level, 'name' => $up['name'] ?? 'Your workshop', 'look' => workshop_level_def($level)['name'], 'progress' => $progress];
    });
}
