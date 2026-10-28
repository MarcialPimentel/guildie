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

    // How often the market tick runs (seconds). Must match the cron schedule (*/5 = 300).
    'tick_interval_seconds' => 300,

    // Private feedback page (docs/deploy.md, "Reading player feedback"): a long random phrase you make up.
    // Open https://marz.gg/games/guildie/api/index.php?action=feedback_list&key=YOUR_PHRASE
    // Leave empty to turn the page off.
    'feedback_key' => '',

    // The living city (0.9.0): live presence of other players through the realtime service
    // (docs/realtime-setup.md). Leave realtime_url empty to turn presence off (the quarters still work,
    // without live players). realtime_secret must be the same long random phrase as the worker's
    // REALTIME_SECRET (at least 16 characters).
    'realtime_url'    => '',   // e.g. 'wss://guildie-live.marz.gg'
    'realtime_secret' => '',

    // Set to true only while debugging; shows detailed errors in API responses.
    'debug' => false,
];
