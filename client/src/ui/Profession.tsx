// Choose a profession (once). GDD 9: the identity moment.
import { useEffect, useState } from 'preact/hooks'
import { errorMessage } from '../api'
import { session } from '../session'
import type { ProfessionChoice as Choice } from '../types'

export function ProfessionChoice() {
  const [list, setList] = useState<Choice[] | null>(null)
  const [status, setStatus] = useState('Loading guilds…')
  const [isError, setIsError] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    session.professions().then((r) => {
      if (r.ok) {
        setList(r.data.professions)
        setStatus('')
      } else {
        setStatus(errorMessage(r))
        setIsError(true)
      }
    })
  }, [])

  const choose = async (id: string) => {
    setBusy(true)
    setIsError(false)
    setStatus('Joining…')
    const r = await session.chooseProfession(id)
    // On success the App shows the game screen by itself.
    if (!r.ok) {
      setBusy(false)
      setIsError(true)
      setStatus(errorMessage(r))
    }
  }

  return (
    <main class="page">
      <h1 style={{ fontSize: '32px' }}>Choose your guild</h1>
      <p class="muted">This is your profession for now. You can learn a second one much later.</p>
      {status && <p class={isError ? 'error' : 'muted'}>{status}</p>}
      <div class="cols">
        {list?.map((p) => (
          <section class="card" data-testid={`guild-${p.id}`}>
            <h2 style={{ fontSize: '26px' }}>{p.name}</h2>
            <p class="muted">{p.tagline}</p>
            <p>{p.description}</p>
            <p class="small">Gathers: {p.gathers.join(', ')} ({p.station})</p>
            <p class="small">Makes: {p.makes.join(', ')}</p>
            <p class="small npc">Needs from others: {p.needs_from_others}</p>
            <button disabled={busy} onClick={() => choose(p.id)} data-testid={`join-${p.id}`}>
              Join the {p.name} guild
            </button>
          </section>
        ))}
      </div>
    </main>
  )
}
