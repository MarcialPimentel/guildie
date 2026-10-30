<?php
/**
 * Guildie economy simulator (systems.md 8.1).
 *
 * Runs virtual players through the REAL server code (gathering, crafting, Exchange, market tick)
 * on a scratch database, with a fast-forwarded clock, and reports how the economy behaves.
 * Use it to tune content/economy.json before numbers reach real players.
 * Bots also fill the orders they can, learn recipes at the trainer when they can afford them, claim the
 * new-player guide, play the station minigame, do the Palazzo officials' favors, build bottega upgrades (buying the
 * other guilds' goods they need) and keep their Expert and Master machines in lamp oil (#52). The report says when
 * each bot reached each rank (time-to-rank, #30) and where the gold came from and went (faucets and sinks).
 *
 * Three play styles: 'active' (every 30-60 min in the evening, 2-4 h otherwise), 'regular' (every 2-4 h by day)
 * and 'daily' (the GDD's regular player: a morning and an evening check-in, a third at weekends).
 *
 *   php tools/econ_sim.php --db-name=guildie_sim --db-user=guildie --db-pass=... \
 *       [--players=6] [--days=7] [--seed=1] [--content=content] [--report=out.json] [--tick=300]
 *
 * WARNING: wipes and rebuilds the database you point it at. Never point it at the live database.
 */
declare(strict_types=1);

$opt = getopt('', ['db-name:', 'db-user:', 'db-pass:', 'db-host::', 'players::', 'days::', 'seed::', 'content::', 'report::', 'tick::', 'quiet']);
foreach (['db-name', 'db-user', 'db-pass'] as $k) {
    if (!isset($opt[$k])) {
        fwrite(STDERR, "Missing --$k\n");
        exit(1);
    }
}
$root = dirname(__DIR__);
$players = (int) ($opt['players'] ?? 6);
$days = (float) ($opt['days'] ?? 7);
$seed = (int) ($opt['seed'] ?? 1);
$quiet = isset($opt['quiet']);

// ---- Boot the real server code against a temporary private folder -------------------------------
$tmp = sys_get_temp_dir() . '/guildie-sim-' . getmypid();
@mkdir($tmp);
file_put_contents("$tmp/config.php", '<?php return ' . var_export([
    'db' => ['host' => $opt['db-host'] ?? '127.0.0.1', 'name' => $opt['db-name'], 'user' => $opt['db-user'], 'pass' => $opt['db-pass'], 'charset' => 'utf8mb4'],
    'tick_interval_seconds' => 300,
    'debug' => true,
], true) . ';');
@symlink("$root/server/app", "$tmp/app");
define('GUILDIE_PRIVATE', $tmp);
putenv('GUILDIE_CONTENT=' . realpath($opt['content'] ?? "$root/content"));
require "$root/server/app/bootstrap.php";
register_shutdown_function(fn() => array_map('unlink', array_filter(["$tmp/config.php", "$tmp/app"], 'file_exists')) && @rmdir($tmp));

mt_srand($seed);

// ---- Fresh database -----------------------------------------------------------------------------
$pdo = db();
$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $t) {
    $pdo->exec("DROP TABLE `$t`");
}
$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
foreach (glob("$root/server/migrations/*.sql") as $file) {
    foreach (array_filter(array_map('trim', explode(";\n", file_get_contents($file)))) as $sql) {
        $sql = trim(preg_replace('/^--.*$/m', '', $sql));
        if ($sql !== '') {
            $pdo->exec($sql);
        }
    }
}

// ---- Bots ---------------------------------------------------------------------------------------
$start = gmmktime(6, 0, 0, 1, 5, 2026);   // a Monday, 06:00 UTC
set_game_now($start);
$pdo->prepare("UPDATE game_state SET v = ? WHERE k = 'last_tick_at'")->execute([(string) $start]);

$professionIds = array_keys(content_professions());
$bots = [];
for ($i = 0; $i < $players; $i++) {
    $prof = $professionIds[$i % count($professionIds)];
    $style = ['regular', 'active', 'daily'][intdiv($i, count($professionIds)) % 3];
    [$id] = register_player(sprintf('bot%02d_%s', $i, substr($prof, 0, 5)), 'simpass');
    choose_profession($id, $prof);
    $bots[] = ['id' => $id, 'profession' => $prof, 'style' => $style, 'next' => $start + mt_rand(0, 3600)];
}

/** When a bot checks in next: regulars every 2-4 h, active players every 30-60 min in the evening. Nobody plays 00:00-08:00. */
function next_checkin(array $bot, int $now): int
{
    $hour = (int) gmdate('G', $now);
    if ($bot['style'] === 'daily') {
        // Morning (08-09) and evening (19-21); at weekends also midday (13-14).
        $day = gmmktime(0, 0, 0, (int) gmdate('n', $now), (int) gmdate('j', $now), (int) gmdate('Y', $now));
        foreach ([0, 1] as $add) {
            $weekend = (int) gmdate('N', $day + $add * 86400) >= 6;
            $slots = $weekend ? [[8, 9], [13, 14], [19, 21]] : [[8, 9], [19, 21]];
            foreach ($slots as [$from, $to]) {
                $t = $day + $add * 86400 + mt_rand($from * 3600, $to * 3600);
                if ($t > $now + 1800) {
                    return $t;
                }
            }
        }
    }
    $gap = $bot['style'] === 'active' && $hour >= 17 && $hour < 23 ? mt_rand(1800, 3600) : mt_rand(7200, 14400);
    $next = $now + $gap;
    $nextHour = (int) gmdate('G', $next);
    if ($nextHour < 8) {
        $next = gmmktime(8, mt_rand(0, 59), 0, (int) gmdate('n', $next), (int) gmdate('j', $next), (int) gmdate('Y', $next));
    }
    return $next;
}

/** Try an action and count how much gold it moved for the bot under $category (faucets > 0, sinks < 0). */
function tracked(array &$log, string $category, int $id, callable $fn): mixed
{
    $before = gold_get(db(), $id);
    $result = attempt($fn);
    $log['gold'][$category] = ($log['gold'][$category] ?? 0) + gold_get(db(), $id) - $before;
    return $result;
}

/** Buy up to $need of an item at the Mercato (players or the Guild Suppliers) at no more than $maxMultiple x usual. */
function bot_buy(int $id, string $itemId, int $need, float $maxMultiple, array &$log, string $why): int
{
    $got = 0;
    if ($need <= 0) {
        return 0;
    }
    $detail = exchange_item($id, $itemId);
    foreach ($detail['listings'] as $l) {
        if ($need <= 0) {
            break;
        }
        // Compare with the higher of today's price and the item's usual value: the Guild Suppliers never sell below
        // 1.5x usual, so a dip in today's price mustn't stop a bot that needs the goods.
        $usual = max((float) $detail['reference'], (float) (content_item($itemId)['reference_value'] ?? 0));
        if ($l['mine'] || $l['unit_price'] > $usual * $maxMultiple) {
            continue;
        }
        $qty = min($need, $l['quantity'], intdiv(gold_get(db(), $id), max(1, (int) $l['unit_price'])));
        if ($qty > 0 && tracked($log, "buy_$why", $id, fn() => exchange_buy($id, $l['id'], $qty)) !== false) {
            $need -= $qty;
            $got += $qty;
            $log['bought_inputs'][$itemId] = ($log['bought_inputs'][$itemId] ?? 0) + $qty;
        }
    }
    return $got;
}

/** One round of the station minigame, played like a fair human: mostly good taps, some perfect, some misses. */
function bot_minigame(int $id, array &$log): void
{
    $round = attempt(fn() => minigame_start($id, 'station'));
    if ($round === false) {
        return;
    }
    $plan = $round['plan'];
    $taps = [];
    foreach ($plan['swings'] as $swing) {
        $roll = rand_between(0, 1);
        $want = $roll < 0.35 ? 'perfect' : ($roll < 0.8 ? 'good' : 'miss');
        $tap = null;
        if ($want !== 'miss') {
            for ($ms = (int) $plan['min_tap_ms']; $ms <= (int) $plan['swing_timeout_ms']; $ms += 5) {
                $off = abs(strike_position($swing, $ms) - (float) $swing['center']);
                if ($want === 'perfect' ? $off <= $plan['perfect_width'] / 2 : ($off > $plan['perfect_width'] / 2 && $off <= $plan['good_width'] / 2)) {
                    $tap = $ms;
                    break;
                }
            }
        }
        $taps[] = $tap;
    }
    $now = game_now();
    set_game_now($now + (int) ceil(strike_min_ms($plan, $taps) / 1000) + 2);
    $result = attempt(fn() => minigame_finish($id, (int) $round['round_id'], $taps));
    set_game_now($now);
    if ($result !== false) {
        $log['minigame_rounds'] = ($log['minigame_rounds'] ?? 0) + 1;
        foreach ($result['rewards'] ?? $result['items'] ?? [] as $r) {
            $log['minigame_raws'][$r['item_id']] = ($log['minigame_raws'][$r['item_id']] ?? 0) + (int) $r['quantity'];
        }
    }
}

/** Try an action; return false on a game-rule error. */
function attempt(callable $fn): mixed
{
    try {
        return $fn();
    } catch (ApiError $e) {
        return false;
    }
}

/** One bot check-in: collect, buy missing inputs, craft, reprice and sell. */
function bot_checkin(array $bot, array &$log): void
{
    $id = $bot['id'];
    $now = game_now();
    attempt(fn() => crafting_collect($id));
    attempt(fn() => gathering_collect($id));
    bot_minigame($id, $log);

    // The new-player guide (0.14.0): claim each step once it's done; the Palazzo walk is reported by the client.
    attempt(fn() => guide_mark($id, 'palazzo'));
    for ($i = 0; $i < 6; $i++) {
        $g = attempt(fn() => guide_status(db(), $id));
        if (!$g || $g['finished']) {
            break;
        }
        $skip = $g['step']['optional'] && !$g['step']['ready'];
        if ((!$g['step']['ready'] && !$skip) || tracked($log, 'guide', $id, fn() => guide_advance($id, $g['step']['id'], $skip)) === false) {
            break;
        }
    }

    // The bottega (#51): open a finished upgrade.
    $w = player_state($id)['profession']['workshop'];
    if ($w['building'] && $w['building']['ready'] && attempt(fn() => workshop_finish($id)) !== false) {
        $w = player_state($id)['profession']['workshop'];
    }
    // Machines (#52): keep some lamp oil in stock for Expert and Master crafts.
    if ($w['running']) {
        bot_buy($id, $w['running']['fuel_item_id'], 20 - $w['running']['fuel_have'], 1.6, $log, 'fuel');
    }

    $market = [];
    foreach (exchange_overview() as $row) {
        $market[$row['item_id']] = $row;
    }

    // Reprice: cancel own listings older than 4 hours so they can be relisted at current prices.
    $stmt = db()->prepare("SELECT id FROM listings WHERE seller_player_id = ? AND status = 'active' AND created_at < ?");
    $stmt->execute([$id, $now - 4 * 3600]);
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $lid) {
        attempt(fn() => exchange_cancel($id, (int) $lid));
    }

    // Craft: prefer higher-value recipes; buy a missing cross-profession input if it's cheap enough.
    $state = player_state($id);
    // Score recipes by margin (output value minus input value), with a bonus for components nobody is selling.
    $score = function (array $r) use ($market): float {
        $out = market_reference_value($r['output']['item_id']) * $r['output']['quantity'];
        $in = array_sum(array_map(fn($i) => market_reference_value($i['item_id']) * $i['quantity'], $r['inputs']));
        $scarce = content_item($r['output']['item_id'])['type'] === 'component' && $market[$r['output']['item_id']]['from_players'] === 0 ? 8 : 0;
        return $out - $in + $scarce + rand_between(0, 3);
    };
    $recipes = $state['profession']['recipes'];
    $wanted = [];   // own-guild goods the next bottega upgrade still needs (#51): craft those first
    foreach ($state['profession']['workshop']['next']['cost']['items'] ?? [] as $it) {
        $wanted[$it['item_id']] = $it['have'] < $it['quantity'];
    }
    $scores = [];
    foreach ($recipes as $r) {
        $scores[$r['id']] = $score($r) + (!empty($wanted[$r['output']['item_id']]) ? 1000 : 0);
    }
    usort($recipes, fn($a, $b) => $scores[$b['id']] <=> $scores[$a['id']]);
    $free = $state['craft_slots'] - count($state['crafts']);
    foreach ($recipes as $recipe) {
        if ($free <= 0) {
            break;
        }
        if ($recipe['can_make'] === 0) {
            foreach ($recipe['inputs'] as $in) {
                if (!$in['from_other_profession'] || $in['have'] >= $in['quantity']) {
                    continue;
                }
                bot_buy($id, $in['item_id'], $in['quantity'] * 3 - $in['have'], 1.3, $log, 'inputs');
            }
            $recipe = current(array_filter(player_state($id)['profession']['recipes'], fn($r) => $r['id'] === $recipe['id']));
        }
        if ($recipe['can_make'] > 0 && tracked($log, 'wages', $id, fn() => crafting_start($id, $recipe['id'], min($recipe['can_make'], (int) econ('crafting.max_batch')))) !== false) {
            $free--;
            $log['crafted'][$recipe['id']] = ($log['crafted'][$recipe['id']] ?? 0) + 1;
        }
    }

    // Orders (#44): fill any order the bot already has the goods for (pays gold and XP).
    foreach (attempt(fn() => orders_board($id))['orders'] ?? [] as $o) {
        if ($o['arriving_in'] === 0 && array_reduce($o['items'], fn($ok, $i) => $ok && $i['have'] >= $i['quantity'], true)
            && tracked($log, 'orders', $id, fn() => orders_fill($id, $o['id'])) !== false) {
            $log['orders_filled'][$bot['profession']] = ($log['orders_filled'][$bot['profession']] ?? 0) + 1;
        }
    }

    // The Palazzo officials' favors (0.11.0): one each a day, when the bot has the goods.
    foreach (palazzo_overview($id) as $npc) {
        if (!$npc['favor_done']) {
            $f = attempt(fn() => palazzo_talk($id, $npc['id']))['favor'] ?? null;
            if ($f && !$f['done'] && $f['have'] >= $f['quantity']
                && tracked($log, 'favors', $id, fn() => palazzo_favor_do($id, $npc['id'])) !== false) {
                $log['favors_done'] = ($log['favors_done'] ?? 0) + 1;
            }
        }
    }

    // Bottega upgrades (#51): at the build skill, buy the goods still missing (players first, then the Guild
    // Suppliers, up to 1.6x usual) and build. Saving for it comes before the trainer.
    $prog = player_state($id)['profession']['progress'];
    $next = $w['next'];
    $saving = !$w['building'] && $next && $prog['skill'] >= $next['needs_skill'];
    if ($saving) {
        $budget = gold_get(db(), $id) - $next['cost']['gold'];
        foreach ($next['cost']['items'] as $it) {
            $missing = $it['quantity'] - $it['have'];
            if ($missing > 0 && $budget > 0) {
                $budget -= (int) (bot_buy($id, $it['item_id'], $missing, 1.6, $log, 'upgrade') * market_reference_value($it['item_id']) * 1.6);
            }
        }
        if (tracked($log, 'upgrades', $id, fn() => workshop_start($id)) !== false) {
            $log['upgrades_started'][$bot['profession']] = ($log['upgrades_started'][$bot['profession']] ?? 0) + 1;
            $saving = false;
        } else {
            // Still missing another guild's goods: post a buy offer at the top of the fair band (0.13.0), like a
            // player told "buy it at the marketplace, with a buy offer if nobody sells it".
            $board = attempt(fn() => wanted_board($id));
            $open = array_column(array_filter($board['mine'] ?? [], fn($p) => $p['status'] === 'open'), 'item_id');
            $next = player_state($id)['profession']['workshop']['next'];
            foreach ($next['cost']['items'] as $it) {
                $missing = $it['quantity'] - $it['have'];
                if ($missing > 0 && (content_item($it['item_id'])['profession'] ?? '') !== $bot['profession'] && !in_array($it['item_id'], $open, true)) {
                    $price = $board['bands'][$it['item_id']]['max'] ?? 0;
                    if ($price > 0 && attempt(fn() => wanted_post($id, $it['item_id'], $missing, $price)) !== false) {
                        $log['buy_offers_posted'][$it['item_id']] = ($log['buy_offers_posted'][$it['item_id']] ?? 0) + $missing;
                    }
                }
            }
        }
    }

    // The trainer (#49): learn the cheapest recipe the bot can, keeping 50 ducats back for inputs.
    $learnable = $saving ? [] : array_filter(attempt(fn() => trainer_list($id))['recipes'] ?? [], fn($r) => $r['status'] === 'learn');
    usort($learnable, fn($a, $b) => $a['price'] <=> $b['price']);
    foreach ($learnable as $r) {
        if (gold_get(db(), $id) >= $r['price'] + 50 && tracked($log, 'trainer', $id, fn() => trainer_learn($id, $r['id'])) !== false) {
            $log['learned'][$r['id']] = ($log['learned'][$r['id']] ?? 0) + 1;
            break;
        }
    }

    // Sell: finished goods and components; raw materials only when there's a surplus.
    $state = player_state($id);
    $needs = [];
    foreach (content_recipes_for($bot['profession']) as $r) {
        foreach ($r['inputs'] as $in) {
            $needs[$in['item_id']] = true;
        }
    }
    // Keep what the next bottega upgrade needs, and lamp oil for the machines (now or after the next upgrade).
    $keepFor = [];
    $ws = $state['profession']['workshop'];
    foreach ($ws['next']['cost']['items'] ?? [] as $it) {
        $keepFor[$it['item_id']] = $it['quantity'];
    }
    if ($ws['running'] || ($ws['next']['running'] ?? null)) {
        $keepFor[workshop_fuel_item()] = max($keepFor[workshop_fuel_item()] ?? 0, 30);
    }
    // Fill other players' buy offers first: they pay the top of the band.
    $have = [];
    foreach ($state['inventory'] as $row) {   // every quality counts (0.18.0)
        $have[$row['item_id']] = ($have[$row['item_id']] ?? 0) + $row['quantity'];
    }
    foreach (attempt(fn() => wanted_board($id))['posts'] ?? [] as $post) {
        $spare = ($have[$post['item_id']] ?? 0) - ($keepFor[$post['item_id']] ?? 0);
        $qty = min($post['remaining'], $spare);
        if ($qty > 0 && tracked($log, 'buy_offers_filled', $id, fn() => wanted_fill($id, $post['id'], $qty)) !== false) {
            $have[$post['item_id']] -= $qty;
            $log['buy_offer_units'][$post['item_id']] = ($log['buy_offer_units'][$post['item_id']] ?? 0) + $qty;
        }
    }
    $state = player_state($id);
    $keepLeft = [];
    foreach ($state['inventory'] as $item) {   // one row per quality, lowest first: what's kept comes from Common
        $itemId = $item['item_id'];
        $quality = (int) $item['quality'];
        $type = content_item($itemId)['type'];
        $keepLeft[$itemId] ??= max(isset($needs[$itemId]) ? ($type === 'raw' ? 20 : 4) : 0, $keepFor[$itemId] ?? 0);
        $kept = min($item['quantity'], $keepLeft[$itemId]);
        $keepLeft[$itemId] -= $kept;
        $qty = $item['quantity'] - $kept;
        if ($qty <= 0) {
            continue;
        }
        $ref = market_reference_value($itemId) * quality_multiplier($quality);
        $lowest = $quality === QUALITY_COMMON && $market[$itemId]['from_players'] > 0 ? $market[$itemId]['lowest'] : null;
        $price = (int) round($ref * rand_between(0.95, 1.15));
        if ($lowest !== null && $lowest < $price) {
            $price = max((int) ceil($ref * 0.9), $lowest - 1);
        }
        if (attempt(fn() => exchange_list($id, $itemId, $qty, max(1, $price), 24, $quality)) !== false) {
            $log['listed'][$itemId] = ($log['listed'][$itemId] ?? 0) + $qty;
            $log['listed_quality'][$quality] = ($log['listed_quality'][$quality] ?? 0) + $qty;
        }
    }
}

// ---- Run ----------------------------------------------------------------------------------------
$end = $start + (int) ($days * 86400);
$tickEvery = max(60, (int) ($opt['tick'] ?? 300));   // seconds between market ticks (longer = faster run, coarser market)
$nextTick = $start + $tickEvery;
$log = ['crafted' => [], 'listed' => [], 'bought_inputs' => [], 'orders_filled' => [], 'learned' => [], 'gold' => []];
$rankAt = [];
$builtAt = [];
$daily = [];
$unmet = [];
$npcBought = [];
$lastDay = -1;

while (true) {
    $nextBot = min(array_column($bots, 'next'));
    $now = min($nextTick, $nextBot);
    if ($now > $end) {
        break;
    }
    set_game_now($now);

    if ($now === $nextTick) {
        $result = maybe_run_tick('cron');
        foreach ($result['market']['unmet'] ?? [] as $item => $n) {
            $unmet[$item] = ($unmet[$item] ?? 0) + $n;
        }
        foreach ($result['market']['npc_bought'] ?? [] as $item => $n) {
            $npcBought[$item] = ($npcBought[$item] ?? 0) + $n;
        }
        $nextTick += $tickEvery;
    } else {
        foreach ($bots as &$bot) {
            if ($bot['next'] === $now) {
                bot_checkin($bot, $log);
                $bot['next'] = next_checkin($bot, $now);
                $rankName = progression_rank((int) (progression_row(db(), $bot['id'])['skill'] ?? 1))['name'];
                $rankAt[$bot['id']][$rankName] ??= round(($now - $start) / 86400, 1);
                $lvl = (int) (progression_row(db(), $bot['id'])['workshop_level'] ?? 1);
                $builtAt[$bot['id']]["level $lvl"] ??= round(($now - $start) / 86400, 1);
            }
        }
        unset($bot);
    }

    $day = intdiv($now - $start, 86400);
    if ($day !== $lastDay) {
        $refs = market_reference_values();
        $gold = (int) db()->query('SELECT SUM(gold) FROM players')->fetchColumn();
        $daily[] = ['day' => $day + 1, 'gold_total' => $gold, 'refs' => array_map(fn($v) => round($v, 1), $refs)];
        $lastDay = $day;
        if (!$quiet) {
            fwrite(STDERR, sprintf("day %d  gold in circulation %d\n", $day + 1, $gold));
        }
    }
}

// ---- Report -------------------------------------------------------------------------------------
$t = db()->query(
    "SELECT item_id,
            SUM(CASE WHEN seller_player_id IS NOT NULL AND buyer_player_id IS NOT NULL THEN quantity ELSE 0 END) AS p2p,
            SUM(CASE WHEN seller_player_id IS NOT NULL AND buyer_persona IN ('townsfolk','adventurers','workshops') THEN quantity ELSE 0 END) AS to_consumers,
            SUM(CASE WHEN seller_player_id IS NOT NULL AND buyer_persona = 'traders' THEN quantity ELSE 0 END) AS to_traders,
            SUM(CASE WHEN seller_persona = 'suppliers' AND buyer_player_id IS NOT NULL THEN quantity ELSE 0 END) AS from_suppliers,
            SUM(CASE WHEN seller_player_id IS NOT NULL THEN quantity * unit_price ELSE 0 END) / NULLIF(SUM(CASE WHEN seller_player_id IS NOT NULL THEN quantity ELSE 0 END), 0) AS avg_player_price
     FROM trades GROUP BY item_id"
)->fetchAll();
$trades = array_column($t, null, 'item_id');
$finalRefs = market_reference_values();

$rows = [];
foreach (content_items() as $id => $item) {
    $tr = $trades[$id] ?? [];
    $base = (float) $item['reference_value'];
    $rows[] = [
        'item'            => $item['name'],
        'base'            => $base,
        'final_ref'       => round($finalRefs[$id], 1),
        'ref_change_pct'  => (int) round(($finalRefs[$id] / $base - 1) * 100),
        'avg_sale'        => isset($tr['avg_player_price']) ? round((float) $tr['avg_player_price'], 1) : null,
        'to_consumers'    => (int) ($tr['to_consumers'] ?? 0),
        'unmet_demand'    => $unmet[$id] ?? 0,
        'p2p'             => (int) ($tr['p2p'] ?? 0),
        'to_traders'      => (int) ($tr['to_traders'] ?? 0),
        'from_suppliers'  => (int) ($tr['from_suppliers'] ?? 0),
    ];
}

$playersOut = db()->query(
    'SELECT p.id, p.name, pp.profession_id, p.gold, pp.skill, pp.workshop_level FROM players p JOIN player_professions pp ON pp.player_id = p.id ORDER BY p.id'
)->fetchAll();
foreach ($playersOut as &$p) {
    $p['style'] = current(array_filter($bots, fn($b) => $b['id'] === (int) $p['id']))['style'] ?? '';
    $p['rank_days'] = $rankAt[(int) $p['id']] ?? [];
    $p['built_days'] = $builtAt[(int) $p['id']] ?? [];
}
unset($p);

// Gold from selling: player sales to NPC buyers (consumers and Traders), before the Mercato's cut.
$log['gold']['npc_sales_gross'] = (int) db()->query(
    'SELECT COALESCE(SUM(quantity * unit_price), 0) FROM trades WHERE seller_player_id IS NOT NULL AND buyer_persona IS NOT NULL'
)->fetchColumn();
$oil = 0;
$byHand = 0;
foreach (db()->query("SELECT payload FROM activity WHERE type = 'craft_started'")->fetchAll(PDO::FETCH_COLUMN) as $pl) {
    $pl = json_decode((string) $pl, true);
    $oil += (int) ($pl['oil'] ?? 0);
    $byHand += array_key_exists('powered', $pl) && $pl['powered'] === false ? 1 : 0;
}
$log['machines'] = ['oil_burned' => $oil, 'crafts_by_hand' => $byHand];

$report = ['players' => $players, 'days' => $days, 'seed' => $seed, 'items' => $rows, 'players_final' => $playersOut, 'daily' => $daily, 'log' => $log];
if (isset($opt['report'])) {
    file_put_contents($opt['report'], json_encode($report, JSON_PRETTY_PRINT));
}

printf("\nGuildie economy simulation: %d players, %.1f days, seed %d\n\n", $players, $days, $seed);
printf("%-17s %5s %6s %5s %6s %7s %6s %4s %6s %6s\n", 'Item', 'Base', 'Ref', 'Chg%', 'AvgSale', 'ToNPC', 'Unmet', 'P2P', 'Trader', 'Suppl');
foreach ($rows as $r) {
    printf("%-17s %5d %6.1f %+4d%% %6s %7d %6d %4d %6d %6d\n", $r['item'], $r['base'], $r['final_ref'], $r['ref_change_pct'],
        $r['avg_sale'] === null ? '-' : number_format($r['avg_sale'], 1), $r['to_consumers'], $r['unmet_demand'], $r['p2p'], $r['to_traders'], $r['from_suppliers']);
}
echo "\nFinal gold, skill and day each rank was reached (time-to-rank, #30):\n";
foreach ($playersOut as $p) {
    $ranks = implode(', ', array_map(fn($r, $d) => "$r day $d", array_keys($p['rank_days']), $p['rank_days']));
    printf("  %-14s %-14s %-8s %6d  skill %3d  bottega %d  %s\n", $p['name'], $p['profession_id'], $p['style'], $p['gold'], $p['skill'], $p['workshop_level'], $ranks);
    if (count($p['built_days']) > 1) {
        printf("  %-14s bottega built: %s\n", '', implode(', ', array_map(fn($l, $d) => "$l day $d", array_keys($p['built_days']), $p['built_days'])));
    }
}
echo "\nGold moved by players' own actions (+ in, - out; NPC sales are before the Mercato's cut):\n";
foreach ($log['gold'] as $k => $v) {
    printf("  %-22s %+9d\n", $k, $v);
}
echo 'Buy offers filled: ' . json_encode($log['buy_offer_units'] ?? []) . "
";
echo 'Machines: ' . json_encode($log['machines']) . "\nMinigame rounds: " . ($log['minigame_rounds'] ?? 0) . ' ' . json_encode($log['minigame_raws'] ?? []) . "\nFavors done: " . ($log['favors_done'] ?? 0) . "\n";
echo 'Listed by quality (1 Common, 2 Fine, 3 Masterwork): ' . json_encode($log['listed_quality'] ?? []) . "\n";
echo "\nOrders filled: " . json_encode($log['orders_filled']) . "\nRecipes learned: " . json_encode($log['learned']) . "\n";
printf("\nGold in circulation: start %d -> end %d\n", $daily[0]['gold_total'] ?? 0, (int) db()->query('SELECT SUM(gold) FROM players')->fetchColumn());
