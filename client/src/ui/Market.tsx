// The Mercato (the Exchange, systems.md 6.1): browse prices, buy, sell, and manage your listings.
// Views: browse -> item detail; sell list -> sell form; my listings.
import type { ComponentChild } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { ago, duration, gold } from '../format'
import { Coins, ItemIcon } from './art'
import { session, useSession } from '../session'
import type { Listing, MarketRow, SellQuote } from '../types'
import { ActionButton, Modes, Stepper, useGame, useLoad, type TabRequest } from './common'
import { NewsBoard, Sparkline, Trend } from './Ticker'

const PROFESSIONS: [string, string][] = [
  ['blacksmith', 'Blacksmith goods'], ['alchemist', 'Alchemist goods'], ['leatherworker', 'Leatherworker goods'],
]

type View = { name: 'browse' } | { name: 'item'; itemId: string } | { name: 'sell' } | { name: 'sell_form'; itemId: string; qty: number } | { name: 'mine' }

export function Market({ request, onView }: { request: TabRequest; onView: (v: string) => void }) {
  const [view, setView] = useState<View>({ name: 'browse' })

  // Requests from other tabs (e.g. Bag → Sell this item).
  useEffect(() => {
    if (request.sellItem) setView({ name: 'sell_form', itemId: request.sellItem, qty: request.sellQty ?? 1 })
    else if (request.market) setView({ name: request.market } as View)
  }, [request])
  useEffect(() => onView(view.name), [view.name])

  const mode = view.name === 'item' ? 'browse' : view.name === 'sell_form' ? 'sell' : view.name
  return (
    <>
      <Modes
        value={mode}
        options={[['browse', 'Browse'], ['sell', 'Sell'], ['mine', 'My listings']]}
        onChange={(m) => setView({ name: m } as View)}
      />
      {view.name === 'browse' && <Browse open={(itemId) => setView({ name: 'item', itemId })} />}
      {view.name === 'item' && <ItemDetail itemId={view.itemId} back={() => setView({ name: 'browse' })} />}
      {view.name === 'sell' && <SellList open={(itemId, qty) => setView({ name: 'sell_form', itemId, qty })} />}
      {view.name === 'sell_form' && (
        <SellForm key={view.itemId} itemId={view.itemId} startQty={view.qty} back={() => setView({ name: 'sell' })} done={(v) => setView({ name: v } as View)} />
      )}
      {view.name === 'mine' && <MyListings />}
    </>
  )
}

// ---------------------------------------------------------------- browse

function Browse({ open }: { open: (itemId: string) => void }) {
  const s = useSession()
  const [data] = useLoad(() => session.market(), [], true)
  if (!data) return <p class="muted">Loading the Mercato…</p>
  const mine = s.state!.profession!.id
  const order = [mine, ...PROFESSIONS.map(([p]) => p).filter((p) => p !== mine)]
  const groups: Record<string, MarketRow[]> = {}
  data.items.forEach((item) => (groups[item.profession] ??= []).push(item))

  return (
    <>
      <NewsBoard news={data.news ?? []} />
      <p class="muted small">
        Price = what it's worth today, against its usual price: <span class="up">▲ green</span> is above usual (a good
        time to sell), <span class="down">▼ red</span> is below (a good time to buy). Lowest = the cheapest listing. Tap an
        item to buy or see its history.
      </p>
      <div class="cols">
        {order.map((prof) => (
          <section class="stack tight" data-testid={`browse-${prof}`}>
            <h2>{PROFESSIONS.find(([p]) => p === prof)?.[1]}{prof === mine ? ' (your guild)' : ''}</h2>
            <div class="card tight">
              <div class="list-row list-head">
                <span class="grow">Item</span>
                <span class="col-num">Price</span>
                <span class="col-num narrow">Lowest</span>
              </div>
              {(groups[prof] ?? []).map((item) => (
                <button class="link" onClick={() => open(item.item_id)} data-testid={`browse-item-${item.item_id}`}>
                  <div class="list-row">
                    <ItemIcon id={item.item_id} />
                    <span class="grow">
                      {item.name}
                      <span class="spark-row"><Sparkline points={item.spark} usual={item.usual} width={72} height={16} /></span>
                    </span>
                    <span class="col-num num">
                      <Coins n={item.reference} />
                      <span style={{ display: 'block' }} data-testid="trend"><Trend pct={item.change_pct} hot={item.hot} /></span>
                    </span>
                    <span class="col-num narrow num">
                      {item.lowest !== null ? <Coins n={item.lowest} /> : '—'}
                      {item.from_players > 0 && <span class="tiny muted" style={{ display: 'block' }}>{item.from_players} by players</span>}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- item detail + buying

function ItemDetail({ itemId, back }: { itemId: string; back: () => void }) {
  const [data, reload] = useLoad(() => session.marketItem(itemId), [itemId], true)
  if (!data) return <p class="muted">Loading…</p>
  return (
    <div class="stack" data-testid="item-detail">
      <button class="secondary small" onClick={back}>‹ Back to all items</button>
      <section class="card">
        <div class="row">
          <ItemIcon id={itemId} big />
          <h1 class="grow">{data.name}</h1>
        </div>
        <p class="muted">{data.description}</p>
        <div class="row">
          <span class="grow">Today <span class="accent num"><Coins n={data.reference} /></span> · usual <Coins n={data.usual} /></span>
          <Trend pct={data.change_pct} hot={data.hot} />
        </div>
        <Sparkline points={data.spark} usual={data.usual} width={300} height={56} />
        <p class="tiny muted">Last 7 days. The dotted line is the usual price.</p>
        <div class="stats">
          {[['Today', data.reference], ['Quick sale', data.trader_price], ['Suppliers', data.ceiling]].map(([label, v]) => (
            <div><div class="label">{label}</div><div class="value num"><Coins n={v as number} /></div></div>
          ))}
        </div>
        <p class="muted small">
          You have {data.you_have}. Quick sale: traders buy anything listed at that price or less within a few minutes.
          Suppliers always sell a few at their price.
        </p>
      </section>
      <div class="cols">
        <section class="stack">
          <h2>For sale</h2>
          {data.listings.length === 0 && <p class="muted">Nothing listed right now.</p>}
          {data.listings.map((l) => <ListingRow listing={l} name={data.name} reload={reload} />)}
        </section>
        <section class="stack">
          <h2>Recent sales</h2>
          {data.trades.length === 0 && <p class="muted">No sales yet.</p>}
          {data.trades.length > 0 && (
            <div class="card tight">
              {data.trades.slice(0, 12).map((t) => (
                <div class="list-row">
                  <span class="grow small">{capitalize(t.seller)} sold {t.quantity} to {t.buyer}</span>
                  <span class="num"><Coins n={t.unit_price} /></span>
                  <span class="muted tiny num">{ago(t.ago)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function ListingRow({ listing, name, reload }: { listing: Listing; name: string; reload: () => void }) {
  const [qty, setQty] = useState(1)
  return (
    <div class="card tight">
      <div class="row">
        <span class={`grow ${listing.is_npc ? 'npc' : ''}`}>{listing.mine ? 'You' : capitalize(listing.seller)}</span>
        <span class="muted small">{listing.quantity} left</span>
        <span class="accent num"><Coins n={listing.unit_price} /> each</span>
      </div>
      {!listing.mine && (
        <div class="row wrap">
          <Stepper value={qty} min={1} max={listing.quantity} onChange={setQty} />
          <ActionButton
            class="small"
            action={() => session.buyListing(listing.id, qty)}
            success={`Bought ${qty} ${name}.`}
            after={(ok) => ok && reload()}
            testid={`buy-${listing.id}`}
          >
            Buy {qty} for <Coins n={qty * listing.unit_price} />
          </ActionButton>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- selling

function SellList({ open }: { open: (itemId: string, qty: number) => void }) {
  const s = useSession()
  const items = s.state!.inventory
  return (
    <section class="stack">
      <h2>Choose something to sell</h2>
      {items.length === 0 && <p class="muted">Your bag is empty.</p>}
      {items.map((item) => (
        <div class="card tight">
          <div class="row">
            <ItemIcon id={item.item_id} />
            <span class="grow">{item.name} × {item.quantity}</span>
            <span class="muted small">value ~<Coins n={item.reference} /></span>
            <button class="secondary small" onClick={() => open(item.item_id, item.quantity)} data-testid={`sell-${item.item_id}`}>Sell…</button>
          </div>
        </div>
      ))}
    </section>
  )
}

function SellForm({ itemId, startQty, back, done }: {
  itemId: string; startQty: number; back: () => void; done: (v: 'sell' | 'mine') => void
}) {
  const game = useGame()
  const [qty, setQty] = useState(startQty)
  const [quote, setQuote] = useState<SellQuote | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [hours, setHours] = useState(24)
  const [quoteTick, setQuoteTick] = useState(0)   // bump to fetch a fresh quote

  useEffect(() => {
    let alive = true
    session.sellQuote(itemId, qty).then((r) => {
      if (!alive) return
      if (!r.ok) return game.say(r.error.message, true)
      setQuote(r.data)
      if (price === null) {
        const lowest = r.data.lowest_player
        setPrice(lowest !== null && lowest < r.data.reference ? Math.max(1, lowest - 1) : r.data.reference)
      }
    })
    return () => { alive = false }
  }, [itemId, qty, quoteTick])

  if (!quote || price === null) return <p class="muted">Loading…</p>
  const q = quote
  const total = qty * price
  const cut = Math.ceil((total * q.cut_percent) / 100)
  const deposit = q.deposits[String(hours)] ?? 0
  const undercut = q.lowest_player !== null ? Math.max(1, q.lowest_player - 1) : q.reference

  return (
    <div class="stack" data-testid="sell-form">
      <button class="secondary small" onClick={back}>‹ Back</button>
      <section class="card">
        <div class="row">
          <ItemIcon id={itemId} big />
          <h1 class="grow">Sell {q.name}</h1>
        </div>
        <p class="muted small">
          Value <Coins n={q.reference} /> · lowest player price {q.lowest_player !== null ? <Coins n={q.lowest_player} /> : 'none'} · traders buy
          instantly at <Coins n={q.trader_price} /> or less
        </p>
        <p>Quantity (you have {q.you_have})</p>
        <Stepper value={qty} min={1} max={q.you_have} onChange={setQty} />
        {q.type === 'raw' && (
          <p class="npc small" data-testid="raw-hint">
            No city buyers for raw materials: craft them, or list them for other players. Traders only buy at the
            quick-sale price or less.
          </p>
        )}
      </section>

      <div class="cols">
        {/* The Mercato comes first: it's the main way to sell (#37). */}
        <section class="card" data-testid="list-on-exchange">
          <h2>List at the Mercato</h2>
          <p class="muted small">The best price, but you wait for a buyer. The city shops every few minutes.</p>
          <p>Price each</p>
          <Stepper value={price} min={1} max={q.ceiling * 10} onChange={setPrice} steps={[1, 10]} />
          <div class="btnrow">
            {([['Value', q.reference], ['Undercut', undercut], ['Quick sale', q.trader_price]] as [string, number][]).map(([label, v]) => (
              <button class={price === v ? 'on small' : 'secondary small'} onClick={() => setPrice(v)}>{label} <Coins n={v} /></button>
            ))}
          </div>
          <p>Listing lasts</p>
          <div class="btnrow">
            {Object.keys(q.deposits).map((h) => (
              <button class={Number(h) === hours ? 'on small' : 'secondary small'} onClick={() => setHours(Number(h))}>{h}h</button>
            ))}
          </div>
          <div class="stack tight" style={{ marginTop: '4px' }}>
            {([
              ['Total if all sell', <Coins n={total} />],
              [`Mercato cut (${q.cut_percent}%)`, <>−<Coins n={cut} /></>],
              ['Deposit (taken from the sale)', <>−<Coins n={deposit} /></>],
              ["You'd earn", <Coins n={Math.max(0, total - cut - deposit)} />],
            ] as [string, ComponentChild][]).map(([label, v]) => (
              <div class="row"><span class="grow">{label}</span><span class="num">{v}</span></div>
            ))}
          </div>
          {price > q.ceiling && <p class="error small">Guild suppliers sell this for <Coins n={q.ceiling} />, so few will pay more.</p>}
          <ActionButton
            action={() => session.listItem(itemId, qty, price, hours)}
            success={`Listed ${qty} ${q.name}.`}
            after={(ok) => ok && done('mine')}
            testid="list-item"
          >
            List {qty} for <Coins n={price} /> each
          </ActionButton>
        </section>

        {/* The fallback: instant ducats from the guild (#28). */}
        <section class="card" data-testid="guild-sale">
          <h2>Or sell to the guild now</h2>
          <p class="muted small">Instant ducats, no listing and no fees, but a low price. Handy when you need ducats right away.</p>
          {q.guild.hint && <p class="error small">{q.guild.hint}</p>}
          <ActionButton
            class="secondary"
            action={() => session.sellToGuild(itemId, q.guild.quantity, q.guild.total)}
            success={`Sold ${q.guild.quantity} ${q.name} to the guild for ${gold(q.guild.total)}.`}
            after={(ok, r) => {
              if (ok) done('sell')
              else if (!r.ok && r.error.code === 'price_changed') setQuoteTick((t) => t + 1)   // show the new offer
            }}
            testid="sell-to-guild"
          >
            Sell {q.guild.quantity} to the guild for <Coins n={q.guild.total} />
          </ActionButton>
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- my listings

function MyListings() {
  const [data, reload] = useLoad(() => session.myListings(), [], true)
  if (!data) return <p class="muted">Loading…</p>
  const active = data.listings.filter((l) => l.status === 'active')
  const closed = data.listings.filter((l) => l.status !== 'active')
  return (
    <div class="stack" data-testid="my-listings">
      <h2>Active listings ({active.length})</h2>
      {active.length === 0 && <p class="muted">Nothing listed. Use Sell to list items.</p>}
      {active.map((l) => (
        <div class="card tight">
          <div class="row">
            <ItemIcon id={l.item_id} />
            <span class="grow">{l.name} × {l.quantity}</span>
            <span class="accent num"><Coins n={l.unit_price} /> each</span>
          </div>
          <p class="muted small">Sold {l.sold} of {l.original} · ends in {duration(l.seconds_left)}</p>
          <ActionButton class="secondary small" action={() => session.cancelListing(l.id)} success="Listing cancelled." after={(ok) => ok && reload()}>
            Cancel (items come back)
          </ActionButton>
        </div>
      ))}
      {closed.length > 0 && (
        <>
          <h2>Recently closed</h2>
          <div class="card tight">
            {closed.map((l) => (
              <div class="list-row">
                <span class="grow small">{l.name}: sold {l.sold} of {l.original}</span>
                <span class="muted small">{capitalize(l.status)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
