// Quality tiers (0.18.0, #79, GDD 5.2): Common, Fine, Masterwork. The server decides quality; these only show it.
import economy from '../../../content/economy.json'

const NAMES: string[] = economy.quality.names

export function qualityName(q: number): string {
  return NAMES[q - 1] ?? NAMES[0]
}

/** "Fine Iron Sword"; Common goods keep their plain name. */
export function withQuality(name: string, q: number): string {
  return q > 1 ? `${qualityName(q)} ${name}` : name
}

/** A small badge for Fine and Masterwork goods; nothing for Common, so most rows look as before. */
export function QualityTag({ q }: { q: number }) {
  if (q <= 1) return null
  return <span class={`tag q${q}`} data-testid={`quality-${q}`}>{qualityName(q)}</span>
}

/** What a recipe makes at your skill: "Makes Common · 10% Fine". */
export function qualityOdds(floor: number, up: number): string {
  const base = `Makes ${qualityName(floor)}`
  return up > 0 && floor < NAMES.length ? `${base} · ${Math.round(up * 100)}% ${qualityName(floor + 1)}` : base
}

/** "3 Fine, 1 Masterwork" from a collected batch's {quality: count}; empty when it's all Common. */
export function betterText(byQuality: Record<string, number> | undefined): string {
  if (!byQuality) return ''
  return Object.entries(byQuality)
    .filter(([q, n]) => Number(q) > 1 && n > 0)
    .map(([q, n]) => `${n} ${qualityName(Number(q))}`)
    .join(', ')
}
