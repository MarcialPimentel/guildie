<?php
declare(strict_types=1);

/*
 * Activity Log (systems.md 4.5). Append-only record of what happened, written in the same
 * transaction as the action that caused it. The client shows the text; M2 builds the
 * "While you were away" screen on top of it.
 */

function activity_log(PDO $pdo, ?int $playerId, string $type, array $payload): void
{
    $pdo->prepare('INSERT INTO activity (player_id, type, payload, created_at) VALUES (?, ?, ?, ?)')
        ->execute([$playerId, $type, json_encode($payload, JSON_UNESCAPED_UNICODE), game_now()]);
}

/** Recent activity for a player, newest first, with display text. */
function activity_list(int $playerId, int $limit = 30, int $since = 0): array
{
    $stmt = db()->prepare(
        'SELECT id, type, payload, created_at FROM activity
         WHERE player_id = ? AND created_at >= ? ORDER BY id DESC LIMIT ' . max(1, min(100, $limit))
    );
    $stmt->execute([$playerId, $since]);

    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $payload = json_decode($row['payload'], true) ?: [];
        $out = [
            'id'         => (int) $row['id'],
            'type'       => $row['type'],
            'text'       => activity_text($row['type'], $payload),
            'created_at' => (int) $row['created_at'],
        ];
        if ($row['type'] === 'sold') {
            // Who bought, for the buyer who walks up to your stall in the 3D harbor (0.10.0). Read-only.
            $out['sale'] = [
                'buyer'    => !empty($payload['buyer_is_player']) ? 'player' : (string) ($payload['buyer_persona'] ?? ''),
                'item_id'  => (string) ($payload['item_id'] ?? ''),
                'quantity' => (int) ($payload['quantity'] ?? 0),
                'earned'   => (int) ($payload['earned'] ?? 0),
            ];
        }
        $rows[] = $out;
    }
    return $rows;
}

/** " Deposit: 2 ducats." or " Deposit waived." after a cancelled or expired listing. */
function deposit_note(array $p): string
{
    if ((int) ($p['deposit'] ?? 0) > 0) {
        return ' Deposit: ' . ducats((int) $p['deposit']) . '.';
    }
    return (int) ($p['waived'] ?? 0) > 0 ? ' Deposit waived.' : '';
}

/** How the Expert and Master machines ran for a craft (#52): oil burned and wages paid, or crafted by hand. */
function activity_power_text(array $p): string
{
    if (!array_key_exists('powered', $p) || $p['powered'] === null) {
        return '';
    }
    if ($p['powered'] === false) {
        return sprintf(' No %s or wages for the machines, so it is made by hand (slower).', strtolower(item_name(workshop_fuel_item())));
    }
    $parts = [];
    if ((int) ($p['oil'] ?? 0) > 0) {
        $parts[] = sprintf('burned %d %s', (int) $p['oil'], item_name(workshop_fuel_item()));
    }
    if ((int) ($p['wages'] ?? 0) > 0) {
        $parts[] = sprintf("paid today's wages (%s)", ducats((int) $p['wages']));
    }
    return $parts ? ' Machines: ' . implode(', ', $parts) . '.' : '';
}

/** " (7 Common, 3 Fine)" for a crafted batch (0.18.0); nothing when it's all one quality or older entries. */
function activity_quality_text(array $byQuality): string
{
    if (count($byQuality) < 2) {
        return count($byQuality) === 1 && (int) array_key_first($byQuality) > QUALITY_COMMON
            ? ', all ' . quality_name((int) array_key_first($byQuality)) : '';
    }
    $parts = [];
    foreach ($byQuality as $q => $n) {
        $parts[] = $n . ' ' . quality_name((int) $q);
    }
    return ' (' . implode(', ', $parts) . ')';
}

function activity_text(string $type, array $p): string
{
    $n = fn($key) => (int) ($p[$key] ?? 0);
    $item = fn() => item_name_q((string) ($p['item_id'] ?? ''), (int) ($p['quality'] ?? QUALITY_COMMON));
    return match ($type) {
        'profession_chosen' => sprintf('You joined the %s guild.', $p['profession_name'] ?? ''),
        'gathered'          => 'Collected ' . implode(', ', array_map(
                                   fn($i) => $i['quantity'] . ' ' . item_name($i['item_id']), $p['items'] ?? [])) . '.',
        'worked'            => sprintf('%s: ', $p['title'] ?? 'Worked') . ($p['items'] ?? [] ? implode(', ', array_map(
                                   fn($i) => '+' . $i['quantity'] . ' ' . item_name($i['item_id']), $p['items'])) : 'nothing this time') . '.',
        'craft_started'     => sprintf('Started crafting %d %s.', $n('quantity'), $item()) . activity_power_text($p),
        'crafted'           => sprintf('Crafted %d %s', $n('quantity'), $item()) . activity_quality_text($p['qualities'] ?? []) . '.',
        'listed'            => sprintf('Listed %d %s at %s each (deposit %s, taken from the sale).', $n('quantity'), $item(), ducats($n('unit_price')), ducats($n('deposit'))),
        'sold'              => sprintf('Sold %d %s to %s for %s (after %s cut%s).', $n('quantity'), $item(), $p['buyer'] ?? 'someone', ducats($n('earned')), ducats($n('cut')),
                                   $n('deposit') > 0 ? ' and ' . ducats($n('deposit')) . ' deposit' : ''),
        'sold_to_guild'     => sprintf('Sold %d %s to the guild for %s.', $n('quantity'), $item(), ducats($n('earned'))),
        'order_filled'      => sprintf('%s took %s and paid %s.', $p['customer'] ?? 'A customer', $p['items'] ?? '', $p['reward'] ?? ''),
        'surprise'          => (string) ($p['text'] ?? 'A lucky find!'),
        'guide_step'        => !empty($p['skipped']) ? sprintf('First steps: skipped "%s".', $p['title'] ?? '')
                                   : sprintf('First steps: %s (+%s).', $p['title'] ?? '', ducats($n('gold')))
                                   . ($n('final') > 0 ? sprintf(' Guide finished: +%s!', ducats($n('final'))) : ''),
        'skill_up'          => sprintf('%s skill %d → %d (+%d XP).', $p['profession'] ?? 'Your', $n('from'), $n('to'), $n('xp'))
                                   . (empty($p['discoveries']) ? '' : ' First ' . implode(', ', $p['discoveries'])
                                       . (count($p['discoveries']) > 1 ? ': +1 skill each.' : ': +1 skill.')),
        'rank_up'           => sprintf('You are now a %s %s!', $p['rank'] ?? '', $p['profession'] ?? '')
                                   . (empty($p['learned']) ? '' : ' The guild taught you ' . implode(', ', $p['learned']) . ' for free.'),
        'raw_unlocked'      => sprintf('%s now yields %s too.', $p['station'] ?? 'Your station', $p['item'] ?? ''),
        'recipe_learned'    => sprintf('Learned %s at the guild trainer for %s.', $p['recipe'] ?? '', ducats($n('price'))),
        'recipe_taught'     => sprintf('%s taught you a rare recipe: %s.', $p['customer'] ?? 'A customer', $p['recipe'] ?? ''),
        'skill_counted'     => sprintf('Skill arrived! Your past crafts count: %s %d/100 · %s.', $p['profession'] ?? '', $n('skill'), $p['rank'] ?? ''),
        'offer_sent'        => sprintf('You offered %s %s for %s.', $p['other'] ?? 'a player', $p['give'] ?? '', $p['ask'] ?? ''),
        'offer_received'    => sprintf('%s offers you %s for %s. See City → Trades.', $p['other'] ?? 'A player', $p['give'] ?? '', $p['ask'] ?? ''),
        'offer_accepted'    => sprintf('%s accepted your trade: you got %s for %s.', $p['other'] ?? 'A player', $p['got'] ?? '', $p['gave'] ?? ''),
        'trade_done'        => sprintf('Traded with %s: you got %s for %s.', $p['other'] ?? 'a player', $p['got'] ?? '', $p['gave'] ?? ''),
        'offer_declined'    => sprintf('%s declined your offer. %s returned.', $p['other'] ?? 'A player', ucfirst((string) ($p['give'] ?? ''))),
        'offer_cancelled'   => sprintf('You cancelled your offer. %s returned.', ucfirst((string) ($p['give'] ?? ''))),
        'offer_expired'     => sprintf('Your offer expired. %s returned.', ucfirst((string) ($p['give'] ?? ''))),
        'duke_contributed'  => sprintf('Gave %d %s to the Duke (%s) and were paid %s.', $n('quantity'), $item(), $p['title'] ?? "the Duke's order", ducats($n('paid'))),
        'duke_fulfilled'    => sprintf("The Duke's order is fulfilled: %s. Your thanks from the palazzo: %s.", $p['title'] ?? '', ducats($n('bonus'))),
        'bought'            => sprintf('Bought %d %s from %s for %s.', $n('quantity'), $item(), $p['seller'] ?? 'someone', ducats($n('total'))),
        'listing_cancelled' => sprintf('Cancelled your listing: %d %s returned.', $n('quantity'), $item()) . deposit_note($p),
        'listing_expired'   => sprintf('Your listing expired: %d %s returned.', $n('quantity'), $item()) . deposit_note($p),
        'workshop_started'  => sprintf('The builders are at work on your %s (%s paid). Ready in %s.', $p['name'] ?? 'new workshop', ducats($n('gold')), orders_duration_text($n('seconds'))),
        'workshop_built'    => sprintf('Your %s is open! Your bottega is now a %s.', $p['name'] ?? 'new workshop', strtolower((string) ($p['look'] ?? 'finer place'))),
        'wanted_posted'     => sprintf('Posted on the Wanted board: %d %s at %s each (%s held).', $n('quantity'), $item(), ducats($n('unit_price')), ducats($n('held'))),
        'wanted_filled'     => sprintf("Filled %s's request: %d %s for %s (after %s cut).", $p['for'] ?? 'a crafter', $n('quantity'), $item(), ducats($n('earned')), ducats($n('cut'))),
        'wanted_received'   => sprintf('%s filled your request: %d %s for %s.%s', $p['from'] ?? 'A crafter', $n('quantity'), $item(), ducats($n('paid')), !empty($p['done']) ? ' Request complete.' : ''),
        'wanted_cancelled'  => sprintf('You took down your request for %s. %s returned.', $item(), ucfirst(ducats($n('refund')))),
        'wanted_expired'    => sprintf('Your request for %s expired (%d of %d filled). %s returned.', $item(), $n('filled'), $n('quantity'), ucfirst(ducats($n('refund')))),
        'favor_done'        => sprintf('Did a favor for %s: %d %s for %s%s.', $p['npc'] ?? 'the Palazzo', $n('quantity'), $item(), ducats($n('reward')), $n('xp') > 0 ? sprintf(' (+%d XP)', $n('xp')) : ''),
        default             => $type,
    };
}
