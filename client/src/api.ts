// Talks to the Guildie PHP API (GDD 11.4). The server is authoritative: this only sends requests and
// returns what the server says. The API lives next to the game page: .../games/guildie/api/index.php

export interface ApiError {
  code: string
  message: string
}

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: ApiError; status: number }

const TIMEOUT_MS = 20000
const BASE = new URL('api/index.php', window.location.href).href

let tokenProvider: () => string = () => ''

/** The session tells the API layer which token to send (avoids a circular import). */
export function setTokenProvider(fn: () => string): void {
  tokenProvider = fn
}

function failure<T>(code: string, message: string, status: number): ApiResult<T> {
  return { ok: false, error: { code, message }, status }
}

/** Call an API action. Pass a body for POST, or nothing for GET. */
export async function callAction<T>(action: string, body?: unknown, query: Record<string, string | number> = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = tokenProvider()
  if (token) headers['X-Guildie-Token'] = token
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response: Response
  try {
    const params = new URLSearchParams({ action, ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])) })
    response = await fetch(`${BASE}?${params}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    })
  } catch {
    return failure('network_error', 'Could not reach the server. Check your connection.', 0)
  } finally {
    clearTimeout(timer)
  }

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    return failure('bad_response', 'The server sent an unexpected response.', response.status)
  }
  const p = parsed as { ok?: boolean; data?: T; error?: ApiError }
  if (p && p.ok) return { ok: true, data: p.data as T, status: response.status }
  return { ok: false, error: p?.error ?? { code: 'unknown', message: 'Unknown error.' }, status: response.status }
}

/** Human-readable message from a failed call. */
export function errorMessage(result: ApiResult<unknown>): string {
  return result.ok ? '' : result.error.message || 'Something went wrong.'
}
