# Mock-up recipe (Three.js in a single HTML page)

The worked example is `assets/example-mockup.src.html`. Copy its structure and helpers rather than starting from scratch. This file explains the pieces and the traps.

## Contents

1. Page structure
2. Loading Three.js
3. Scene helpers
4. Building a diorama
5. Camera and touch controls
6. Interactions
7. Day and night
8. Performance and accessibility
9. Testing pitfalls

## 1. Page structure

- `.stage` (position relative, `height: clamp(440px, 74vh, 700px)`, rounded) holds the `<canvas>`, a loading fallback, and HUD layers positioned absolutely: a top bar (currency pills, Day/Night, Reset view), a toast (`role="status"`), a labels layer, bottom sheets (one per interaction), and a row of action chips.
- HUD colors are fixed "in-world" colors (light glass panels, dark ink), because they sit on the scene, not the page background.
- Hide sheets and chips with the `hidden` attribute and include `[hidden]{display:none!important}` in your CSS so local tests match the artifact skeleton.
- The rest of the page (proposal) uses the page tokens for both themes.

## 2. Loading Three.js

```html
<script type="module">
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';
```

- Pin an exact version. Avoid the `examples/jsm` addons (they import the bare specifier `three` and need an import map); write your own small orbit controls instead (section 5).
- Wrap `new THREE.WebGLRenderer` in try/catch and replace the fallback text with a clear message if WebGL is missing.
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`, `shadowMap.enabled = true`, `PCFSoftShadowMap`. Leave tone mapping off so the palette stays punchy.

## 3. Scene helpers

- Seeded RNG (mulberry32) so the town looks the same every load.
- Cached `MeshStandardMaterial` per color with `flatShading: true, roughness: 0.9`: this alone gives the low-poly look.
- `box(w, h, d, color, x, yBottom, z, parent)`: positions by the bottom, which makes stacking trivial. Set `castShadow` and `receiveShadow`.
- `cyl(...)`, and `hipRoof(w, d, h, ...)` = `ConeGeometry(Math.SQRT1_2, 1, 4)` rotated 45° and scaled to the footprint.
- `stripes(colorA, colorB, n)`: a `CanvasTexture` for awnings and flags (`colorSpace = SRGBColorSpace`).
- Text on signs: draw on a canvas; shrink the font in a loop until `measureText` fits, and redraw after `document.fonts.load(...)` resolves.
- Simple tween list: `{t, dur, fn(k), done}` updated each frame, with an ease function. Respect reduced motion by shortening durations.

## 4. Building a diorama

- Ground it on the game's real home screen (the base, the shop, the farm). Put the player's own building front and center, with its stations around it, and the wider world behind as a backdrop that is cheap to generate (rows of random houses, trees).
- Terrace the backdrop upward so it reads from a 3/4 view.
- Water: a `PlaneGeometry(260, 260, 96, 96)` with per-vertex colors (shallow near shore → deep → far) and vertex heights from a few summed sines each frame. `flatShading` gives facets and glints without recomputing normals.
- Small life makes it feel alive: bobbing boats, circling birds (two triangles flapping), sparks (a `Points` pool), a foam strip pulsing.
- Ships: extrude a top-down hull `Shape`, rotate it so the extrusion becomes height, stack a hull, a colored band and a deck. Sails are single triangles; rotate the sail rig about 35° off the hull axis so they read from the camera.
- Keep the player's world readable at phone size: chunky objects, strong silhouettes, a few labels floating above key stations (timers, fill counts).

## 5. Camera and touch controls

- Orbit rig: target point, `yaw`, `pitch`, `dist`; smooth `view` toward `goal` each frame. Clamp all three.
- `home()` returns a farther, slightly higher view when the stage is portrait; apply it on first resize and on "Reset view".
- Pointer events on the canvas with `touch-action: pan-y`: horizontal drag orbits, vertical swipes still scroll the page on phones, two-finger pinch zooms. Mouse drag also changes pitch. Wheel zooms only with Ctrl held (trackpad pinch), so the page still scrolls.
- A tap is a pointerup within ~9 px and 500 ms of pointerdown; raycast against the tappable groups, each child tagged `userData.tap = id`. Show a pointer cursor on hover for mouse users.
- A "bounce" on tap should scale only Y (groups often have their origin at world zero, so uniform scaling shifts them sideways).

## 6. Interactions

Pick three to five that stand for real systems. Patterns that worked:

- **Tend a station (skill moment):** a bottom sheet with a gauge, a target band, a countdown and one big button; the station's glow and light follow the value; result is a quality tier with "skipping is never punished" if that's the game's rule.
- **Collect from a gatherer:** pieces fly in an arc from the station to the storehouse door, the HUD counter ticks up, a "+N" label pops, then the station visibly refills over time.
- **Sell to a walking NPC:** a sheet shows your listing; confirming sends a simple character along a path to the stall, a pause, a coin pop, the stock on the counter drops, the NPC leaves.
- **An event arrives:** a ship (or caravan, or courier) travels a Bézier path into view and a toast explains the market effect.

Floating labels: project a world point with `vector.project(camera)` and position an absolutely placed div; hide it when `z > 1`.

## 7. Day and night

Define DAY and NIGHT parameter sets (sky and fog color, hemisphere colors and intensity, sun color and intensity, a sea color multiplier, emissive intensity for windows and lamps, point-light intensity for lamps) and lerp between them. Start in the viewer's theme (`data-theme` on the root, else `prefers-color-scheme`). Windows on a shared emissive material light up at night for free.

## 8. Performance and accessibility

- Pause rendering when the stage is off screen (IntersectionObserver) or the tab is hidden.
- Smaller shadow map on coarse pointers (phones).
- Give the canvas an `aria-label` describing the scene, and mirror every tap target as a button in the chips row.
- Respect `prefers-reduced-motion`: freeze waves and shorten tweens.

## 9. Testing pitfalls

- The sandbox may block the CDN for curl; install the same Three.js version with npm and let `scripts/screenshot.cjs` route the CDN URL to it.
- Headless Chromium renders WebGL through SwiftShader, which is slow. Frame time is capped (`dt ≤ 0.05`), so in-scene timers run slower than real time. Wait for page state (a toast's text, a button becoming visible) instead of fixed sleeps.
- Google Fonts are blocked in the test, so fallback fonts are wider. Check sign and label text fits with the fallback too.
- Check both a desktop light screenshot and a phone dark screenshot. Common fixes: camera too close (objects cut off), event ships starting off screen, sails edge-on, labels clipped at the stage edge, and price or trend text overlapping in narrow list rows (give the price column `flex: none` and `white-space: nowrap`).
