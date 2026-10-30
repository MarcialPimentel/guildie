// Shared building blocks: the game context (messages + running actions), action buttons, steppers, clock.
import { createContext, type ComponentChildren } from 'preact'
import { useContext, useEffect, useState } from 'preact/hooks'
import { errorMessage, type ApiResult } from '../api'
import { session } from '../session'

export interface Game {
  /** Show a short message above the tab bar. */
  say(text: string, isError?: boolean): void
  /** Run a server action, report its error (or success text), and restart the background refresh timer. */
  run<T>(action: () => Promise<ApiResult<T>>, successText?: string): Promise<ApiResult<T>>
  /** Open a tab (by name), optionally with a request for that tab (e.g. open the sell form for an item). */
  openTab(tab: TabName, request?: TabRequest): void
  /** Bumped every background refresh, so open views can reload their data. */
  refreshTick: number
}

export type TabName = 'workshop' | 'market' | 'bag' | 'city'
/** market: which Mercato view; guild (0.13.0): a guild vendor's stall shows only that guild's goods. */
export type TabRequest = { sellItem?: string; sellQty?: number; sellQuality?: number; market?: 'browse' | 'sell' | 'mine' | 'offers'; guild?: string }

export const GameContext = createContext<Game>({
  say: () => {},
  run: (a) => a(),
  openTab: () => {},
  refreshTick: 0,
})

export function useGame(): Game {
  return useContext(GameContext)
}

/** Current server time, updated every second (for countdowns). */
export function useNow(): number {
  const [now, setNow] = useState(session.now())
  useEffect(() => {
    const id = setInterval(() => setNow(session.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

/**
 * Load data from the API when `deps` change (and on every background refresh if `live`).
 * Returns [data, reload]. Errors are shown as a message; data stays as it was.
 */
export function useLoad<T>(load: () => Promise<ApiResult<T>>, deps: unknown[], live = false): [T | null, () => Promise<void>] {
  const game = useGame()
  const [data, setData] = useState<T | null>(null)
  const reload = async () => {
    const r = await load()
    if (r.ok) setData(r.data)
    else game.say(errorMessage(r), true)
  }
  useEffect(() => {
    let alive = true
    load().then((r) => {
      if (!alive) return
      if (r.ok) setData(r.data)
      else game.say(errorMessage(r), true)
    })
    return () => { alive = false }
  }, live ? [...deps, game.refreshTick] : deps)
  return [data, reload]
}

interface ActionButtonProps {
  action: () => Promise<ApiResult<unknown>>
  success?: string
  /** Called after the action, with whether it succeeded. */
  after?: (ok: boolean, result: ApiResult<unknown>) => void
  class?: string
  disabled?: boolean
  testid?: string
  children: ComponentChildren
}

/** A button that runs a server action, disables itself while waiting, and reports the result. */
export function ActionButton(props: ActionButtonProps) {
  const game = useGame()
  const [busy, setBusy] = useState(false)
  const onClick = async () => {
    if (busy) return
    setBusy(true)
    const r = await game.run(props.action, props.success)
    setBusy(false)
    props.after?.(r.ok, r)
  }
  return (
    <button class={props.class} disabled={props.disabled || busy} onClick={onClick} data-testid={props.testid}>
      {props.children}
    </button>
  )
}

interface StepperProps {
  value: number
  min: number
  max: number
  onChange: (n: number) => void
  steps?: number[]
  testid?: string
}

/** − value + (or −10 −1 value +1 +10 with steps). */
export function Stepper({ value, min, max, onChange, steps = [1], testid }: StepperProps) {
  const hi = Math.max(min, max)
  const set = (n: number) => onChange(Math.min(hi, Math.max(min, n)))
  const down = [...steps].reverse()
  return (
    <div class="stepper" data-testid={testid}>
      {down.map((s) => (
        <button class="secondary small step" onClick={() => set(value - s)} disabled={value <= min} aria-label={`minus ${s}`}>
          −{s > 1 ? s : ''}
        </button>
      ))}
      <span class="val num">{value}</span>
      {steps.map((s) => (
        <button class="secondary small step" onClick={() => set(value + s)} disabled={value >= hi} aria-label={`plus ${s}`}>
          +{s > 1 ? s : ''}
        </button>
      ))}
    </div>
  )
}

/** A row of mode buttons (e.g. Browse / Sell / My listings). */
export function Modes<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div class="btnrow">
      {options.map(([key, label]) => (
        <button class={key === value ? 'on small' : 'secondary small'} onClick={() => onChange(key)} data-testid={`mode-${key}`}>
          {label}
        </button>
      ))}
    </div>
  )
}
