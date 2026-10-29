// Your bottega and its upgrades (0.11.0, #51, docs/palazzo.md §2). An upgrade is the exam for the next rank:
// your skill stops at the top of the rank your bottega allows, and you build the next level with ducats and
// goods from both other guilds. The server decides everything: costs, the build timer and what opens.
import { duration } from '../format'
import { session } from '../session'
import type { GameState, Workshop } from '../types'
import { Coins, ItemIcon } from './art'
import { ActionButton, useGame } from './common'
import { celebrate } from './Progress'

const pct = (x: number) => `${Math.round(x * 100)}%`

/** What a level adds, in one line ("4 craft slots · crafts 20% faster · station holds 50% more"). */
function gives(n: NonNullable<Workshop['next']>): string {
  const parts = [`${n.slots} craft slots`]
  if (n.craft_speed > 0) parts.push(`crafts ${pct(n.craft_speed)} faster`)
  if (n.station_cap > 1) parts.push(`station holds ${pct(n.station_cap - 1)} more`)
  if (n.station_rate > 1) parts.push(`station ${pct(n.station_rate - 1)} faster`)
  return parts.join(' · ')
}

export function BottegaCard({ state, now }: { state: GameState; now: number }) {
  const game = useGame()
  const prof = state.profession
  const w = prof?.workshop
  if (!prof || !w) return null
  const p = prof.progress
  const building = w.building
  const left = building ? Math.max(0, building.ready_at - now) : 0
  const next = w.next
  const canAfford = next ? state.player.gold >= next.cost.gold && next.cost.items.every((i) => i.have >= i.quantity) : false
  const skilled = next ? p.skill >= next.needs_skill : false

  return (
    <section class="stack tight" data-testid="bottega">
      <h2>Workshop and upgrades</h2>
      <div class="card">
        <div class="row">
          <span class="grow">
            <strong data-testid="bottega-look">{w.look}</strong>
            <span class="muted small" style={{ display: 'block' }}>
              Level {w.level} of {w.max_level}{w.level > 1 ? ` · ${w.name}` : ''} · {w.slots} craft slots{w.craft_speed > 0 ? ` · crafts ${pct(w.craft_speed)} faster` : ''}
            </span>
          </span>
        </div>
        {p.at_cap && !building && (
          <p class="accent small" data-testid="bottega-capped">
            Your skill has reached {p.cap}, the most this bottega allows. Crafts give no XP until you build the {next?.name ?? 'next upgrade'}.
          </p>
        )}
        {w.kept_rank && <p class="muted small">You keep the rank you earned before upgrades existed. Build to give your bottega the look and the bonuses.</p>}
      </div>

      {building && (
        <div class="card" data-testid="bottega-building">
          <p><strong>{building.name}</strong>: {left > 0 ? `the builders need ${duration(left)} more.` : 'finished!'}</p>
          {left <= 0 && (
            <ActionButton
              action={() => session.workshopOpen()}
              after={(ok, r) => {
                if (!ok || !r.ok) return
                const d = r.data as { built: { name: string; look: string; progress: Parameters<typeof celebrate>[0] } }
                game.say(`Your ${d.built.name} is open! Your bottega is now a ${d.built.look.toLowerCase()}.`)
                celebrate(d.built.progress)
              }}
              testid="bottega-open"
            >
              Open your {building.name}
            </ActionButton>
          )}
        </div>
      )}

      {!building && next && (
        <div class="card" data-testid="bottega-next">
          <p>
            <strong>Next: {next.name}</strong>
            {next.opens_rank && <span class="accent"> · opens {next.opens_rank}</span>}
          </p>
          <p class="muted small">Becomes a {next.look.toLowerCase()} · {gives(next)} · builds in {duration(next.cost.seconds)}</p>
          <div class="stack tight">
            <div class="row small"><span class="grow">Ducats</span><span class={`num ${state.player.gold >= next.cost.gold ? 'ok' : 'muted'}`}><Coins n={next.cost.gold} /></span></div>
            {next.cost.items.map((i) => (
              <div class="row small" data-testid={`bottega-cost-${i.item_id}`}>
                <ItemIcon id={i.item_id} />
                <span class="grow">{i.name} <span class="muted">({i.guild})</span></span>
                <span class={`num ${i.have >= i.quantity ? 'ok' : 'muted'}`}>{Math.min(i.have, i.quantity)}/{i.quantity}</span>
              </div>
            ))}
          </div>
          {!skilled && <p class="muted small">The guild lets you build it from skill {next.needs_skill}. You are at {p.skill}.</p>}
          {skilled && !canAfford && <p class="muted small">Craft what you can, and buy the rest at the Mercato, on the Wanted board or from other crafters.</p>}
          <ActionButton
            action={() => session.workshopUpgrade()}
            success={`The builders are at work on your ${next.name}.`}
            disabled={!skilled || !canAfford}
            testid="bottega-build"
          >
            Build the {next.name}
          </ActionButton>
        </div>
      )}
      {!building && !next && <p class="ok small">The finest bottega in Portovela.</p>}
    </section>
  )
}
