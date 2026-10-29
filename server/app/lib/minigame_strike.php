<?php
declare(strict_types=1);

/*
 * Strike (0.15.0, content/minigames.json -> kinds.strike): a marker sweeps back and forth along a bar and the
 * player taps while it's over the sweet spot. Pickaxe at the Mine, sickle in the Herb Garden, snare at the
 * Trapper's Lodge: the same rules with three looks (client/src/minigames/Strike.tsx).
 *
 * The marker's position is a triangle wave: x = phase + speed × seconds; position = x mod 2, folded back past 1.
 * The client uses the same formula to draw; the server alone decides what a tap was worth.
 */

/** Roll a round: per swing a speed, a start and a sweet-spot centre. Rounded so both sides use the same numbers. */
function strike_plan(array $p): array
{
    $swings = [];
    $n = max(1, (int) $p['swings']);
    for ($i = 0; $i < $n; $i++) {
        $speed = rand_between((float) $p['speed_min'], (float) $p['speed_max']) * (1 + (float) $p['ramp_per_swing'] * $i);
        $swings[] = [
            'speed'  => round($speed, 4),
            'phase'  => round(rand_between(0, 2), 4),
            'center' => round(rand_between((float) $p['center_min'], (float) $p['center_max']), 4),
        ];
    }
    return [
        'swings'           => $swings,
        'good_width'       => (float) $p['good_width'],
        'perfect_width'    => (float) $p['perfect_width'],
        'good_points'      => (float) $p['good_points'],
        'perfect_points'   => (float) $p['perfect_points'],
        'swing_timeout_ms' => (int) $p['swing_timeout_ms'],
        'gap_ms'           => (int) $p['gap_ms'],
        'min_tap_ms'       => (int) $p['min_tap_ms'],
    ];
}

/** Where the marker is (0..1) after $ms milliseconds of a swing. */
function strike_position(array $swing, int $ms): float
{
    $x = fmod((float) $swing['phase'] + (float) $swing['speed'] * $ms / 1000, 2.0);
    return $x <= 1 ? $x : 2 - $x;
}

/** One tap per swing: whole milliseconds between min_tap_ms and the timeout, or null for no tap. */
function strike_clean_taps(array $plan, array $taps): array
{
    if (count($taps) !== count($plan['swings'])) {
        throw new ApiError('bad_request', 'Send one tap per swing.');
    }
    $out = [];
    foreach ($taps as $t) {
        if ($t === null) {
            $out[] = null;
            continue;
        }
        if (!is_int($t) && !(is_float($t) && floor($t) === $t)) {
            throw new ApiError('bad_request', 'Each tap must be whole milliseconds or null.');
        }
        $t = (int) $t;
        if ($t < (int) $plan['min_tap_ms'] || $t > (int) $plan['swing_timeout_ms']) {
            throw new ApiError('bad_request', 'A tap is outside its swing.');
        }
        $out[] = $t;
    }
    return $out;
}

/** The shortest time the round can take: every tap (or timeout) plus the pauses between swings. */
function strike_min_ms(array $plan, array $taps): int
{
    $ms = (int) $plan['gap_ms'] * max(0, count($taps) - 1);
    foreach ($taps as $t) {
        $ms += $t ?? (int) $plan['swing_timeout_ms'];
    }
    return $ms;
}

/** The longest a round can honestly take (no taps at all). */
function strike_max_ms(array $plan): int
{
    $n = count($plan['swings']);
    return $n * (int) $plan['swing_timeout_ms'] + max(0, $n - 1) * (int) $plan['gap_ms'];
}

/** Score the taps: each swing is perfect, good or a miss. Score = points / the most points possible. */
function strike_score(array $plan, array $taps): array
{
    $steps = [];
    $points = 0.0;
    foreach ($plan['swings'] as $i => $swing) {
        $t = $taps[$i] ?? null;
        $hit = 'miss';
        if ($t !== null) {
            $off = abs(strike_position($swing, $t) - (float) $swing['center']);
            if ($off <= $plan['perfect_width'] / 2) {
                $hit = 'perfect';
            } elseif ($off <= $plan['good_width'] / 2) {
                $hit = 'good';
            }
        }
        $points += $hit === 'perfect' ? $plan['perfect_points'] : ($hit === 'good' ? $plan['good_points'] : 0);
        $steps[] = $hit;
    }
    $best = count($plan['swings']) * (float) $plan['perfect_points'];
    return ['score' => $best > 0 ? $points / $best : 0.0, 'steps' => $steps];
}
