// The main game screen: header (name, guild, ducats, view switch, Feedback), a message line, and either
// the classic view (tabs: Bottega, Mercato, Bag, City) or the 3D harbor with side panels (desktop, 0.7.0).
// Both views use the same screens, the same background refresh and the same "While you were away".
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { errorMessage, type ApiResult } from '../api'
import { Coins } from './art'
import { useSession, session } from '../session'
import { Bag } from './Bag'
import { City } from './City'
import { GameContext, type Game, type TabName, type TabRequest } from './common'
import { FeedbackDialog } from './Feedback'
import { HarborView, type Panel } from './HarborView'
import { Market } from './Market'
import { markSeen, ReturnSummary } from './ReturnSummary'
import { Workshop } from './Workshop'
import { canOffer3D, initialView, rememberView, type ViewMode } from '../view'
import type { PickId } from '../world/types'

const REFRESH_MS = 20000
const TABS: [TabName, string][] = [['workshop', 'Bottega'], ['market', 'Mercato'], ['bag', 'Bag'], ['city', 'City']]

export function GameScreen() {
  const s = useSession()
  const state = s.state!
  const [tab, setTab] = useState<TabName>('workshop')
  const [request, setRequest] = useState<TabRequest>({})
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [mode, setMode] = useState<ViewMode>(initialView)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [view, setView] = useState('')   // the current tab's sub-view, saved with feedback
  const messageTimer = useRef<number>()
  const refreshTimer = useRef<number>()

  const say = (text: string, error = false) => {
    setMessage({ text, error })
    clearTimeout(messageTimer.current)
    messageTimer.current = window.setTimeout(() => setMessage(null), 6000)
  }

  // Background refresh: new state every 20 s while the game is on screen, and open views reload their data.
  // Paused while the tab is hidden; refreshes at once when it comes back. Stops for good once this screen
  // is gone (e.g. logged out), so no stray timer keeps polling (0.5.2).
  const mounted = useRef(true)
  const refreshNow = async () => {
    await session.refresh()
    if (!mounted.current) return
    setRefreshTick((n) => n + 1)
    if (document.visibilityState === 'visible' && session.state) markSeen(session.state.player.id)
  }
  const scheduleRefresh = () => {
    clearTimeout(refreshTimer.current)
    if (!mounted.current) return
    refreshTimer.current = window.setTimeout(async () => {
      if (document.visibilityState === 'visible') await refreshNow()
      scheduleRefresh()
    }, REFRESH_MS)
  }
  useEffect(() => {
    mounted.current = true
    scheduleRefresh()
    const onVisibility = () => {
      if (!session.state) return
      if (document.visibilityState === 'hidden') {
        // Leaving counts as the last time the player was here (for "While you were away").
        markSeen(session.state.player.id)
      } else {
        refreshNow().then(scheduleRefresh)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      mounted.current = false
      clearTimeout(refreshTimer.current)
      clearTimeout(messageTimer.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const game: Game = {
    say,
    async run<T>(action: () => Promise<ApiResult<T>>, successText = '') {
      const r = await action()
      if (r.ok) {
        if (successText) say(successText)
      } else {
        say(errorMessage(r), true)
      }
      scheduleRefresh()
      return r
    },
    openTab(name: TabName, req: TabRequest = {}) {
      if (mode === '3d') {
        // In the harbor, a tab is a place: open its panel instead.
        const id: PickId = name === 'workshop' ? 'workbench' : name === 'bag' ? 'bag' : name === 'city' ? 'city' : req.market === 'mine' ? 'stall' : 'mercato'
        setPanel({ id, request: req })
        return
      }
      setRequest(req)
      setTab(name)
      window.scrollTo(0, 0)
    },
    refreshTick,
  }

  const offers = state.incoming_offers ?? 0
  const screenName = mode === '3d' ? `3D/${view || 'harbor'}` : TABS.find(([k]) => k === tab)![1] + (view ? `/${view}` : '')

  const openPanel = useCallback((id: PickId) => {
    setPanel({ id, request: id === 'stall' ? { market: 'mine' } : id === 'mercato' ? { market: 'browse' } : {} })
  }, [])
  const closePanel = useCallback(() => setPanel(null), [])
  const switchMode = (m: ViewMode) => {
    rememberView(m)
    setMode(m)
    setPanel(null)
    setView('')
  }
  useEffect(() => {
    document.body.classList.toggle('in-world', mode === '3d')
    return () => document.body.classList.remove('in-world')
  }, [mode])

  return (
    <GameContext.Provider value={game}>
      <header class="header">
        <div class="header-inner">
          <span class="who" data-testid="who">{state.player.name} · {state.profession?.name ?? 'No guild'}</span>
          <span class="gold num"><Coins n={state.player.gold} testid="gold" /></span>
          {(mode === '3d' || canOffer3D()) && (
            <button class="secondary small" onClick={() => switchMode(mode === '3d' ? 'classic' : '3d')} data-testid="view-toggle">
              {mode === '3d' ? 'Classic view' : '3D view'}
            </button>
          )}
          <button class="secondary small" onClick={() => setFeedbackOpen(true)} data-testid="feedback-open">Feedback</button>
        </div>
      </header>

      {mode === '3d' && (
        <HarborView
          panel={panel}
          open={openPanel}
          close={closePanel}
          onView={setView}
          onFail={() => { setMode('classic'); say('The 3D harbor could not start in this browser, so the classic view is on.', true) }}
        />
      )}

      {mode === 'classic' && <>
      <nav class="tabbar">
        <div class="tabbar-inner">
          {TABS.map(([key, label]) => (
            <button
              class={key === tab ? 'on' : 'secondary'}
              onClick={() => game.openTab(key, key === 'market' ? { market: 'browse' } : {})}
              data-testid={`tab-${key}`}
            >
              {key === 'city' && offers > 0 ? `${label} (${offers})` : label}
            </button>
          ))}
        </div>
      </nav>

      <main class="page" data-testid={`screen-${tab}`}>
        {tab === 'workshop' && <Workshop />}
        {tab === 'market' && <Market request={request} onView={setView} />}
        {tab === 'bag' && <Bag />}
        {tab === 'city' && <City onView={setView} />}
      </main>
      </>}

      {message && (
        <div class="message" role="status" data-testid="message">
          <span class={message.error ? 'error' : 'ok'}>{message.text}</span>
        </div>
      )}

      <ReturnSummary />

      {feedbackOpen && <FeedbackDialog screen={screenName} onClose={() => setFeedbackOpen(false)} />}
    </GameContext.Provider>
  )
}
