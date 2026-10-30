// The guild trainer (#49): every recipe of your guild, the skill it needs, its price, its XP at your skill, and which
// other guild's goods it uses, so you can build around your trade partners. Rare recipes only come from customers.
// Shown inside the Recipes section (the Bottega in the classic view, the workbench panel in the 3D harbor).
import { duration } from '../format'
import { Coins, ItemIcon } from './art'
import { session } from '../session'
import type { TrainerRecipe } from '../types'
import { ActionButton, useGame, useLoad } from './common'
import { XpChip } from './Progress'

export function Trainer() {
  const game = useGame()
  const [data, reload] = useLoad(() => session.trainer(), [], true)
  if (!data) return <p class="muted" data-testid="trainer">Finding the guild trainer…</p>

  return (
    <div class="stack" data-testid="trainer">
      <div class="card tight">
        <h3>{data.trainer}</h3>
        <p class="muted small">
          “Choose well: you can't learn everything at once.” You have skill {data.skill} and <Coins n={data.gold} />.
          A free recipe comes with each new rank; rare ones come only from customers.
        </p>
      </div>
      {data.recipes.map((r) => <Lesson recipe={r} gold={data.gold} after={reload} say={game.say} />)}
    </div>
  )
}

function Lesson({ recipe: r, gold, after, say }: { recipe: TrainerRecipe; gold: number; after: () => void; say: (t: string, e?: boolean) => void }) {
  return (
    <div class={`card tight lesson ${r.status}`} data-testid={`lesson-${r.id}`}>
      <div class="row">
        <ItemIcon id={r.output.item_id} />
        <h3 class="grow">
          {r.name}
          {r.rare && <span class="tag rare">rare</span>}
          {r.starter && <span class="tag">free at {r.rank}</span>}
        </h3>
        {r.status !== 'rare' && <XpChip colour={r.colour} xp={r.xp_each} trade={r.imports_from.length > 0} />}
      </div>
      <p class="small">
        {r.inputs.map((i, n) => (
          <>{n > 0 && ' + '}<span class={i.guild ? 'npc' : ''}>{i.quantity} {i.name}</span></>
        ))}
        {' → '}{r.output.quantity > 1 ? `${r.output.quantity} ` : ''}{r.output.name}
        <span class="muted"> · {duration(r.seconds_each)} · worth ~<Coins n={r.value} /></span>
      </p>
      {r.imports_from.length > 0 && (
        <p class="tiny npc">Uses {r.imports_from.join(' and ')} goods: buy or trade for them. +25% XP.</p>
      )}
      <div class="row">
        <span class="grow small muted">{r.rank} · skill {r.skill}</span>
        {r.status === 'known' && <span class="ok small" data-testid="known">Known</span>}
        {r.status === 'locked' && <span class="small error" data-testid="locked">Learn from skill {r.skill}</span>}
        {r.status === 'rare' && <span class="small muted">Only a customer can teach this</span>}
        {r.status === 'learn' && (
          <ActionButton
            class="small"
            disabled={gold < r.price}
            action={() => session.learnRecipe(r.id)}
            after={(ok) => { if (ok) { say(`Learned ${r.name}. It's on your workbench now.`); after() } }}
            testid={`learn-${r.id}`}
          >
            {gold < r.price ? <>Needs <Coins n={r.price} /></> : <>Learn for <Coins n={r.price} /></>}
          </ActionButton>
        )}
      </div>
    </div>
  )
}
