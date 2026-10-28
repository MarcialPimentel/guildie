# Guildie — Art Direction Proposal: Portovela

**Status:** Draft 1 for Marz's review (2026-10-28). Nothing here is decided until Marz approves it; then the GDD and its Decision Log get updated in the same PR as the first visual change.

**Playable mock-up:** open [`docs/art/portovela-mockup.html`](art/portovela-mockup.html) in a browser (it loads Three.js from a CDN). Starter icons are in [`docs/art/icons/`](art/icons/).

## The request (from Marz)

1. A more mercantile, Italian theme.
2. Less "spreadsheet simulator": real assets and things to do, as interactive as possible, even 3D.
3. A palette distinct from Hormiga's (which Guildie currently shares): light blue to teal, for the sea, the Amalfi coast and ship traders.
4. A port away from the current client is allowed, but not Unity.

## 1. Setting

| | A. Renaissance merchant republic (recommended) | B. Riviera in the age of steam |
|---|---|---|
| Era | Around 1500: Amalfi, Venice, Genoa | Around 1890: pastel coastal town, steamships |
| Progression story | Hand tools → water power → gears and clockwork ("the age of invention") | Unchanged: hand tools → steam |
| Fit | Guilds (*Arti*), the *bottega* apprenticeship and merchant banking are Italian history; Venice's Rialto is the auction-house fantasy | Steam, coal and brass content stays as written |
| Cost | A flavor pass over names and the rank story. Game rules are unchanged | Fewest changes, but weaker guild flavor |

Suggested renames for option A (display text only; item IDs are permanent):

| Today | Portovela |
|---|---|
| Brassmere | **Portovela** (working name; alternatives Calarossa, Portocorallo) |
| Gold | **Ducats** (server field stays `gold`) |
| The Exchange | **The Mercato** |
| Workshop | **Your Bottega** |
| Steam Engine (Journeyman+) | **Water Wheel**, later **the Great Contraption** |
| Coal running cost | **Lamp oil and wages** (decision needed) |
| Brassmere Tournament | **The Regatta** |
| Airship fair | **A galley from the Levant** |
| The Great Fog | **The Libeccio** (sea storm) |
| Steam Tonic | **Lemon Tonic** (ID stays `steam_tonic`) |

Tone: warm, cozy and lightly funny, never a caricature. English stays the main language; Italian appears in place names and a few craft terms, always next to plain English.

## 2. Palette

The old palette (`#1b1816`, `#2a211b`, `#c9963f`, `#e8d5a8`, shared with Hormiga) is retired. All text colors pass WCAG AA.

**Day (default)**

| Token | Hex | Use |
|---|---|---|
| Sea foam | `#E3F2EF` | Page ground |
| Whitewash | `#F8FCFB` | Panels |
| Harbor ink | `#10323A` | Text (11.8:1) |
| Muted | `#4A6B6F` | Secondary text |
| Amalfi teal | `#177A76` (buttons) / `#12706D` (text, links) | Primary |
| Shallows | `#9ED9D0` | Highlights, tile rims |
| Lemon | `#F2C53D` | Ducats, rewards (fill only; ink text on top) |
| Roof tile | `#A9492A` | Warnings, price down |
| Majolica | `#2A4C9A` | NPCs, Fine quality |
| Olive | `#4E6F2C` | Gains, price up |

**Night** (the same harbor after sunset; can follow real time)

| Token | Hex |
|---|---|
| Night sea (ground) | `#0B2530` |
| Lantern shade (panels) | `#12333F` |
| Moonlit plaster (text) | `#E3F3F0` |
| Muted | `#93B5B3` |
| Glow teal (buttons, dark text on top) | `#52C7BD` |
| Lantern | `#F5CF5A` |
| Ember (warnings) | `#EC8A64` |

**World colors** (3D only, never used for UI text): plaster pastels `#F2B98B #F3D27A #EFA9A0 #F5F0E4 #BFE3D9`, roofs `#C4623A #A9492A`, stone `#E7D7B9`, sea `#86D8CC` → `#1F8F8D`, greenery `#6E9B48`, umbrella pine `#4F7A3A`.

## 3. Type and icons

- **Headings:** Fraunces (warm, chunky serif). **Everything else:** Nunito (rounded, very readable on phones). Both are free Google fonts, bundled with the game rather than loaded from Google.
- **Item icons:** 64×64 SVG, thick ink outline (3px at 64), two flat tones per material, one white highlight, seen slightly from above. Icons sit on a light **majolica tile** (cream with a shallows-teal inner rim), so they read in day and night. Later, icons can be rendered from the 3D models so the two always match.

## 4. Interaction: every system gets a place and a verb

| System | Where it lives | What the player does | Server action |
|---|---|---|---|
| Gathering | Mine cart, herb terraces, trappers' boat | Watch them fill; tap to empty, goods fly to the storehouse | `collect_station` |
| Crafting | Forge, alembic or tanning bench | Drag ingredients onto the bench; the work animates with a timer above it | `start_craft`, `collect_craft` |
| Focus | The same stations, live | Pump bellows, stir, pull stitches at the right moment; never punished if ignored | Focus (systems.md 5), server-issued and checked |
| The Exchange | The Mercato on the piazza, your stall on the quay | Set goods on the stall; buyers walk up, coins pop | `list_item`, `buy_listing` |
| Market news | Harbor and town crier | Ships arrive with events, Regatta banners, chalk-board price arrows | calendar, events, ticker |
| Orders | Customers at the door, messenger boats | Hand the package over | `fulfill_order` |
| Upgrades | Your bottega | Scaffolding, then a new floor, a water wheel, a bigger forge | `upgrade_building` |
| City | The quay and cliff streets | Visit other players' bottegas and stalls | City tab, direct trades |
| Return | The morning harbor | Boats unloading, a full cart, a ledger of sales | `get_state` summary |

The client still decides nothing: the world animates what the server returns.

## 5. Technology

**Recommendation:** keep TypeScript, Vite, the PHP API and MySQL. Swap Preact for React (same API, about 35 KB more) and add **Three.js via React Three Fiber** for a 3D world layer. Menus stay HTML, layered over the world, so text, forms, accessibility and the Playwright tests keep working.

```
HTML menus and panels (React)          <- opened by taps in the world
3D harbor (Three.js / React Three Fiber)
Game state + API client (unchanged)
PHP + MySQL on SiteGround (unchanged, authoritative)
```

Alternatives considered: Babylon.js (capable, about ten times heavier, its own UI fights HTML menus), PlayCanvas (great on phones, but projects live in a cloud editor that is hard to review in PRs), Godot web (left in 0.4.0), Unity (ruled out).

**Budgets**

- Menus usable in about 1 second, as today; the world streams in after (about 2–4 MB first visit, then cached).
- Props ≤ 1,500 triangles, buildings ≤ 6,000; most models share one small palette texture.
- 60 fps on a mid-range phone; 30 fps and no shadows on older phones. Stop rendering when nothing moves or the tab is hidden.
- Phones that can't run 3D still play the whole game through the menus.

## 6. Making assets

- **Placeholders:** CC0 low-poly kits from Kenney (kenney.nl) and Quaternius (quaternius.com), recolored to the palette.
- **Hero pieces** (bottega, Mercato, ships): concept image → AI image-to-3D (Meshy, Tripo or Rodin) → `.glb` → I shrink, recolor, compress and wire it in. Check each tool's plan allows commercial use.
- **Later:** a hired low-poly artist, using this document as the brief.

Concept prompt template (change the first line):

```
A small Italian Renaissance craftsman's shop on a harbor quay.
Low-poly 3D game asset, stylized and chunky like a cozy mobile builder game, isometric 3/4 view from above.
Flat colors, no textures, soft daylight, simple shapes with bevelled edges.
Palette: pastel peach plaster walls, terracotta roof tiles, sea-teal shutters and awning with white stripes, warm stone base, small lemon tree in a pot.
Single object centered on a plain white background, no text, no people.
```

## 7. Conflicts with the GDD (to update on approval)

| Section | Today | Would become |
|---|---|---|
| §1 Non-goals | "3D. The game is 2D and UI-driven." | 3D world with HTML menus |
| §3 Setting | Brassmere, industrial revolution | Portovela, merchant republic |
| §3 Progression as industrialization | Rise into steam | Rise into water power and clockwork (option A) |
| §3 Visual direction | 2D; art out of scope until M4 | Low-poly 3D; a first slice before M4 |
| §8.1, systems.md 7.1 | Steam Engine; machines burn coal | Water Wheel; oil and wages |
| §11, decision of 2026-10-27 | ~20 KB client, loads in a second | Menus still load in a second; world streams after |
| §12 Milestones | All art in M4 | 3D slice beside M2; final art in M4 |
| `content/*.json` flavor text | Brassmere, airships, the Crown, steam | Renamed display text; IDs unchanged |

## 8. Plan

1. **Reskin the current menus:** palette, fonts, icons, Portovela names, GDD update. One small PR.
2. **3D test slice** behind a switch: your bottega with forge, mine cart and stall, placeholder models, real API. Marz plays it on his phone: go or no-go.
3. **Focus in 3D:** the M2 Focus prototype, done in the world.
4. **The whole harbor:** Mercato, event ships, NPC buyers, other players' shops, the morning return.
5. **Final art (M4):** hero models, icons rendered from models, sound, installable app.

## Decisions needed from Marz

- Era: A (Renaissance) or B (steam-age Riviera)?
- City name: Portovela or another?
- OK to switch Preact → React and add Three.js?
- Start steps 1 and 2 now, beside M2?
- Machine running cost: lamp oil, wages, or both?
