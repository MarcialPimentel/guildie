// The guild quarters and friends as lists (0.9.0, docs/living-city.md §10). Phones see them in the City tab;
// on desktop the Steps on your quay open the chooser, and you walk around the quarter in 3D.
import { useState } from 'preact/hooks'
import { seen } from '../format'
import { session, useSession } from '../session'
import type { StallCard } from '../types'
import { Coins, ItemIcon } from './art'
import { ActionButton, Modes, useLoad } from './common'

export const QUARTERS: [string, string][] = [['blacksmith', "Smiths'"], ['alchemist', "Alchemists'"], ['leatherworker', "Tanners'"]]

/** The Steps on your quay: pick a quarter to walk up to. */
export function QuarterChooser({ go }: { go: (quarter: string) => void }) {
  const s = useSession()
  const mine = s.state!.profession?.id
  return (
    <section class="stack" data-testid="quarter-chooser">
      <p class="muted">Each guild has a piazza up the Steps, lined with its crafters' bottegas. Other merchants walk there live.</p>
      {QUARTERS.map(([id, label]) => (
        <button class={id === mine ? '' : 'secondary'} onClick={() => go(id)} data-testid={`go-${id}`}>
          {label} quarter{id === mine ? ' (your guild)' : ''}
        </button>
      ))}
    </section>
  )
}

/** One stall card: who, what they sell, what they did lately. */
export function Stall({ st, open }: { st: StallCard; open: (id: number) => void }) {
  return (
    <button class="link" onClick={() => open(st.id)} data-testid={st.me ? 'stall-me' : `stall-${st.id}`}>
      <div class="card tight">
        <div class="row">
          <span class="grow">
            <strong>{st.friend ? '★ ' : ''}{st.name}{st.me ? ' (you)' : ''}</strong>
            <span class="muted small" style={{ display: 'block' }}>{st.profession} · {seen(st.seen_ago)}</span>
          </span>
          <span class="muted small">{st.listing_count ? `${st.listing_count} for sale` : 'nothing for sale'}</span>
        </div>
        {st.echo && <p class="small accent" data-testid="echo">Just now: {st.echo.text}</p>}
        {st.listings.length > 0 && (
          <div class="row wrap">
            {st.listings.map((l) => (
              <span class="row small"><ItemIcon id={l.item_id} /> {l.name} × {l.quantity} · <Coins n={l.unit_price} /></span>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

/** The classic view's list of a quarter's stalls. */
export function QuarterList({ open }: { open: (id: number) => void }) {
  const s = useSession()
  const [q, setQ] = useState(s.state!.profession?.id ?? 'blacksmith')
  const [data] = useLoad(() => session.quarter(q), [q], true)
  return (
    <section class="stack" data-testid="quarters">
      <Modes value={q} options={QUARTERS.map(([id, label]) => [id, label] as [string, string])} onChange={setQ} />
      {!data && <p class="muted">Walking up the Steps…</p>}
      {data && (
        <>
          <h2>{data.name}</h2>
          <p class="muted small">{data.crafters} crafter{data.crafters === 1 ? '' : 's'} in this guild. Friends' stalls come first. Tap a stall to see its shop window or propose a trade.</p>
          {data.stalls.length === 0 && <p class="muted">No bottegas open here yet.</p>}
          {data.stalls.map((st) => <Stall st={st} open={open} />)}
        </>
      )}
    </section>
  )
}

/** Your friends, with their stalls. */
export function FriendsList({ open }: { open: (id: number) => void }) {
  const [data, reload] = useLoad(() => session.friends(), [], true)
  if (!data) return <p class="muted">Loading friends…</p>
  return (
    <section class="stack" data-testid="friends">
      {data.friends.length === 0 && (
        <p class="muted">No friends yet. Open a crafter (in Players, a quarter, or by tapping them in 3D) and tap Add friend. Their stalls then appear first in every quarter.</p>
      )}
      {data.friends.map((st) => (
        <div class="stack">
          <Stall st={st} open={open} />
          <ActionButton class="secondary small" action={() => session.friendRemove(st.id)} success={`${st.name} removed from your friends.`} after={() => reload()}>
            Remove {st.name}
          </ActionButton>
        </div>
      ))}
    </section>
  )
}
