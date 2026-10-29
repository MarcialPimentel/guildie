// The order board (#44): named customers in the Workshop who want specific items before a deadline.
// Filling an order hands over the items and pays more than the market (sometimes with a rare material).
import { useMemo } from 'preact/hooks'
import { duration } from '../format'
import { Coins, ItemIcon } from './art'
import { session, useSession } from '../session'
import { worldEvents } from '../worldEvents'
import type { Order, ProgressGain } from '../types'
import { ActionButton, useGame, useLoad, useNow } from './common'
import { celebrate, gainText } from './Progress'

export function Orders() {
  const s = useSession()
  const game = useGame()
  const now = useNow()
  // Reload when the bag changes (so "have" counts stay right) and on every background refresh.
  const bagKey = JSON.stringify(s.state?.inventory.map((i) => [i.item_id, i.quantity]) ?? [])
  const [board, reload] = useLoad(() => session.orders(), [bagKey], true)
  // Server time when the board data arrived, so countdowns tick between refreshes.
  const loadedAt = useMemo(() => session.now(), [board])

  if (!board) return <section class="card" data-testid="orders"><h2>Orders</h2><p class="muted">Checking the order board…</p></section>
  const elapsed = Math.max(0, now - loadedAt)
  const skipIn = Math.max(0, board.skip_in - elapsed)

  return (
    <section class="stack tight" data-testid="orders">
      <div class="row">
        <h2 class="grow">Orders</h2>
        <span class="tiny muted">{skipIn > 0 ? `next skip in ${duration(skipIn)}` : 'customers pay more than the market'}</span>
      </div>
      {board.orders.map((o) => (
        <OrderCard order={o} elapsed={elapsed} skipIn={skipIn} after={reload} say={game.say} />
      ))}
    </section>
  )
}

function OrderCard({ order, elapsed, skipIn, after, say }: {
  order: Order; elapsed: number; skipIn: number; after: () => void; say: (t: string, e?: boolean) => void
}) {
  const arriving = order.arriving_in - elapsed
  if (arriving > 0) {
    return (
      <div class="card tight order" data-testid="order-arriving">
        <p class="muted small">A new customer arrives in {duration(arriving)}.</p>
      </div>
    )
  }
  const left = order.seconds_left - elapsed
  const ready = order.items.every((i) => i.have >= i.quantity)

  return (
    <div class={`card tight order ${order.kind}`} data-testid="order">
      <div class="row">
        <h3 class="grow ink">
          {order.customer}
          {order.kind === 'collector' && <span class="tag collector">collector</span>}
          {order.kind === 'bundle' && <span class="tag bundle">bundle</span>}
        </h3>
        <span class={`tiny ${left < 1800 ? 'error' : 'muted'}`}>{left > 0 ? `${duration(left)} left` : 'leaving…'}</span>
      </div>
      <p class="muted small">{order.line}</p>
      {order.items.map((i) => (
        <div class="row">
          <ItemIcon id={i.item_id} />
          <span class={`grow ${i.own_guild ? '' : 'npc'}`}>{i.quantity} × {i.name}</span>
          <span class={`small ${i.have >= i.quantity ? 'ok' : 'error'}`}>have {i.have}</span>
        </div>
      ))}
      <p class="small">
        Pays <span class="accent"><Coins n={order.reward_gold} /></span>
        {order.reward_items.map((r) => <> + <span class="surprise">{r.quantity} {r.name}</span></>)}
        {order.reward_xp > 0 && <> + <span class="accent" data-testid="order-xp">{order.reward_xp} XP</span></>}
      </p>
      {order.reward_recipe && (
        <p class="small surprise" data-testid="order-recipe">
          …and teaches you a rare recipe: {order.reward_recipe.name} ({order.reward_recipe.quantity > 1 ? `${order.reward_recipe.quantity} ` : ''}{order.reward_recipe.output} per craft).
        </p>
      )}
      <div class="btnrow">
        <ActionButton
          class="small"
          disabled={!ready}
          action={() => session.orderFill(order.id)}
          after={(ok, r) => {
            if (ok && r.ok) {
              const d = r.data as { filled?: { customer: string; reward_text: string; progress?: ProgressGain } }
              if (d.filled) {
                worldEvents.emit({ t: 'orderFilled', order: order.id, text: `+${d.filled.reward_text}` })
                const gain = gainText(d.filled.progress)
                say(`${d.filled.customer} paid ${d.filled.reward_text}.${gain ? ` ${gain}` : ''}`)
                celebrate(d.filled.progress)
              }
            }
            after()
          }}
          testid="order-fill"
        >
          {ready ? 'Fill order' : 'Missing items'}
        </ActionButton>
        <ActionButton class="secondary small" disabled={skipIn > 0} action={() => session.orderSkip(order.id)} success="Order turned down. A new customer is here." after={(ok) => { if (ok) worldEvents.emit({ t: 'orderTurnedDown', order: order.id }); after() }} testid="order-skip">
          Turn down
        </ActionButton>
      </div>
    </div>
  )
}
