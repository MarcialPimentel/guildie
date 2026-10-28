// City (#31, #32, #38): every crafter in one list (gold and crafts columns, the Factotum title), their profiles
// and shop windows, and direct trades. Views: players -> profile -> compose; trades (offers to you, yours, recent).
import { useEffect, useState } from 'preact/hooks'
import { duration, gold, seen } from '../format'
import { Coins, ItemIcon } from './art'
import { session, useSession } from '../session'
import type { ItemCount, MarketRow, Offer } from '../types'
import { ActionButton, Modes, Stepper, useGame, useLoad } from './common'

type View =
  | { name: 'players' }
  | { name: 'profile'; id: number }
  | { name: 'compose'; id: number; playerName: string }
  | { name: 'trades' }

const MAX_ITEM_QTY = 999

export function City({ onView }: { onView: (v: string) => void }) {
  const s = useSession()
  const [view, setView] = useState<View>({ name: 'players' })
  useEffect(() => onView(view.name), [view.name])
  const offers = s.state!.incoming_offers ?? 0
  const mode = view.name === 'trades' ? 'trades' : 'players'

  return (
    <>
      <Modes
        value={mode}
        options={[['players', 'Players'], ['trades', offers > 0 ? `Trades (${offers})` : 'Trades']]}
        onChange={(m) => setView(m === 'trades' ? { name: 'trades' } : { name: 'players' })}
      />
      {view.name === 'players' && <Players open={(id) => setView({ name: 'profile', id })} />}
      {view.name === 'profile' && (
        <ProfileView
          id={view.id}
          back={() => setView({ name: 'players' })}
          trade={(playerName) => setView({ name: 'compose', id: view.id, playerName })}
        />
      )}
      {view.name === 'compose' && (
        <Compose
          to={view.id}
          playerName={view.playerName}
          back={() => setView({ name: 'profile', id: view.id })}
          sent={() => setView({ name: 'trades' })}
        />
      )}
      {view.name === 'trades' && <Trades />}
    </>
  )
}

// ---------------------------------------------------------------- players (one list, #38)

function Players({ open }: { open: (id: number) => void }) {
  const [sort, setSort] = useState<'wealth' | 'mastery'>('wealth')
  const [data] = useLoad(() => session.players(sort), [sort], true)
  if (!data) return <p class="muted">Loading crafters…</p>

  return (
    <section class="stack" data-testid="players">
      {data.me && (
        <p class="muted">You are #{data.me.rank} of {data.total} crafters by {sort === 'wealth' ? 'ducats' : 'crafts made'}.</p>
      )}
      <p class="muted small">Tap a crafter to see their shop window or propose a trade. Tap Ducats or Crafts to sort.</p>
      <div class="card tight">
        <div class="list-row list-head">
          <span class="col-rank">#</span>
          <span class="grow">Crafter</span>
          <span class="col-num">
            <button class={sort === 'wealth' ? 'on small' : 'secondary small'} onClick={() => setSort('wealth')} data-testid="sort-gold">Ducats</button>
          </span>
          <span class="col-num">
            <button class={sort === 'mastery' ? 'on small' : 'secondary small'} onClick={() => setSort('mastery')} data-testid="sort-crafts">Crafts</button>
          </span>
        </div>
        {data.players.map((p) => (
          <button class="link" onClick={() => open(p.id)} data-testid={p.me ? 'player-me' : 'player'}>
            <div class="list-row">
              <span class="col-rank num">{p.rank}</span>
              <span class="grow">
                <span class={p.me ? 'accent' : ''}>{p.name}{p.me ? ' (you)' : ''}</span>
                {p.title && <span class="accent small" style={{ display: 'block' }} data-testid="title">{p.title}</span>}
                <span class="muted small" style={{ display: 'block' }}>{p.profession} · {seen(p.seen_ago)}</span>
              </span>
              <span class={`col-num num ${sort === 'wealth' ? '' : 'muted'}`}><Coins n={p.gold} /></span>
              <span class={`col-num num ${sort === 'mastery' ? '' : 'muted'}`}>{p.crafted}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- profile + shop window

function ProfileView({ id, back, trade }: { id: number; back: () => void; trade: (name: string) => void }) {
  const [p, reload] = useLoad(() => session.playerProfile(id), [id], true)
  if (!p) return <p class="muted">Loading…</p>
  return (
    <div class="stack" data-testid="profile">
      <button class="secondary small" onClick={back}>‹ All crafters</button>
      <section class="card">
        <h1>{p.name}{p.me ? ' (you)' : ''}</h1>
        {p.title && <p class="accent">{p.title}: the richest crafter in the city</p>}
        <p class="muted">{p.profession} · {seen(p.seen_ago)}</p>
        <div class="stats">
          <div><div class="label">Ducats</div><div class="value num"><Coins n={p.gold} /></div></div>
          <div><div class="label">Crafts made</div><div class="value num">{p.crafted}</div></div>
          <div><div class="label">Recipes</div><div class="value num">{p.recipes_known}/{p.recipes_total}</div></div>
        </div>
      </section>
      {p.can_trade && <button onClick={() => trade(p.name)} data-testid="propose-trade">Propose a trade</button>}
      <h2>Shop window</h2>
      {p.listings.length === 0 && <p class="muted">Nothing listed at the Mercato right now.</p>}
      {p.listings.map((l) => (
        <div class="card tight">
          <div class="row">
            <ItemIcon id={l.item_id} />
            <span class="grow">{l.name} × {l.quantity}</span>
            <span class="accent num"><Coins n={l.unit_price} /> each</span>
          </div>
          {!p.me && (
            <ActionButton class="secondary small" action={() => session.buyListing(l.id, 1)} success={`Bought 1 ${l.name}.`} after={(ok) => ok && reload()}>
              Buy 1 for <Coins n={l.unit_price} />
            </ActionButton>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- compose an offer (#32)

function Compose({ to, playerName, back, sent }: { to: number; playerName: string; back: () => void; sent: () => void }) {
  const s = useSession()
  const game = useGame()
  const [catalog] = useLoad(() => session.market(), [])
  const [give, setGive] = useState<Record<string, number>>({})
  const [ask, setAsk] = useState<Record<string, number>>({})
  const [giveGold, setGiveGold] = useState(0)
  const [askGold, setAskGold] = useState(0)
  const [note, setNote] = useState('')
  const state = s.state!

  const nameOf = (id: string) => catalog?.items.find((i) => i.item_id === id)?.name ?? id
  const bundleText = (b: Record<string, number>, g: number) => {
    const parts = Object.entries(b).map(([id, n]) => `${n} ${nameOf(id)}`)
    if (g > 0) parts.push(gold(g))
    return parts.length ? parts.join(' + ') : 'nothing yet'
  }
  const asList = (b: Record<string, number>): ItemCount[] => Object.entries(b).map(([item_id, quantity]) => ({ item_id, quantity }))
  const setIn = (set: (f: (b: Record<string, number>) => Record<string, number>) => void, id: string, n: number) =>
    set((b) => {
      const next = { ...b }
      if (n <= 0) delete next[id]
      else next[id] = n
      return next
    })
  const empty = (b: Record<string, number>, g: number) => Object.keys(b).length === 0 && g === 0

  return (
    <div class="stack" data-testid="compose">
      <button class="secondary small" onClick={back}>‹ Back to {playerName}</button>
      <h1>Trade with {playerName}</h1>
      <p class="muted small">
        What you offer is held until {playerName} accepts or declines (or 24 hours pass). No fees. Both sides need something.
      </p>
      <div class="cols">
        <section class="stack">
          <h2>You give</h2>
          <div class="card tight">
            {state.inventory.length === 0 && <p class="muted">Your bag is empty.</p>}
            {state.inventory.map((item) => (
              <QtyRow label={`${item.name} (have ${item.quantity})`} value={give[item.item_id] ?? 0} max={item.quantity}
                onChange={(n) => setIn(setGive, item.item_id, n)} />
            ))}
            <p class="accent small">Ducats (have <Coins n={state.player.gold} />)</p>
            <Stepper value={giveGold} min={0} max={state.player.gold} onChange={setGiveGold} steps={[1, 10, 100]} />
          </div>
        </section>
        <section class="stack">
          <h2>You ask for</h2>
          <div class="card tight">
            {!catalog && <p class="muted">Loading items…</p>}
            {catalog?.items.map((item: MarketRow) => (
              <QtyRow label={item.name} value={ask[item.item_id] ?? 0} max={MAX_ITEM_QTY} onChange={(n) => setIn(setAsk, item.item_id, n)} />
            ))}
            <p class="accent small">Ducats</p>
            <Stepper value={askGold} min={0} max={100000} onChange={setAskGold} steps={[1, 10, 100]} />
          </div>
        </section>
      </div>
      <input placeholder="Note (optional)" maxLength={140} value={note} onInput={(e) => setNote(e.currentTarget.value)} />
      <p>You give: {bundleText(give, giveGold)}<br />You get: {bundleText(ask, askGold)}</p>
      <ActionButton
        action={async () => {
          if (empty(give, giveGold) || empty(ask, askGold)) {
            game.say('Offer something and ask for something.', true)
            return { ok: false, error: { code: 'local', message: '' }, status: 0 }
          }
          return session.offerCreate(to, asList(give), giveGold, asList(ask), askGold, note)
        }}
        success={`Offer sent to ${playerName}.`}
        after={(ok) => ok && sent()}
        testid="send-offer"
      >
        Send offer
      </ActionButton>
    </div>
  )
}

function QtyRow({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (n: number) => void }) {
  return (
    <div class="list-row">
      <span class="grow small">{label}</span>
      <Stepper value={value} min={0} max={max} onChange={onChange} />
    </div>
  )
}

// ---------------------------------------------------------------- trades inbox

function Trades() {
  const [data, reload] = useLoad(() => session.tradeOffers(), [], true)
  if (!data) return <p class="muted">Loading…</p>
  return (
    <div class="stack" data-testid="trades">
      <h2>Offers to you</h2>
      {data.incoming.length === 0 && <p class="muted">None right now. Crafters can send you offers from your profile in Players.</p>}
      {data.incoming.map((o) => (
        <OfferCard offer={o}>
          <div class="btnrow">
            <ActionButton action={() => session.offerAccept(o.id)} success={`Trade done with ${o.other}.`} after={() => reload()} testid="accept-offer">Accept</ActionButton>
            <ActionButton class="secondary" action={() => session.offerDecline(o.id)} success="Offer declined." after={() => reload()}>Decline</ActionButton>
          </div>
        </OfferCard>
      ))}
      <h2>Your offers</h2>
      {data.outgoing.length === 0 && <p class="muted">None. Open a crafter in Players and tap Propose a trade.</p>}
      {data.outgoing.map((o) => (
        <OfferCard offer={o}>
          <ActionButton class="secondary small" action={() => session.offerCancel(o.id)} success="Offer cancelled." after={() => reload()}>
            Cancel (your side comes back)
          </ActionButton>
        </OfferCard>
      ))}
      {data.closed.length > 0 && (
        <>
          <h2>Recent</h2>
          <div class="card tight">
            {data.closed.map((o) => (
              <div class="list-row">
                <span class="grow small">{o.incoming ? 'From' : 'To'} {o.other}: you get {o.you_get} for {o.you_give}</span>
                <span class={`small ${o.status === 'accepted' ? 'ok' : 'muted'}`}>{o.status.charAt(0).toUpperCase() + o.status.slice(1)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function OfferCard({ offer, children }: { offer: Offer; children: preact.ComponentChildren }) {
  return (
    <div class="card">
      <div class="row">
        <h3 class="grow ink">{offer.incoming ? 'From' : 'To'} {offer.other}</h3>
        <span class="muted tiny">ends in {duration(offer.seconds_left)}</span>
      </div>
      <p class="ok">You get: {offer.you_get}</p>
      <p>You give: {offer.you_give}</p>
      {offer.note && <p class="muted small">“{offer.note}”</p>}
      {children}
    </div>
  )
}
