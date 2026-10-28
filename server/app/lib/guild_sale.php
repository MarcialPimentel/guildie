<?php
declare(strict_types=1);

/*
 * Sell to guild (systems.md 6.1, #28). An instant sale with no listing, so a player is never stuck,
 * even with 0 gold. The item is consumed (a sink) and gold is paid at once.
 *
 * The price starts low (guild_sale.base_multiplier × reference value) and drops with every unit a player
 * sells of that item ("pressure"). Pressure fades over time, so the price recovers. Players always see the
 * exact total before confirming; only the rule behind it is hidden. Selling on the Exchange should almost
 * always pay better (Pillar 2).
 */

function guild_sale_settings(): array
{
    return [
        'base'      => (float) econ('guild_sale.base_multiplier', 0.5),
        'drop'      => (float) econ('guild_sale.drop_per_unit', 0.03),
        'floor'     => (float) econ('guild_sale.floor_multiplier', 0.15),
        'half_life' => (float) econ('guild_sale.recovery_half_life_hours', 4) * 3600 * pace(),
        'hint'      => (float) econ('guild_sale.hint_below', 0.6),
    ];
}

/** A player's current pressure on an item, after fading since it was last updated. */
function guild_sale_pressure(PDO $pdo, int $playerId, string $itemId, bool $lock = false): float
{
    $stmt = $pdo->prepare('SELECT pressure, updated_at FROM guild_sales WHERE player_id = ? AND item_id = ?' . ($lock ? ' FOR UPDATE' : ''));
    $stmt->execute([$playerId, $itemId]);
    $row = $stmt->fetch();
    if (!$row) {
        return 0.0;
    }
    $elapsed = max(0, game_now() - (int) $row['updated_at']);
    $halfLife = max(1.0, guild_sale_settings()['half_life']);
    $pressure = (float) $row['pressure'] * 0.5 ** ($elapsed / $halfLife);
    return $pressure < 0.01 ? 0.0 : $pressure;
}

/** Price multiplier (× reference value) for the next unit, given the current pressure. */
function guild_sale_multiplier(float $pressure): float
{
    $s = guild_sale_settings();
    return max($s['floor'], $s['base'] * (1 - $s['drop']) ** $pressure);
}

/** Gold paid for each of the next $quantity units: every unit sold lowers the next one. */
function guild_sale_unit_prices(float $reference, float $pressure, int $quantity): array
{
    $prices = [];
    for ($k = 0; $k < $quantity; $k++) {
        $prices[] = max(1, (int) floor($reference * guild_sale_multiplier($pressure + $k)));
    }
    return $prices;
}

/** What the guild would pay right now for $quantity of an item (shown in the sell form). */
function guild_sale_quote(int $playerId, string $itemId, int $quantity): array
{
    $quantity = max(1, $quantity);
    $pdo = db();
    $pressure = guild_sale_pressure($pdo, $playerId, $itemId);
    $prices = guild_sale_unit_prices(market_reference_value($itemId), $pressure, $quantity);
    return [
        'quantity'   => $quantity,
        'total'      => array_sum($prices),
        'first_unit' => $prices[0],
        'last_unit'  => $prices[count($prices) - 1],
        'hint'       => guild_sale_hint($itemId, $pressure),
    ];
}

/** A flavour line when the guild's offer is well below normal (the rule itself stays hidden). */
function guild_sale_hint(string $itemId, float $pressure): ?string
{
    $s = guild_sale_settings();
    if (guild_sale_multiplier($pressure) >= $s['base'] * $s['hint']) {
        return null;
    }
    return sprintf('The guild quartermaster has plenty of %s today.', item_name($itemId));
}

/**
 * Sell to the guild. If the client passes the total it showed ($expectedTotal) and the price has since
 * dropped, the sale is refused so a player never gets less than they were shown.
 */
function guild_sell(int $playerId, string $itemId, int $quantity, ?int $expectedTotal): array
{
    if (content_item($itemId) === null) {
        throw new ApiError('unknown_item', 'That item does not exist.');
    }
    if ($quantity < 1 || $quantity > 10000) {
        throw new ApiError('bad_request', 'Quantity must be at least 1.');
    }
    return tx(function (PDO $pdo) use ($playerId, $itemId, $quantity, $expectedTotal) {
        require_profession($pdo, $playerId);
        $now = game_now();
        // Make sure the row exists so it can be locked: two sales at once can't both get the higher price.
        $pdo->prepare('INSERT IGNORE INTO guild_sales (player_id, item_id, pressure, updated_at) VALUES (?, ?, 0, ?)')
            ->execute([$playerId, $itemId, $now]);
        $pressure = guild_sale_pressure($pdo, $playerId, $itemId, true);

        $total = array_sum(guild_sale_unit_prices(market_reference_value($itemId), $pressure, $quantity));
        if ($expectedTotal !== null && $total < $expectedTotal) {
            throw new ApiError('price_changed', sprintf("The guild's offer changed to %s. Check it and try again.", ducats($total)), 409);
        }

        inventory_remove($pdo, $playerId, $itemId, $quantity);
        gold_add($pdo, $playerId, $total);
        $pdo->prepare('UPDATE guild_sales SET pressure = ?, updated_at = ? WHERE player_id = ? AND item_id = ?')
            ->execute([round($pressure + $quantity, 4), $now, $playerId, $itemId]);
        activity_log($pdo, $playerId, 'sold_to_guild', ['item_id' => $itemId, 'quantity' => $quantity, 'earned' => $total]);
        return ['item_id' => $itemId, 'quantity' => $quantity, 'total' => $total];
    });
}
