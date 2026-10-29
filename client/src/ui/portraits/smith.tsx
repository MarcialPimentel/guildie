// The smith kit's flat portrait parts (the Blacksmith): the dress and the hats, drawn in SVG for the menus
// (ui/Look.tsx). One hat per hat name in content/professions.json, in the same order. The 3D kit is
// world/kits/smith.ts.
import { INK, type PortraitKit } from './kit'

const kit: PortraitKit = {
  dress: <g><rect x="38" y="74" width="44" height="54" rx="5" fill="#4B3A2E" /><path d="M40 76 L44 50 M80 76 L76 50" stroke="#4B3A2E" stroke-width="5" /></g>,
  hats: [
    <g><rect x="33" y="10" width="54" height="30" rx="12" fill="#B83A3A" stroke={INK} stroke-width="3" transform="rotate(-6 60 25)" /></g>,
    <g><path d="M20 62 Q20 18 60 18 Q100 18 100 62 L92 62 Q90 30 60 30 Q30 30 28 62 Z" fill="#5A3A28" stroke={INK} stroke-width="3" /><rect x="28" y="36" width="64" height="8" rx="4" fill="#7A5233" /></g>,
    <g><path d="M24 44 Q26 16 60 16 Q94 16 96 44 Z" fill="#B83A3A" stroke={INK} stroke-width="3" /><circle cx="99" cy="36" r="7" fill="#B83A3A" stroke={INK} stroke-width="2.5" /></g>,
  ],
}
export default kit
