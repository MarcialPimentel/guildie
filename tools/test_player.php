<?php
/**
 * Test helper for tools/smoke_test.py (CI and local only; never deployed: tools/ isn't packaged).
 *
 *   php tools/test_player.php legacy smoke_dxxxxx     make them a player from before 0.8.0: no known recipes,
 *                                                     skill 1, both raws at the station, progress_version 0,
 *                                                     so their next request replays their past crafts (#30)
 *   php tools/test_player.php skill smoke_dxxxxx 25   set their skill, one XP short of the next level
 *   php tools/test_player.php give smoke_dxxxxx ITEM 10   add goods to their storehouse (0.11.0)
 *   php tools/test_player.php gold smoke_dxxxxx 5000      set their ducats
 *   php tools/test_player.php build_ready smoke_dxxxxx    finish their bottega upgrade's build time now
 *   php tools/test_player.php kept_rank smoke_dxxxxx 1    the rank they "held before 0.11.0" (migration 009)
 *   php tools/test_player.php expire_wanted smoke_dxxxxx  make their open Wanted posts expire now
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
$modes = ['legacy', 'skill', 'give', 'gold', 'build_ready', 'kept_rank', 'expire_wanted'];
if (!config('debug', false) || !str_starts_with($name, 'smoke_') || !in_array($mode, $modes, true)) {
    fwrite(STDERR, 'Usage: test_player.php ' . implode('|', $modes) . " smoke_NAME [VALUE]. Needs 'debug' => true in config.php.\n");
    exit(1);
}

tx(function (PDO $pdo) use ($mode, $name, $value, $argv) {
    $stmt = $pdo->prepare('SELECT p.id, pp.profession_id FROM players p JOIN player_professions pp ON pp.player_id = p.id WHERE p.name = ?');
    $stmt->execute([$name]);
    $p = $stmt->fetch();
    if (!$p) {
        throw new RuntimeException("No player $name with a profession.");
    }
    $id = (int) $p['id'];
    if ($mode === 'give') {
        inventory_add($pdo, $id, (string) $argv[3], (int) ($argv[4] ?? 1));
        return;
    }
    if ($mode === 'gold') {
        $pdo->prepare('UPDATE players SET gold = ? WHERE id = ?')->execute([max(0, $value), $id]);
        return;
    }
    if ($mode === 'build_ready') {
        $pdo->prepare('UPDATE player_professions SET upgrade_ready_at = ? WHERE player_id = ? AND upgrade_to IS NOT NULL')->execute([game_now() - 1, $id]);
        return;
    }
    if ($mode === 'kept_rank') {
        $pdo->prepare('UPDATE player_professions SET legacy_rank = ? WHERE player_id = ?')->execute([max(0, min(3, $value)), $id]);
        return;
    }
    if ($mode === 'expire_wanted') {
        $pdo->prepare("UPDATE wanted_posts SET expires_at = ? WHERE player_id = ? AND status = 'open'")->execute([game_now() - 1, $id]);
        return;
    }
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
