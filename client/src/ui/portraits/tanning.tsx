// The tanning kit's flat portrait parts (the Leatherworker): the dress and the hats, drawn in SVG for the menus
// (ui/Look.tsx). One hat per hat name in content/professions.json, in the same order. The 3D kit is
// world/kits/tanning.ts.
import { INK, type PortraitKit } from './kit'

const kit: PortraitKit = {
  dress: <rect x="16" y="68" width="88" height="76" fill="#4E6F2C" />,
  hats: [
    <g><ellipse cx="60" cy="34" rx="56" ry="9" fill="#E3C27A" stroke={INK} stroke-width="3" /><rect x="38" y="8" width="44" height="26" rx="8" fill="#E3C27A" stroke={INK} stroke-width="3" /><rect x="38" y="24" width="44" height="7" fill="#A9492A" /></g>,
    <g><ellipse cx="64" cy="26" rx="40" ry="14" fill="#4E6F2C" stroke={INK} stroke-width="3" /><path d="M86 22 Q104 0 112 -12" stroke="#F3D27A" stroke-width="6" stroke-linecap="round" fill="none" /></g>,
    <g><path d="M26 42 Q28 16 60 16 Q92 16 94 42 Z" fill="#A9492A" stroke={INK} stroke-width="3" /><rect x="46" y="38" width="30" height="6" rx="3" fill="#A9492A" stroke={INK} stroke-width="2" /></g>,
  ],
}
export default kit
