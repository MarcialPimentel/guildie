// The 3D harbor (desktop). Loads the 3D engine on demand, turns the server's state into what the harbor
// shows (world/types.ts WorldState), and reports clicks on places. The engine never decides anything.
import { useEffect, useRef, useState } from 'preact/hooks'
import { duration } from '../format'
import { session, useSession } from '../session'
import type { GameState, NewsItem, OrderBoard } from '../types'
import type { PickId, ProfessionId, WorldEngine, WorldLabel, WorldState } from '../world/types'
import { useLoad, useNow } from './common'

const WORKBENCH: Record<ProfessionId, string> = { blacksmith: 'Forge', alchemist: 'Alembic', leatherworker: 'Tanning bench' }

/** What the harbor shows, from the latest state. Station fill is estimated between refreshes, like the classic screen. */
export function worldState(state: GameState, now: number, board: OrderBoard | null, news: NewsItem[]): WorldState {
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
    .map((o) => ({ kind: o.kind, ready: o.items.every((i) => i.have >= i.quantity) }))
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

interface WorldProps {
  focus: PickId | null
  panelWidth: number
  onPick: (id: PickId) => void
  onFail: () => void
}

export function World({ focus, panelWidth, onPick, onFail }: WorldProps) {
  const s = useSession()
  const state = s.state!
  const now = useNow()
  const box = useRef<HTMLDivElement>(null)
  const engine = useRef<WorldEngine | null>(null)
  const pickRef = useRef(onPick)
  pickRef.current = onPick
  const [status, setStatus] = useState<'loading' | 'ready'>('loading')
  const [night, setNight] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)

  // The bag key makes customers' "ready" marks follow the bag; both reload on every background refresh.
  const bagKey = JSON.stringify(state.inventory.map((i) => [i.item_id, i.quantity]))
  const [board] = useLoad(() => session.orders(), [bagKey], true)
  const [news] = useLoad(() => session.news(), [], true)

  useEffect(() => {
    let alive = true
    import('../world/engine')
      .then((m) => {
        if (!alive || !box.current) return
        engine.current = m.createWorld(box.current, state.profession!.id as ProfessionId, state.player.name, { onPick: (id) => pickRef.current(id) })
        setStatus('ready')
      })
      .catch((e) => {
        console.error('3D harbor failed to start', e)
        if (alive) onFail()
      })
    return () => {
      alive = false
      engine.current?.dispose()
      engine.current = null
    }
  }, [])

  useEffect(() => {
    engine.current?.setState(worldState(state, now, board, news?.news ?? []))
  }, [state, now, board, news, status])
  useEffect(() => engine.current?.focus(focus, panelWidth), [focus, panelWidth, status])
  useEffect(() => engine.current?.setNight(night), [night, status])

  return (
    <div class="world" ref={box} data-testid="world" data-ready={status === 'ready' ? 'yes' : 'no'}>
      {status === 'loading' && <p class="world-loading">Sailing into the harbor…</p>}
      <div class="world-tools" style={{ right: `${panelWidth + 12}px` }}>
        <button class="secondary small" onClick={() => setNight((n) => !n)} data-testid="world-night">{night ? 'Day' : 'Night'}</button>
        <button class="secondary small" onClick={() => engine.current?.resetView()} data-testid="world-reset">Reset view</button>
      </div>
      <p class="world-hint tiny">Drag to turn · right-drag to move · scroll to zoom · click a place</p>
    </div>
  )
}
