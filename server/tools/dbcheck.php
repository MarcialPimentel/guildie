<?php
/**
 * ONE-TIME database connection check.
 *
 * Upload to public_html/games/guildie/api/dbcheck.php, open it in a browser,
 * then DELETE IT. It never prints credentials, only whether the connection works
 * and where the private folder is (needed later for the cron job).
 */
header('Content-Type: text/plain; charset=utf-8');

// api -> guildie -> games -> public_html -> site root, then into guildie-private
$cfgPath = __DIR__ . '/../../../../guildie-private/config.php';

echo "PHP version: " . PHP_VERSION . "\n";

if (!is_file($cfgPath)) {
    echo "FAIL: config.php was not found. Check that the guildie-private folder sits next to public_html.\n";
    exit;
}

echo "Private folder: " . dirname(realpath($cfgPath)) . "\n";

$c = require $cfgPath;

try {
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', $c['db']['host'], $c['db']['name'], $c['db']['charset']);
    $pdo = new PDO($dsn, $c['db']['user'], $c['db']['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $version = $pdo->query('SELECT VERSION()')->fetchColumn();
    echo "OK: connected to the database. MySQL version: $version\n";
    echo "\nAll good. Now delete this file (dbcheck.php) from the server.\n";
} catch (PDOException $e) {
    echo "FAIL: could not connect. Check the database name, user, and password in config.php,\n";
    echo "and that the user has been added to the database with all privileges.\n";
}
