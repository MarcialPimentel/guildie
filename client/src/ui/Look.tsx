// Your merchant's look (0.10.0): a flat portrait of the blob (drawn in SVG, so it shows on every device
// without the 3D engine) and the pickers for body color and hat. Used when joining a guild and in the
// "Your look" sheet of the 3D city. The look is cosmetic; the server only stores two small numbers.
import { BODY_COLORS, BODY_COLOR_NAMES, HAT_NAMES, RANK_NAMES, SASH_COLORS } from '../world/looks'
import type { ProfessionId } from '../world/types'

const INK = '#2B2A33'

function Hat({ guild, hat }: { guild: ProfessionId; hat: number }) {
  const k = `${guild}:${hat}`
  switch (k) {
    case 'blacksmith:0': return <g><rect x="33" y="10" width="54" height="30" rx="12" fill="#B83A3A" stroke={INK} stroke-width="3" transform="rotate(-6 60 25)" /></g>
    case 'blacksmith:1': return <g><path d="M20 62 Q20 18 60 18 Q100 18 100 62 L92 62 Q90 30 60 30 Q30 30 28 62 Z" fill="#5A3A28" stroke={INK} stroke-width="3" /><rect x="28" y="36" width="64" height="8" rx="4" fill="#7A5233" /></g>
    case 'blacksmith:2': return <g><path d="M24 44 Q26 16 60 16 Q94 16 96 44 Z" fill="#B83A3A" stroke={INK} stroke-width="3" /><circle cx="99" cy="36" r="7" fill="#B83A3A" stroke={INK} stroke-width="2.5" /></g>
    case 'alchemist:0': return <g><path d="M30 34 L62 -22 L90 34 Z" fill="#2A4C9A" stroke={INK} stroke-width="3" stroke-linejoin="round" /><ellipse cx="60" cy="34" rx="42" ry="7" fill="#2A4C9A" stroke={INK} stroke-width="3" /><circle cx="63" cy="-22" r="6" fill="#F2C53D" stroke={INK} stroke-width="2" /></g>
    case 'alchemist:1': return <g><ellipse cx="60" cy="16" rx="34" ry="14" fill="#2A4C9A" stroke={INK} stroke-width="3" /><rect x="32" y="20" width="56" height="16" rx="4" fill="#2A4C9A" stroke={INK} stroke-width="3" /><circle cx="60" cy="4" r="5" fill="#F2C53D" /></g>
    case 'alchemist:2': return <g><path d="M18 70 Q16 14 60 14 Q104 14 102 70 L92 70 Q90 30 60 30 Q30 30 28 70 Z" fill="#1F8A87" stroke={INK} stroke-width="3" /><circle cx="60" cy="12" r="5" fill="#F2C53D" /></g>
    case 'leatherworker:0': return <g><ellipse cx="60" cy="34" rx="56" ry="9" fill="#E3C27A" stroke={INK} stroke-width="3" /><rect x="38" y="8" width="44" height="26" rx="8" fill="#E3C27A" stroke={INK} stroke-width="3" /><rect x="38" y="24" width="44" height="7" fill="#A9492A" /></g>
    case 'leatherworker:1': return <g><ellipse cx="64" cy="26" rx="40" ry="14" fill="#4E6F2C" stroke={INK} stroke-width="3" /><path d="M86 22 Q104 0 112 -12" stroke="#F3D27A" stroke-width="6" stroke-linecap="round" fill="none" /></g>
    case 'leatherworker:2': return <g><path d="M26 42 Q28 16 60 16 Q92 16 94 42 Z" fill="#A9492A" stroke={INK} stroke-width="3" /><rect x="46" y="38" width="30" height="6" rx="3" fill="#A9492A" stroke={INK} stroke-width="2" /></g>
  }
  return null
}

function Dress({ guild }: { guild: ProfessionId }) {
  if (guild === 'blacksmith') return <g><rect x="38" y="74" width="44" height="54" rx="5" fill="#4B3A2E" /><path d="M40 76 L44 50 M80 76 L76 50" stroke="#4B3A2E" stroke-width="5" /></g>
  if (guild === 'alchemist') return <rect x="16" y="84" width="88" height="60" fill="#1F8A87" />
  return <rect x="16" y="68" width="88" height="76" fill="#4E6F2C" />
}

/** A front view of a merchant: guild dress and hat, body color, and a rank sash. */
export function Portrait({ guild, color, hat, rank = 0, size = 96 }: { guild: ProfessionId; color: number; hat: number; rank?: number; size?: number }) {
  const body = BODY_COLORS[((color % 6) + 6) % 6]
  const sash = SASH_COLORS[rank] ?? null
  const id = `body-${guild}-${color}-${hat}-${rank}`
  return (
    <svg class="portrait" viewBox="0 -30 120 172" width={size} height={(size * 172) / 120} role="img" aria-label={`${HAT_NAMES[guild][hat]}, ${BODY_COLOR_NAMES[color]} merchant${rank ? `, ${RANK_NAMES[rank]} sash` : ''}`}>
      <defs><clipPath id={id}><rect x="20" y="30" width="80" height="104" rx="40" /></clipPath></defs>
      <ellipse cx="44" cy="136" rx="14" ry="7" fill="#5A3A28" />
      <ellipse cx="76" cy="136" rx="14" ry="7" fill="#5A3A28" />
      <rect x="20" y="30" width="80" height="104" rx="40" fill={body} />
      <g clip-path={`url(#${id})`}>
        <Dress guild={guild} />
        {sash && <path d="M10 60 L110 116 L110 132 L10 76 Z" fill={sash} />}
      </g>
      <rect x="20" y="30" width="80" height="104" rx="40" fill="none" stroke={INK} stroke-width="3" />
      <circle cx="48" cy="62" r="4.5" fill={INK} />
      <circle cx="72" cy="62" r="4.5" fill={INK} />
      <ellipse cx="38" cy="72" rx="6" ry="3.5" fill="#E98A86" />
      <ellipse cx="82" cy="72" rx="6" ry="3.5" fill="#E98A86" />
      <circle cx="12" cy="96" r="10" fill={body} stroke={INK} stroke-width="3" />
      <circle cx="108" cy="96" r="10" fill={body} stroke={INK} stroke-width="3" />
      <Hat guild={guild} hat={hat} />
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

/** The three hats of a guild. */
export function HatPicker({ guild, hat, onChange, testid = 'look-hat' }: { guild: ProfessionId; hat: number; onChange: (h: number) => void; testid?: string }) {
  return (
    <div class="hat-picks" role="radiogroup" aria-label="Hat">
      {HAT_NAMES[guild].map((name, i) => (
        <button type="button" class={`chip${i === hat ? ' on' : ''}`} role="radio" aria-checked={i === hat} onClick={() => onChange(i)} data-testid={`${testid}-${i}`}>
          {name}
        </button>
      ))}
    </div>
  )
}
