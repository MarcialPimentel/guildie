<?php
declare(strict_types=1);

/**
 * Static game data from /content (systems.md 4.3). Read-only, cached per request.
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

/** Index a content list by id. */
function content_index(string $file, string $key): array
{
    static $cache = [];
    $cacheKey = "$file:$key";
    if (!isset($cache[$cacheKey])) {
        $cache[$cacheKey] = [];
        foreach (content_file($file)[$key] as $row) {
            $cache[$cacheKey][$row['id']] = $row;
        }
    }
    return $cache[$cacheKey];
}

function content_items(): array        { return content_index('items.json', 'items'); }
function content_item(string $id): ?array { return content_items()[$id] ?? null; }

function content_professions(): array  { return content_index('professions.json', 'professions'); }
function content_profession(string $id): ?array { return content_professions()[$id] ?? null; }

function content_recipes(): array      { return content_index('recipes.json', 'recipes'); }
function content_recipe(string $id): ?array { return content_recipes()[$id] ?? null; }

/** Recipes for one profession, in content order. */
function content_recipes_for(string $professionId): array
{
    return array_values(array_filter(content_recipes(), fn($r) => $r['profession'] === $professionId));
}

/** Economy settings (economy.json). */
function content_economy(): array
{
    return content_file('economy.json');
}

/** One economy value by dotted path, e.g. econ('market.floor_multiplier'). */
function econ(string $path, mixed $default = null): mixed
{
    $value = content_economy();
    foreach (explode('.', $path) as $part) {
        if (!is_array($value) || !array_key_exists($part, $value)) {
            return $default;
        }
        $value = $value[$part];
    }
    return $value;
}

function item_name(string $id): string
{
    return content_item($id)['name'] ?? $id;
}
