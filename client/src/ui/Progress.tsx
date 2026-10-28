// Skill and rank (#30): the header line ("Blacksmith 37/100 · Journeyman") with its XP bar, the message after a
// collect or a filled order ("+24 XP · skill 12 → 13"), and the rank-up moment. The server works it all out.
import { useEffect, useState } from 'preact/hooks'
import type { Colour, GameState, ProgressGain } from '../types'

/** "Blacksmith 37/100 · Journeyman" with the XP toward the next level, a row under the header. */
export function SkillLine({ state }: { state: GameState }) {
  const prof = state.profession
  if (!prof?.progress) return null
  const p = prof.progress
  return (
    <div class="header-skill">
      <span class="grow" data-testid="skill">{prof.name} {p.skill}/{p.max_skill} · {p.rank}</span>
      <span class="num" data-testid="xp-text" title={p.next_rank ? `${p.next_rank.name} at skill ${p.next_rank.at}` : 'The highest rank'}>
        {p.xp_needed > 0 ? `${p.xp} / ${p.xp_needed} XP` : 'Mastered'}
      </span>
    </div>
  )
}

export function XpBar({ state }: { state: GameState }) {
  const p = state.profession?.progress
  if (!p) return null
  const pct = p.xp_needed > 0 ? Math.min(100, (100 * p.xp) / p.xp_needed) : 100
  const label = (p.xp_needed > 0 ? `${p.xp} / ${p.xp_needed} XP to skill ${p.skill + 1}` : 'Mastered')
    + (p.next_rank ? ` · ${p.next_rank.name} at ${p.next_rank.at}` : '')
  return (
    <div class="xpbar" title={label} role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} data-testid="xp-bar">
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

/** The colour chip and XP per craft, as on a recipe card. */
export function XpChip({ colour, xp, trade }: { colour: Colour; xp: number; trade?: boolean }) {
  const tip = colour === 'grey' ? 'Too easy now: no XP' : `${trimXp(xp)} XP per craft${trade ? ', +25% for using another guild’s goods' : ''}`
  return (
    <span class={`xp-chip ${colour}`} title={tip} data-testid="xp-chip">
      {colour === 'grey' ? 'no XP' : `+${trimXp(xp)} XP`}{trade && colour !== 'grey' ? ' ⇄' : ''}
    </span>
  )
}

function trimXp(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** One line for the message bar: "+50 XP (first craft today: double) · skill 1 → 4 · first Healing Draught". */
export function gainText(g: ProgressGain | null | undefined): string {
  if (!g) return ''
  const parts: string[] = []
  if (g.xp > 0) parts.push(`+${g.xp} XP${g.doubled ? ' (first craft today: double)' : ''}`)
  if (g.skill_to > g.skill_from) parts.push(`skill ${g.skill_from} → ${g.skill_to}`)
  if (g.discoveries?.length) parts.push(`first ${g.discoveries.join(', ')}: +1 skill`)
  if (g.unlocked?.length) parts.push(`your station now yields ${g.unlocked.join(', ')}`)
  if (g.taught) parts.push(`learned the rare recipe ${g.taught}!`)
  return parts.join(' · ')
}

// ---------------------------------------------------------------- the rank-up moment

type Listener = (g: ProgressGain) => void
const listeners = new Set<Listener>()

/** Show the rank-up dialog if a gain reached a new rank. */
export function celebrate(g: ProgressGain | null | undefined): void {
  if (g?.rank_up) listeners.forEach((fn) => fn(g))
}

const RANK_NOTES: Record<string, string> = {
  Journeyman: 'Customers now bring bundle orders that ask for another guild’s goods too, and pay more.',
  Expert: 'The trainer opens the Expert recipes.',
  Master: 'The trainer opens the Master recipes.',
}

export function RankUp({ profession }: { profession: string }) {
  const [gain, setGain] = useState<ProgressGain | null>(null)
  useEffect(() => {
    const fn: Listener = (g) => setGain(g)
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])
  if (!gain?.rank_up) return null
  const close = () => setGain(null)
  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && close()} data-testid="rank-up">
      <div class="card rank-up" role="dialog" aria-label={`You are now a ${gain.rank_up}`}>
        <p class="tiny muted center">The {profession} guild is proud to name you</p>
        <h1 class="center">{gain.rank_up}</h1>
        <p class="center">{profession} skill {gain.skill_to}</p>
        <ul class="small">
          {gain.learned.map((r) => <li>The guild taught you <b>{r}</b>, free.</li>)}
          {gain.unlocked.map((r) => <li>Your station now yields <b>{r}</b>.</li>)}
          {RANK_NOTES[gain.rank_up] && <li>{RANK_NOTES[gain.rank_up]}</li>}
          <li>New recipes are waiting at the guild trainer.</li>
        </ul>
        <button onClick={close} data-testid="rank-up-close">Onward!</button>
      </div>
    </div>
  )
}
