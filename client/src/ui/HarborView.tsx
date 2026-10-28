// The 3D view's layout (desktop): the harbor fills the screen, every place opens a side panel with the
// same screens the classic view uses, and a dock offers every place as a plain button too.
// 0.9.0: the Steps lead to the guild quarters, where tapping a player or a stall opens their bottega.
import type { ComponentChildren } from 'preact'
import { useCallback, useEffect, useState } from 'preact/hooks'
import { session, useSession } from '../session'
import type { PickId, Scene } from '../world/types'
import { Bag } from './Bag'
import { City, Crafter } from './City'
import { useLoad, useNow, type TabRequest } from './common'
import { DukeOrder } from './Duke'
import { QuarterChooser } from './Quarters'
import { Market } from './Market'
import { Orders } from './Orders'
import { NewsBoard } from './Ticker'
import { Crafts, Ledger, Recipes, Station } from './Workshop'
import { World } from './World'

export interface Panel {
  /** A place, or 'visit': another crafter's bottega (playerId). */
  id: PickId | 'visit'
  request: TabRequest
  playerId?: number
}

export const PANEL_WIDTH = 460

const DOCK: [PickId, string][] = [
  ['station', 'Station'], ['workbench', 'Workbench'], ['orders', 'Customers'], ['stall', 'Your stall'],
  ['mercato', 'Mercato'], ['bag', 'Storehouse'], ['city', 'Guild hall'], ['news', 'News'], ['ledger', 'Ledger'],
  ['duke', "Duke's order"], ['steps', 'Quarters'],
]
const QUARTER_DOCK: [PickId, string][] = [['home', 'Back to your bottega'], ['duke', "Duke's order"], ['trainer', 'Guild hall'], ['steps', 'Other quarters']]

const TITLES: Record<PickId | 'visit', string> = {
  station: '', workbench: 'Workbench', orders: 'Customers at your door', ledger: 'Your bottega', bag: 'Storehouse',
  stall: 'Your stall', mercato: 'The Mercato', city: 'Guild hall', news: 'Harbor news',
  duke: "The Duke's order", steps: 'The guild quarters', trainer: 'Guild hall', home: '', visit: 'A bottega',
}

interface Props {
  panel: Panel | null
  open: (id: PickId) => void
  show: (p: Panel) => void
  close: () => void
  onFail: () => void
  onView: (v: string) => void
}

export function HarborView({ panel, open, show, close, onFail, onView }: Props) {
  const s = useSession()
  const state = s.state!
  const now = useNow()
  const [scene, setScene] = useState<Scene>('harbor')
  const go = useCallback((next: Scene) => { close(); setScene(next) }, [close])
  const pick = useCallback((id: PickId) => {
    if (id === 'home') go('harbor')
    else open(id)
  }, [open, go])
  const visit = useCallback((playerId: number) => show({ id: 'visit', request: {}, playerId }), [show])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])
  useEffect(() => onView(panel?.id ?? 'harbor'), [panel?.id])

  // On a narrow screen (a phone trying ?view=3d) the panel takes the whole width.
  const width = Math.min(PANEL_WIDTH, window.innerWidth)
  const covers = width >= window.innerWidth
  const title = panel ? (panel.id === 'station' ? state.profession!.station.name : TITLES[panel.id]) : ''
  const dock = scene === 'harbor' ? DOCK : QUARTER_DOCK
  let body: ComponentChildren = null
  if (panel) {
    switch (panel.id) {
      case 'station': body = <Station state={state} now={now} />; break
      case 'workbench': body = <><Crafts state={state} now={now} /><Recipes state={state} /></>; break
      case 'orders': body = <Orders />; break
      case 'ledger': body = <Ledger state={state} now={now} />; break
      case 'bag': body = <Bag />; break
      case 'stall':
      case 'mercato': body = <Market key={panel.id} request={panel.request} onView={() => {}} />; break
      case 'city': body = <City onView={() => {}} />; break
      case 'news': body = <News />; break
      case 'duke': body = <DukeOrder />; break
      case 'steps': body = <QuarterChooser go={(q) => go(q as Scene)} />; break
      case 'trainer': body = <Trainer />; break
      case 'visit': body = panel.playerId ? <Crafter key={panel.playerId} id={panel.playerId} /> : null; break
    }
  }

  return (
    <div class="harbor-view">
      <World
        scene={scene}
        focus={panel && panel.id !== 'visit' && panel.id !== 'steps' ? panel.id : null}
        panelWidth={panel && !covers ? width : 0}
        onPick={pick}
        onPickPlayer={visit}
        onFail={onFail}
      />
      <nav class="dock" aria-label="Places in the harbor" style={{ right: panel ? `${width}px` : '0', display: panel && covers ? 'none' : undefined }}>
        {dock.map(([id, label]) => (
          <button class={`small ${panel?.id === id ? 'on' : 'secondary'}`} onClick={() => (panel?.id === id ? close() : pick(id))} data-testid={`dock-${id}`}>
            {label}
          </button>
        ))}
      </nav>
      {panel && (
        <aside class="side-panel" style={{ width: `${width}px` }} data-testid={`panel-${panel.id}`} aria-label={title}>
          <div class="side-head">
            <h2 class="grow">{title}</h2>
            <button class="secondary small" onClick={close} aria-label="Close" data-testid="panel-close">✕</button>
          </div>
          <div class="side-body stack">{body}</div>
        </aside>
      )}
    </div>
  )
}

function News() {
  const [data] = useLoad(() => session.news(), [], true)
  if (!data) return <p class="muted">Asking at the docks…</p>
  if (!data.news.length) return <p class="muted">A quiet day in the harbor.</p>
  return (
    <>
      <NewsBoard news={data.news} />
      <p class="muted small">When an event is on, a galley is moored at the pier. Prices react on the Mercato.</p>
    </>
  )
}

/** The guild hall door in a quarter: the guild trainer moves in with M2 (#49); until then, the City. */
function Trainer() {
  return (
    <>
      <p class="muted small" data-testid="trainer-soon">The guild trainer will teach new recipes here (coming with skill and recipes). For now, the hall keeps the city's notices.</p>
      <City onView={() => {}} />
    </>
  )
}
