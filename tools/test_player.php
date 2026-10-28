<?php
/**
 * Test helper for tools/smoke_test.py (CI and local only; never deployed: tools/ isn't packaged).
 *
 *   php tools/test_player.php legacy smoke_dxxxxx     make them a player from before 0.8.0: no known recipes,
 *                                                     skill 1, both raws at the station, progress_version 0,
 *                                                     so their next request replays their past crafts (#30)
 *   php tools/test_player.php skill smoke_dxxxxx 25   set their skill, one XP short of the next level
 *
 * Needs GUILDIE_PRIVATE (and GUILDIE_CONTENT) like tick.php, and refuses unless config.php has
 * 'debug' => true and the name starts with "smoke_".
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}
define('GUILDIE_PRIVATE', getenv('GUILDIE_PRIVATE') ?: dirname(__DIR__) . '/server');
require dirname(__DIR__) . '/server/app/bootstrap.php';

[$mode, $name, $value] = [(string) ($argv[1] ?? ''), (string) ($argv[2] ?? ''), (int) ($argv[3] ?? 0)];
if (!config('debug', false) || !str_starts_with($name, 'smoke_') || !in_array($mode, ['legacy', 'skill'], true)) {
    fwrite(STDERR, "Usage: test_player.php legacy|skill smoke_NAME [SKILL]. Needs 'debug' => true in config.php.\n");
    exit(1);
}

tx(function (PDO $pdo) use ($mode, $name, $value) {
    $stmt = $pdo->prepare('SELECT p.id, pp.profession_id FROM players p JOIN player_professions pp ON pp.player_id = p.id WHERE p.name = ?');
    $stmt->execute([$name]);
    $p = $stmt->fetch();
    if (!$p) {
        throw new RuntimeException("No player $name with a profession.");
    }
    $id = (int) $p['id'];
    if ($mode === 'skill') {
        $skill = max(1, min(progression_max_skill(), $value));
        $pdo->prepare('UPDATE player_professions SET skill = ?, xp = ? WHERE player_id = ?')
            ->execute([$skill, max(0, progression_xp_needed($skill) - 1), $id]);
        return;
    }
    $pdo->prepare('DELETE FROM player_recipes WHERE player_id = ?')->execute([$id]);
    $pdo->prepare('UPDATE player_professions SET skill = 1, xp = 0, bonus_day = 0, progress_version = 0 WHERE player_id = ?')->execute([$id]);
    foreach (content_profession($p['profession_id'])['station']['outputs'] as $o) {
        $pdo->prepare('INSERT IGNORE INTO gathering (player_id, item_id, last_at) VALUES (?, ?, ?)')->execute([$id, $o['item_id'], game_now()]);
    }
});
echo "$name: $mode done.\n";
