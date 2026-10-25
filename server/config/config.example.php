<?php
/**
 * Guildie server configuration — TEMPLATE.
 *
 * Copy this file to `config.php` inside the private folder on SiteGround
 * (guildie-private/config.php, which sits next to public_html, never inside it)
 * and fill in the real values. Never commit the real config.php.
 */
return [
    'db' => [
        'host'    => 'localhost',   // SiteGround: scripts on the same server use localhost
        'name'    => '',            // e.g. dbabc123xyz (SiteGround adds a prefix)
        'user'    => '',            // e.g. uabc123xyz
        'pass'    => '',            // the generated password, keep it in your password manager
        'charset' => 'utf8mb4',
    ],

    // Shown in the client so you can confirm a deploy is current. Bump on every deploy.
    'build' => '0.0.1',

    // How often the market tick should run (seconds). Used by the catch-up guard.
    'tick_interval_seconds' => 600,

    // Set to true only while debugging; shows detailed errors in API responses.
    'debug' => false,
];
