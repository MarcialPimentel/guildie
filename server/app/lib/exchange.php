<?php
declare(strict_types=1);

/*
 * The Exchange (systems.md 6.1). Buyout-only auction house shared by players and NPC personas.
 * Listing moves items out of inventory; buying moves gold and items in one transaction.
 *
 * The listing deposit is never charged up front (0.2.2, #27): a player with 0 gold can always list.
 * It comes out of the sale money as the listing sells, and on cancel/expiry only if affordable.
 */

function persona_label(string $persona): string
{
    return (string) econ("personas.$persona.label", $persona);
}

function player_names(PDO $pdo, array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) {
        return [];
    }
    $stmt = $pdo->prepare('SELECT id, name FROM players WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
    $stmt->execute($ids);
    return array_column($stmt->fetchAll(), 'name', 'id');
}

function party_label(array $names, ?int $playerId, ?string $persona): string
{
    if ($playerId) {
        return $names[$playerId] ?? 'a player';
    }
    return persona_label((string) $persona);
}

function exchange_deposit(string $itemId, int $quantity, int $hours): int
{
    $ref = market_reference_value($itemId);
    return max(1, (int) ceil($ref * $quantity * (float) econ('exchange.deposit_rate_per_12h', 0.01) * $hours / 12));
}

function exchange_cut(int $total): int
{
    return (int) ceil($total * (float) econ('exchange.cut', 0.05));
}

function exchange_list(int $playerId, string $itemId, int $quantity, int $unitPrice, int $hours): array
{
    if (content_item($itemId) === null) {
        throw new ApiError('unknown_item', 'That item does not exist.');
    }
    $durations = econ('exchange.durations_hours', [12, 24, 48]);
    if (!in_array($hours, $durations, true)) {
        throw new ApiError('bad_request', 'Duration must be one of: ' . implode(', ', $durations) . ' hours.');
    }
    $maxPrice = max(1, (int) ceil(market_reference_value($itemId) * (float) econ('exchange.max_price_multiple', 20)));
    if ($unitPrice < 1 || $unitPrice > $maxPrice) {
        throw new ApiError('bad_price', 'Price must be between 1 and ' . ducats($maxPrice) . '.');
    }
    if ($quantity < 1 || $quantity > 10000) {
        throw new ApiError('bad_request', 'Quantity must be at least 1.');
    }
    $deposit = exchange_deposit($itemId, $quantity, $hours);

    return tx(function (PDO $pdo) use ($playerId, $itemId, $quantity, $unitPrice, $hours, $deposit) {
        require_profession($pdo, $playerId);
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM listings WHERE seller_player_id = ? AND status = 'active' FOR UPDATE");
        $stmt->execute([$playerId]);
        $max = (int) econ('exchange.max_active_listings', 20);
        if ((int) $stmt->fetchColumn() >= $max) {
            throw new ApiError('too_many_listings', "You can have at most $max active listings.");
        }

        inventory_remove($pdo, $playerId, $itemId, $quantity);

        $now = game_now();
        $pdo->prepare(
            'INSERT INTO listings (seller_player_id, item_id, quantity, original_quantity, unit_price, deposit, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([$playerId, $itemId, $quantity, $quantity, $unitPrice, $deposit, $now, $now + $hours * 3600]);
        $listingId = (int) $pdo->lastInsertId();

        activity_log($pdo, $playerId, 'listed', ['item_id' => $itemId, 'quantity' => $quantity, 'unit_price' => $unitPrice, 'deposit' => $deposit]);
        return ['listing_id' => $listingId, 'deposit' => $deposit];
    });
}

/**
 * Execute a purchase against a listing row that is already locked (FOR UPDATE) in this transaction.
 * Exactly one of $buyerPlayerId / $buyerPersona is set.
 */
function exchange_execute(PDO $pdo, array $listing, int $quantity, ?int $buyerPlayerId, ?string $buyerPersona): array
{
    $total = $quantity * (int) $listing['unit_price'];
    $itemId = $listing['item_id'];
    $sellerId = $listing['seller_player_id'] !== null ? (int) $listing['seller_player_id'] : null;
    $sellerPersona = $listing['seller_persona'];
    $quality = (int) $listing['quality'];

    if ($buyerPlayerId !== null) {
        gold_spend($pdo, $buyerPlayerId, $total, 'this purchase');
        inventory_add($pdo, $buyerPlayerId, $itemId, $quantity, $quality);
    }

    $remaining = (int) $listing['quantity'] - $quantity;
    $cut = 0;
    $depositTaken = 0;
    if ($sellerId !== null) {
        $cut = exchange_cut($total);
        $depositTaken = min(exchange_deposit_due($listing, $remaining), $total - $cut);
        gold_add($pdo, $sellerId, $total - $cut - $depositTaken);
    }

    $pdo->prepare('UPDATE listings SET quantity = ?, status = ?, deposit_paid = deposit_paid + ? WHERE id = ?')
        ->execute([$remaining, $remaining > 0 ? 'active' : 'sold', $depositTaken, $listing['id']]);

    $now = game_now();
    $pdo->prepare(
        'INSERT INTO trades (listing_id, item_id, quality, quantity, unit_price, buyer_player_id, buyer_persona, seller_player_id, seller_persona, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([$listing['id'], $itemId, $quality, $quantity, $listing['unit_price'], $buyerPlayerId, $buyerPersona, $sellerId, $sellerPersona, $now]);

    $names = player_names($pdo, [$buyerPlayerId, $sellerId]);
    if ($sellerId !== null) {
        activity_log($pdo, $sellerId, 'sold', [
            'item_id' => $itemId, 'quantity' => $quantity, 'buyer' => party_label($names, $buyerPlayerId, $buyerPersona),
            'buyer_is_player' => $buyerPlayerId !== null, 'earned' => $total - $cut - $depositTaken, 'cut' => $cut,
            'deposit' => $depositTaken,
        ]);
    }
    if ($buyerPlayerId !== null) {
        activity_log($pdo, $buyerPlayerId, 'bought', [
            'item_id' => $itemId, 'quantity' => $quantity, 'seller' => party_label($names, $sellerId, $sellerPersona), 'total' => $total,
        ]);
    }
    return ['total' => $total, 'cut' => $cut, 'deposit' => $depositTaken, 'quantity' => $quantity];
}

/**
 * Deposit still owed after a sale leaves $remaining units in the listing. The deposit is collected in
 * proportion to how much of the listing has sold, so the last unit sold settles it in full.
 */
function exchange_deposit_due(array $listing, int $remaining): int
{
    $deposit = (int) ($listing['deposit'] ?? 0);
    $paid = (int) ($listing['deposit_paid'] ?? 0);
    $original = max(1, (int) $listing['original_quantity']);
    if ($deposit <= $paid) {
        return 0;
    }
    $sold = $original - $remaining;
    $dueSoFar = intdiv($deposit * $sold + $original - 1, $original);   // rounded up
    return max(0, min($deposit, $dueSoFar) - $paid);
}

/**
 * On cancel or expiry: collect the rest of the deposit if the seller can afford it, otherwise waive it.
 * Returns [charged, waived].
 */
function exchange_settle_deposit(PDO $pdo, array $listing): array
{
    $owed = max(0, (int) $listing['deposit'] - (int) ($listing['deposit_paid'] ?? 0));
    if ($owed === 0 || $listing['seller_player_id'] === null) {
        return [0, 0];
    }
    $sellerId = (int) $listing['seller_player_id'];
    if (gold_get($pdo, $sellerId, true) < $owed) {
        return [0, $owed];
    }
    gold_spend($pdo, $sellerId, $owed, 'the listing deposit');
    $pdo->prepare('UPDATE listings SET deposit_paid = deposit WHERE id = ?')->execute([$listing['id']]);
    return [$owed, 0];
}

function exchange_buy(int $playerId, int $listingId, int $quantity): array
{
    if ($quantity < 1) {
        throw new ApiError('bad_request', 'Quantity must be at least 1.');
    }
    return tx(function (PDO $pdo) use ($playerId, $listingId, $quantity) {
        require_profession($pdo, $playerId);
        $stmt = $pdo->prepare('SELECT * FROM listings WHERE id = ? FOR UPDATE');
        $stmt->execute([$listingId]);
        $listing = $stmt->fetch();
        if (!$listing || $listing['status'] !== 'active' || (int) $listing['expires_at'] <= game_now()) {
            throw new ApiError('listing_gone', 'That listing is no longer available.', 409);
        }
        if ((int) $listing['seller_player_id'] === $playerId) {
            throw new ApiError('own_listing', "You can't buy your own listing. Cancel it instead.");
        }
        if ($quantity > (int) $listing['quantity']) {
            throw new ApiError('not_enough_listed', sprintf('Only %d left in that listing.', $listing['quantity']), 409);
        }
        return exchange_execute($pdo, $listing, $quantity, $playerId, null);
    });
}

function exchange_cancel(int $playerId, int $listingId): void
{
    tx(function (PDO $pdo) use ($playerId, $listingId) {
        $stmt = $pdo->prepare('SELECT * FROM listings WHERE id = ? FOR UPDATE');
        $stmt->execute([$listingId]);
        $listing = $stmt->fetch();
        if (!$listing || (int) $listing['seller_player_id'] !== $playerId) {
            throw new ApiError('not_found', 'Listing not found.', 404);
        }
        if ($listing['status'] !== 'active') {
            throw new ApiError('listing_gone', 'That listing is no longer active.', 409);
        }
        if ((int) $listing['quantity'] > 0) {
            inventory_add($pdo, $playerId, $listing['item_id'], (int) $listing['quantity'], (int) $listing['quality']);
        }
        [$charged, $waived] = exchange_settle_deposit($pdo, $listing);
        $pdo->prepare("UPDATE listings SET status = 'cancelled' WHERE id = ?")->execute([$listingId]);
        activity_log($pdo, $playerId, 'listing_cancelled', [
            'item_id' => $listing['item_id'], 'quantity' => (int) $listing['quantity'], 'deposit' => $charged, 'waived' => $waived,
        ]);
    });
}

/** Expire old listings (runs in the tick). Player items go back to inventory. */
function exchange_expire(PDO $pdo, int $now): int
{
    $stmt = $pdo->prepare("SELECT * FROM listings WHERE status = 'active' AND expires_at <= ? FOR UPDATE");
    $stmt->execute([$now]);
    $count = 0;
    foreach ($stmt->fetchAll() as $listing) {
        if ($listing['seller_player_id'] !== null && (int) $listing['quantity'] > 0) {
            inventory_add($pdo, (int) $listing['seller_player_id'], $listing['item_id'], (int) $listing['quantity'], (int) $listing['quality']);
            [$charged, $waived] = exchange_settle_deposit($pdo, $listing);
            activity_log($pdo, (int) $listing['seller_player_id'], 'listing_expired', [
                'item_id' => $listing['item_id'], 'quantity' => (int) $listing['quantity'], 'deposit' => $charged, 'waived' => $waived,
            ]);
        }
        $pdo->prepare("UPDATE listings SET status = 'expired' WHERE id = ?")->execute([$listing['id']]);
        $count++;
    }
    return $count;
}

/** Market overview: every item with its lowest price, amount listed, and reference value. */
function exchange_overview(): array
{
    $pdo = db();
    $now = game_now();
    $stmt = $pdo->prepare(
        "SELECT item_id, MIN(unit_price) AS lowest, SUM(quantity) AS listed,
                SUM(CASE WHEN seller_player_id IS NOT NULL THEN quantity ELSE 0 END) AS from_players
         FROM listings WHERE status = 'active' AND expires_at > ? GROUP BY item_id"
    );
    $stmt->execute([$now]);
    $listed = [];
    foreach ($stmt->fetchAll() as $row) {
        $listed[$row['item_id']] = $row;
    }

    $stmt = $pdo->prepare(
        'SELECT item_id, SUM(quantity * unit_price) / SUM(quantity) AS avg_price, SUM(quantity) AS volume
         FROM trades WHERE created_at >= ? GROUP BY item_id'
    );
    $stmt->execute([$now - 86400]);
    $recent = [];
    foreach ($stmt->fetchAll() as $row) {
        $recent[$row['item_id']] = $row;
    }

    $refs = market_reference_values();
    $spark = market_history($pdo, $now, 86400, 24);
    $out = [];
    foreach (content_items() as $id => $item) {
        $out[] = market_ticker($id, (float) $refs[$id]) + ['spark' => $spark[$id] ?? []] + [
            'item_id'       => $id,
            'name'          => $item['name'],
            'type'          => $item['type'],
            'profession'    => $item['profession'],
            'reference'     => (int) round($refs[$id]),
            'lowest'        => isset($listed[$id]) ? (int) $listed[$id]['lowest'] : null,
            'listed'        => isset($listed[$id]) ? (int) $listed[$id]['listed'] : 0,
            'from_players'  => isset($listed[$id]) ? (int) $listed[$id]['from_players'] : 0,
            'avg_24h'       => isset($recent[$id]) ? (int) round((float) $recent[$id]['avg_price']) : null,
            'volume_24h'    => isset($recent[$id]) ? (int) $recent[$id]['volume'] : 0,
        ];
    }
    return $out;
}

/** One item's order book and recent trades. */
function exchange_item(int $playerId, string $itemId): array
{
    $item = content_item($itemId);
    if ($item === null) {
        throw new ApiError('unknown_item', 'That item does not exist.');
    }
    $pdo = db();
    $now = game_now();

    $stmt = $pdo->prepare(
        "SELECT id, seller_player_id, seller_persona, quantity, unit_price, expires_at FROM listings
         WHERE status = 'active' AND item_id = ? AND expires_at > ? ORDER BY unit_price, id LIMIT 30"
    );
    $stmt->execute([$itemId, $now]);
    $listings = $stmt->fetchAll();

    $stmt = $pdo->prepare(
        'SELECT quantity, unit_price, buyer_player_id, buyer_persona, seller_player_id, seller_persona, created_at
         FROM trades WHERE item_id = ? ORDER BY id DESC LIMIT 20'
    );
    $stmt->execute([$itemId]);
    $trades = $stmt->fetchAll();

    $ids = array_merge(array_column($listings, 'seller_player_id'), array_column($trades, 'buyer_player_id'), array_column($trades, 'seller_player_id'));
    $names = player_names($pdo, $ids);
    $ref = market_reference_value($itemId);

    return market_ticker($itemId, $ref) + ['spark' => market_history($pdo, $now, 7 * 86400, 28, $itemId)[$itemId] ?? []] + [
        'item_id'   => $itemId,
        'name'      => $item['name'],
        'description' => $item['description'] ?? '',
        'reference' => (int) round($ref),
        'floor'     => (int) floor($ref * (float) econ('market.floor_multiplier', 0.6)),
        'trader_price' => (int) floor($ref * (float) econ('market.trader_buy_below', 0.8)),
        'ceiling'   => (int) ceil($ref * (float) econ('market.ceiling_multiplier', 1.5)),
        'you_have'  => inventory_count($pdo, $playerId, $itemId),
        'listings'  => array_map(fn($l) => [
            'id'         => (int) $l['id'],
            'seller'     => party_label($names, $l['seller_player_id'] !== null ? (int) $l['seller_player_id'] : null, $l['seller_persona']),
            'is_npc'     => $l['seller_player_id'] === null,
            'mine'       => (int) $l['seller_player_id'] === $playerId,
            'quantity'   => (int) $l['quantity'],
            'unit_price' => (int) $l['unit_price'],
        ], $listings),
        'trades'    => array_map(fn($t) => [
            'quantity'   => (int) $t['quantity'],
            'unit_price' => (int) $t['unit_price'],
            'buyer'      => party_label($names, $t['buyer_player_id'] !== null ? (int) $t['buyer_player_id'] : null, $t['buyer_persona']),
            'seller'     => party_label($names, $t['seller_player_id'] !== null ? (int) $t['seller_player_id'] : null, $t['seller_persona']),
            'ago'        => max(0, $now - (int) $t['created_at']),
        ], $trades),
    ];
}

/** The player's active listings and recently closed ones. */
function exchange_my_listings(int $playerId): array
{
    $stmt = db()->prepare(
        "(SELECT id, item_id, quantity, original_quantity, unit_price, status, expires_at FROM listings
          WHERE seller_player_id = ? AND status = 'active' ORDER BY id DESC)
         UNION ALL
         (SELECT id, item_id, quantity, original_quantity, unit_price, status, expires_at FROM listings
          WHERE seller_player_id = ? AND status <> 'active' ORDER BY id DESC LIMIT 15)"
    );
    $stmt->execute([$playerId, $playerId]);
    $now = game_now();
    return array_map(fn($l) => [
        'id'            => (int) $l['id'],
        'item_id'       => $l['item_id'],
        'name'          => item_name($l['item_id']),
        'quantity'      => (int) $l['quantity'],
        'sold'          => (int) $l['original_quantity'] - (int) $l['quantity'],
        'original'      => (int) $l['original_quantity'],
        'unit_price'    => (int) $l['unit_price'],
        'status'        => $l['status'],
        'seconds_left'  => max(0, (int) $l['expires_at'] - $now),
    ], $stmt->fetchAll());
}

/** Numbers the sell form needs: suggested price, deposit per duration, cut. */
function exchange_sell_quote(int $playerId, string $itemId, int $quantity): array
{
    if (content_item($itemId) === null) {
        throw new ApiError('unknown_item', 'That item does not exist.');
    }
    $quantity = max(1, $quantity);
    $ref = market_reference_value($itemId);
    $deposits = [];
    foreach (econ('exchange.durations_hours', [12, 24, 48]) as $h) {
        $deposits[(string) $h] = exchange_deposit($itemId, $quantity, (int) $h);
    }
    $stmt = db()->prepare("SELECT MIN(unit_price) FROM listings WHERE status = 'active' AND item_id = ? AND expires_at > ? AND seller_persona IS NULL");
    $stmt->execute([$itemId, game_now()]);
    $lowest = $stmt->fetchColumn();
    return [
        'item_id'        => $itemId,
        'name'           => item_name($itemId),
        'type'           => content_item($itemId)['type'] ?? '',
        'you_have'       => inventory_count(db(), $playerId, $itemId),
        'reference'      => (int) round($ref),
        'lowest_player'  => $lowest !== null && $lowest !== false ? (int) $lowest : null,
        'trader_price'   => (int) floor($ref * (float) econ('market.trader_buy_below', 0.8)),
        'ceiling'        => (int) ceil($ref * (float) econ('market.ceiling_multiplier', 1.5)),
        'deposits'       => $deposits,
        'deposit_from_sale' => true,
        'cut_percent'    => (int) round((float) econ('exchange.cut', 0.05) * 100),
        'guild'          => guild_sale_quote($playerId, $itemId, $quantity),
    ];
}
