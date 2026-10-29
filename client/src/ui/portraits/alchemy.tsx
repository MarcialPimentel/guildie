// The alchemy kit's flat portrait parts (the Alchemist): the dress and the hats, drawn in SVG for the menus
// (ui/Look.tsx). One hat per hat name in content/professions.json, in the same order. The 3D kit is
// world/kits/alchemy.ts.
import { INK, type PortraitKit } from './kit'

const kit: PortraitKit = {
  dress: <rect x="16" y="84" width="88" height="60" fill="#1F8A87" />,
  hats: [
    <g><path d="M30 34 L62 -22 L90 34 Z" fill="#2A4C9A" stroke={INK} stroke-width="3" stroke-linejoin="round" /><ellipse cx="60" cy="34" rx="42" ry="7" fill="#2A4C9A" stroke={INK} stroke-width="3" /><circle cx="63" cy="-22" r="6" fill="#F2C53D" stroke={INK} stroke-width="2" /></g>,
    <g><ellipse cx="60" cy="16" rx="34" ry="14" fill="#2A4C9A" stroke={INK} stroke-width="3" /><rect x="32" y="20" width="56" height="16" rx="4" fill="#2A4C9A" stroke={INK} stroke-width="3" /><circle cx="60" cy="4" r="5" fill="#F2C53D" /></g>,
    <g><path d="M18 70 Q16 14 60 14 Q104 14 102 70 L92 70 Q90 30 60 30 Q30 30 28 70 Z" fill="#1F8A87" stroke={INK} stroke-width="3" /><circle cx="60" cy="12" r="5" fill="#F2C53D" /></g>,
  ],
}
export default kit
