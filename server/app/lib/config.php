<?php
declare(strict_types=1);

/**
 * Read a config value with a default, e.g. config('tick_interval_seconds', 600).
 */
function config(string $key, mixed $default = null): mixed
{
    return $GLOBALS['guildie_config'][$key] ?? $default;
}
