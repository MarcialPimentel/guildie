<?php
declare(strict_types=1);

/**
 * Static game data from /content (GDD 11.7). Read-only, cached per request.
 */
function content_file(string $name): array
{
    static $cache = [];
    if (!isset($cache[$name])) {
        $path = GUILDIE_CONTENT . '/' . $name;
        $data = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        if (!is_array($data)) {
            throw new RuntimeException("Content file missing or invalid: $name");
        }
        $cache[$name] = $data;
    }
    return $cache[$name];
}

/** All items keyed by id. */
function content_items(): array
{
    static $byId = null;
    if ($byId === null) {
        $byId = [];
        foreach (content_file('items.json')['items'] as $item) {
            $byId[$item['id']] = $item;
        }
    }
    return $byId;
}

function content_item(string $id): ?array
{
    return content_items()[$id] ?? null;
}

/** Economy settings (starting gold, limits). */
function content_economy(): array
{
    return content_file('economy.json');
}
