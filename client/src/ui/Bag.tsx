// Bag: everything you own, with today's market value, and a Sell button per item.
import { Coins, ItemIcon } from './art'
import { useSession } from '../session'
import { useGame } from './common'
import { QualityTag } from './Quality'

export function Bag() {
  const s = useSession()
  const game = useGame()
  const items = s.state!.inventory
  const total = items.reduce((sum, i) => sum + i.quantity * i.reference, 0)

  return (
    <section class="stack" data-testid="bag">
      <h1>Your bag</h1>
      {items.length === 0 && <p class="muted">Empty. Collect from your station in your Bottega.</p>}
      {items.length > 0 && (
        <div class="card tight">
          {items.map((item) => (
            <div class="list-row" data-testid={`bag-${item.item_id}${item.quality > 1 ? `-q${item.quality}` : ''}`}>
              <ItemIcon id={item.item_id} />
              <span class="grow">{item.name}<QualityTag q={item.quality} /></span>
              <span class="num">× {item.quantity}</span>
              <span class="col-num muted small num">~<Coins n={item.quantity * item.reference} /></span>
              <button class="secondary small" onClick={() => game.openTab('market', { sellItem: item.item_id, sellQty: item.quantity, sellQuality: item.quality })}>
                Sell
              </button>
            </div>
          ))}
        </div>
      )}
      <p class="muted small">
        Estimated value: <Coins n={total} /> (at reference prices). Sell lets you list it at the Mercato or sell it to the guild instantly.
      </p>
      <button class="secondary" onClick={() => game.openTab('market', { market: 'sell' })}>Sell at the Mercato</button>
    </section>
  )
}
