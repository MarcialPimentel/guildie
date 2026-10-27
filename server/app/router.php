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
    choose_profession($playerId, body_string($body, 'profession_id'));
    return player_state($playerId);
}

function action_collect_station(array $body, ?int $playerId): array
{
    $collected = gathering_collect($playerId);
    return ['collected' => $collected, 'state' => player_state($playerId)];
}

function action_start_craft(array $body, ?int $playerId): array
{
    crafting_start($playerId, body_string($body, 'recipe_id'), body_int($body, 'quantity', 1, 1, 1000));
    return player_state($playerId);
}

function action_collect_crafts(array $body, ?int $playerId): array
{
    $collected = crafting_collect($playerId);
    return ['collected' => $collected, 'state' => player_state($playerId)];
}

function action_market(array $body, ?int $playerId): array
{
    return ['items' => exchange_overview(), 'server_time' => game_now()];
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
    return ['activity' => activity_list($playerId, 50)];
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
