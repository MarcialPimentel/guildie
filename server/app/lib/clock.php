<?php
declare(strict_types=1);

/*
 * Game clock (systems.md 3, Time model). All game logic uses game_now() instead of time(),
 * so the economy simulator can run a simulated week in seconds.
 */

function game_now(): int
{
    return $GLOBALS['guildie_fake_now'] ?? time();
}

/** Simulator only: set the clock. */
function set_game_now(?int $now): void
{
    $GLOBALS['guildie_fake_now'] = $now;
}

/** The pace multiplier from economy.json: 1.0 = fast playtest, larger = slower game. */
function pace(): float
{
    $p = (float) (content_economy()['pace']['time_multiplier'] ?? 1.0);
    return $p > 0 ? $p : 1.0;
}

/** Random float in [min, max]. Uses mt_rand so the simulator can be seeded for repeatable runs. */
function rand_between(float $min, float $max): float
{
    return $min + (mt_rand() / mt_getrandmax()) * ($max - $min);
}
