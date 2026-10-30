// The station's minigame on the station card (0.15.0): a button that says what a good round brings, then the
// round itself, then what you got. Optional: the station keeps gathering on its own either way.
import { useState } from 'preact/hooks'
import { errorMessage } from '../api'
import { session } from '../session'
import type { MinigameResult, MinigameRound, StationMinigame } from '../types'
import { ItemIcon } from '../ui/art'
import { useGame } from '../ui/common'
import { minigameScreens } from './registry'

type Phase = { at: 'idle' } | { at: 'starting' } | { at: 'playing'; round: MinigameRound } | { at: 'sending' } | { at: 'result'; result: MinigameResult }

/** "Fresh" or "Tiring", and what a perfect round brings. */
function freshnessLine(game: { freshness: number; max_units: number; name: string }): string {
  const what = `a clean round brings up to ${game.max_units} ${game.name}`
  if (game.freshness >= 0.95) return `Fresh: ${what}.`
  if (game.freshness > 0.45) return `Tiring: ${what}. Rest restores it.`
  return `Worn out: ${what}. Rest a few hours for full rounds.`
}

export function MinigamePanel({ game }: { game: StationMinigame }) {
  const g = useGame()
  const [phase, setPhase] = useState<Phase>({ at: 'idle' })
  const Screen = minigameScreens[game.kind]
  if (!Screen) return null   // a kind this client doesn't know yet: reload for the new version

  const start = async () => {
    setPhase({ at: 'starting' })
    const r = await session.minigameStart('station')
    if (!r.ok) {
      g.say(errorMessage(r), true)
      setPhase({ at: 'idle' })
      return
    }
    setPhase({ at: 'playing', round: r.data })
  }

  const finish = async (roundId: number, taps: (number | null)[]) => {
    setPhase({ at: 'sending' })
    const r = await session.minigameFinish(roundId, taps)
    if (!r.ok) {
      g.say(errorMessage(r), true)
      setPhase({ at: 'idle' })
      return
    }
    setPhase({ at: 'result', result: r.data })
  }

  if (phase.at === 'playing') {
    const round = phase.round
    return (
      <div class="minigame stack tight" data-testid="minigame">
        <h3>{game.words.title}</h3>
        <Screen plan={round.plan} game={game} onDone={(taps) => finish(round.round_id, taps)} />
      </div>
    )
  }

  if (phase.at === 'sending') {
    return <div class="minigame" data-testid="minigame"><p class="muted center">Counting what you brought in…</p></div>
  }

  if (phase.at === 'result') {
    const res = phase.result
    const pct = Math.round(res.score * 100)
    const count = (hit: string) => res.steps.filter((s) => s === hit).length
    return (
      <div class="minigame stack tight" data-testid="minigame-result">
        <h3>{game.words.title}: {pct}%</h3>
        <p class="small muted">
          {count('perfect')}× {game.words.perfect.replace(/!$/, '')} · {count('good')}× {game.words.good} · {count('miss')} missed
        </p>
        {res.rewards.length === 0 && <p>Nothing this time. Watch for {game.words.zone}.</p>}
        {res.rewards.map((rw) => (
          <div class="row">
            <ItemIcon id={rw.item_id} />
            <span class={`grow ${rw.find ? 'surprise' : ''}`}>{rw.find ? `${rw.text} ` : ''}+{rw.quantity} {rw.name}</span>
          </div>
        ))}
        {/* `game` comes from the state the server sent back with the result, so it's already the next round's. */}
        <p class="tiny muted" data-testid="minigame-freshness">{freshnessLine(game)}</p>
        <div class="btnrow">
          <button class="small" onClick={start} data-testid="minigame-again">Again</button>
          <button class="secondary small" onClick={() => setPhase({ at: 'idle' })} data-testid="minigame-close">Done</button>
        </div>
      </div>
    )
  }

  return (
    <div class="minigame stack tight">
      <p class="small">{game.words.intro}</p>
      <p class="tiny muted" data-testid="minigame-freshness">{freshnessLine(game)}</p>
      <button class="secondary block" onClick={start} disabled={phase.at === 'starting'} data-testid="minigame-open">
        <ItemIcon id={game.item_id} /> {game.words.title}
      </button>
    </div>
  )
}
