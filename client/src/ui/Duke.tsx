// The Duke's order (0.9.0, systems.md 6.5): one city-wide order everyone works on, with a public board of
// helpers. Shown in the City tab (classic view), and at the Duke's lectern in the Palazzo.
// The server decides everything: what you may give, what you're paid, when it's fulfilled.
import { useState } from 'preact/hooks'
import { duration } from '../format'
import { session } from '../session'
import type { DukeLine } from '../types'
import { Coins, ItemIcon } from './art'
import { ActionButton, Stepper, useLoad } from './common'

export function DukeOrder() {
  const [board, reload] = useLoad(() => session.dukeOrder(), [], true)
  if (!board) return <p class="muted">The herald unrolls the scroll…</p>
  const fulfilled = board.status === 'fulfilled'
  return (
    <section class="stack" data-testid="duke">
      <div class="card">
        <h2>{board.title}</h2>
        <p class="muted small">{board.line}</p>
        <p class={fulfilled ? 'ok' : 'accent'} data-testid="duke-status">
          {fulfilled
            ? `Fulfilled, with thanks to ${board.helper_count} crafter${board.helper_count === 1 ? '' : 's'}. A new order in ${duration(board.seconds_left)}.`
            : `${duration(board.seconds_left)} left`}
        </p>
      </div>
      {board.lines.map((l) => <Line line={l} open={!fulfilled} shareOpenIn={board.share_open_in} maxShare={board.max_share} after={reload} />)}
      {!fulfilled && (
        <p class="muted small">
          You're paid at once for each item. If every line is filled in time, everyone who helped gets a bonus. To keep it a group effort,
          one crafter can give at most {Math.round(board.max_share * 100)}% of a line
          {board.share_open_in > 0 ? ` for the next ${duration(board.share_open_in)}; then anyone can finish it.` : '.'}
        </p>
      )}
      <h2>Those who helped</h2>
      {board.helpers.length === 0 && <p class="muted">Nobody yet. Be the first name on the Duke's board.</p>}
      {board.helpers.length > 0 && (
        <div class="card tight" data-testid="duke-helpers">
          {board.helpers.map((h, i) => (
            <div class={`list-row ${h.me ? 'helper-me' : ''}`}>
              <span class="col-rank num">{i + 1}</span>
              <span class="grow">{h.name}{h.me ? ' (you)' : ''}</span>
              <span class="muted small num">{h.items} item{h.items === 1 ? '' : 's'}</span>
              <span class="col-num num"><Coins n={h.value} /></span>
            </div>
          ))}
        </div>
      )}
      {(board.my_paid > 0 || board.my_bonus > 0) && (
        <p class="small">
          You've been paid <Coins n={board.my_paid} />{board.my_bonus > 0 && <> and a bonus of <Coins n={board.my_bonus} /></>}
          {board.my_rank ? ` · #${board.my_rank} on the board` : ''}.
        </p>
      )}
    </section>
  )
}

function Line({ line, open, shareOpenIn, maxShare, after }: { line: DukeLine; open: boolean; shareOpenIn: number; maxShare: number; after: () => void }) {
  const max = Math.min(line.have, line.can_give)
  const [qty, setQty] = useState(1)
  const n = Math.max(1, Math.min(qty, max))
  const pct = Math.min(100, Math.round((line.delivered / Math.max(1, line.goal)) * 100))
  const full = line.delivered >= line.goal
  return (
    <div class="card" data-testid={`duke-line-${line.item_id}`}>
      <div class="row">
        <ItemIcon id={line.item_id} />
        <span class="grow">
          <strong>{line.name}</strong>
          <span class="muted small" style={{ display: 'block' }}>{line.guild} · {line.delivered}/{line.goal}{line.mine ? ` · you gave ${line.mine}` : ''}</span>
        </span>
        <span class="small accent num"><Coins n={line.unit_pay} /> each</span>
      </div>
      <div class="bar" aria-label={`${pct}% filled`}><span style={{ width: `${pct}%` }} /></div>
      {open && !full && (
        line.have === 0
          ? <p class="muted small">You have none. {line.unit_bonus > 0 && <>Bonus on completion: <Coins n={line.unit_bonus} /> each.</>}</p>
          : line.can_give === 0
            ? <p class="muted small">You've given your share ({Math.round(maxShare * 100)}%){shareOpenIn > 0 ? `; anyone can finish it in ${duration(shareOpenIn)}` : ''}.</p>
            : (
              <div class="row wrap">
                <Stepper value={n} min={1} max={max} onChange={setQty} />
                <ActionButton
                  action={() => session.dukeContribute(line.item_id, n)}
                  success={`The Duke thanks you for ${n} ${line.name}.`}
                  after={(ok) => ok && after()}
                  testid={`duke-give-${line.item_id}`}
                >
                  Give {n} for <Coins n={n * line.unit_pay} />
                </ActionButton>
              </div>
            )
      )}
      {full && <p class="ok small">Line filled.</p>}
    </div>
  )
}
