// Strike (0.15.0, content/minigames.json -> kinds.strike): a marker sweeps along a bar; tap while it's over the
// sweet spot. One set of rules, three looks: pickaxe on a glinting seam, sickle on ripe stems, snare on a trail.
// The marker uses the server's formula (server/app/lib/minigame_strike.php), so what you see is what is scored;
// the server still decides the score.
import { useEffect, useRef, useState } from 'preact/hooks'
import type { MinigameScreenProps } from './registry'

export interface StrikeSwing { speed: number; phase: number; center: number }
export interface StrikePlan {
  swings: StrikeSwing[]
  good_width: number
  perfect_width: number
  swing_timeout_ms: number
  gap_ms: number
  min_tap_ms: number
}

type Hit = 'perfect' | 'good' | 'miss'

/** Where the marker is (0..1) after `ms` milliseconds of a swing: a triangle wave, as on the server. */
export function strikePosition(s: StrikeSwing, ms: number): number {
  const x = (((s.phase + (s.speed * ms) / 1000) % 2) + 2) % 2
  return x <= 1 ? x : 2 - x
}

export function strikeJudge(plan: StrikePlan, s: StrikeSwing, ms: number | null): Hit {
  if (ms === null) return 'miss'
  const off = Math.abs(strikePosition(s, ms) - s.center)
  return off <= plan.perfect_width / 2 ? 'perfect' : off <= plan.good_width / 2 ? 'good' : 'miss'
}

/** The tool drawn on the marker, per look. */
function Tool({ skin }: { skin: string }) {
  if (skin === 'sickle') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4c9 0 14 6 12 13-2-5-6-8-12-8z" fill="#D9DEE0" stroke="#2B3A3E" stroke-width="1.2" /><rect x="15.5" y="15" width="3" height="8" rx="1.2" fill="#8A5A2B" /></svg>
  }
  if (skin === 'snare') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="6" fill="none" stroke="#C9A36A" stroke-width="2.4" /><path d="M12 15v8" stroke="#8A5A2B" stroke-width="2.4" /></svg>
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7c5-4 13-4 18 0l-1.5 1.5C15 6 9 6 4.5 8.5z" fill="#9AA4A8" stroke="#2B3A3E" stroke-width="1.2" /><rect x="10.8" y="6" width="2.4" height="17" rx="1" fill="#8A5A2B" /></svg>
}

export function Strike({ plan, game, onDone }: MinigameScreenProps<StrikePlan>) {
  const words = game.words
  const [index, setIndex] = useState(0)
  const [hits, setHits] = useState<Hit[]>([])
  const [flash, setFlash] = useState<Hit | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  const marker = useRef<HTMLDivElement>(null)
  // Mutable round state, read by the animation frame and the tap handler without re-rendering.
  const run = useRef({ swingStart: 0, moving: false, taps: [] as (number | null)[], done: false })
  const swing = plan.swings[index]

  const settle = (ms: number | null) => {
    const r = run.current
    if (!r.moving || r.done) return
    r.moving = false
    r.taps.push(ms)
    const hit = strikeJudge(plan, plan.swings[r.taps.length - 1], ms)
    setHits((h) => [...h, hit])
    setFlash(hit)
    if (r.taps.length >= plan.swings.length) {
      r.done = true
      setTimeout(() => onDone(r.taps), 450)
      return
    }
    setTimeout(() => {
      setFlash(null)
      setIndex(r.taps.length)
    }, plan.gap_ms)
  }

  // Each swing: start the clock and move the marker every frame; no tap before the timeout is a miss.
  useEffect(() => {
    const r = run.current
    if (r.done) return
    r.swingStart = performance.now()
    r.moving = true
    bar.current?.removeAttribute('data-pos')
    let frame = 0
    const tick = () => {
      if (!r.moving) return
      const ms = performance.now() - r.swingStart
      if (ms >= plan.swing_timeout_ms) {
        settle(null)
        return
      }
      const pos = strikePosition(swing, ms)
      if (marker.current) marker.current.style.left = `${pos * 100}%`
      // data-pos is set only while a tap would count (the browser test aims with it).
      if (ms >= plan.min_tap_ms) bar.current?.setAttribute('data-pos', pos.toFixed(4))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [index])

  const tap = () => {
    const r = run.current
    if (!r.moving) return
    const ms = Math.round(performance.now() - r.swingStart)
    if (ms < plan.min_tap_ms) return   // too soon to count: the swing has only just begun
    settle(Math.min(ms, plan.swing_timeout_ms))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        tap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const left = (w: number) => ({ left: `${(swing.center - w / 2) * 100}%`, width: `${w * 100}%` })
  return (
    <div class={`strike skin-${game.skin}`}>
      <div
        ref={bar}
        class="strike-bar"
        onPointerDown={(e) => { e.preventDefault(); tap() }}
        data-testid="strike-bar"
        data-center={swing.center}
        data-good={plan.good_width}
        data-perfect={plan.perfect_width}
        data-swing={index}
        role="presentation"
      >
        <div class="strike-zone" style={left(plan.good_width)} />
        <div class="strike-zone perfect" style={left(plan.perfect_width)} />
        <div ref={marker} class="strike-marker"><Tool skin={game.skin} /></div>
        {flash && <div class={`strike-flash ${flash}`} aria-live="polite">{words[flash]}</div>}
      </div>
      <div class="strike-pips" aria-label={`${hits.length} of ${plan.swings.length}`}>
        {plan.swings.map((_, i) => <span class={`pip ${hits[i] ?? (i === index ? 'now' : '')}`} />)}
      </div>
      <button class="block" onClick={tap} data-testid="strike-tap">{words.button}!</button>
      <p class="tiny muted center">Tap the bar, the button or Space when the marker is over {words.zone}.</p>
    </div>
  )
}
