<?php
declare(strict_types=1);

/*
 * Accounts for the proof of concept (GDD 11.2.1): name + simple password.
 * Passwords are hashed with password_hash(); session tokens are random and only their hash is stored.
 */

const SESSION_IDLE_DAYS = 30;          // sessions expire after this many days without use
const LOGIN_FAILURE_WINDOW_MIN = 15;   // look-back window for failed logins
const LOGIN_FAILURE_LIMIT = 10;        // failed logins per IP allowed in that window

function validate_name(string $name): string
{
    $name = trim($name);
    if (!preg_match('/^[A-Za-z0-9_-]{3,20}$/', $name)) {
        throw new ApiError('invalid_name', 'Names must be 3–20 characters: letters, numbers, _ or -.');
    }
    return $name;
}

function validate_password(string $password): string
{
    $len = strlen($password);
    if ($len < 4 || $len > 72) {
        throw new ApiError('invalid_password', 'Passwords must be 4–72 characters.');
    }
    return $password;
}

/** Create a session for a player and return the raw token (sent to the client once). */
function create_session(PDO $pdo, int $playerId): string
{
    $token = bin2hex(random_bytes(32));
    $stmt = $pdo->prepare('INSERT INTO sessions (token_hash, player_id) VALUES (?, ?)');
    $stmt->execute([hash('sha256', $token), $playerId]);
    return $token;
}

/** Register a new player with starting gold and items. Returns [player_id, token]. */
function register_player(string $name, string $password): array
{
    $name = validate_name($name);
    $password = validate_password($password);
    $economy = content_economy()['new_player'];

    return tx(function (PDO $pdo) use ($name, $password, $economy) {
        try {
            $stmt = $pdo->prepare('INSERT INTO players (name, password_hash, gold, last_login_at) VALUES (?, ?, ?, UTC_TIMESTAMP())');
            $stmt->execute([$name, password_hash($password, PASSWORD_DEFAULT), (int) $economy['starting_gold']]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {   // unique name already taken
                throw new ApiError('name_taken', 'That name is already taken.', 409);
            }
            throw $e;
        }
        $playerId = (int) $pdo->lastInsertId();

        foreach ($economy['starting_items'] as $start) {
            inventory_add($pdo, $playerId, $start['item_id'], (int) $start['quantity']);
        }

        return [$playerId, create_session($pdo, $playerId)];
    });
}

/** Log in. Returns [player_id, token]. Slows down repeated failures from the same IP. */
function login_player(string $name, string $password): array
{
    $pdo = db();
    $ip = client_ip();

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM login_failures WHERE ip = ? AND attempted_at > UTC_TIMESTAMP() - INTERVAL ? MINUTE');
    $stmt->execute([$ip, LOGIN_FAILURE_WINDOW_MIN]);
    if ((int) $stmt->fetchColumn() >= LOGIN_FAILURE_LIMIT) {
        throw new ApiError('too_many_attempts', 'Too many failed logins. Try again in a few minutes.', 429);
    }

    $name = trim($name);
    $stmt = $pdo->prepare('SELECT id, password_hash FROM players WHERE name = ?');
    $stmt->execute([$name]);
    $player = $stmt->fetch();

    if (!$player || !password_verify($password, $player['password_hash'])) {
        $pdo->prepare('INSERT INTO login_failures (ip, name) VALUES (?, ?)')->execute([$ip, substr($name, 0, 20)]);
        throw new ApiError('invalid_credentials', 'Wrong name or password.', 401);
    }

    $playerId = (int) $player['id'];

    return tx(function (PDO $pdo) use ($playerId, $password, $player) {
        if (password_needs_rehash($player['password_hash'], PASSWORD_DEFAULT)) {
            $pdo->prepare('UPDATE players SET password_hash = ? WHERE id = ?')
                ->execute([password_hash($password, PASSWORD_DEFAULT), $playerId]);
        }
        $pdo->prepare('UPDATE players SET last_login_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$playerId]);
        return [$playerId, create_session($pdo, $playerId)];
    });
}

/** The logged-in player's id, from the request token. Throws if not logged in. */
function require_player_id(): int
{
    $token = request_token();
    if ($token === null) {
        throw new ApiError('not_logged_in', 'Please log in.', 401);
    }

    $pdo = db();
    $hash = hash('sha256', $token);
    $stmt = $pdo->prepare(
        'SELECT player_id, last_seen_at < UTC_TIMESTAMP() - INTERVAL 5 MINUTE AS stale
         FROM sessions WHERE token_hash = ? AND last_seen_at > UTC_TIMESTAMP() - INTERVAL ? DAY'
    );
    $stmt->execute([$hash, SESSION_IDLE_DAYS]);
    $row = $stmt->fetch();
    if (!$row) {
        throw new ApiError('not_logged_in', 'Your session has expired. Please log in again.', 401);
    }

    if ((int) $row['stale'] === 1) {   // only touch the row occasionally
        $pdo->prepare('UPDATE sessions SET last_seen_at = UTC_TIMESTAMP() WHERE token_hash = ?')->execute([$hash]);
    }
    return (int) $row['player_id'];
}

function logout_session(): void
{
    $token = request_token();
    if ($token !== null) {
        db()->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
    }
}
