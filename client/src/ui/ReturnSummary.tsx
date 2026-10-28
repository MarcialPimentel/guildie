// "While you were away" (#47, GDD 4.1 and 8.2): when a player comes back after a while, show what happened
// before the Workshop, with one tap to collect everything that's ready. Built on the server's Activity Log.
import { useEffect, useState } from 'preact/hooks'
import { duration } from '../format'
import { Coins } from './art'
import { session } from '../session'
import type { Activity, NewsItem } from '../types'
import { useGame } from './common'

const AWAY_SECONDS = 15 * 60   // [tune]
const KEY = 'guildie.lastSeen.'

function load(playerId: number): number {
  try {
    return Number(localStorage.getItem(KEY + playerId) || 0)
  } catch {
    return 0
  }
}

/** Remember that the player was here (server time). Called on every refresh and when the page hides. */
export function markSeen(playerId: number): void {
  try {
    localStorage.setItem(KEY + playerId, String(session.now()))
  } catch {
    // Blocked storage: the summary just won't show next time.
  }
}

interface Summary {
  away: number
  lines: { text: string; good?: boolean }[]
  news: NewsItem[]
  stationFull: boolean
  craftsReady: number
}

function summarize(activity: Activity[], away: number, news: NewsItem[]): Summary {
  const count = (type: string) => activity.filter((a) => a.type === type)
  const lines: Summary['lines'] = []
  const pick = (types: string[], good = false, max = 6) =>
    activity.filter((a) => types.includes(a.type)).slice(0, max).forEach((a) => lines.push({ text: a.text, good }))
  pick(['sold', 'sold_to_guild', 'order_filled', 'trade_done', 'offer_accepted'], true)
  pick(['surprise'], true, 3)
  pick(['offer_received', 'offer_declined', 'offer_expired', 'listing_expired'])
  const sold = count('sold').length
  if (sold > 6) lines.push({ text: `…and ${sold - 6} more sales.` })
  const s = session.state!
  const now = session.now()
  return {
    away,
    lines,
    news: news.filter((n) => n.kind === 'event'),
    stationFull: s.profession?.station.outputs.some((o) => o.ready >= o.cap) ?? false,
    craftsReady: s.crafts.filter((c) => c.ends_at <= now).length,
  }
}

/**
 * Shows when the player has been away at least AWAY_SECONDS: on opening the game, and (0.5.2) when a
 * phone brings a backgrounded tab back, which is how most phone visits start.
 */
export function ReturnSummary() {
  const game = useGame()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [busy, setBusy] = useState(false)
  const playerId = session.state!.player.id

  useEffect(() => {
    let alive = true
    const check = async () => {
      const last = load(playerId)
      const away = session.now() - last
      markSeen(playerId)
      if (!last || away < AWAY_SECONDS) return
      await session.refresh()   // the bag, station and crafts as they are now
      const [a, n] = await Promise.all([session.activitySince(last), session.news()])
      if (alive && a.ok && session.state) setSummary(summarize(a.data.activity, away, n.ok ? n.data.news : []))
    }
    const onVisible = () => document.visibilityState === 'visible' && check()
    check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [playerId])

  if (!summary) return null
  const collectAll = async () => {
    setBusy(true)
    const texts: string[] = []
    const station = await game.run(() => session.collectStation(), 'Collected.')
    if (station.ok) texts.push(...(station.data.surprises ?? []).map((x) => x.text))
    if (summary.craftsReady) {
      const crafts = await game.run(() => session.collectCrafts(), 'Collected everything.')
      if (crafts.ok) texts.push(...(crafts.data.surprises ?? []).map((x) => x.text))
    }
    if (texts.length) game.say(texts.join(' · '))
    setBusy(false)
    setSummary(null)
  }
  const goldNow = session.state!.player.gold

  return (
    <div class="overlay" data-testid="return-summary" onClick={(e) => e.target === e.currentTarget && setSummary(null)}>
      <div class="card" role="dialog" aria-label="While you were away">
        <h2>While you were away</h2>
        <p class="muted small">You were gone {duration(summary.away)}. You have <Coins n={goldNow} />.</p>
        {summary.lines.length === 0 && <p class="small muted">A quiet spell: nothing sold or arrived.</p>}
        {summary.lines.map((l) => <p class={`small ${l.good ? 'ok' : ''}`}>{l.text}</p>)}
        {summary.stationFull && <p class="small error">Your station is full: production paused until you collect.</p>}
        {summary.craftsReady > 0 && <p class="small ok">{summary.craftsReady} craft{summary.craftsReady === 1 ? ' is' : 's are'} ready.</p>}
        {summary.news.map((n) => <p class="small accent">{n.status === 'now' ? 'Now' : 'Coming'}: {n.headline}</p>)}
        <div class="btnrow">
          <button class="secondary" onClick={() => setSummary(null)} data-testid="return-close">Close</button>
          <button disabled={busy} onClick={collectAll} data-testid="return-collect">Collect everything</button>
        </div>
      </div>
    </div>
  )
}
