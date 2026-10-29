// Choose a profession (once). GDD 9: the identity moment. Since 0.10.0 you also choose how your merchant
// looks: a body color here, and a hat on each guild's card (cosmetic; saved with the guild in one step).
import { useEffect, useState } from 'preact/hooks'
import { errorMessage } from '../api'
import { session } from '../session'
import type { ProfessionChoice as Choice } from '../types'
import { ColorPicker, HatPicker, Portrait } from './Look'

export function ProfessionChoice() {
  const [list, setList] = useState<Choice[] | null>(null)
  const [status, setStatus] = useState('Loading guilds…')
  const [isError, setIsError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [color, setColor] = useState(() => Math.floor(Math.random() * 6))
  const [hats, setHats] = useState<Record<string, number>>({})

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
    const r = await session.chooseProfession(id, { color, hat: hats[id] ?? 0 })
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
      {list && (
        <section class="card look-row" data-testid="look-picker">
          <div>
            <h2 style={{ fontSize: '22px' }}>Your merchant</h2>
            <p class="small muted">Pick a body color, then a hat on your guild's card. You can change both later in the 3D city.</p>
          </div>
          <ColorPicker color={color} onChange={setColor} />
        </section>
      )}
      <div class="cols">
        {list?.map((p) => (
          <section class="card" data-testid={`guild-${p.id}`}>
            <div class="guild-head">
              <Portrait guild={p.id} color={color} hat={hats[p.id] ?? 0} size={72} />
              <div>
                <h2 style={{ fontSize: '26px' }}>{p.name}</h2>
                <p class="muted">{p.tagline}</p>
              </div>
            </div>
            <HatPicker guild={p.id} hat={hats[p.id] ?? 0} onChange={(h) => setHats((x) => ({ ...x, [p.id]: h }))} testid={`hat-${p.id}`} />
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
