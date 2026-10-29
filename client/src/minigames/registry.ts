// Minigames (0.15.0, systems.md 5.5): one screen per KIND of game. The server owns the rules (server/app/lib/
// minigame_<kind>.php); a screen only draws the round the server rolled and reports when the player tapped.
// To add a kind: write its screen here, register it below, and add its scorer on the server. Each guild picks a
// kind and a look (skin) in content/professions.json -> station.minigame, so a new profession needs no code.
import type { ComponentType } from 'preact'
import type { StationMinigame } from '../types'
import { Strike } from './Strike'

export interface MinigameScreenProps<Plan> {
  plan: Plan
  game: StationMinigame
  /** Called once with one entry per step: milliseconds after the step began, or null for no tap. */
  onDone: (taps: (number | null)[]) => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const minigameScreens: Record<string, ComponentType<MinigameScreenProps<any>>> = {
  strike: Strike,
}
