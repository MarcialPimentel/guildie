// Bottega (the Workshop tab): the 30-second check-in (GDD 4.1, #39). Collect from the station, collect crafts, queue new crafts
// and see what happened, all on one screen. On desktop the recipes sit in a second column.
import { useState } from 'preact/hooks'
import { ago, CLIENT_BUILD, duration, trimNumber } from '../format'
import { Coins, ItemIcon } from './art'
import { session, useSession } from '../session'
import type { GameState, ProgressGain, Recipe } from '../types'
import type { ApiResult } from '../api'
import { ActionButton, Stepper, useGame, useNow } from './common'
import { Orders } from './Orders'
import { celebrate, gainText, XpChip } from './Progress'
import { Trainer } from './Trainer'

export function Workshop() {
  const s = useSession()
  const state = s.state!
  const now = useNow()

  return (
    <div class="cols">
      <div class="stack">
        <Station state={state} now={now} />
        <Orders />
        <Crafts state={state} now={now} />
        <Ledger state={state} now={now} />
      </div>
      <Recipes state={state} />
    </div>
  )
}

/** Recent activity, the build numbers and Log out (the 3D view shows this at the bottega door). */
export function Ledger({ state, now }: { state: GameState; now: number }) {
  const s = useSession()
  return (
    <>
      <section class="stack tight">
        <h2>Recent activity</h2>
        {state.activity.length === 0 && <p class="muted">Nothing yet.</p>}
        {state.activity.slice(0, 12).map((a) => (
          <div class="row">
            <p class={`grow small ${a.type === 'surprise' ? 'surprise' : ['sold', 'sold_to_guild', 'trade_done', 'order_filled'].includes(a.type) ? 'ok' : ''}`}>{a.text}</p>
            <span class="tiny muted num">{ago(now - a.created_at).replace(' ago', '')}</span>
          </div>
        ))}
      </section>
      <p class="center tiny muted" data-testid="footer">Client {CLIENT_BUILD} · Server {s.serverBuild}</p>
      <button class="secondary small" onClick={() => session.logout()} data-testid="logout">Log out</button>
    </>
  )
}

/** After a collect: show any surprises (#48) and the XP and skill gained (#30) instead of the plain success message. */
function useSurpriseMessage() {
  const game = useGame()
  return (ok: boolean, r: ApiResult<unknown>) => {
    if (!ok || !r.ok) return
    const data = r.data as { surprises?: { text: string }[]; progress?: ProgressGain | null }
    const parts = [...(data.surprises ?? []).map((x) => x.text), gainText(data.progress)].filter(Boolean)
    if (parts.length) game.say(parts.join(' · '))
    celebrate(data.progress)
  }
}

export function Station({ state, now }: { state: GameState; now: number }) {
  const station = state.profession!.station
  const onCollected = useSurpriseMessage()
  // The server sent counts at server_time; estimate what has been produced since (the server decides on collect).
  const since = Math.max(0, now - state.server_time)
  let anyReady = false
  return (
    <section class="card" data-testid="station">
      <h2>{station.name}</h2>
      {station.outputs.map((out) => {
        const estimate = Math.min(out.cap, out.ready + Math.floor((since * out.rate_per_hour) / 3600))
        const full = estimate >= out.cap
        anyReady ||= estimate > 0
        const left = out.seconds_to_full - since
        return (
          <div class="stack tight">
            <div class="row">
              <ItemIcon id={out.item_id} />
              <span class="grow">{out.name}</span>
              <span class={`num ${full ? 'error' : 'accent'}`} style={{ fontSize: '20px' }}>{estimate} / {out.cap}</span>
            </div>
            <p class={`small ${full ? 'error' : 'muted'}`}>
              {full
                ? 'Full: production is paused until you collect.'
                : `${trimNumber(out.rate_per_hour)}/hour · full in ${left <= 0 ? 'now' : duration(left)}`}
            </p>
          </div>
        )
      })}
      {(station.locked ?? []).map((l) => (
        <div class="row muted" data-testid="station-locked">
          <ItemIcon id={l.item_id} />
          <span class="grow small">{l.name}: yours to gather from skill {l.unlock_skill}.</span>
        </div>
      ))}
      <ActionButton action={() => session.collectStation()} success="Collected." after={onCollected} disabled={!anyReady} testid="collect-station">
        Collect
      </ActionButton>
    </section>
  )
}

export function Crafts({ state, now }: { state: GameState; now: number }) {
  const crafts = state.crafts
  const onCollected = useSurpriseMessage()
  const anyDone = crafts.some((c) => c.ends_at <= now)
  return (
    <section class="card" data-testid="crafts">
      <div class="row">
        <h2 class="grow">Crafting</h2>
        <span class="muted small">{crafts.length} / {state.craft_slots} slots</span>
      </div>
      {crafts.length === 0 && <p class="muted">Nothing crafting. Pick a recipe{window.innerWidth >= 900 ? ' on the right' : ' below'}.</p>}
      {crafts.map((job) => (
        <div class="row">
          <ItemIcon id={job.item_id ?? job.recipe_id} />
          <span class="grow">{job.name} ×{job.quantity}</span>
          <span class="ok num">{job.ends_at <= now ? 'Ready!' : duration(job.ends_at - now)}</span>
        </div>
      ))}
      {crafts.length > 0 && (
        <ActionButton action={() => session.collectCrafts()} success="Crafts collected." after={onCollected} disabled={!anyDone} testid="collect-crafts">
          Collect finished crafts
        </ActionButton>
      )}
    </section>
  )
}

/** Your recipes, or the guild trainer (#49) in their place. */
export function Recipes({ state }: { state: GameState }) {
  const [trainer, setTrainer] = useState(false)
  const free = state.craft_slots - state.crafts.length
  const progress = state.profession!.progress
  return (
    <section class="stack" data-testid="recipes">
      <div class="row">
        <h2 class="grow">{trainer ? 'Guild trainer' : 'Recipes'}</h2>
        {!trainer && <span class={`small ${free > 0 ? 'ok' : 'error'}`}>{free} free slot{free === 1 ? '' : 's'}</span>}
        <button class="secondary small" onClick={() => setTrainer(!trainer)} data-testid={trainer ? 'trainer-close' : 'trainer-open'}>
          {trainer ? '‹ Your recipes' : 'Guild trainer'}
        </button>
      </div>
      {trainer ? <Trainer /> : <>
        {progress?.first_craft_bonus && (
          <p class="small surprise" data-testid="double-xp">Your first finished craft today pays double XP.</p>
        )}
        {state.profession!.recipes.map((r) => <RecipeCard recipe={r} slotFree={free > 0} maxBatch={state.max_batch} />)}
        <p class="npc small">Blue inputs come from other guilds: buy them at the Mercato. Recipes that use them give +25% XP (⇄).</p>
        <p class="muted small">
          Easy recipes give less XP as your skill grows: orange full, yellow 60%, green 20%, grey none.
          Learn new ones from the <button class="link inline" onClick={() => setTrainer(true)}>guild trainer</button>.
        </p>
      </>}
    </section>
  )
}

function RecipeCard({ recipe, slotFree, maxBatch }: { recipe: Recipe; slotFree: boolean; maxBatch: number }) {
  const limit = Math.max(1, Math.min(recipe.can_make, maxBatch))
  const [chosen, setChosen] = useState(1)
  const qty = Math.min(Math.max(1, chosen), limit)
  const label = recipe.can_make === 0 ? 'Missing materials' : !slotFree ? 'No free slot' : `Craft ${qty}`

  return (
    <div class="card" data-testid={`recipe-${recipe.id}`}>
      <div class="row">
        <ItemIcon id={recipe.output?.item_id ?? recipe.id} big />
        <h3 class="grow">
          {recipe.name}
          {recipe.output?.quantity > 1 && <span class="muted small"> ×{recipe.output.quantity}</span>}
          {recipe.rare && <span class="tag rare">rare</span>}
          {!recipe.discovered && <span class="tag" title="Your first craft of a recipe gives +1 skill">new: +1 skill</span>}
        </h3>
        <XpChip colour={recipe.colour} xp={recipe.xp_each} trade={recipe.trade_bonus} />
      </div>
      <p class="muted small">value ~<Coins n={recipe.value} /> · skill {recipe.skill}</p>
      {recipe.inputs.map((input) => (
        <div class="row">
          <span class={`grow ${input.from_other_profession ? 'npc' : ''}`}>{input.quantity} × {input.name}</span>
          <span class={`small ${input.have >= input.quantity ? 'ok' : 'error'}`}>have {input.have}</span>
        </div>
      ))}
      <div class="row wrap">
        <Stepper value={qty} min={1} max={limit} onChange={setChosen} />
        <button class="secondary small" disabled={recipe.can_make <= 1} onClick={() => setChosen(limit)}>Max</button>
        <span class="grow right muted small">{duration(recipe.seconds_each * qty)}</span>
      </div>
      <ActionButton
        action={() => session.startCraft(recipe.id, qty)}
        success={`Started ${qty} × ${recipe.name}.`}
        disabled={recipe.can_make === 0 || !slotFree}
        testid={`craft-${recipe.id}`}
      >
        {label}
      </ActionButton>
    </div>
  )
}
