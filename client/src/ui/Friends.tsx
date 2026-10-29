// Friends as a list, and a crafter's stall card (0.9.0, docs/living-city.md §10). The guild quarters that
// listed stalls by guild were removed in 0.13.0: the Palazzo is the one shared square.
import { seen } from '../format'
import { session } from '../session'
import type { StallCard } from '../types'
import { Coins, ItemIcon } from './art'
import { ActionButton, useLoad } from './common'

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


/** Your friends, with their stalls. */
export function FriendsList({ open }: { open: (id: number) => void }) {
  const [data, reload] = useLoad(() => session.friends(), [], true)
  if (!data) return <p class="muted">Loading friends…</p>
  return (
    <section class="stack" data-testid="friends">
      {data.friends.length === 0 && (
        <p class="muted">No friends yet. Open a crafter (in Players, or by tapping them in the Palazzo) and tap Add friend.</p>
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
