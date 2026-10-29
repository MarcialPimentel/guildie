<?php
declare(strict_types=1);

/*
 * Professions & Progression (systems.md 5.1). A one-time choice; skill, XP and recipes are in progression.php (0.8.0).
 */

/** The player's profession id, or null if they haven't chosen yet. */
function player_profession_id(PDO $pdo, int $playerId): ?string
{
    $stmt = $pdo->prepare('SELECT profession_id FROM player_professions WHERE player_id = ?');
    $stmt->execute([$playerId]);
    $id = $stmt->fetchColumn();
    return $id === false ? null : (string) $id;
}

function require_profession(PDO $pdo, int $playerId): array
{
    $id = player_profession_id($pdo, $playerId);
    if ($id === null) {
        throw new ApiError('no_profession', 'Choose a profession first.');
    }
    return content_profession($id);
}

/** Join a guild. $look = [body color, hat] chosen on the same screen (0.10.0), or null for the default look. */
function choose_profession(int $playerId, string $professionId, ?array $look = null): void
{
    $profession = content_profession($professionId);
    if ($profession === null) {
        throw new ApiError('unknown_profession', 'That profession does not exist.');
    }

    tx(function (PDO $pdo) use ($playerId, $profession, $look) {
        // Lock the player row so two quick taps can't both choose.
        $pdo->prepare('SELECT id FROM players WHERE id = ? FOR UPDATE')->execute([$playerId]);
        if (player_profession_id($pdo, $playerId) !== null) {
            throw new ApiError('profession_already_chosen', 'You have already chosen a profession.', 409);
        }

        $now = game_now();
        $pdo->prepare('INSERT INTO player_professions (player_id, profession_id, skill, xp, progress_version, chosen_at) VALUES (?, ?, 1, 0, ?, ?)')
            ->execute([$playerId, $profession['id'], PROGRESS_VERSION, $now]);

        gathering_init($pdo, $playerId, $profession, $now);
        progression_learn_starters($pdo, $playerId, $profession['id'], 0, $now);   // the Apprentice starter recipe
        if ($look !== null) {
            city_save_look($pdo, $playerId, $look[0], $look[1]);
        }
        activity_log($pdo, $playerId, 'profession_chosen', ['profession_id' => $profession['id'], 'profession_name' => $profession['name']]);
    });
}

/** Profession list for the choose screen. */
function professions_for_choice(): array
{
    $out = [];
    foreach (content_professions() as $p) {
        $makes = array_map(fn($r) => recipe_name($r), array_values(array_filter(content_recipes_for($p['id']), fn($r) => !recipe_is_rare($r))));
        $out[] = [
            'id'                => $p['id'],
            'name'              => $p['name'],
            'tagline'           => $p['tagline'],
            'description'       => $p['description'],
            'needs_from_others' => $p['needs_from_others'],
            'station'           => $p['station']['name'],
            'gathers'           => array_map(fn($o) => item_name($o['item_id']), $p['station']['outputs']),
            'makes'             => $makes,
        ];
    }
    return $out;
}
