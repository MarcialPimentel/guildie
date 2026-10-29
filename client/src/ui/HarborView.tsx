// The 3D view's layout (desktop): the harbor fills the screen, every place opens a side panel with the
// same screens the classic view uses, and a dock offers every place as a plain button too.
// 0.13.0: the quay keeps only your own work; the Steps lead to the Palazzo, the one shared square, with the
// marketplace (a vendor per guild and the selling desk), the Hall of honor and the city's merchants, the
// Duke's lectern and the officials. Tapping a player there opens their bottega.
import type { ComponentChildren } from 'preact'
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import { useSession } from '../session'
import { GUILDS, guild } from '../guilds'
import { PALAZZO, type PickId, type Scene } from '../world/types'
import { Bag } from './Bag'
import { City, Crafter } from './City'
import { useNow, type TabRequest } from './common'
import { DukeOrder } from './Duke'
import { Market } from './Market'
import { Orders } from './Orders'
import { GuideCard } from './Guide'
import { HallOfHonor, OfficialView } from './Palazzo'
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
  ['station', 'Station'], ['workbench', 'Workbench'], ['orders', 'Customers'], ['bag', 'Storehouse'], ['ledger', 'Your bottega'],
  ['steps', 'Up to the Palazzo'],
]
const PALAZZO_DOCK: [PickId, string][] = [
  ['home', 'Back to your bottega'],
  ...GUILDS.map((g) => [`vendor:${g.id}` as PickId, g.goods] as [PickId, string]),
  ['desk', 'Selling desk'], ['hall', 'Hall of honor'], ['duke', "Duke's order"],
  ['notary', 'Notary'], ['crier', 'Crier'], ['steward', 'Steward'],
]

const TITLES: Partial<Record<PickId | 'visit', string>> = {
  station: '', workbench: 'Workbench', orders: 'Customers at your door', ledger: 'Your bottega', bag: 'Storehouse',
  duke: "The Duke's order", steps: 'Up the Steps', home: '', visit: 'A bottega', desk: 'The selling desk',
  hall: 'The Palazzo', statue: 'Il Factotum', notary: 'The notary', crier: 'The town crier', steward: "The Duke's steward",
}
const titleOf = (id: PickId | 'visit') => (id.startsWith('vendor:') ? `The ${guild(id.slice(7)).goods.toLowerCase()} vendor` : TITLES[id] ?? '')
/** Places that live up at the Palazzo: opening one from the quay walks you up there (0.13.0). */
const atPalazzo = (id: PickId | 'visit') => id === 'desk' || id === 'hall' || id === 'statue' || id.startsWith('vendor:')

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
    else if (id === 'steps') go(PALAZZO)
    else open(id)
  }, [open, go])
  // A trade or city link from the quay (the storehouse's "Sell", a Mercato tab request) takes you up the Steps.
  useEffect(() => {
    if (panel && atPalazzo(panel.id) && scene === 'harbor') setScene(PALAZZO)
  }, [panel?.id])
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
  const title = panel ? (panel.id === 'station' ? state.profession!.station.name : titleOf(panel.id)) : ''
  const dock = scene === 'harbor' ? DOCK : PALAZZO_DOCK
  // Built once per panel: a new object on every redraw (the clock ticks each second) would make the
  // Mercato treat it as a fresh request and jump back to the goods list, closing the buy screen.
  const vendorRequest = useMemo<TabRequest | null>(
    () => (panel?.id.startsWith('vendor:') ? { market: 'browse', guild: panel.id.slice(7), ...panel.request } : null),
    [panel],
  )
  let body: ComponentChildren = null
  if (panel) {
    switch (panel.id) {
      case 'station': body = <Station state={state} now={now} />; break
      case 'workbench': body = <><Crafts state={state} now={now} /><Recipes state={state} /></>; break
      case 'orders': body = <Orders />; break
      case 'ledger': body = <Ledger state={state} now={now} />; break
      case 'bag': body = <Bag />; break
      case 'desk': body = <Market key={panel.id} request={panel.request} onView={() => {}} desk />; break
      case 'duke': body = <DukeOrder />; break
      case 'hall': body = <><HallOfHonor /><City onView={() => {}} inHall /></>; break
      case 'statue': body = <HallOfHonor />; break
      case 'notary':
      case 'crier':
      case 'steward': body = <OfficialView key={panel.id} npc={panel.id} />; break
      case 'visit': body = panel.playerId ? <Crafter key={panel.playerId} id={panel.playerId} /> : null; break
      default:
        if (vendorRequest) body = <Market key={panel.id} request={vendorRequest} onView={() => {}} vendor />
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
      <GuideCard floating />
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

