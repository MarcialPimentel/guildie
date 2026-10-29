// The Palazzo (0.11.0, docs/palazzo.md): the city hall on the shared square where every guild meets.
// Buy offers (players' paid requests; the Wanted board until 0.13.0, now part of the marketplace), the Hall of
// honor with the Factotum's portrait, and the three officials (rumors, one favor a day each). Desktop opens these
// from places in the 3D Palazzo; phones see buy offers in the Mercato tab and the rest in City → Palazzo.
// The server decides prices, payouts, favors and rumors.
import { useState } from 'preact/hooks'
import items from '../../../content/items.json'
import { duration } from '../format'
import { session, useSession } from '../session'
import type { NpcTalk, WantedBoard, WantedPost } from '../types'
import { Coins, ItemIcon } from './art'
import { ActionButton, Modes, Stepper, useGame, useLoad } from './common'
import { Portrait } from './Look'
import { celebrate, gainText } from './Progress'

const ITEMS: { id: string; name: string; profession: string }[] = items.items.map((i) => ({ id: i.id, name: i.name, profession: i.profession }))
export const OFFICIALS = ['notary', 'crier', 'steward'] as const
export type Official = (typeof OFFICIALS)[number]

// ---------------------------------------------------------------- buy offers (the Wanted board until 0.13.0)

export function BuyOffers() {
  const [board, reload] = useLoad(() => session.wanted(), [], true)
  if (!board) return <p class="muted">The notary pins up the notices…</p>
  return (
    <section class="stack" data-testid="wanted">
      <p class="muted small">
        Offer to buy what you need and other crafters bring it. Your ducats are held on the offer until it's filled; whoever
        fills it is paid at once, minus the Mercato's {Math.round(board.cut * 100)}% cut. Offers last {board.hours} hours.
      </p>
      <h2>Buy offers</h2>
      {board.posts.length === 0 && <p class="muted">No buy offers from other crafters right now.</p>}
      {board.posts.map((p) => <Notice post={p} after={reload} />)}
      <PostForm board={board} after={reload} />
      {board.mine.length > 0 && (
        <>
          <h2>Your buy offers</h2>
          {board.mine.map((p) => <Mine post={p} after={reload} />)}
        </>
      )}
    </section>
  )
}

function Notice({ post, after }: { post: WantedPost; after: () => void }) {
  const [qty, setQty] = useState(1)
  const max = Math.min(post.have, post.remaining)
  const n = Math.max(1, Math.min(qty, max))
  return (
    <div class="card" data-testid={`wanted-post-${post.id}`}>
      <div class="row">
        <ItemIcon id={post.item_id} />
        <span class="grow">
          <strong>Wanted: {post.remaining} {post.name}</strong>
          <span class="muted small" style={{ display: 'block' }}>{post.player} · {post.profession} · {duration(post.expires_in)} left</span>
        </span>
        <span class="accent small num"><Coins n={post.unit_price} /> each</span>
      </div>
      {max <= 0
        ? <p class="muted small">You have none. {post.guild} crafters make it.</p>
        : (
          <div class="row wrap">
            <Stepper value={n} min={1} max={max} onChange={setQty} />
            <ActionButton
              action={() => session.wantedFill(post.id, n)}
              success={`${post.player} thanks you for ${n} ${post.name}.`}
              after={(ok) => ok && after()}
              testid={`wanted-fill-${post.id}`}
            >
              Bring {n} for <Coins n={n * post.unit_price} />
            </ActionButton>
          </div>
        )}
    </div>
  )
}

function Mine({ post, after }: { post: WantedPost; after: () => void }) {
  const filled = post.quantity - post.remaining
  return (
    <div class="card tight" data-testid={`wanted-mine-${post.id}`}>
      <div class="row">
        <ItemIcon id={post.item_id} />
        <span class="grow">
          {post.name}: {filled}/{post.quantity} brought · <Coins n={post.unit_price} /> each
          <span class="muted small" style={{ display: 'block' }}>
            {post.status === 'open' ? `${duration(post.expires_in)} left` : post.status === 'filled' ? 'Complete' : post.status === 'expired' ? 'Expired, refunded' : 'Taken down, refunded'}
          </span>
        </span>
        {post.status === 'open' && (
          <ActionButton class="secondary small" action={() => session.wantedCancel(post.id)} success="Taken down. The held ducats are back." after={(ok) => ok && after()} testid={`wanted-cancel-${post.id}`}>
            Take down
          </ActionButton>
        )}
      </div>
    </div>
  )
}

function PostForm({ board, after }: { board: WantedBoard; after: () => void }) {
  const s = useSession()
  const mine = s.state!.profession?.id
  // Other guilds' goods first: that's what you can't make yourself.
  const choices = [...ITEMS].sort((a, b) => Number(a.profession === mine) - Number(b.profession === mine))
  const [itemId, setItemId] = useState(choices[0]?.id ?? '')
  const band = board.bands[itemId] ?? { min: 1, max: 1, usual: 1 }
  const [qty, setQty] = useState(5)
  const [price, setPrice] = useState(band.usual)
  const p = Math.min(band.max, Math.max(band.min, price))
  const open = board.mine.filter((x) => x.status === 'open').length
  const total = qty * p
  return (
    <div class="card stack tight" data-testid="wanted-form">
      <h2>Post a request</h2>
      {open >= board.max_open
        ? <p class="muted small">You have {board.max_open} requests up. Take one down to post another.</p>
        : (
          <>
            <label class="small">Item
              <select value={itemId} onChange={(e) => { const id = (e.target as HTMLSelectElement).value; setItemId(id); setPrice(board.bands[id]?.usual ?? 1) }} data-testid="wanted-item">
                {choices.map((i) => <option value={i.id}>{i.name}{i.profession === mine ? ' (your guild)' : ''}</option>)}
              </select>
            </label>
            <div class="row wrap small"><span class="grow">How many</span><Stepper value={qty} min={1} max={100} steps={[1, 10]} onChange={setQty} testid="wanted-qty" /></div>
            <div class="row wrap small">
              <span class="grow">Price each <span class="muted">(fair range {band.min}–{band.max}, usually {band.usual})</span></span>
              <Stepper value={p} min={band.min} max={band.max} steps={[1, 5]} onChange={setPrice} testid="wanted-price" />
            </div>
            <ActionButton
              action={() => session.wantedPost(itemId, qty, p)}
              success={`Posted. ${total} ducats are held on the notice.`}
              disabled={board.gold < total}
              after={(ok) => ok && after()}
              testid="wanted-post"
            >
              Post for <Coins n={total} />
            </ActionButton>
            {board.gold < total && <p class="muted small">You have <Coins n={board.gold} />.</p>}
          </>
        )}
    </div>
  )
}

// ---------------------------------------------------------------- the Hall of honor

export function HallOfHonor() {
  const [h] = useLoad(() => session.honors(), [], true)
  if (!h) return <p class="muted">The custodian lights the candles…</p>
  return (
    <section class="stack" data-testid="honors">
      {h.factotum && (
        <div class="card center" data-testid="factotum">
          {h.factotum.look && (
            <Portrait guild={h.factotum.look.profession_id} color={h.factotum.look.color} hat={h.factotum.look.hat} rank={h.factotum.look.rank} size={110} />
          )}
          <p class="tiny muted">{h.title}</p>
          <h2>{h.factotum.name}{h.factotum.me ? ' (you!)' : ''}</h2>
          <p class="small">{h.factotum.profession} · {h.factotum.value}</p>
        </div>
      )}
      {h.boards.map((b) => (
        <div class="stack tight" data-testid={`honors-${b.id}`}>
          <h2>{b.title}</h2>
          {b.rows.length === 0 && <p class="muted small">{b.id === 'bottegas' ? 'Nobody has rebuilt their bottega yet.' : 'Nobody yet.'}</p>}
          {b.rows.length > 0 && (
            <div class="card tight">
              {b.rows.map((r, i) => (
                <div class={`list-row ${r.me ? 'helper-me' : ''}`}>
                  <span class="col-rank num">{i + 1}</span>
                  <span class="grow">{r.name}{r.me ? ' (you)' : ''} <span class="muted small">{r.profession}</span></span>
                  <span class="small num">{r.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  )
}

// ---------------------------------------------------------------- the officials

export function OfficialView({ npc }: { npc: string }) {
  const game = useGame()
  const [talk, reload] = useLoad(() => session.npcTalk(npc), [npc])
  if (!talk) return <p class="muted">Waiting for an audience…</p>
  return <Talk talk={talk} after={reload} say={game.say} />
}

function Talk({ talk, after, say }: { talk: NpcTalk; after: () => void; say: (m: string, err?: boolean) => void }) {
  const f = talk.favor
  return (
    <section class="stack" data-testid={`npc-${talk.id}`}>
      <div class="card">
        <p class="tiny muted">{talk.title}</p>
        <h2>{talk.name}</h2>
        <p class="small">“{talk.line}”</p>
      </div>
      <div class="card">
        <h2>A word in your ear</h2>
        <p class="small" data-testid="npc-rumor">{talk.rumor}</p>
      </div>
      {f && (
        <div class="card" data-testid="npc-favor">
          <h2>Today's favor</h2>
          <p class="small">“{f.line}”</p>
          <div class="row small">
            <ItemIcon id={f.item_id} />
            <span class="grow">{f.quantity} {f.name} · you have {f.have}</span>
            <span class="num"><Coins n={f.reward} />{f.xp > 0 ? ` +${f.xp} XP` : ''}</span>
          </div>
          {f.done
            ? <p class="ok small">Done. A new favor in {duration(talk.resets_in)}.</p>
            : (
              <ActionButton
                action={() => session.npcFavor(talk.id)}
                disabled={f.have < f.quantity}
                after={(ok, r) => {
                  if (!ok || !r.ok) return
                  const d = r.data as { done: { reward: number; progress: Parameters<typeof gainText>[0] } }
                  say([`${talk.name} pays you ${d.done.reward} ducats.`, gainText(d.done.progress)].filter(Boolean).join(' · '))
                  celebrate(d.done.progress)
                  after()
                }}
                testid="npc-favor-do"
              >
                Hand over {f.quantity} {f.name}
              </ActionButton>
            )}
        </div>
      )}
    </section>
  )
}

/** Phones and the classic view: everything in the Palazzo as one tabbed list (City → Palazzo). */
export function PalazzoList() {
  type Mode = 'honors' | Official
  const [mode, setMode] = useState<Mode>('honors')
  const [npcs] = useLoad(() => session.palazzo(), [], true)
  const name = (id: string) => npcs?.npcs.find((n) => n.id === id)?.name ?? id
  return (
    <section class="stack" data-testid="palazzo">
      <p class="muted small">The Piazza del Palazzo, where every guild meets: the Hall of honor and the city's officials. Buying and selling is in the Mercato tab.</p>
      <Modes<Mode>
        value={mode}
        options={[['honors', 'Hall of honor'], ...OFFICIALS.map((o) => [o, name(o)] as [Mode, string])]}
        onChange={setMode}
      />
      {mode === 'honors' && <HallOfHonor />}
      {(OFFICIALS as readonly string[]).includes(mode) && <OfficialView key={mode} npc={mode} />}
    </section>
  )
}
