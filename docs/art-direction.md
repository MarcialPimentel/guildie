# Guildie — Art Direction Proposal: Portovela

**Status:** Approved by Marz on 2026-10-28: option A (Renaissance), the name Portovela, Three.js (in the end used directly with Preact, see §5), starting now beside M2, and lamp oil plus wages as the machine running cost. The GDD and its Decision Log were updated in 0.6.0, which shipped plan step 1 (the new look on today's screens). **0.7.0 ships step 2 and the start of step 4: the 3D harbor is the desktop home screen**, with every place opening its screen in a side panel; phones keep the classic view.

**Playable mock-up:** open [`docs/art/portovela-mockup.html`](art/portovela-mockup.html) in a browser (it loads Three.js from a CDN). The game's item icons are in [`client/src/icons/`](../client/src/icons/).

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

**Built (0.7.0):** TypeScript, Vite, the PHP API and MySQL stay. **Three.js is used directly inside the Preact app** (`client/src/world/`), loaded as a separate file only by the 3D view. The original plan was React Three Fiber; plain Three.js turned out simpler for a mostly hand-animated scene and avoids swapping the whole client to React (GDD Decision Log, 2026-10-28). Menus stay HTML, opened as side panels over the world, so text, forms, accessibility and the Playwright tests keep working.

```
HTML menus and panels (Preact)         <- opened by clicks in the world
3D harbor (Three.js, lazily loaded)
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
- **Made in Blender (0.15.1):** a Python script in `tools/art/` builds the piece and exports a `.glb` with vertex colors (no textures), so it can be rebuilt and tweaked by number. First piece: the people's body (§9.3).
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

## Decisions (approved 2026-10-28)

- Era: **A, Renaissance merchant republic.**
- City name: **Portovela.**
- Technology: **add Three.js** (with step 2). Built with plain Three.js in Preact instead of React Three Fiber; see §5.
- Timing: **steps 1 and 2 now, beside M2.** Step 1 shipped as 0.6.0.
- Machine running cost: **lamp oil and wages.** How it maps onto the recipe ladder (`professions.md` §8) is settled when workshop upgrades are built.

## 9. Blob merchants and the slap glove (0.9.0 look pass)

**Status:** Marz's direction of 2026-10-28 for the living city ([living-city.md](living-city.md)): people become wobbly, chunky **blob merchants** (in the spirit of Gang Beasts) in Portovela dress and hats, and players can slap each other with an oversized cartoon glove (in Renaissance Italy a glove slap was a duel challenge). This replaces the capsule-and-sphere customers of 0.7.0. Built in code like the rest of the harbor; the in-game quarters are the mock-up.

**Why blobs:** they read from far away (a few big shapes, one color each), they are funny without words, they hide the lack of faces and hands at this camera distance, and wobble is cheap to animate (a spring on scale, no skeleton).

**Shape**

| Part | Shape | Notes |
|---|---|---|
| Body | Capsule squashed to about 1 : 1.25 (width : height), about 2 m tall | No neck; the face is two dark dot eyes and a soft blush, high on the body |
| Hands | Two mitten spheres, 0.22 m | Float a little off the body; swing when walking |
| Feet | Two flattened spheres | Just peek out; step in turn |
| Hat | One chunky piece per guild | The guild read: must be visible from the default camera |
| Total | 4–5 meshes, about 600 triangles | Merged into body + hat + hands so a blob costs 3–4 draw calls |

**Dress by guild** (colors from the palette in §2)

| Guild | Dress | Hat |
|---|---|---|
| Smiths (*Fabbri*) | Soot-dark leather apron `#4B3A2E` over the body color | Red felt cap `#B83A3A`, slightly crushed |
| Alchemists (*Speziali*) | Teal robe `#1F8A87` | Tall pointed hat `#2A4C9A` with a lemon tassel `#F2C53D` |
| Tanners (*Conciatori*) | Olive jerkin `#4E6F2C` | Wide straw hat `#E3C27A` with a ribbon |
| Townsfolk | Cream or majolica-blue smock | Bare head, a headscarf, or a priest's black cap |

The **body color** is one of the plaster pastels (`#F2B98B #F3D27A #EFA9A0 #BFE3D9 #E9D5F0 #F6C9A2`), picked from the player number so it's stable. Your own merchant gets a soft lemon ring under their feet so you can always find yourself.

**Motion**

- Walk: bob 0.08 m and squash 6% per step, lean 8° into the direction of travel.
- Stop: one overshoot wobble (spring, about 0.4 s).
- Wave: one hand up, three waggles.
- Slapped: squash 25% sideways, slide back 0.8 m over 0.3 s, a wobble, then a "Challenge!" bubble.
- Reduced motion: no wobble or squash; positions still update.

**The glove:** an oversized white cartoon glove (`#F7F3EA`, ink outline by darker flat shading) with a lemon cuff, about the size of a blob's head. It pops in beside the slapper (scale 0 → 1 in 0.08 s), swings in a 100° arc in 0.15 s, and pops out. The hit shows three small white stars.

**Labels:** names float above heads in the same label style as places (Nunito on whitewash), smaller; friends get a lemon star. A player with slaps off shows a small white flag on their hat.

**Budget (0.9.0):** 30 players + 8 townsfolk/echoes ≈ 120 draw calls in a quarter (the quay stays under 150 without them); shadows only from blobs near the camera. Updated in §9.1.

### 9.1 The people of Portovela (0.10.0)

**Status:** approved by Marz on 2026-10-29 (all eight decisions of the character proposal, plus "players choose their look when they create their account"). The playable proposal is [`docs/art/characters-mockup.html`](art/characters-mockup.html).

**One character kit** (`client/src/world/blobs.ts`): the same blob for everyone, dressed from a table of parts: dress, hat, one prop merged into the right hand, and a rank sash. No skeletons. Since 0.15.1 the bare body under the clothes is a Blender model (§9.3); everything else is still built in code. A new character is a few lines of data.

| Who | Where | Look | Driven by |
|---|---|---|---|
| Your merchant | Your quay, the quarters | Guild dress and one of three guild hats, your body color, lemon ring underfoot, rank sash | Your keys and clicks |
| Other players | Quarters | The same, from their signed presence pass | The realtime room |
| Echoes | At their stall | The player's blob at 42% | The quarter action |
| Townsfolk | Quay (2), quarters (≤ 6) | Porter with a sack, priest, fishwife with a fish, sailor | Client only: wander and idle |
| The Duke's herald | By the pier | Majolica tabard, lemon panel, feathered cap, trumpet with a banner | Trumpets new and fulfilled Duke's orders |
| Guild trainer | Each guild hall door | An elder in the guild's colors: white beard, taller hat, gold chain | The `trainer` place |
| Donna Vittoria | Your door | Lavender gown, round gold *balzo*, a fan | The order board |
| Pellegrino the oarsman | | Striped shirt, floppy red cap, an oar | |
| Madre Ilaria | | Grey habit, black veil with a white band, a loaf | |
| Mastro Grigio | | Slate work smock, flat cap, a mallet | |
| Captain Vos | | Navy coat, brass buttons, wide hat with a red plume, a spyglass | |
| Fra Amon | | Brown friar's robe, rope belt, tonsure, a jar of salve | |
| Signora Orsini | | Green dress, coral headscarf, a basket | |
| Messer Quill (collector) | | Black doublet, white ruff, beret with a giant quill, a magnifier | |
| La Marchesa (collector) | | Crimson gown, gold tiara, a parasol | |
| Buyers | Walk to your stall | Townsperson (straw cap, basket), sailor, workshop hand (apron, crate), trader (saffron robe, turban, purse); a porter with a sealed note for sales to other players | New `sold` entries in your log |
| Hired hands (#51) | Your quay, later | Apprentice in a linen smock carrying sacks; mason with a mallet | Your upgrades |

**Looks you choose:** six body colors (the plaster pastels) and three hats per guild:

| Guild | Hat 1 | Hat 2 | Hat 3 |
|---|---|---|---|
| Smiths | Felt cap | Leather coif | Bandana |
| Alchemists | Pointed hat | Scholar's cap | Hood |
| Tanners | Straw hat | Feathered beret | Cloth cap |

Rank sash: none (Apprentice), sea-glass `#8FD3C4` (Journeyman), majolica `#2A4C9A` (Expert), lemon gold `#F2C53D` with a medallion (Master).

**Moves** (squash, lean and hand positions; with reduced motion each becomes a held pose with no bounce):

| Move | What happens | Time |
|---|---|---|
| Walk / stop | Bob 0.08 m, squash 6% per step, lean into travel; one overshoot wobble on stopping | loop / 0.4 s |
| Idle | After 4 s still: look around, rock on the heels or stretch, never in sync | 2–3 s every 5–9 s |
| Wave (E) | One hand up, three waggles | 1.2 s |
| Bow (1) | Lean 30°, one hand to the chest, the other sweeps back | 1.4 s |
| Cheer (2) | Both hands up, two hops | 1.3 s |
| Shrug (3) | Hands out, palms up, small squash and head tilt | 1.1 s |
| Slapped | Squash sideways, slide back 0.8 m, wobble, "Challenge!" | 0.6 s |
| Hand over | Both hands forward; a parcel arcs across | 1.0 s |
| Trumpet | The herald raises the trumpet and shouts | 2.0 s |
| Carry / hammer | Loops for hired hands | loop |

**Bubbles and labels:** at most three bubbles at a time (the newest replaces the oldest), lines cut to about 60 characters; people's name tags and bubbles never overlap (they stack upward). Arrivals in a quarter step onto one of eight spots at the top of the Steps. The slap glove is 1.6× its 0.9.0 size so it reads from the quarter camera.

**Budget (measured):** a character is 3 draw calls (body, two hands; all ground shadows are one shared batch). A quarter with 30 players and 8 others costs about 115 draw calls for people. The quay: 69 draw calls with three customers, your merchant, two townsfolk and the herald.

**Smooth people (0.10.1, Marz's playtest: "add polygons to make the character models smoother"):** people are **smooth-shaded** with 1.5× the curve segments, and the body (the main silhouette) is extra round. About 1,750 triangles per person on average (2,100 at most; 0.10.0: about 590), so a full quarter is about 67,000 triangles for people, with the same draw calls. The town, props in the world and icons stay faceted low-poly; the people read as soft toys against it.

**Pointing at things (0.10.2, Marz's playtest: thin places like the trapper's lodge and the Duke's notice board were hard to hover, and their names seemed to jump):** every clickable place has an invisible hover box around its whole shape, and every person an invisible column, so the gaps between posts and beams count. Hover lets go only after 200 ms over nothing, so it doesn't flicker. A hovered label lights up (a lemon ring) instead of growing, so it never shifts under the mouse or onto a neighbor. `?debug=hits` draws the hover boxes as wireframes.

**Smooth walking (0.10.1):** townsfolk, customers and buyers ease in and out of a walk (half a second to get going, a gentle slow-down to arrive); townsfolk stroll at least 7 m at a time and stand for 2–6 s between walks; other players glide between the room's position updates without stopping; walking people always get the full frame rate.

### 9.2 The Palazzo and the four bottegas (0.11.0)

- **The Palazzo** (city hall): warm ochre plaster, an arcaded loggia of seven white arches, pointed windows, crenellations, every guild's banner on the façade (from content, so a new guild gets one), and a bell tower with a gilded bell and a clock. A merchant's statue in the middle of a herringbone-paved square; cypresses at the edges. Built in code like the quarters (`client/src/world/palazzo.ts`).
- **Officials** (`blobs.ts`): the notary in black with a red cap and a quill; the town crier in teal and lemon with a bell and a plumed hat; the Duke's steward in majolica blue with a gold chain of office and a scroll.
- **Your bottega, four looks** (`harbor.ts`): (1) a rundown shack of weathered planks, a patched lean-to roof, a boarded window and a barrel; (2) a repaired workshop, one floor of fresh plaster under tiles, teal shutters and a small awning; (3) the two-storey bottega of 0.7.0; (4) the same with a roof loggia (altana), lemon-gold trim, banners and a second lemon tree. While builders work: scaffolding of poles and planks, and a mason hammering at the door.
- **Stall signs in the quarters** follow the owner's level: a weathered plank for a shack, navy for a workshop, gold trim from level 3, a double gilded frame for a fine bottega.

### 9.3 The Blender body (0.15.1)

**Status:** Marz's pick of 2026-10-30, option 3 "Expressive" of three made in Blender (Tidy: today's face with eye shine; Soft toy: tall shiny eyes and a smile; Expressive).

- **What:** one shared body for every person (players, trainers, townsfolk, customers, officials): the body, the face and the feet. Clothes, hats, hands and props are still built in code on top of it.
- **The face:** oval ink eyes with a white shine, small arched brows, a button nose in the body color, a smile, rosy cheeks. **Feet:** little brown shoes with dark soles, toes turned slightly out.
- **The outline is locked** to the 0.10 capsule (radius 0.5 m, 1.43 m tall before the 1.4× blob scale), because robes and hats are fitted to it. Personality goes into the face and feet, not the silhouette.
- **File:** `client/src/world/models/blob_body.glb` (31 KB, about 1,320 triangles, vertex colors, no textures). Skin is painted magenta `#FF00FF` in the file and swapped for each person's body color in code. Built and exported by `tools/art/blob_body.py` (`blender -b -P tools/art/blob_body.py` from the repo root); change the numbers there, re-run, commit the new `.glb`.
- **Loading:** the 3D view loads it once before drawing anyone. If it fails or takes over 8 s, people use the 0.10 code body, so the harbor never breaks over it.
- **Budget:** about 2,050 triangles per person on average (was about 1,750), so a full quarter is about 78,000 triangles for people. Draw calls unchanged (3 per person).
- **Checking it:** `npm run dev` in `client/`, then open `/cast.html`: every look side by side, drawn by the game's own code (`?code=1` shows the old body, `?near=1` a close camera, `?players=1` only players and trainers).
- **Known, unchanged by the new body:** Madre Ilaria's veil band and the workshop hand's apron straps cross the face, as before.
