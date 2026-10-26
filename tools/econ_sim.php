<?php
/**
 * Guildie economy simulator (systems.md 8.1).
 *
 * Runs virtual players through the REAL server code (gathering, crafting, Exchange, market tick)
 * on a scratch database, with a fast-forwarded clock, and reports how the economy behaves.
 * Use it to tune content/economy.json before numbers reach real players.
 *
 *   php tools/econ_sim.php --db-name=guildie_sim --db-user=guildie --db-pass=... \
 *       [--players=6] [--days=7] [--seed=1] [--content=content] [--report=out.json]
 *
 * WARNING: wipes and rebuilds the database you point it at. Never point it at the live database.
 */
declare(strict_types=1);

$opt = getopt('', ['db-name:', 'db-user:', 'db-pass:', 'db-host::', 'players::', 'days::', 'seed::', 'content::', 'report::', 'quiet']);
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
    $style = intdiv($i, count($professionIds)) % 2 === 0 ? 'regular' : 'active';
    [$id] = register_player(sprintf('bot%02d_%s', $i, substr($prof, 0, 5)), 'simpass');
    choose_profession($id, $prof);
    $bots[] = ['id' => $id, 'profession' => $prof, 'style' => $style, 'next' => $start + mt_rand(0, 3600)];
}

/** When a bot checks in next: regulars every 2-4 h, active players every 30-60 min in the evening. Nobody plays 00:00-08:00. */
function next_checkin(array $bot, int $now): int
{
    $hour = (int) gmdate('G', $now);
    $gap = $bot['style'] === 'active' && $hour >= 17 && $hour < 23 ? mt_rand(1800, 3600) : mt_rand(7200, 14400);
    $next = $now + $gap;
    $nextHour = (int) gmdate('G', $next);
    if ($nextHour < 8) {
        $next = gmmktime(8, mt_rand(0, 59), 0, (int) gmdate('n', $next), (int) gmdate('j', $next), (int) gmdate('Y', $next));
    }
    return $next;
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
    $scores = [];
    foreach ($recipes as $r) {
        $scores[$r['id']] = $score($r);
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
                $need = $in['quantity'] * 3 - $in['have'];
                $detail = exchange_item($id, $in['item_id']);
                foreach ($detail['listings'] as $l) {
                    if ($need <= 0 || $l['mine'] || $l['unit_price'] > $detail['reference'] * 1.3) {
                        continue;
                    }
                    $qty = min($need, $l['quantity']);
                    if (attempt(fn() => exchange_buy($id, $l['id'], $qty)) !== false) {
                        $need -= $qty;
                        $log['bought_inputs'][$in['item_id']] = ($log['bought_inputs'][$in['item_id']] ?? 0) + $qty;
                    }
                }
            }
            $recipe = current(array_filter(player_state($id)['profession']['recipes'], fn($r) => $r['id'] === $recipe['id']));
        }
        if ($recipe['can_make'] > 0 && attempt(fn() => crafting_start($id, $recipe['id'], min($recipe['can_make'], (int) econ('crafting.max_batch')))) !== false) {
            $free--;
            $log['crafted'][$recipe['id']] = ($log['crafted'][$recipe['id']] ?? 0) + 1;
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
    foreach ($state['inventory'] as $item) {
        $itemId = $item['item_id'];
        $type = content_item($itemId)['type'];
        $keep = isset($needs[$itemId]) ? ($type === 'raw' ? 20 : 4) : 0;
        $qty = $item['quantity'] - $keep;
        if ($qty <= 0) {
            continue;
        }
        $ref = market_reference_value($itemId);
        $lowest = $market[$itemId]['from_players'] > 0 ? $market[$itemId]['lowest'] : null;
        $price = (int) round($ref * rand_between(0.95, 1.15));
        if ($lowest !== null && $lowest < $price) {
            $price = max((int) ceil($ref * 0.9), $lowest - 1);
        }
        if (attempt(fn() => exchange_list($id, $itemId, $qty, max(1, $price), 24)) !== false) {
            $log['listed'][$itemId] = ($log['listed'][$itemId] ?? 0) + $qty;
        }
    }
}

// ---- Run ----------------------------------------------------------------------------------------
$end = $start + (int) ($days * 86400);
$tickEvery = 300;
$nextTick = $start + $tickEvery;
$log = ['crafted' => [], 'listed' => [], 'bought_inputs' => []];
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
    'SELECT p.name, pp.profession_id, p.gold FROM players p JOIN player_professions pp ON pp.player_id = p.id ORDER BY p.id'
)->fetchAll();

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
echo "\nFinal gold by player:\n";
foreach ($playersOut as $p) {
    printf("  %-14s %-14s %6d\n", $p['name'], $p['profession_id'], $p['gold']);
}
printf("\nGold in circulation: start %d -> end %d\n", $daily[0]['gold_total'] ?? 0, (int) db()->query('SELECT SUM(gold) FROM players')->fetchColumn());
