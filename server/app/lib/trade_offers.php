<?php
declare(strict_types=1);

/*
 * Direct trades (systems.md 6.4, #32). Asynchronous offers: the sender's side (items and/or gold) is held
 * when the offer is made and returned if it's declined, cancelled or expires. Accepting swaps both sides in
 * one transaction. Both sides must contain something (no gifts yet). No fee for now.
 */

const OFFER_NOTE_MAX = 140;

function offer_settings(): array
{
    return [
        'hours'    => (int) econ('trade_offers.duration_hours', 24),
        'max_open' => (int) econ('trade_offers.max_open_per_player', 5),
        'max_kinds' => (int) econ('trade_offers.max_items_per_side', 5),
        'max_gold' => 100000000,
    ];
}

/** Validate an item list from the request: [{item_id, quantity}] -> merged [item_id => quantity]. */
function offer_parse_items(mixed $list, string $side): array
{
    if ($list === null) {
        return [];
    }
    if (!is_array($list)) {
        throw new ApiError('bad_request', "'$side' must be a list of items.");
    }
    $items = [];
    foreach ($list as $entry) {
        $id = is_array($entry) ? ($entry['item_id'] ?? null) : null;
        $qty = is_array($entry) ? ($entry['quantity'] ?? null) : null;
        if (!is_string($id) || content_item($id) === null) {
            throw new ApiError('unknown_item', 'One of the items in the offer does not exist.');
        }
        if (!is_int($qty) || $qty < 1 || $qty > 10000) {
            throw new ApiError('bad_request', 'Each item needs a quantity between 1 and 10,000.');
        }
        $items[$id] = ($items[$id] ?? 0) + $qty;
    }
    if (count($items) > offer_settings()['max_kinds']) {
        throw new ApiError('bad_request', sprintf('At most %d different items on each side.', offer_settings()['max_kinds']));
    }
    return $items;
}

/** "2 Iron Ingot + 30g" (or "nothing"). */
function offer_summary(array $items, int $gold): string
{
    $parts = [];
    foreach ($items as $id => $qty) {
        $parts[] = $qty . ' ' . item_name((string) $id);
    }
    if ($gold > 0) {
        $parts[] = $gold . 'g';
    }
    return $parts ? implode(' + ', $parts) : 'nothing';
}

function offer_items_json(array $items): string
{
    $list = [];
    foreach ($items as $id => $qty) {
        $list[] = ['item_id' => $id, 'quantity' => $qty];
    }
    return json_encode($list);
}

function offer_items_from_row(string $json): array
{
    $items = [];
    foreach (json_decode($json, true) ?: [] as $e) {
        $items[$e['item_id']] = (int) $e['quantity'];
    }
    return $items;
}

/** Move a bundle of items + gold from one player to another (inside the caller's transaction). */
function offer_take(PDO $pdo, int $playerId, array $items, int $gold, string $what): void
{
    foreach ($items as $id => $qty) {
        inventory_remove($pdo, $playerId, (string) $id, $qty);
    }
    gold_spend($pdo, $playerId, $gold, $what);
}

function offer_give(PDO $pdo, int $playerId, array $items, int $gold): void
{
    foreach ($items as $id => $qty) {
        inventory_add($pdo, $playerId, (string) $id, $qty);
    }
    gold_add($pdo, $playerId, $gold);
}

/** Make an offer. The sender's side is held right away. */
function offer_create(int $fromId, int $toId, mixed $giveList, int $giveGold, mixed $askList, int $askGold, string $note): array
{
    $s = offer_settings();
    $give = offer_parse_items($giveList, 'give_items');
    $ask = offer_parse_items($askList, 'ask_items');
    if ($giveGold < 0 || $askGold < 0 || $giveGold > $s['max_gold'] || $askGold > $s['max_gold']) {
        throw new ApiError('bad_request', 'Gold amounts must be between 0 and 100,000,000.');
    }
    if ((!$give && $giveGold === 0) || (!$ask && $askGold === 0)) {
        throw new ApiError('no_gifts', 'A trade needs something on both sides: offer something and ask for something.');
    }
    if ($fromId === $toId) {
        throw new ApiError('bad_request', "You can't trade with yourself.");
    }
    $note = mb_substr(trim($note), 0, OFFER_NOTE_MAX);

    return tx(function (PDO $pdo) use ($fromId, $toId, $give, $giveGold, $ask, $askGold, $note, $s) {
        // Lock the sender's row FIRST, before any other read: InnoDB fixes a transaction's view of the data
        // at its first plain read, so locking later would still count offers from a stale view and let two
        // offers sent at once both slip under the limit (0.5.2).
        gold_get($pdo, $fromId, true);
        require_profession($pdo, $fromId);
        if (player_profession_id($pdo, $toId) === null) {
            throw new ApiError('not_found', 'That player is not in a guild yet.', 404);
        }
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM trade_offers WHERE from_player_id = ? AND status = 'open' FOR UPDATE");
        $stmt->execute([$fromId]);
        if ((int) $stmt->fetchColumn() >= $s['max_open']) {
            throw new ApiError('too_many_offers', sprintf('You can have at most %d open offers. Cancel one first.', $s['max_open']));
        }

        offer_take($pdo, $fromId, $give, $giveGold, 'this offer');
        $now = game_now();
        $pdo->prepare(
            'INSERT INTO trade_offers (from_player_id, to_player_id, give_items, give_gold, ask_items, ask_gold, note, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([$fromId, $toId, offer_items_json($give), $giveGold, offer_items_json($ask), $askGold, $note, $now, $now + $s['hours'] * 3600]);
        $offerId = (int) $pdo->lastInsertId();

        $names = player_names($pdo, [$fromId, $toId]);
        $payload = ['give' => offer_summary($give, $giveGold), 'ask' => offer_summary($ask, $askGold)];
        activity_log($pdo, $fromId, 'offer_sent', $payload + ['other' => $names[$toId] ?? 'a player']);
        activity_log($pdo, $toId, 'offer_received', $payload + ['other' => $names[$fromId] ?? 'a player']);
        return ['offer_id' => $offerId];
    });
}

/** Lock an offer row; checks it's open and the player is allowed to act on it. */
function offer_lock(PDO $pdo, int $offerId, int $playerId, string $role): array
{
    $stmt = $pdo->prepare('SELECT * FROM trade_offers WHERE id = ? FOR UPDATE');
    $stmt->execute([$offerId]);
    $offer = $stmt->fetch();
    $owner = $role === 'to' ? 'to_player_id' : 'from_player_id';
    if (!$offer || (int) $offer[$owner] !== $playerId) {
        throw new ApiError('not_found', 'Offer not found.', 404);
    }
    if ($offer['status'] !== 'open') {
        throw new ApiError('offer_closed', 'That offer is no longer open.', 409);
    }
    if ((int) $offer['expires_at'] <= game_now()) {
        throw new ApiError('offer_closed', 'That offer has expired.', 409);
    }
    return $offer;
}

/** Return the held side to the sender and close the offer. */
function offer_close(PDO $pdo, array $offer, string $status): void
{
    offer_give($pdo, (int) $offer['from_player_id'], offer_items_from_row($offer['give_items']), (int) $offer['give_gold']);
    $pdo->prepare('UPDATE trade_offers SET status = ?, resolved_at = ? WHERE id = ?')->execute([$status, game_now(), $offer['id']]);
}

function offer_accept(int $playerId, int $offerId): array
{
    return tx(function (PDO $pdo) use ($playerId, $offerId) {
        $offer = offer_lock($pdo, $offerId, $playerId, 'to');
        $fromId = (int) $offer['from_player_id'];
        $give = offer_items_from_row($offer['give_items']);
        $ask = offer_items_from_row($offer['ask_items']);

        offer_take($pdo, $playerId, $ask, (int) $offer['ask_gold'], 'this trade');   // throws if they lack it: nothing changes
        offer_give($pdo, $fromId, $ask, (int) $offer['ask_gold']);
        offer_give($pdo, $playerId, $give, (int) $offer['give_gold']);
        $pdo->prepare("UPDATE trade_offers SET status = 'accepted', resolved_at = ? WHERE id = ?")->execute([game_now(), $offerId]);

        $names = player_names($pdo, [$fromId, $playerId]);
        $giveText = offer_summary($give, (int) $offer['give_gold']);
        $askText = offer_summary($ask, (int) $offer['ask_gold']);
        activity_log($pdo, $fromId, 'offer_accepted', ['other' => $names[$playerId] ?? 'a player', 'got' => $askText, 'gave' => $giveText]);
        activity_log($pdo, $playerId, 'trade_done', ['other' => $names[$fromId] ?? 'a player', 'got' => $giveText, 'gave' => $askText]);
        return ['offer_id' => $offerId, 'got' => $giveText, 'gave' => $askText];
    });
}

function offer_decline(int $playerId, int $offerId): void
{
    tx(function (PDO $pdo) use ($playerId, $offerId) {
        $offer = offer_lock($pdo, $offerId, $playerId, 'to');
        offer_close($pdo, $offer, 'declined');
        $names = player_names($pdo, [$playerId]);
        activity_log($pdo, (int) $offer['from_player_id'], 'offer_declined', [
            'other' => $names[$playerId] ?? 'a player',
            'give'  => offer_summary(offer_items_from_row($offer['give_items']), (int) $offer['give_gold']),
        ]);
    });
}

function offer_cancel(int $playerId, int $offerId): void
{
    tx(function (PDO $pdo) use ($playerId, $offerId) {
        $offer = offer_lock($pdo, $offerId, $playerId, 'from');
        offer_close($pdo, $offer, 'cancelled');
        activity_log($pdo, $playerId, 'offer_cancelled', [
            'give' => offer_summary(offer_items_from_row($offer['give_items']), (int) $offer['give_gold']),
        ]);
    });
}

/** Expire old offers and return the held side (runs in the tick). */
function offers_expire(PDO $pdo, int $now): int
{
    $stmt = $pdo->prepare("SELECT * FROM trade_offers WHERE status = 'open' AND expires_at <= ? FOR UPDATE");
    $stmt->execute([$now]);
    $count = 0;
    foreach ($stmt->fetchAll() as $offer) {
        offer_close($pdo, $offer, 'expired');
        activity_log($pdo, (int) $offer['from_player_id'], 'offer_expired', [
            'give' => offer_summary(offer_items_from_row($offer['give_items']), (int) $offer['give_gold']),
        ]);
        $count++;
    }
    return $count;
}

/** Number of open offers waiting for this player (for the City tab badge). */
function offers_incoming_count(int $playerId): int
{
    $stmt = db()->prepare("SELECT COUNT(*) FROM trade_offers WHERE to_player_id = ? AND status = 'open' AND expires_at > ?");
    $stmt->execute([$playerId, game_now()]);
    return (int) $stmt->fetchColumn();
}

/** Offers to and from the player: open ones, then the 15 most recently closed. */
function offers_list(int $playerId): array
{
    $pdo = db();
    $now = game_now();
    $stmt = $pdo->prepare(
        "(SELECT * FROM trade_offers WHERE (to_player_id = ? OR from_player_id = ?) AND status = 'open' AND expires_at > ? ORDER BY id DESC)
         UNION ALL
         (SELECT * FROM trade_offers WHERE (to_player_id = ? OR from_player_id = ?) AND (status <> 'open' OR expires_at <= ?) ORDER BY id DESC LIMIT 15)"
    );
    $stmt->execute([$playerId, $playerId, $now, $playerId, $playerId, $now]);
    $rows = $stmt->fetchAll();
    $names = player_names($pdo, array_merge(array_column($rows, 'from_player_id'), array_column($rows, 'to_player_id')));

    $out = ['incoming' => [], 'outgoing' => [], 'closed' => []];
    foreach ($rows as $o) {
        $incoming = (int) $o['to_player_id'] === $playerId;
        $open = $o['status'] === 'open' && (int) $o['expires_at'] > $now;
        $give = offer_items_from_row($o['give_items']);
        $ask = offer_items_from_row($o['ask_items']);
        $entry = [
            'id'           => (int) $o['id'],
            'incoming'     => $incoming,
            'other'        => $names[$incoming ? $o['from_player_id'] : $o['to_player_id']] ?? 'a player',
            // From this player's point of view: what they would get and what they would pay.
            'you_get'      => $incoming ? offer_summary($give, (int) $o['give_gold']) : offer_summary($ask, (int) $o['ask_gold']),
            'you_give'     => $incoming ? offer_summary($ask, (int) $o['ask_gold']) : offer_summary($give, (int) $o['give_gold']),
            'note'         => $o['note'],
            'status'       => $open ? 'open' : ($o['status'] === 'open' ? 'expired' : $o['status']),
            'seconds_left' => max(0, (int) $o['expires_at'] - $now),
        ];
        $out[$open ? ($incoming ? 'incoming' : 'outgoing') : 'closed'][] = $entry;
    }
    return $out;
}
