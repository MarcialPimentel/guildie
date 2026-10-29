// Your merchant's look (0.10.0): a flat portrait of the blob (drawn in SVG, so it shows on every device
// without the 3D engine) and the pickers for body color and hat. Used when joining a guild and in the
// "Your look" sheet of the 3D city. The look is cosmetic; the server only stores two small numbers.
import { guild as guildOf } from '../guilds'
import { BODY_COLORS, BODY_COLOR_NAMES, RANK_NAMES, SASH_COLORS } from '../world/looks'
import type { PortraitKit } from './portraits/kit'

const INK = '#2B2A33'

// Each guild's dress and hats, from ui/portraits/<kit>.tsx (the kit is named in content/professions.json).
const KITS: Record<string, PortraitKit> = Object.fromEntries(
  Object.entries(import.meta.glob<PortraitKit>('./portraits/*.tsx', { eager: true, import: 'default' }))
    .map(([path, kit]) => [path.slice(path.lastIndexOf('/') + 1, -4), kit]),
)
/** A guild without a portrait kit gets a plain grey smock and no hat, never a crash. */
const PLAIN: PortraitKit = { dress: <rect x="16" y="76" width="88" height="68" fill="#8A8F96" />, hats: [] }
const kitOf = (guild: string) => KITS[guildOf(guild).kit] ?? PLAIN

/** A guild's hat names (content/professions.json), in the order the server stores the hat index. */
export const hatNames = (guild: string): string[] => guildOf(guild).hats

/** A front view of a merchant: guild dress and hat, body color, and a rank sash. */
export function Portrait({ guild, color, hat, rank = 0, size = 96 }: { guild: string; color: number; hat: number; rank?: number; size?: number }) {
  const body = BODY_COLORS[((color % 6) + 6) % 6]
  const sash = SASH_COLORS[rank] ?? null
  const id = `body-${guild}-${color}-${hat}-${rank}`
  const kit = kitOf(guild)
  const hatName = hatNames(guild)[hat] ?? 'Cap'
  return (
    <svg class="portrait" viewBox="0 -30 120 172" width={size} height={(size * 172) / 120} role="img" aria-label={`${hatName}, ${BODY_COLOR_NAMES[color]} merchant${rank ? `, ${RANK_NAMES[rank]} sash` : ''}`}>
      <defs><clipPath id={id}><rect x="20" y="30" width="80" height="104" rx="40" /></clipPath></defs>
      <ellipse cx="44" cy="136" rx="14" ry="7" fill="#5A3A28" />
      <ellipse cx="76" cy="136" rx="14" ry="7" fill="#5A3A28" />
      <rect x="20" y="30" width="80" height="104" rx="40" fill={body} />
      <g clip-path={`url(#${id})`}>
        {kit.dress}
        {sash && <path d="M10 60 L110 116 L110 132 L10 76 Z" fill={sash} />}
      </g>
      <rect x="20" y="30" width="80" height="104" rx="40" fill="none" stroke={INK} stroke-width="3" />
      <circle cx="48" cy="62" r="4.5" fill={INK} />
      <circle cx="72" cy="62" r="4.5" fill={INK} />
      <ellipse cx="38" cy="72" rx="6" ry="3.5" fill="#E98A86" />
      <ellipse cx="82" cy="72" rx="6" ry="3.5" fill="#E98A86" />
      <circle cx="12" cy="96" r="10" fill={body} stroke={INK} stroke-width="3" />
      <circle cx="108" cy="96" r="10" fill={body} stroke={INK} stroke-width="3" />
      {kit.hats[hat] && <g data-testid="portrait-hat">{kit.hats[hat]}</g>}
    </svg>
  )
}

/** Six body color swatches. */
export function ColorPicker({ color, onChange }: { color: number; onChange: (c: number) => void }) {
  return (
    <div class="swatches" role="radiogroup" aria-label="Body color">
      {BODY_COLORS.map((c, i) => (
        <button type="button" class="swatch" role="radio" aria-checked={i === color} aria-label={BODY_COLOR_NAMES[i]} title={BODY_COLOR_NAMES[i]}
          style={{ background: c }} onClick={() => onChange(i)} data-testid={`look-color-${i}`} />
      ))}
    </div>
  )
}

/** A guild's hats. */
export function HatPicker({ guild, hat, onChange, testid = 'look-hat' }: { guild: string; hat: number; onChange: (h: number) => void; testid?: string }) {
  return (
    <div class="hat-picks" role="radiogroup" aria-label="Hat">
      {hatNames(guild).map((name, i) => (
        <button type="button" class={`chip${i === hat ? ' on' : ''}`} role="radio" aria-checked={i === hat} onClick={() => onChange(i)} data-testid={`${testid}-${i}`}>
          {name}
        </button>
      ))}
    </div>
  )
}
