// The 3D world (desktop). Loads the 3D engine on demand, turns the server's state into what the harbor
// shows (world/types.ts WorldState), and reports clicks on places and players. The engine never decides
// anything. In a guild quarter (0.9.0) it also joins the realtime room (presence.ts) and passes other
// merchants' positions, emotes and slaps to the engine; that's cosmetic only. Since 0.10.0 it also passes on
// what the server already decided for the people at your quay to act out: customers arriving and being
// served, buyers for your sales, and the herald announcing the Duke's orders.
import { useEffect, useRef, useState } from 'preact/hooks'
import { duration } from '../format'
import { Presence, type PresenceStatus, type RoomEvent, type RoomPlayer } from '../presence'
import { session, useSession } from '../session'
import type { DukeBoard, GameState, NewsItem, OrderBoard, PresenceMe, QuarterData } from '../types'
import { worldEvents } from '../worldEvents'
import { HAT_NAMES } from '../world/looks'
import type { MyLook, Peer, PickId, ProfessionId, RoomEmote, Scene, StallInfo, WorldEngine, WorldLabel, WorldState } from '../world/types'
import { useGame, useLoad, useNow } from './common'
import { ColorPicker, HatPicker, Portrait } from './Look'

const WORKBENCH: Record<ProfessionId, string> = { blacksmith: 'Forge', alchemist: 'Alembic', leatherworker: 'Tanning bench' }
const HALL: Record<ProfessionId, string> = { blacksmith: 'Arte dei Fabbri', alchemist: 'Arte degli Speziali', leatherworker: 'Arte dei Conciatori' }
export const SLAP_REACH = 2.5

const dukePct = (d: DukeBoard) => {
  const goal = d.lines.reduce((n, l) => n + l.goal, 0)
  const got = d.lines.reduce((n, l) => n + Math.min(l.delivered, l.goal), 0)
  return Math.round((got / Math.max(1, goal)) * 100)
}
const dukeLabel = (d: DukeBoard | null): WorldLabel => (!d
  ? { text: "The Duke's order", tone: 'plain' }
  : d.status === 'fulfilled'
    ? { text: "The Duke's order · fulfilled!", tone: 'plain' }
    : { text: `The Duke's order · ${dukePct(d)}% · ${duration(d.seconds_left)}`, tone: d.lines.some((l) => l.can_give > 0 && l.have > 0) ? 'ready' : 'plain' })

/** What the harbor shows, from the latest state. Station fill is estimated between refreshes, like the classic screen. */
export function worldState(state: GameState, now: number, board: OrderBoard | null, news: NewsItem[], duke: DukeBoard | null = null): WorldState {
  const prof = state.profession!
  const since = Math.max(0, now - state.server_time)
  const outputs = prof.station.outputs.map((o) => ({
    ...o,
    estimate: Math.min(o.cap, o.ready + Math.floor((since * o.rate_per_hour) / 3600)),
  }))
  const ready = state.crafts.filter((c) => c.ends_at <= now)
  const running = state.crafts.filter((c) => c.ends_at > now)
  const customers = (board?.orders ?? [])
    .filter((o) => o.arriving_in <= 0)
    .slice(0, 3)
    .map((o) => ({ order: o.id, customer: o.customer_id, name: o.customer, line: o.line, kind: o.kind, ready: o.items.every((i) => i.have >= i.quantity) }))
  const event = news.find((n) => n.kind === 'event' && n.status === 'now')
  const today = news.find((n) => n.status === 'today')
  const full = outputs.some((o) => o.estimate >= o.cap)
  const bagItems = state.inventory.reduce((n, i) => n + i.quantity, 0)
  const fillable = customers.filter((c) => c.ready).length
  const offers = state.incoming_offers ?? 0

  const labels: Partial<Record<PickId, WorldLabel>> = {
    station: {
      text: `${prof.station.name} · ${outputs.map((o) => `${o.estimate}/${o.cap}`).join(' · ')}${full ? ' · full!' : ''}`,
      tone: full ? 'alert' : outputs.some((o) => o.estimate > 0) ? 'ready' : 'plain',
    },
    workbench: {
      text: ready.length
        ? `${WORKBENCH[prof.id as ProfessionId]} · ${ready.length} ready!`
        : running.length
          ? `${WORKBENCH[prof.id as ProfessionId]} · ${running[0].name} ${duration(running[0].ends_at - now)}${running.length > 1 ? ` +${running.length - 1}` : ''}`
          : `${WORKBENCH[prof.id as ProfessionId]} · idle`,
      tone: ready.length ? 'ready' : 'plain',
    },
    ledger: { text: `Bottega di ${state.player.name}`, tone: 'plain' },
    bag: { text: `Storehouse · ${bagItems} item${bagItems === 1 ? '' : 's'}`, tone: 'plain' },
    stall: { text: `Your stall · ${state.active_listings} listed`, tone: 'plain' },
    mercato: { text: 'Mercato', tone: 'plain' },
    city: { text: offers ? `Guild hall · ${offers} offer${offers === 1 ? '' : 's'}` : 'Guild hall', tone: offers ? 'ready' : 'plain' },
    news: { text: event ? event.title : today ? `News · ${today.title}` : 'Harbor news', tone: event ? 'ready' : 'plain' },
    duke: dukeLabel(duke),
    steps: { text: 'To the quarters', tone: 'plain' },
  }
  if (customers.length) labels.orders = { text: fillable ? `Customers · ${fillable} ready to fill` : `Customers · ${customers.length} waiting`, tone: fillable ? 'ready' : 'plain' }

  return {
    profession: prof.id as ProfessionId,
    playerName: state.player.name,
    stationFill: outputs.map((o) => (o.cap > 0 ? o.estimate / o.cap : 0)),
    crafting: { active: running.length, ready: ready.length },
    bagKinds: state.inventory.length,
    listings: state.active_listings,
    customers,
    eventNow: !!event,
    festival: !!today && /regatta/i.test(today.title),
    labels,
  }
}

/** The bottegas around a piazza, for the engine. */
export function stallInfos(q: QuarterData | null): StallInfo[] {
  return (q?.stalls ?? []).map((s) => ({
    id: s.id, name: s.name, profession: s.profession_id as ProfessionId, look: s.look, hat: s.hat ?? 0, rank: s.rank ?? 0, friend: s.friend, me: s.me,
    listings: s.listing_count, echo: s.echo ? `${s.echo.text} · ${duration(s.echo.ago)} ago` : null,
  }))
}

interface WorldProps {
  scene: Scene
  focus: PickId | null
  panelWidth: number
  onPick: (id: PickId) => void
  onPickPlayer: (id: number) => void
  onFail: () => void
}

export function World({ scene, focus, panelWidth, onPick, onPickPlayer, onFail }: WorldProps) {
  const s = useSession()
  const game = useGame()
  const state = s.state!
  const myId = state.player.id
  const now = useNow()
  const box = useRef<HTMLDivElement>(null)
  const engine = useRef<WorldEngine | null>(null)
  const presence = useRef<Presence | null>(null)
  const cbs = useRef({ onPick, onPickPlayer })
  cbs.current = { onPick, onPickPlayer }
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const [night, setNight] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  const [live, setLive] = useState<{ status: PresenceStatus; room: string; count: number }>({ status: 'idle', room: '', count: 0 })
  const [slaps, setSlaps] = useState(true)
  const [me, setMe] = useState<PresenceMe | null>(null)
  const [lookOpen, setLookOpen] = useState(false)
  const [quarter, setQuarter] = useState<QuarterData | null>(null)
  const friendIds = useRef(new Set<number>())
  const peerIds = useRef(new Set<number>())

  // The bag key makes customers' "ready" marks follow the bag; both reload on every background refresh.
  const bagKey = JSON.stringify(state.inventory.map((i) => [i.item_id, i.quantity]))
  const [board] = useLoad(() => session.orders(), [bagKey], true)
  const [news] = useLoad(() => session.news(), [], true)
  const [duke] = useLoad(() => session.dukeOrder(), [bagKey], true)
  const [friends] = useLoad(() => session.friends(), [s.friendsVersion], true)
  const roomPlayers = useRef(new Map<number, RoomPlayer>())
  const toPeerRef = useRef<(p: RoomPlayer) => Peer>(null as unknown as (p: RoomPlayer) => Peer)

  // Who I am in the city (look, hat, rank, slaps on/off): from the presence pass, which works even with
  // presence off. Fetched again when your rank changes, so the sash follows.
  const rankId = state.profession?.progress?.rank_id ?? ''
  useEffect(() => {
    session.presenceToken().then((r) => {
      if (!r.ok) return
      setMe(r.data.me)
      setSlaps(r.data.me.slaps)
    })
  }, [rankId])
  const myLook = (m: PresenceMe, sl = slaps): MyLook => ({ look: m.look, hat: m.hat ?? 0, rank: m.rank ?? 0, slaps: sl })

  useEffect(() => {
    let alive = true
    import('../world/engine')
      .then((m) => {
        if (!alive || !box.current) return
        engine.current = m.createWorld(box.current, state.profession!.id as ProfessionId, state.player.name, {
          onPick: (id) => cbs.current.onPick(id),
          onPickPlayer: (id) => cbs.current.onPickPlayer(id),
          onMove: (x, z, h) => presence.current?.send({ t: 'mv', x, z, h }),
        })
        engine.current.setMyId(myId)
        setStatus('ready')
      })
      .catch((e) => {
        console.error('3D harbor failed to start', e)
        if (alive) onFail()
      })
    toPeerRef.current = (p: RoomPlayer): Peer => ({
      id: p.id, name: p.n, profession: p.p as ProfessionId, look: p.l, hat: p.ht ?? 0, rank: p.r ?? 0, slaps: p.s === 1, x: p.x, z: p.z, h: p.h, friend: friendIds.current.has(p.id),
    })
    const onEvent = (m: RoomEvent) => {
      const e = engine.current
      if (!e) return
      switch (m.t) {
        case 'welcome':
          e.peersClear()
          peerIds.current.clear()
          roomPlayers.current.clear()
          for (const p of m.players) if (p.id !== myId) { e.peerUpsert(toPeerRef.current(p)); peerIds.current.add(p.id); roomPlayers.current.set(p.id, p) }
          break
        case 'join':
          if (m.p.id !== myId) { e.peerUpsert(toPeerRef.current(m.p)); peerIds.current.add(m.p.id); roomPlayers.current.set(m.p.id, m.p) }
          break
        case 'leave':
          e.peerRemove(m.id)
          peerIds.current.delete(m.id)
          roomPlayers.current.delete(m.id)
          break
        case 'mv': {
          e.peerMove(m.id, m.x, m.z, m.h)
          const p = roomPlayers.current.get(m.id)
          if (p) Object.assign(p, { x: m.x, z: m.z, h: m.h })
          break
        }
        case 'wave': e.wave(m.id); break
        case 'emote': e.emote(m.id, m.e); break
        case 'slap': e.slap(m.from, m.to); break
        case 'pref': e.setSlaps(m.id, m.s === 1); break
        case 'nope': game.say(m.why, true); break
      }
      setLive((l) => ({ ...l, count: peerIds.current.size }))
    }
    presence.current = new Presence(onEvent, (st, room) => setLive((l) => ({ status: st, room, count: st === 'live' ? l.count : 0 })))
    return () => {
      alive = false
      presence.current?.dispose()
      presence.current = null
      engine.current?.dispose()
      engine.current = null
    }
  }, [])

  // Scenes: the harbor, or a guild quarter (join its room, load its stalls).
  const ready = status === 'ready' && me !== null
  useEffect(() => {
    if (!ready) return
    engine.current!.setScene(scene, myLook(me!))
    peerIds.current.clear()
    roomPlayers.current.clear()
    setLive((l) => ({ ...l, count: 0 }))
    if (scene === 'harbor') {
      presence.current?.disconnect()
      setQuarter(null)
      return
    }
    presence.current?.connect(scene)
    let alive = true
    const load = () => session.quarter(scene).then((r) => { if (alive && r.ok) setQuarter(r.data) })
    load()
    const timer = setInterval(load, 30_000)
    return () => { alive = false; clearInterval(timer) }
  }, [scene, ready])
  // A new rank (sash) or look mid-scene.
  useEffect(() => {
    if (ready) engine.current!.setMyLook(myLook(me!))
  }, [me])

  // The order board's customers act out fills and turn-downs the server just made.
  useEffect(() => worldEvents.on((ev) => {
    if (ev.t === 'orderFilled') engine.current?.orderFilled(ev.order, ev.text)
    else engine.current?.orderTurnedDown(ev.order)
  }), [])

  // New sales in your log: buyers of the right kind walk up to your stall (at most 3; the rest are summed up).
  const lastSale = useRef<number | null>(null)
  useEffect(() => {
    const sold = state.activity.filter((a) => a.type === 'sold' && a.sale)
    const newest = sold.reduce((n, a) => Math.max(n, a.id), 0)
    if (lastSale.current === null || status !== 'ready') { lastSale.current = Math.max(lastSale.current ?? 0, newest); return }
    const fresh = sold.filter((a) => a.id > lastSale.current!).sort((a, b) => a.id - b.id)
    lastSale.current = Math.max(lastSale.current, newest)
    if (!fresh.length) return
    engine.current?.sales(fresh.slice(0, 3).map((a) => ({ buyer: a.sale!.buyer, text: `+${a.sale!.earned} ducats` })), Math.max(0, fresh.length - 3))
  }, [state, status])

  // The herald announces a new Duke's order, or one fulfilled, while you're here.
  const lastDuke = useRef<{ id: number; status: string } | null>(null)
  useEffect(() => {
    if (!duke || status !== 'ready') return
    const prev = lastDuke.current
    lastDuke.current = { id: duke.id, status: duke.status }
    if (!prev) return
    if (prev.id !== duke.id) engine.current?.herald(`Hear ye! The Duke orders: ${duke.title}!`)
    else if (prev.status !== 'fulfilled' && duke.status === 'fulfilled') engine.current?.herald("The Duke's order is fulfilled! Grazie, Portovela!")
  }, [duke, status])

  // Friends: stars on their names and stalls, as soon as you add one.
  useEffect(() => {
    friendIds.current = new Set((friends?.friends ?? []).map((f) => f.id))
    for (const p of roomPlayers.current.values()) engine.current?.peerUpsert(toPeerRef.current(p))
  }, [friends])
  useEffect(() => {
    if (scene === 'harbor' || status !== 'ready') return
    session.quarter(scene).then((r) => { if (r.ok) setQuarter(r.data) })
  }, [s.friendsVersion])
  useEffect(() => {
    if (status === 'ready' && quarter && quarter.quarter === scene) engine.current?.setStalls(stallInfos(quarter))
  }, [quarter, status])
  useEffect(() => {
    engine.current?.setState(worldState(state, now, board, news?.news ?? [], duke))
  }, [state, now, board, news, duke, status])
  useEffect(() => {
    if (scene === 'harbor') return
    engine.current?.setQuarterLabels({
      duke: dukeLabel(duke),
      trainer: { text: `${HALL[scene]} · guild trainer`, tone: 'plain' },
      home: { text: 'Down to your bottega', tone: 'plain' },
    })
  }, [duke, scene, status])
  useEffect(() => engine.current?.focus(focus, panelWidth), [focus, panelWidth, status])
  useEffect(() => engine.current?.setNight(night), [night, status])

  // E waves, 1-3 bow, cheer and shrug, F slaps the nearest merchant within reach. In a live quarter the room
  // relays them (and echoes them back); elsewhere only you see them.
  const emote = (e: RoomEmote) => {
    if (presence.current?.live) presence.current.send(e === 'wave' ? { t: 'wave' } : { t: 'emote', e })
    else engine.current?.emote(myId, e)
  }
  const wave = () => emote('wave')
  const slap = () => {
    const e = engine.current
    if (!e || scene === 'harbor') return
    if (!slaps) return game.say('Your slaps are off. Turn them on to challenge someone.', true)
    const target = e.nearestPeer(SLAP_REACH)
    if (target === null) return game.say('Nobody within reach. Walk up to a merchant first.', true)
    presence.current?.send({ t: 'slap', to: target })
  }
  const toggleSlaps = async () => {
    const r = await session.cityPrefs(!slaps)
    if (!r.ok) return game.say(r.error.message, true)
    setSlaps(r.data.slaps)
    presence.current?.send({ t: 'pref', s: r.data.slaps ? 1 : 0 })
    engine.current?.setSlaps(myId, r.data.slaps)
    game.say(r.data.slaps ? 'Slaps on: you can challenge and be challenged.' : 'Slaps off: nobody can slap you, and a white flag flies on your hat.')
  }
  const actions = useRef({ emote, slap })
  actions.current = { emote, slap }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.closest?.('.side-panel, dialog'))) return
      if (e.code === 'KeyE') actions.current.emote('wave')
      if (e.code === 'Digit1') actions.current.emote('bow')
      if (e.code === 'Digit2') actions.current.emote('cheer')
      if (e.code === 'Digit3') actions.current.emote('shrug')
      if (e.code === 'KeyF') actions.current.slap()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const inQuarter = scene !== 'harbor'
  const statusText = !inQuarter
    ? ''
    : live.status === 'live'
      ? `${quarter?.name ?? ''}${live.room.endsWith('-1') ? '' : ` · copy ${live.room.split('-').pop()}`} · ${live.count} other merchant${live.count === 1 ? '' : 's'} here`
      : live.status === 'off' || live.status === 'quiet'
        ? `${quarter?.name ?? ''} · Quiet day: other merchants can't be seen right now`
        : live.status === 'replaced'
          ? 'You opened the game in another tab, so this one left the piazza.'
          : `${quarter?.name ?? ''} · Arriving…`

  return (
    <div class="world" ref={box} data-testid="world" data-ready={status === 'ready' ? 'yes' : 'no'} data-scene={scene}>
      {status === 'loading' && <p class="world-loading">Sailing into the harbor…</p>}
      <div class="world-tools" style={{ right: `${panelWidth + 12}px` }}>
        <button class="secondary small" onClick={() => setLookOpen((o) => !o)} data-testid="world-look" title="Choose your merchant's look">Your look</button>
        <button class="secondary small" onClick={wave} data-testid="world-wave" title="Wave (E)">Wave</button>
        <button class="secondary small" onClick={() => emote('bow')} data-testid="world-bow" title="Bow (1)">Bow</button>
        <button class="secondary small" onClick={() => emote('cheer')} data-testid="world-cheer" title="Cheer (2)">Cheer</button>
        <button class="secondary small" onClick={() => emote('shrug')} data-testid="world-shrug" title="Shrug (3)">Shrug</button>
        {inQuarter && <button class="secondary small" onClick={slap} data-testid="world-slap" title="Slap the nearest merchant (F)">Slap</button>}
        {inQuarter && <button class="secondary small" onClick={toggleSlaps} data-testid="world-slaps">{slaps ? 'Slaps: on' : 'Slaps: off'}</button>}
        <button class="secondary small" onClick={() => setNight((n) => !n)} data-testid="world-night">{night ? 'Day' : 'Night'}</button>
        <button class="secondary small" onClick={() => engine.current?.resetView()} data-testid="world-reset">Reset view</button>
      </div>
      <p class="world-hint tiny">WASD or click to walk · drag to turn · scroll to zoom · E wave · 1 bow · 2 cheer · 3 shrug{inQuarter ? ' · F slap' : ''}</p>
      {me && status === 'ready' && (lookOpen || !me.look_chosen) && (
        <LookSheet guild={state.profession!.id as ProfessionId} me={me} invite={!lookOpen}
          onDone={(m) => {
            setLookOpen(false)
            if (!m) return
            const changed = m.look !== me.look || m.hat !== me.hat
            setMe(m)
            if (changed) presence.current?.reconnect()   // a fresh pass, so others see the new look
          }} />
      )}
      {inQuarter && <p class="world-status small" data-testid="world-presence" data-status={live.status}>{statusText}</p>}
    </div>
  )
}

/**
 * Choose your merchant's look (0.10.0). Accounts from before 0.10.0 see it once as an invitation; "Keep this
 * one" saves the look they already have, so the invitation doesn't come back.
 */
function LookSheet({ guild, me, invite, onDone }: { guild: ProfessionId; me: PresenceMe; invite: boolean; onDone: (m: PresenceMe | null) => void }) {
  const game = useGame()
  const [color, setColor] = useState(me.look)
  const [hat, setHat] = useState(me.hat ?? 0)
  const [busy, setBusy] = useState(false)
  const save = async (c: number, h: number) => {
    setBusy(true)
    const r = await session.cityLook(c, h)
    setBusy(false)
    if (!r.ok) return game.say(r.error.message, true)
    onDone({ ...me, look: r.data.color, hat: r.data.hat, rank: r.data.rank, look_chosen: true })
    game.say(`Your merchant now wears the ${HAT_NAMES[guild][r.data.hat].toLowerCase()}.`)
  }
  return (
    <section class="world-look" data-testid={invite ? 'look-invite' : 'look-sheet'} aria-label="Your look">
      <div class="look-preview">
        <Portrait guild={guild} color={color} hat={hat} rank={me.rank ?? 0} size={72} />
        <div>
          <h2>{invite ? 'New: choose your look' : 'Your look'}</h2>
          <p class="small">{invite ? 'Every merchant in Portovela can now pick a body color and a hat. Others see it in the quarters.' : 'Others see it in the quarters. Your sash shows your rank.'}</p>
        </div>
      </div>
      <ColorPicker color={color} onChange={setColor} />
      <HatPicker guild={guild} hat={hat} onChange={setHat} />
      <div class="btnrow">
        <button class="small" disabled={busy} onClick={() => save(color, hat)} data-testid="look-save">Save my look</button>
        {invite
          ? <button class="secondary small" disabled={busy} onClick={() => save(me.look, me.hat ?? 0)} data-testid="look-keep">Keep this one</button>
          : <button class="secondary small" disabled={busy} onClick={() => onDone(null)} data-testid="look-cancel">Cancel</button>}
      </div>
    </section>
  )
}
