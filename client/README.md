# Guildie web client

TypeScript + Preact, built by Vite into static files that go to `public_html/games/guildie/`. The client is only a view: every action is a call to the PHP API (`api/index.php` next to the page), and the server decides everything.

```
src/api.ts        HTTP wrapper (sends the session token)
src/session.ts    login, player state, server clock offset; every game action
src/types.ts      shapes of what the API returns
src/ui/           one file per screen: Login, Profession, GameScreen (header + tabs), Workshop, Market, Bag, City, Feedback
src/styles.css    brass-and-soot placeholder look; phone layout first, two columns from 900 px
tests/            Playwright browser test that plays every screen (phone + desktop)
```

## Commands

```
npm install                                               # once
GUILDIE_API_TARGET=http://127.0.0.1:8080 npm run dev      # dev server at http://localhost:5173, API forwarded
npm run build                                             # type check + build into dist/
GUILDIE_URL=http://127.0.0.1:8080/games/guildie/ npx playwright test   # browser test against a served build
```

The build label in the footer comes from `GUILDIE_BUILD` (set by `tools/package.sh` from the repo's `VERSION`).
