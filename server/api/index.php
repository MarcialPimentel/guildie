<?php
/**
 * Guildie public API entry point.
 *
 * Deployed to public_html/games/guildie/api/index.php. This is the ONLY server file
 * reachable from the web. Everything else lives in guildie-private/ (next to public_html).
 *
 * Usage: index.php?action=<name>   (see server/app/router.php for the list)
 */

// api -> guildie -> games -> public_html -> site root, then into guildie-private.
// GUILDIE_PRIVATE can be overridden by an environment variable for local testing.
$private = getenv('GUILDIE_PRIVATE') ?: __DIR__ . '/../../../../guildie-private';

if (!is_file($private . '/app/bootstrap.php')) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => ['code' => 'not_installed', 'message' => 'Server files are missing.']]);
    exit;
}

define('GUILDIE_PRIVATE', realpath($private));
require GUILDIE_PRIVATE . '/app/bootstrap.php';

guildie_handle_request();
