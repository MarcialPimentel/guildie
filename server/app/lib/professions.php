<?php
declare(strict_types=1);

/*
 * Professions & Progression (systems.md 5.1). M1: a one-time choice; skill arrives in M2.
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

function choose_profession(int $playerId, string $professionId): void
{
    $profession = content_profession($professionId);
    if ($profession === null) {
        throw new ApiError('unknown_profession', 'That profession does not exist.');
    }

    tx(function (PDO $pdo) use ($playerId, $profession) {
        // Lock the player row so two quick taps can't both choose.
        $pdo->prepare('SELECT id FROM players WHERE id = ? FOR UPDATE')->execute([$playerId]);
        if (player_profession_id($pdo, $playerId) !== null) {
            throw new ApiError('profession_already_chosen', 'You have already chosen a profession.', 409);
        }

        $now = game_now();
        $pdo->prepare('INSERT INTO player_professions (player_id, profession_id, chosen_at) VALUES (?, ?, ?)')
            ->execute([$playerId, $profession['id'], $now]);

        gathering_init($pdo, $playerId, $profession, $now);
        activity_log($pdo, $playerId, 'profession_chosen', ['profession_id' => $profession['id'], 'profession_name' => $profession['name']]);
    });
}

/** Profession list for the choose screen. */
function professions_for_choice(): array
{
    $out = [];
    foreach (content_professions() as $p) {
        $makes = array_map(fn($r) => item_name($r['output']['item_id']), content_recipes_for($p['id']));
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
