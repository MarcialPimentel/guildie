// The new-player guide (0.14.0, systems.md 8.3, content/guide.json): one first step at a time, on a card that
// says what to do, with ducats to claim when it's done. The server checks every step and pays the ducats. The
// card also marks the page (body[data-guide]) so the button to press next pulses (styles.css), and in 3D the
// world shows an arrow over the place (World.tsx → engine.setGuide).
import { useEffect } from 'preact/hooks'
import { session, useSession } from '../session'
import type { GuideClaim, GuideStatus } from '../types'
import { Coins } from './art'
import { ActionButton, useGame } from './common'

/** What the guide points at right now: the step's id, 'claim' when it's ready, or '' when there's nothing. */
export function guideFocus(g: GuideStatus | undefined): string {
  if (!g || g.finished) return ''
  return g.step.ready ? 'claim' : g.step.id
}

export function GuideCard({ floating = false }: { floating?: boolean }) {
  const s = useSession()
  const game = useGame()
  const g = s.state?.guide
  const focus = s.state?.profession ? guideFocus(g) : ''

  useEffect(() => {
    if (focus) document.body.dataset.guide = focus
    else delete document.body.dataset.guide
    return () => { delete document.body.dataset.guide }
  }, [focus])

  if (!g || g.finished || !s.state?.profession) return null
  const st = g.step
  const last = g.index === g.total
  return (
    <section class={`guide card${st.ready ? ' ready' : ''}${floating ? ' floating' : ''}`} data-testid="guide" data-step={st.id} aria-live="polite">
      <div class="row">
        <span class="tiny muted grow">First steps · {g.index} of {g.total}</span>
        <span class="small">+<Coins n={st.reward} /></span>
      </div>
      <h3>{st.title}</h3>
      <p class="small">{st.ready ? 'Done! Claim your ducats.' : st.hint}</p>
      <div class="row">
        {st.ready && (
          <ActionButton
            action={() => session.guideClaim(st.id)}
            after={(ok, r) => {
              if (!ok || !r?.ok) return
              const d = r.data as GuideClaim
              game.say(d.finished ? `Guide finished! +${d.gold + d.final} ducats. Welcome to Portovela.` : `+${d.gold} ducats. Next: ${d.guide.finished ? '' : d.guide.step.title}.`)
            }}
            testid="guide-claim"
          >
            Claim <Coins n={st.reward} />{last ? <> + <Coins n={g.final_reward} /> purse</> : null}
          </ActionButton>
        )}
        {!st.ready && st.optional && (
          <ActionButton
            class="secondary small"
            action={() => session.guideSkip(st.id)}
            after={(ok, r) => { const d = r?.ok ? (r.data as GuideClaim) : null; if (ok && d?.finished) game.say(`Guide finished! +${d.final} ducats. Welcome to Portovela.`) }}
            testid="guide-skip"
          >
            Skip{last ? <> and take the <Coins n={g.final_reward} /> purse</> : null}
          </ActionButton>
        )}
      </div>
    </section>
  )
}
