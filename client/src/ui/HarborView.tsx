// The 3D view's layout (desktop): the harbor fills the screen, every place opens a side panel with the
// same screens the classic view uses, and a dock offers every place as a plain button too.
import type { ComponentChildren } from 'preact'
import { useEffect } from 'preact/hooks'
import { session, useSession } from '../session'
import type { PickId } from '../world/types'
import { Bag } from './Bag'
import { City } from './City'
import { useLoad, useNow, type TabRequest } from './common'
import { Market } from './Market'
import { Orders } from './Orders'
import { NewsBoard } from './Ticker'
import { Crafts, Ledger, Recipes, Station } from './Workshop'
import { World } from './World'

export interface Panel {
  id: PickId
  request: TabRequest
}

export const PANEL_WIDTH = 460

const DOCK: [PickId, string][] = [
  ['station', 'Station'], ['workbench', 'Workbench'], ['orders', 'Customers'], ['stall', 'Your stall'],
  ['mercato', 'Mercato'], ['bag', 'Storehouse'], ['city', 'Guild hall'], ['news', 'News'], ['ledger', 'Ledger'],
]

const TITLES: Record<PickId, string> = {
  station: '', workbench: 'Workbench', orders: 'Customers at your door', ledger: 'Your bottega', bag: 'Storehouse',
  stall: 'Your stall', mercato: 'The Mercato', city: 'Guild hall', news: 'Harbor news',
}

interface Props {
  panel: Panel | null
  open: (id: PickId) => void
  close: () => void
  onFail: () => void
  onView: (v: string) => void
}

export function HarborView({ panel, open, close, onFail, onView }: Props) {
  const s = useSession()
  const state = s.state!
  const now = useNow()

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
    }
  }

  return (
    <div class="harbor-view">
      <World focus={panel?.id ?? null} panelWidth={panel && !covers ? width : 0} onPick={open} onFail={onFail} />
      <nav class="dock" aria-label="Places in the harbor" style={{ right: panel ? `${width}px` : '0', display: panel && covers ? 'none' : undefined }}>
        {DOCK.map(([id, label]) => (
          <button class={`small ${panel?.id === id ? 'on' : 'secondary'}`} onClick={() => (panel?.id === id ? close() : open(id))} data-testid={`dock-${id}`}>
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
