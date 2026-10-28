<?php
declare(strict_types=1);

/*
 * Automatic database updates (docs/deploy.md). Deploys upload new migrations/NNN_*.sql files
 * next to app/. The first API request or cron tick afterwards applies any file numbered higher
 * than game_state.schema_version, in order, once. A MySQL named lock makes sure only one
 * request does it, even if many arrive at the same moment.
 *
 * Migrations must be safe to re-run (CREATE TABLE IF NOT EXISTS, INSERT IGNORE, ...) because
 * MySQL can't roll back table changes if a file fails halfway.
 *
 * From 006 on, every migration must end with the line `-- END NNN` (its own number). The deploy
 * uploads files one at a time, so a request can arrive while a migration is only half written; the
 * marker proves the whole file is there. A file without it is skipped (with everything after it)
 * until a later request finds it complete (0.5.2).
 */

const MIGRATION_FIRST_WITH_END_MARKER = 6;

/** True when the migration file is fully uploaded: from 006 on it must end with `-- END NNN`. */
function migration_complete(int $number, string $sql): bool
{
    if ($number < MIGRATION_FIRST_WITH_END_MARKER) {
        return true;
    }
    $lines = preg_split('/\r?\n/', rtrim($sql));
    return trim((string) end($lines)) === sprintf('-- END %03d', $number);
}

function migrations_dir(): string
{
    return getenv('GUILDIE_MIGRATIONS') ?: GUILDIE_PRIVATE . '/migrations';
}

/** Pending migration files: [number => path], in order. */
function migrations_available(): array
{
    $files = [];
    foreach (glob(migrations_dir() . '/[0-9][0-9][0-9]_*.sql') ?: [] as $path) {
        $files[(int) substr(basename($path), 0, 3)] = $path;
    }
    ksort($files);
    return $files;
}

function schema_version(PDO $pdo): int
{
    try {
        $v = $pdo->query("SELECT v FROM game_state WHERE k = 'schema_version'")->fetchColumn();
        return $v === false ? 0 : (int) $v;
    } catch (PDOException $e) {
        return 0;   // brand new database: game_state doesn't exist yet
    }
}

/**
 * Apply pending migrations if there are any. Cheap when there's nothing to do (one glob + one query).
 * Returns the list of applied migration numbers.
 */
function migrate_if_needed(): array
{
    $available = migrations_available();
    if (!$available) {
        return [];
    }
    $pdo = db();
    $latest = max(array_keys($available));
    if (schema_version($pdo) >= $latest) {
        return [];
    }

    if ((int) $pdo->query("SELECT GET_LOCK('guildie_migrate', 30)")->fetchColumn() !== 1) {
        throw new RuntimeException('Could not get the migration lock.');
    }
    try {
        $applied = [];
        $current = schema_version($pdo);   // re-check: another request may have just finished
        $pdo->exec('SET SESSION lock_wait_timeout = 10');   // don't hang forever behind a long query
        foreach ($available as $number => $path) {
            if ($number <= $current) {
                continue;
            }
            $file = (string) file_get_contents($path);
            if (!migration_complete($number, $file)) {
                // Still uploading (or missing its END line): try again on a later request.
                error_log('Guildie: migration ' . basename($path) . ' is incomplete (no "-- END" line yet); waiting');
                break;
            }
            foreach (sql_statements($file) as $sql) {
                try {
                    $pdo->exec($sql);
                } catch (Throwable $e) {
                    error_log('Guildie: migration ' . basename($path) . ' failed: ' . $e->getMessage() . ' | statement: ' . substr($sql, 0, 300));
                    throw $e;
                }
            }
            $pdo->prepare("INSERT INTO game_state (k, v) VALUES ('schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")
                ->execute([(string) $number]);
            error_log('Guildie: applied migration ' . basename($path));
            $applied[] = $number;
        }
        return $applied;
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('guildie_migrate')");
    }
}

/** Split a migration file into statements: drops -- comments, splits on ; at line ends. */
function sql_statements(string $sql): array
{
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    $parts = preg_split('/;\s*(\r?\n|$)/', $sql);
    return array_values(array_filter(array_map('trim', $parts), fn($s) => $s !== ''));
}
