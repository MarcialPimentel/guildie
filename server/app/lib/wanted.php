<?php
declare(strict_types=1);

/*
 * The Wanted board at the Palazzo (0.11.0, docs/palazzo.md §4, systems.md 6.6): players post paid requests
 * ("Wanted: 10 Leather Grips at 11 ducats each") and any other crafter fills them, all or part.
 *
 * Rules (Marz, 2026-10-29): the price per unit sits inside the market band (the same floor and ceiling as the
 * NPC market, x usual value), so the board can't funnel ducats between accounts; the poster's ducats are held
 * when posting; the filler is paid minus the Mercato cut (a gold sink); at most max_open posts per player;
 * posts last `hours`, then whatever is unfilled is refunded. Owns: wanted_posts. Every action is one transaction.
 */

function wanted_settings(): array
{
    return econ('wanted', []) + ['max_open' => 3, 'hours' => 48, 'max_quantity' => 100];
}

/** The price band for one unit of an item: [min, max, usual] in ducats (market floor and ceiling x usual value). */
function wanted_band(string $itemId): array
{
    $usual = market_reference_value($itemId);
    $min = max(1, (int) ceil($usual * (float) econ('market.floor_multiplier', 0.6)));
    $max = max($min, (int) floor($usual * (float) econ('market.ceiling_multiplier', 1.5)));
    return [$min, $max, (int) round($usual)];
}

/** Post a request. The ducats for the whole quantity are held until it's filled, cancelled or expires. */
function wanted_post(int $playerId, string $itemId, int $quantity, int $unitPrice): array
{
    if (content_item($itemId) === null) {
        throw new ApiError('unknown_item', 'That item does not exist.');
    }
    $set = wanted_settings();
    if ($quantity < 1 || $quantity > (int) $set['max_quantity']) {
        throw new ApiError('bad_request', sprintf('Ask for 1 to %d at a time.', (int) $set['max_quantity']));
    }
    [$min, $max] = wanted_band($itemId);
    if ($unitPrice < $min || $unitPrice > $max) {
        throw new ApiError('price_out_of_band', sprintf('Offer between %d and %d ducats each for %s: the Palazzo only posts fair prices.', $min, $max, item_name($itemId)));
    }
    return tx(function (PDO $pdo) use ($playerId, $itemId, $quantity, $unitPrice, $set) {
        gold_get($pdo, $playerId, true);
        require_profession($pdo, $playerId);
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM wanted_posts WHERE player_id = ? AND status = 'open'");
        $stmt->execute([$playerId]);
        if ((int) $stmt->fetchColumn() >= (int) $set['max_open']) {
            throw new ApiError('too_many_posts', sprintf('You can have %d requests on the board. Cancel one first.', (int) $set['max_open']), 409);
        }
        $total = $quantity * $unitPrice;
        gold_spend($pdo, $playerId, $total, 'this request');
        $now = game_now();
        $expires = $now + (int) round((float) $set['hours'] * 3600 * pace());
        $pdo->prepare('INSERT INTO wanted_posts (player_id, item_id, quantity, unit_price, held, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([$playerId, $itemId, $quantity, $unitPrice, $total, $now, $expires]);
        $id = (int) $pdo->lastInsertId();
        activity_log($pdo, $playerId, 'wanted_posted', ['item_id' => $itemId, 'quantity' => $quantity, 'unit_price' => $unitPrice, 'held' => $total]);
        return ['id' => $id, 'held' => $total, 'expires_in' => $expires - $now];
    });
}

/** Lock a post (after the player rows). */
function wanted_lock(PDO $pdo, int $postId): array
{
    $stmt = $pdo->prepare('SELECT * FROM wanted_posts WHERE id = ? FOR UPDATE');
    $stmt->execute([$postId]);
    $post = $stmt->fetch();
    if (!$post) {
        throw new ApiError('not_found', 'That request is no longer on the board.', 404);
    }
    foreach (['id', 'player_id', 'quantity', 'filled', 'unit_price', 'held', 'created_at', 'expires_at'] as $k) {
        $post[$k] = (int) $post[$k];
    }
    return $post;
}

/** Fill a request with goods from your storehouse (all of it, or part). You're paid now, minus the Mercato cut. */
function wanted_fill(int $playerId, int $postId, int $quantity): array
{
    if ($quantity < 1) {
        throw new ApiError('bad_request', 'Give at least one.');
    }
    return tx(function (PDO $pdo) use ($playerId, $postId, $quantity) {
        // Find the poster without a lock, then lock both players in id order (no deadlocks), then the post.
        $stmt = $pdo->prepare('SELECT player_id FROM wanted_posts WHERE id = ?');
        $stmt->execute([$postId]);
        $posterId = $stmt->fetchColumn();
        if ($posterId === false) {
            throw new ApiError('not_found', 'That request is no longer on the board.', 404);
        }
        $posterId = (int) $posterId;
        if ($posterId === $playerId) {
            throw new ApiError('own_post', "That's your own request. Cancel it if you don't need it any more.");
        }
        foreach ([min($playerId, $posterId), max($playerId, $posterId)] as $id) {
            gold_get($pdo, $id, true);
        }
        require_profession($pdo, $playerId);
        $post = wanted_lock($pdo, $postId);
        $now = game_now();
        if ($post['status'] !== 'open' || $post['expires_at'] <= $now) {
            throw new ApiError('post_closed', 'That request has closed.', 409);
        }
        $qty = min($quantity, $post['quantity'] - $post['filled']);
        // lowest quality first; the buyer gets exactly what was handed over (0.18.0)
        inventory_add_each($pdo, $posterId, $post['item_id'], inventory_remove($pdo, $playerId, $post['item_id'], $qty));
        $pay = $qty * $post['unit_price'];
        $cut = exchange_cut($pay);
        gold_add($pdo, $playerId, $pay - $cut);
        $filled = $post['filled'] + $qty;
        $done = $filled >= $post['quantity'];
        $pdo->prepare('UPDATE wanted_posts SET filled = ?, held = ?, status = ?, closed_at = ? WHERE id = ?')
            ->execute([$filled, max(0, $post['held'] - $pay), $done ? 'filled' : 'open', $done ? $now : null, $postId]);
        $names = player_names($pdo, [$playerId, $posterId]);
        activity_log($pdo, $playerId, 'wanted_filled', ['item_id' => $post['item_id'], 'quantity' => $qty, 'earned' => $pay - $cut, 'cut' => $cut, 'for' => $names[$posterId] ?? 'a crafter']);
        activity_log($pdo, $posterId, 'wanted_received', ['item_id' => $post['item_id'], 'quantity' => $qty, 'paid' => $pay, 'from' => $names[$playerId] ?? 'a crafter', 'done' => $done]);
        return ['item_id' => $post['item_id'], 'name' => item_name($post['item_id']), 'quantity' => $qty, 'earned' => $pay - $cut, 'cut' => $cut, 'done' => $done];
    });
}

/** Close a post and give back what's still held. */
function wanted_close(PDO $pdo, array $post, string $status, int $now): int
{
    if ($post['held'] > 0) {
        gold_add($pdo, $post['player_id'], $post['held']);
    }
    $pdo->prepare('UPDATE wanted_posts SET status = ?, held = 0, closed_at = ? WHERE id = ?')->execute([$status, $now, $post['id']]);
    activity_log($pdo, $post['player_id'], $status === 'expired' ? 'wanted_expired' : 'wanted_cancelled', [
        'item_id' => $post['item_id'], 'filled' => $post['filled'], 'quantity' => $post['quantity'], 'refund' => $post['held'],
    ]);
    return $post['held'];
}

function wanted_cancel(int $playerId, int $postId): array
{
    return tx(function (PDO $pdo) use ($playerId, $postId) {
        gold_get($pdo, $playerId, true);
        $post = wanted_lock($pdo, $postId);
        if ($post['player_id'] !== $playerId) {
            throw new ApiError('not_yours', 'That request is not yours.', 403);
        }
        if ($post['status'] !== 'open') {
            throw new ApiError('post_closed', 'That request has already closed.', 409);
        }
        return ['refund' => wanted_close($pdo, $post, 'cancelled', game_now())];
    });
}

/** Market tick: close expired posts and refund what's still held. */
function wanted_expire(PDO $pdo, int $now): int
{
    $stmt = $pdo->prepare("SELECT id, player_id FROM wanted_posts WHERE status = 'open' AND expires_at <= ? ORDER BY id LIMIT 200");
    $stmt->execute([$now]);
    $done = 0;
    foreach ($stmt->fetchAll() as $r) {
        gold_get($pdo, (int) $r['player_id'], true);
        $post = wanted_lock($pdo, (int) $r['id']);
        if ($post['status'] === 'open') {
            wanted_close($pdo, $post, 'expired', $now);
            $done++;
        }
    }
    return $done;
}

/** One post as the board shows it. */
function wanted_view(array $p, array $names, array $professions, int $viewerId, array $have, int $now): array
{
    $remaining = (int) $p['quantity'] - (int) $p['filled'];
    $owner = (int) $p['player_id'];
    $guild = content_item($p['item_id'])['profession'] ?? '';
    return [
        'id'         => (int) $p['id'],
        'player_id'  => $owner,
        'player'     => $names[$owner] ?? 'A crafter',
        'profession' => content_profession($professions[$owner] ?? '')['name'] ?? '',
        'item_id'    => $p['item_id'],
        'name'       => item_name($p['item_id']),
        'guild'      => content_profession($guild)['name'] ?? $guild,
        'quantity'   => (int) $p['quantity'],
        'remaining'  => $remaining,
        'unit_price' => (int) $p['unit_price'],
        'status'     => $p['status'],
        'expires_in' => max(0, (int) $p['expires_at'] - $now),
        'mine'       => $owner === $viewerId,
        'have'       => $have[$p['item_id']] ?? 0,
    ];
}

/** The board: open requests (newest first), your own requests, and the fair price band for every item. */
function wanted_board(int $playerId): array
{
    $pdo = db();
    $now = game_now();
    $stmt = $pdo->prepare("SELECT * FROM wanted_posts WHERE status = 'open' AND expires_at > ? ORDER BY id DESC LIMIT 60");
    $stmt->execute([$now]);
    $open = $stmt->fetchAll();
    $stmt = $pdo->prepare("SELECT * FROM wanted_posts WHERE player_id = ? AND (status = 'open' OR closed_at > ?) ORDER BY id DESC LIMIT 10");
    $stmt->execute([$playerId, $now - 86400]);
    $mine = $stmt->fetchAll();

    $ids = array_values(array_unique(array_map(fn($p) => (int) $p['player_id'], [...$open, ...$mine])));
    $names = player_names($pdo, $ids);
    $professions = [];
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $q = $pdo->prepare("SELECT player_id, profession_id FROM player_professions WHERE player_id IN ($in)");
        $q->execute($ids);
        $professions = array_column($q->fetchAll(), 'profession_id', 'player_id');
    }
    $have = [];
    foreach (inventory_list($playerId) as $row) {
        $have[$row['item_id']] = ($have[$row['item_id']] ?? 0) + $row['quantity'];   // any quality fills (0.18.0)
    }
    $bands = [];
    foreach (array_keys(content_items()) as $itemId) {
        [$min, $max, $usual] = wanted_band($itemId);
        $bands[$itemId] = ['min' => $min, 'max' => $max, 'usual' => $usual];
    }
    $set = wanted_settings();
    return [
        'posts'    => array_map(fn($p) => wanted_view($p, $names, $professions, $playerId, $have, $now), array_values(array_filter($open, fn($p) => (int) $p['player_id'] !== $playerId))),
        'mine'     => array_map(fn($p) => wanted_view($p, $names, $professions, $playerId, $have, $now), $mine),
        'bands'    => $bands,
        'max_open' => (int) $set['max_open'],
        'hours'    => (int) round((float) $set['hours'] * pace()),
        'cut'      => (float) econ('exchange.cut', 0.05),
        'gold'     => gold_get($pdo, $playerId),
    ];
}
