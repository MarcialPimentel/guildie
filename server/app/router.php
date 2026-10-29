<?php
declare(strict_types=1);

/*
 * API actions. Each takes the request body and the logged-in player's id (or null)
 * and returns an array that becomes {"ok": true, "data": ...}.
 */

function guildie_actions(): array
{
    return [
        // name                 methods allowed       login required
        'ping'              => [['GET', 'POST'], false, 'action_ping'],
        'register'          => [['POST'],        false, 'action_register'],
        'login'             => [['POST'],        false, 'action_login'],
        'logout'            => [['POST'],        false, 'action_logout'],
        'get_state'         => [['GET', 'POST'], true,  'action_get_state'],
        'professions'       => [['GET'],         true,  'action_professions'],
        'choose_profession' => [['POST'],        true,  'action_choose_profession'],
        'collect_station'   => [['POST'],        true,  'action_collect_station'],
        'start_craft'       => [['POST'],        true,  'action_start_craft'],
        'collect_crafts'    => [['POST'],        true,  'action_collect_crafts'],
        'market'            => [['GET'],         true,  'action_market'],
        'market_item'       => [['GET', 'POST'], true,  'action_market_item'],
        'sell_quote'        => [['POST'],        true,  'action_sell_quote'],
        'list_item'         => [['POST'],        true,  'action_list_item'],
        'buy_listing'       => [['POST'],        true,  'action_buy_listing'],
        'cancel_listing'    => [['POST'],        true,  'action_cancel_listing'],
        'my_listings'       => [['GET'],         true,  'action_my_listings'],
        'activity'          => [['GET'],         true,  'action_activity'],
        'sell_to_guild'     => [['POST'],        true,  'action_sell_to_guild'],
        'feedback'          => [['POST'],        true,  'action_feedback'],
        'feedback_list'     => [['GET'],         false, 'action_feedback_list'],
        'players'           => [['GET', 'POST'], true,  'action_players'],
        'player_profile'    => [['POST'],        true,  'action_player_profile'],
        'trade_offers'      => [['GET'],         true,  'action_trade_offers'],
        'offer_create'      => [['POST'],        true,  'action_offer_create'],
        'offer_accept'      => [['POST'],        true,  'action_offer_accept'],
        'offer_decline'     => [['POST'],        true,  'action_offer_decline'],
        'offer_cancel'      => [['POST'],        true,  'action_offer_cancel'],
        'orders'            => [['GET'],         true,  'action_orders'],
        'order_fill'        => [['POST'],        true,  'action_order_fill'],
        'order_skip'        => [['POST'],        true,  'action_order_skip'],
        'news'              => [['GET'],         true,  'action_news'],
        'trainer'           => [['GET'],         true,  'action_trainer'],
        'learn_recipe'      => [['POST'],        true,  'action_learn_recipe'],
        // The living city (0.9.0, docs/living-city.md)
        'presence_token'    => [['GET', 'POST'], true,  'action_presence_token'],
        'city_prefs'        => [['POST'],        true,  'action_city_prefs'],
        'city_look'         => [['POST'],        true,  'action_city_look'],
        'friends'           => [['GET'],         true,  'action_friends'],
        'friend_add'        => [['POST'],        true,  'action_friend_add'],
        'friend_remove'     => [['POST'],        true,  'action_friend_remove'],
        'duke_order'        => [['GET'],         true,  'action_duke_order'],
        'duke_contribute'   => [['POST'],        true,  'action_duke_contribute'],
        // 0.11.0: the bottega upgrades (#51) and the Palazzo (docs/palazzo.md)
        'workshop_upgrade'  => [['POST'],        true,  'action_workshop_upgrade'],
        'workshop_open'     => [['POST'],        true,  'action_workshop_open'],
        'palazzo'           => [['GET'],         true,  'action_palazzo'],
        'honors'            => [['GET'],         true,  'action_honors'],
        // 0.14.0: the new-player guide (content/guide.json)
        'guide_claim'       => [['POST'],        true,  'action_guide_claim'],
        'guide_skip'        => [['POST'],        true,  'action_guide_skip'],
        'guide_mark'        => [['POST'],        true,  'action_guide_mark'],
        // 0.15.0: minigames (content/minigames.json)
        'minigame_start'    => [['POST'],        true,  'action_minigame_start'],
        'minigame_finish'   => [['POST'],        true,  'action_minigame_finish'],
        'npc_talk'          => [['POST'],        true,  'action_npc_talk'],
        'npc_favor'         => [['POST'],        true,  'action_npc_favor'],
        'wanted'            => [['GET'],         true,  'action_wanted'],
        'wanted_post'       => [['POST'],        true,  'action_wanted_post'],
        'wanted_fill'       => [['POST'],        true,  'action_wanted_fill'],
        'wanted_cancel'     => [['POST'],        true,  'action_wanted_cancel'],
    ];
}

function action_ping(array $body, ?int $playerId): array
{
    return [
        'pong'        => true,
        'server_time' => game_now(),
        'build'       => GUILDIE_BUILD,
        'schema'      => schema_version(db()),
        'tick'        => tick_status(),
    ];
}

function action_register(array $body, ?int $playerId): array
{
    [$id, $token] = register_player(body_string($body, 'name'), body_string($body, 'password'));
    return ['token' => $token, 'state' => player_state($id)];
}

function action_login(array $body, ?int $playerId): array
{
    [$id, $token] = login_player(body_string($body, 'name'), body_string($body, 'password'));
    return ['token' => $token, 'state' => player_state($id)];
}

function action_logout(array $body, ?int $playerId): array
{
    logout_session();
    return ['logged_out' => true];
}

function action_get_state(array $body, ?int $playerId): array
{
    return player_state($playerId);
}

function action_professions(array $body, ?int $playerId): array
{
    return ['professions' => professions_for_choice()];
}

function action_choose_profession(array $body, ?int $playerId): array
{
    // The look chosen on the same screen (0.10.0): optional, so older clients still join with the default look.
    $look = null;
    if (isset($body['look_color']) || isset($body['look_hat'])) {
        $look = [body_int($body, 'look_color', 0, 0, CITY_LOOKS - 1), body_int($body, 'look_hat', 0, 0, city_hat_count(null) - 1)];
    }
    choose_profession($playerId, body_string($body, 'profession_id'), $look);
    return player_state($playerId);
}

function action_collect_station(array $body, ?int $playerId): array
{
    $result = gathering_collect($playerId);
    return $result + ['state' => player_state($playerId)];
}

function action_start_craft(array $body, ?int $playerId): array
{
    crafting_start($playerId, body_string($body, 'recipe_id'), body_int($body, 'quantity', 1, 1, 1000));
    return player_state($playerId);
}

function action_collect_crafts(array $body, ?int $playerId): array
{
    $result = crafting_collect($playerId);
    return $result + ['state' => player_state($playerId)];
}

function action_market(array $body, ?int $playerId): array
{
    return ['items' => exchange_overview(), 'news' => calendar_news(game_now()), 'server_time' => game_now()];
}

function action_market_item(array $body, ?int $playerId): array
{
    $itemId = body_string($body, 'item_id') ?: (string) ($_GET['item_id'] ?? '');
    return exchange_item($playerId, $itemId);
}

function action_sell_quote(array $body, ?int $playerId): array
{
    return exchange_sell_quote($playerId, body_string($body, 'item_id'), body_int($body, 'quantity', 1, 1, 10000));
}

function action_list_item(array $body, ?int $playerId): array
{
    $result = exchange_list(
        $playerId,
        body_string($body, 'item_id'),
        body_int($body, 'quantity', 1, 1, 10000),
        body_int($body, 'unit_price', 1, 1, 100000000),
        body_int($body, 'duration_hours', 24, 1, 1000)
    );
    return ['listing' => $result, 'state' => player_state($playerId)];
}

function action_buy_listing(array $body, ?int $playerId): array
{
    $result = exchange_buy($playerId, body_int($body, 'listing_id', 0, 1, PHP_INT_MAX), body_int($body, 'quantity', 1, 1, 10000));
    return ['purchase' => $result, 'state' => player_state($playerId)];
}

function action_cancel_listing(array $body, ?int $playerId): array
{
    exchange_cancel($playerId, body_int($body, 'listing_id', 0, 1, PHP_INT_MAX));
    return ['listings' => exchange_my_listings($playerId), 'state' => player_state($playerId)];
}

function action_my_listings(array $body, ?int $playerId): array
{
    return ['listings' => exchange_my_listings($playerId)];
}

function action_activity(array $body, ?int $playerId): array
{
    // ?since=<unix time> returns what happened since then (the "While you were away" screen, #47).
    $since = max(0, (int) ($_GET['since'] ?? 0));
    return ['activity' => activity_list($playerId, $since > 0 ? 100 : 50, $since)];
}

function action_orders(array $body, ?int $playerId): array
{
    return orders_board($playerId);
}

function action_order_fill(array $body, ?int $playerId): array
{
    $result = orders_fill($playerId, body_int($body, 'order_id', 0, 1, PHP_INT_MAX));
    return ['filled' => $result, 'board' => orders_board($playerId), 'state' => player_state($playerId)];
}

function action_order_skip(array $body, ?int $playerId): array
{
    orders_skip($playerId, body_int($body, 'order_id', 0, 1, PHP_INT_MAX));
    return ['board' => orders_board($playerId), 'state' => player_state($playerId)];
}

function action_news(array $body, ?int $playerId): array
{
    return ['news' => calendar_news(game_now())];
}

function action_trainer(array $body, ?int $playerId): array
{
    return trainer_list($playerId);
}

function action_learn_recipe(array $body, ?int $playerId): array
{
    $learned = trainer_learn($playerId, body_string($body, 'recipe_id'));
    return ['learned' => $learned, 'trainer' => trainer_list($playerId), 'state' => player_state($playerId)];
}

function action_sell_to_guild(array $body, ?int $playerId): array
{
    $expected = isset($body['expected_total']) ? body_int($body, 'expected_total', 0, 0, PHP_INT_MAX) : null;
    $sale = guild_sell($playerId, body_string($body, 'item_id'), body_int($body, 'quantity', 1, 1, 10000), $expected);
    return ['sale' => $sale, 'state' => player_state($playerId)];
}

function action_feedback(array $body, ?int $playerId): array
{
    feedback_save($playerId, body_string($body, 'message'), isset($body['screen']) ? body_string($body, 'screen') : '');
    return ['saved' => true];
}

/** Private page for Marz: index.php?action=feedback_list&key=... (key in config.php). Returns HTML. */
function action_feedback_list(array $body, ?int $playerId): array
{
    return ['_html' => feedback_page((string) ($_GET['key'] ?? ''))];
}

function action_players(array $body, ?int $playerId): array
{
    $sort = isset($body['sort']) ? body_string($body, 'sort') : (string) ($_GET['sort'] ?? 'wealth');
    return players_directory($playerId, $sort);
}

function action_player_profile(array $body, ?int $playerId): array
{
    return player_profile($playerId, body_int($body, 'player_id', 0, 1, PHP_INT_MAX));
}

function action_trade_offers(array $body, ?int $playerId): array
{
    return offers_list($playerId);
}

function action_offer_create(array $body, ?int $playerId): array
{
    $result = offer_create(
        $playerId,
        body_int($body, 'to_player_id', 0, 1, PHP_INT_MAX),
        $body['give_items'] ?? [],
        body_int($body, 'give_gold', 0, 0, 100000000),
        $body['ask_items'] ?? [],
        body_int($body, 'ask_gold', 0, 0, 100000000),
        isset($body['note']) ? body_string($body, 'note') : ''
    );
    return ['offer' => $result, 'offers' => offers_list($playerId), 'state' => player_state($playerId)];
}

function action_offer_accept(array $body, ?int $playerId): array
{
    $result = offer_accept($playerId, body_int($body, 'offer_id', 0, 1, PHP_INT_MAX));
    return ['trade' => $result, 'offers' => offers_list($playerId), 'state' => player_state($playerId)];
}

function action_offer_decline(array $body, ?int $playerId): array
{
    offer_decline($playerId, body_int($body, 'offer_id', 0, 1, PHP_INT_MAX));
    return ['offers' => offers_list($playerId), 'state' => player_state($playerId)];
}

function action_offer_cancel(array $body, ?int $playerId): array
{
    offer_cancel($playerId, body_int($body, 'offer_id', 0, 1, PHP_INT_MAX));
    return ['offers' => offers_list($playerId), 'state' => player_state($playerId)];
}

// ---------------------------------------------------------------- the living city (0.9.0)

function action_presence_token(array $body, ?int $playerId): array
{
    return city_presence_token($playerId);
}

function action_city_prefs(array $body, ?int $playerId): array
{
    if (!isset($body['slaps']) || !is_bool($body['slaps'])) {
        throw new ApiError('bad_request', "Field 'slaps' must be true or false.");
    }
    return city_set_prefs($playerId, $body['slaps']);
}

function action_city_look(array $body, ?int $playerId): array
{
    return city_set_look($playerId, body_int($body, 'color', 0, 0, CITY_LOOKS - 1), body_int($body, 'hat', 0, 0, city_hat_count(null) - 1));
}


function action_friends(array $body, ?int $playerId): array
{
    return friends_list($playerId);
}

function action_friend_add(array $body, ?int $playerId): array
{
    friends_add($playerId, body_int($body, 'player_id', 0, 1, PHP_INT_MAX));
    return friends_list($playerId);
}

function action_friend_remove(array $body, ?int $playerId): array
{
    friends_remove($playerId, body_int($body, 'player_id', 0, 1, PHP_INT_MAX));
    return friends_list($playerId);
}

function action_duke_order(array $body, ?int $playerId): array
{
    return duke_board($playerId);
}

function action_duke_contribute(array $body, ?int $playerId): array
{
    $given = duke_contribute($playerId, body_string($body, 'item_id'), body_int($body, 'quantity', 1, 1, 10000));
    return ['given' => $given, 'board' => duke_board($playerId), 'state' => player_state($playerId)];
}

function action_workshop_upgrade(array $body, ?int $playerId): array
{
    return ['started' => workshop_start($playerId), 'state' => player_state($playerId)];
}

function action_workshop_open(array $body, ?int $playerId): array
{
    return ['built' => workshop_finish($playerId), 'state' => player_state($playerId)];
}

function action_palazzo(array $body, ?int $playerId): array
{
    return ['npcs' => palazzo_overview($playerId)];
}

function action_honors(array $body, ?int $playerId): array
{
    return palazzo_honors($playerId);
}

function action_guide_claim(array $body, ?int $playerId): array
{
    return guide_advance($playerId, body_string($body, 'step'), false);
}

function action_guide_skip(array $body, ?int $playerId): array
{
    return guide_advance($playerId, body_string($body, 'step'), true);
}

function action_guide_mark(array $body, ?int $playerId): array
{
    return guide_mark($playerId, body_string($body, 'what'));
}

function action_minigame_start(array $body, ?int $playerId): array
{
    return minigame_start($playerId, isset($body['target']) ? body_string($body, 'target') : 'station');
}

function action_minigame_finish(array $body, ?int $playerId): array
{
    $result = minigame_finish($playerId, body_int($body, 'round_id', 0, 1, PHP_INT_MAX), $body['taps'] ?? null);
    return $result + ['state' => player_state($playerId)];
}

function action_npc_talk(array $body, ?int $playerId): array
{
    return palazzo_talk($playerId, body_string($body, 'npc'));
}

function action_npc_favor(array $body, ?int $playerId): array
{
    $done = palazzo_favor_do($playerId, body_string($body, 'npc'));
    return ['done' => $done, 'talk' => palazzo_talk($playerId, body_string($body, 'npc')), 'state' => player_state($playerId)];
}

function action_wanted(array $body, ?int $playerId): array
{
    return wanted_board($playerId);
}

function action_wanted_post(array $body, ?int $playerId): array
{
    $posted = wanted_post($playerId, body_string($body, 'item_id'), body_int($body, 'quantity', 1, 1, 100000), body_int($body, 'unit_price', 0, 0, 10000000));
    return ['posted' => $posted, 'board' => wanted_board($playerId), 'state' => player_state($playerId)];
}

function action_wanted_fill(array $body, ?int $playerId): array
{
    $filled = wanted_fill($playerId, body_int($body, 'post_id', 0, 1, PHP_INT_MAX), body_int($body, 'quantity', 1, 1, 100000));
    return ['filled' => $filled, 'board' => wanted_board($playerId), 'state' => player_state($playerId)];
}

function action_wanted_cancel(array $body, ?int $playerId): array
{
    $cancelled = wanted_cancel($playerId, body_int($body, 'post_id', 0, 1, PHP_INT_MAX));
    return ['cancelled' => $cancelled, 'board' => wanted_board($playerId), 'state' => player_state($playerId)];
}

/**
 * Entry point used by api/index.php.
 */
function guildie_handle_request(): void
{
    try {
        $action = (string) ($_GET['action'] ?? '');
        $actions = guildie_actions();
        if (!isset($actions[$action])) {
            throw new ApiError('unknown_action', 'Unknown action.', 404);
        }
        [$methods, $needsLogin, $handler] = $actions[$action];

        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if (!in_array($method, $methods, true)) {
            throw new ApiError('method_not_allowed', "Use $methods[0] for this action.", 405);
        }

        $body = $method === 'POST' ? request_body() : [];

        // Apply any database updates that came with a new deploy (once, under a lock).
        migrate_if_needed();

        // Run an overdue market tick before handling the request (never blocks the request if it fails).
        if ($action !== 'ping') {
            try {
                maybe_run_tick('catchup');
            } catch (Throwable $e) {
                error_log('Guildie catch-up tick failed: ' . $e->getMessage());
            }
        }

        $playerId = $needsLogin ? require_player_id() : null;
        if ($playerId !== null) {
            progression_ensure($playerId);   // players from before 0.8.0: count their skill once
        }
        $data = $handler($body, $playerId);
        if (isset($data['_html'])) {
            http_response_code(200);
            header('Content-Type: text/html; charset=utf-8');
            header('Cache-Control: no-store');
            header('X-Robots-Tag: noindex');
            echo $data['_html'];
            return;
        }
        send_json(['ok' => true, 'data' => $data]);
    } catch (ApiError $e) {
        send_json(['ok' => false, 'error' => ['code' => $e->errorCode, 'message' => $e->getMessage()]], $e->status);
    } catch (Throwable $e) {
        error_log('Guildie server error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
        $error = ['code' => 'server_error', 'message' => 'Something went wrong on the server.'];
        if (config('debug', false)) {
            $error['detail'] = $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine();
        }
        send_json(['ok' => false, 'error' => $error], 500);
    }
}
