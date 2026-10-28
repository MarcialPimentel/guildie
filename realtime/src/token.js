// @ts-check
// Checks the presence pass the PHP server signs (server/app/lib/city.php city_presence_token):
//   base64url(JSON claims) "." base64url(HMAC-SHA256(secret, first part))
// Uses Web Crypto, which both Cloudflare Workers and Node 20 have built in.

const enc = new TextEncoder()

function fromB64url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const keys = new Map()
async function hmacKey(secret) {
  let k = keys.get(secret)
  if (!k) {
    k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    keys.set(secret, k)
  }
  return k
}

/**
 * The pass's claims if it is genuine and not expired, else null.
 * @returns {Promise<{ pid: number, n: string, p: string, l: number, s: number, exp: number } | null>}
 */
export async function verifyToken(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string' || !secret || secret.length < 16) return null
  const dot = token.indexOf('.')
  if (dot < 1 || token.length > 1024) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  let ok = false
  try {
    ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(body))
  } catch {
    return null
  }
  if (!ok) return null
  let claims
  try {
    claims = JSON.parse(new TextDecoder().decode(fromB64url(body)))
  } catch {
    return null
  }
  if (!claims || typeof claims.pid !== 'number' || typeof claims.exp !== 'number' || claims.exp < nowSeconds) return null
  return claims
}
