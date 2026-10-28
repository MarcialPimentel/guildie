# Guildie web client

TypeScript + Preact (+ Three.js for the 3D harbor), built by Vite into static files that go to `public_html/games/guildie/`. The client is only a view: every action is a call to the PHP API (`api/index.php` next to the page), and the server decides everything.

```
src/api.ts        HTTP wrapper (sends the session token)
src/session.ts    login, player state, server clock offset; every game action
src/types.ts      shapes of what the API returns
src/view.ts       which view: the 3D harbor (desktop default) or the classic tabs (phones); ?view=3d|classic
src/ui/           one file per screen: Login, Profession, GameScreen (header + view), Workshop, Market, Bag, City, Feedback;
                  HarborView (3D layout: world, dock, side panels) and World (loads the engine, maps state to the scene)
src/world/        the 3D harbor: engine.ts (renderer, camera, picking, labels, loop), harbor.ts (the scene),
                  kit.ts (shapes + bake, which merges static meshes), types.ts (the data the scene shows; no three.js)
src/icons/        item icons (SVG), one per item id
src/styles.css    the Portovela look (day + night palettes); phone layout first, two columns from 900 px
tests/            Playwright browser tests: play.spec.ts (classic view, phone + desktop), world.spec.ts (3D, desktop)
```

## Commands

```
npm install                                               # once
GUILDIE_API_TARGET=http://127.0.0.1:8080 npm run dev      # dev server at http://localhost:5173, API forwarded
npm run build                                             # type check + build into dist/
GUILDIE_URL=http://127.0.0.1:8080/games/guildie/ npx playwright test   # browser test against a served build
```

The build label in the footer comes from `GUILDIE_BUILD` (set by `tools/package.sh` from the repo's `VERSION`).

Add `?debug=1` to the address in the 3D view to see frames per second, draw calls, triangles and the pixel ratio.
