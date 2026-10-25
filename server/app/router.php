<?php
declare(strict_types=1);

/*
 * API actions. Each takes the request body and the logged-in player's id (or null)
 * and returns an array that becomes {"ok": true, "data": ...}.
 */

function guildie_actions(): array
{
    return [
        // name             methods allowed       login required
        'ping'          => [['GET', 'POST'], false, 'action_ping'],
        'register'      => [['POST'],        false, 'action_register'],
        'login'         => [['POST'],        false, 'action_login'],
        'logout'        => [['POST'],        false, 'action_logout'],
        'get_state'     => [['GET', 'POST'], true,  'action_get_state'],
        // TEMPORARY (M0 only): proves the server can change inventory. Removed in M1.
        'test_add_item' => [['POST'],        true,  'action_test_add_item'],
    ];
}

function action_ping(array $body, ?int $playerId): array
{
    return [
        'pong'        => true,
        'server_time' => time(),
        'build'       => GUILDIE_BUILD,
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

function action_test_add_item(array $body, ?int $playerId): array
{
    $itemId = body_string($body, 'item_id') ?: 'copper_ore';
    $max = (int) (content_economy()['test_add_item_max'] ?? 10);
    $quantity = body_int($body, 'quantity', 1, 1, $max);

    tx(function (PDO $pdo) use ($playerId, $itemId, $quantity) {
        inventory_add($pdo, $playerId, $itemId, $quantity);
    });
    return player_state($playerId);
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

        // Run an overdue market tick before handling the request (never blocks the request if it fails).
        if ($action !== 'ping') {
            try {
                maybe_run_tick('catchup');
            } catch (Throwable $e) {
                error_log('Guildie catch-up tick failed: ' . $e->getMessage());
            }
        }

        $playerId = $needsLogin ? require_player_id() : null;
        send_json(['ok' => true, 'data' => $handler($body, $playerId)]);
    } catch (ApiError $e) {
        send_json(['ok' => false, 'error' => ['code' => $e->errorCode, 'message' => $e->getMessage()]], $e->status);
    } catch (Throwable $e) {
        error_log('Guildie server error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
        $error = ['code' => 'server_error', 'message' => 'Something went wrong on the server.'];
        if (config('debug', false)) {
            $error['detail'] = $e->getMessage();
        }
        send_json(['ok' => false, 'error' => $error], 500);
    }
}
