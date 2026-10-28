<?php
declare(strict_types=1);

/*
 * Calendar & Events (systems.md 7.2, #46): the Guild Week rhythm and world events from
 * content/calendar.json. Both produce multipliers the Market Simulation uses:
 *   - demand: NPC demand per hour for an item
 *   - price:  where an item's reference value drifts toward (x its usual value) while active
 * The news board shows today's Guild Week day plus announced and active events, so players can
 * learn why prices move (and get ahead of them).
 */

function calendar(): array
{
    return content_file('calendar.json');
}

/** ISO weekday (1 = Monday .. 7 = Sunday) of a game time, UTC. */
function calendar_weekday(int $now): int
{
    return (int) gmdate('N', $now);
}

/** Today's Guild Week entry. */
function calendar_today(int $now): array
{
    $day = calendar_weekday($now);
    foreach (calendar()['week'] ?? [] as $entry) {
        if ((int) $entry['day'] === $day) {
            return $entry;
        }
    }
    return ['day' => $day, 'name' => '', 'headline' => ''];
}

function calendar_event_def(string $id): ?array
{
    foreach (calendar()['events']['list'] ?? [] as $event) {
        if ($event['id'] === $id) {
            return $event;
        }
    }
    return null;
}

/** World events that are announced or running at $now. */
function calendar_events(PDO $pdo, int $now): array
{
    $stmt = $pdo->prepare('SELECT * FROM world_events WHERE ends_at > ? AND announced_at <= ? ORDER BY starts_at');
    $stmt->execute([$now, $now]);
    return $stmt->fetchAll();
}

/**
 * Combined multipliers for every item right now: ['demand' => [item => x], 'price' => [item => x]].
 * Guild Week and active events multiply together.
 */
function calendar_modifiers(PDO $pdo, int $now): array
{
    $mods = ['demand' => [], 'price' => []];
    $apply = function (array $source) use (&$mods) {
        foreach (['demand', 'price'] as $kind) {
            foreach ($source[$kind] ?? [] as $itemId => $x) {
                $mods[$kind][$itemId] = ($mods[$kind][$itemId] ?? 1.0) * (float) $x;
            }
        }
    };
    $apply(calendar_today($now));
    foreach (calendar_events($pdo, $now) as $row) {
        if ((int) $row['starts_at'] <= $now && ($def = calendar_event_def($row['event_id']))) {
            $apply($def);
        }
    }
    return $mods;
}

/** In the tick: maybe announce a new world event (one at a time). Durations scale with the game pace. */
function calendar_tick(PDO $pdo, int $now, int $elapsed): ?string
{
    $settings = calendar()['events']['settings'] ?? [];
    $list = calendar()['events']['list'] ?? [];
    if (!$list) {
        return null;
    }
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM world_events WHERE ends_at > ?');
    $stmt->execute([$now]);
    if ((int) $stmt->fetchColumn() >= (int) ($settings['max_active'] ?? 1)) {
        return null;
    }
    $chance = (float) ($settings['chance_per_hour'] ?? 0.04) * ($elapsed / 3600) / pace();
    if (rand_between(0, 1) >= $chance) {
        return null;
    }
    // Don't repeat the last event.
    $last = $pdo->query('SELECT event_id FROM world_events ORDER BY id DESC LIMIT 1')->fetchColumn();
    $choices = array_values(array_filter($list, fn($e) => $e['id'] !== $last)) ?: $list;
    $event = $choices[mt_rand(0, count($choices) - 1)];
    $starts = $now + (int) round((float) ($settings['announce_hours'] ?? 6) * 3600 * pace());
    $ends = $starts + (int) round((float) $event['duration_hours'] * 3600 * pace());
    $pdo->prepare('INSERT INTO world_events (event_id, announced_at, starts_at, ends_at) VALUES (?, ?, ?, ?)')
        ->execute([$event['id'], $now, $starts, $ends]);
    activity_log($pdo, null, 'world_event', ['event_id' => $event['id'], 'starts_at' => $starts]);
    $pdo->prepare('DELETE FROM world_events WHERE ends_at < ?')->execute([$now - 7 * 86400]);
    return $event['id'];
}

/** The news board: today's Guild Week day, then upcoming and running events. */
function calendar_news(int $now): array
{
    $today = calendar_today($now);
    $news = [[
        'kind'     => 'week',
        'title'    => $today['name'],
        'headline' => $today['headline'],
        'status'   => 'today',
    ]];
    foreach (calendar_events(db(), $now) as $row) {
        $def = calendar_event_def($row['event_id']);
        if (!$def) {
            continue;
        }
        $running = (int) $row['starts_at'] <= $now;
        $news[] = [
            'kind'         => 'event',
            'title'        => $def['name'],
            'headline'     => $def['headline'],
            'status'       => $running ? 'now' : 'soon',
            'seconds'      => $running ? (int) $row['ends_at'] - $now : (int) $row['starts_at'] - $now,
        ];
    }
    return $news;
}
