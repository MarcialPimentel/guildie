<?php
declare(strict_types=1);

/**
 * An error the client should see, with a stable machine-readable code.
 */
final class ApiError extends Exception
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $status = 400,
    ) {
        parent::__construct($message);
    }
}

/** Send a JSON response. */
function send_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

/** Decode the JSON request body (empty array if none). */
function request_body(): array
{
    $raw = file_get_contents('php://input', false, null, 0, 65536);
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new ApiError('bad_request', 'Request body must be a JSON object.');
    }
    return $data;
}

/** The session token sent by the client, if any. */
function request_token(): ?string
{
    $token = $_SERVER['HTTP_X_GUILDIE_TOKEN'] ?? '';
    if ($token === '' && isset($_SERVER['HTTP_AUTHORIZATION']) && str_starts_with($_SERVER['HTTP_AUTHORIZATION'], 'Bearer ')) {
        $token = substr($_SERVER['HTTP_AUTHORIZATION'], 7);
    }
    $token = trim($token);
    return $token === '' ? null : $token;
}

function client_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 45);
}

/** Read a string field from the request body. */
function body_string(array $body, string $key): string
{
    $value = $body[$key] ?? '';
    if (!is_string($value)) {
        throw new ApiError('bad_request', "Field '$key' must be text.");
    }
    return $value;
}

/** Read an integer field from the request body, with bounds. */
function body_int(array $body, string $key, int $default, int $min, int $max): int
{
    $value = $body[$key] ?? $default;
    if (!is_int($value) && !(is_string($value) && ctype_digit($value))) {
        throw new ApiError('bad_request', "Field '$key' must be a whole number.");
    }
    $value = (int) $value;
    if ($value < $min || $value > $max) {
        throw new ApiError('bad_request', "Field '$key' must be between $min and $max.");
    }
    return $value;
}
