// Log in or create an account (name + simple password, GDD 11.2.1).
import { useEffect, useState } from 'preact/hooks'
import { errorMessage } from '../api'
import { CLIENT_BUILD } from '../format'
import { session } from '../session'

export function Login({ initialError = '' }: { initialError?: string }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState(initialError)
  const [isError, setIsError] = useState(initialError !== '')
  const [busy, setBusy] = useState(false)
  const [server, setServer] = useState<string | null>(null)

  useEffect(() => {
    session.ping().then((r) => setServer(r.ok ? session.serverBuild : 'unreachable'))
  }, [])

  const submit = async (isRegister: boolean) => {
    const n = name.trim()
    if (!n || !password) {
      setStatus('Enter a name and password.')
      setIsError(true)
      return
    }
    setBusy(true)
    setIsError(false)
    setStatus(isRegister ? 'Creating account…' : 'Logging in…')
    const r = isRegister ? await session.register(n, password) : await session.login(n, password)
    // On success the App swaps screens by itself.
    if (!r.ok) {
      setBusy(false)
      setIsError(true)
      setStatus(errorMessage(r))
    }
  }

  return (
    <main class="page narrow" style={{ paddingTop: '8vh', maxWidth: '480px' }}>
      <h1 class="center" style={{ fontSize: '52px' }}>Guildie</h1>
      <p class="center muted" style={{ fontSize: '19px' }}>
        Rise from apprentice to master in a guild city on the edge of the steam age.
      </p>
      <form
        class="stack"
        style={{ marginTop: '20px' }}
        onSubmit={(e) => {
          e.preventDefault()
          submit(false)
        }}
      >
        <input
          name="username" autocomplete="username" placeholder="Name" maxLength={20} value={name}
          onInput={(e) => setName(e.currentTarget.value)} data-testid="login-name" autofocus
        />
        <input
          name="password" type="password" autocomplete="current-password" placeholder="Password" maxLength={72}
          value={password} onInput={(e) => setPassword(e.currentTarget.value)} data-testid="login-password"
        />
        <button type="submit" disabled={busy} data-testid="login">Log in</button>
        <button type="button" disabled={busy} onClick={() => submit(true)} data-testid="register">Create account</button>
      </form>
      <p class={`center ${isError ? 'error' : 'muted'}`} data-testid="login-status">{status}</p>
      <p class="center muted small">Names: 3–20 letters, numbers, _ or -. Passwords: at least 4 characters.</p>
      <p class={`center tiny ${server === 'unreachable' ? 'error' : 'muted'}`}>
        Client {CLIENT_BUILD} · Server {server === null ? '…' : server === 'unreachable' ? 'unreachable' : server}
      </p>
    </main>
  )
}
