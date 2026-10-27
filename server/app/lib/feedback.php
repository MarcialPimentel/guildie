<?php
declare(strict_types=1);

/*
 * In-game feedback (#29). Playtesters send short notes from the game; Marz reads them on a private page
 * whose key lives only in guildie-private/config.php ('feedback_key'). No key set = page disabled.
 */

const FEEDBACK_MAX_CHARS = 1000;
const FEEDBACK_PER_HOUR = 10;

function feedback_save(int $playerId, string $message, string $screen): void
{
    $message = trim($message);
    if ($message === '') {
        throw new ApiError('bad_request', 'Write something first.');
    }
    if (mb_strlen($message) > FEEDBACK_MAX_CHARS) {
        throw new ApiError('bad_request', sprintf('Please keep it under %d characters.', FEEDBACK_MAX_CHARS));
    }
    $screen = mb_substr(trim($screen), 0, 64);

    tx(function (PDO $pdo) use ($playerId, $message, $screen) {
        $now = game_now();
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM feedback WHERE player_id = ? AND created_at > ?');
        $stmt->execute([$playerId, $now - 3600]);
        if ((int) $stmt->fetchColumn() >= FEEDBACK_PER_HOUR) {
            throw new ApiError('too_much_feedback', 'Thanks! That is a lot of feedback for one hour. Try again a bit later.', 429);
        }
        $pdo->prepare(
            'INSERT INTO feedback (player_id, message, screen, build, gold, profession, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $playerId, $message, $screen, substr(GUILDIE_BUILD, 0, 64), gold_get($pdo, $playerId),
            (string) (player_profession_id($pdo, $playerId) ?? ''), $now,
        ]);
    });
}

/** The private feedback page as HTML. Throws "unknown action" for a missing or wrong key. */
function feedback_page(string $key): string
{
    $expected = (string) config('feedback_key', '');
    if ($expected === '' || !hash_equals($expected, $key)) {
        throw new ApiError('unknown_action', 'Unknown action.', 404);
    }
    $rows = db()->query(
        'SELECT f.*, p.name FROM feedback f JOIN players p ON p.id = f.player_id ORDER BY f.id DESC LIMIT 500'
    )->fetchAll();

    $h = fn($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
    $out = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<meta name="robots" content="noindex"><title>Guildie feedback</title><style>'
        . 'body{font-family:system-ui,sans-serif;background:#1b1816;color:#e8d5a8;margin:0;padding:16px;max-width:820px}'
        . 'h1{color:#c9963f;font-size:22px}.f{background:#2a211b;border-radius:10px;padding:12px 14px;margin:0 0 12px}'
        . '.m{white-space:pre-wrap;font-size:16px;margin:6px 0 0}.meta{color:#9c8b74;font-size:13px}'
        . '</style></head><body><h1>Guildie feedback (' . count($rows) . ')</h1>';
    if (!$rows) {
        $out .= '<p class="meta">No feedback yet.</p>';
    }
    foreach ($rows as $r) {
        $out .= '<div class="f"><div class="meta"><b>' . $h($r['name']) . '</b> · ' . $h($r['profession'] ?: 'no guild')
            . ' · ' . $h($r['gold']) . 'g · screen: ' . $h($r['screen'] ?: '?') . ' · build ' . $h($r['build'])
            . ' · ' . gmdate('Y-m-d H:i', (int) $r['created_at']) . ' UTC</div><div class="m">' . $h($r['message']) . '</div></div>';
    }
    return $out . '</body></html>';
}
