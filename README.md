# Guildie

**Rise from apprentice to master in Portovela, a merchant harbor on the edge of the age of invention.**

Guildie is a mobile-first browser crafting and trading game. Choose one profession, master it, and trade with every other crafter in a living, persistent market. Your workshop keeps working while you're away.

## Status

- **Live build:** 0.19.0 (see [`VERSION`](VERSION) and [CHANGELOG.md](CHANGELOG.md))
- **Current milestone:** [M2 Crafting Depth](https://github.com/MarcialPimentel/guildie/milestone/3): the M2 playtest is running ([docs/playtest-m2.md](docs/playtest-m2.md)). Full roadmap: [GDD §12](docs/GDD.md#12-milestones).
- **Stack:** TypeScript + Preact web client (Three.js for the 3D town), PHP 8 + MySQL server on SiteGround, a small realtime service for live presence.

## Play it

**https://marz.gg/games/guildie/** (phone or computer). The footer shows the client and server build.

## Run it locally

```
cd client
npm install
GUILDIE_API_TARGET=http://127.0.0.1:8080 npm run dev   # http://localhost:5173, API forwarded to a local PHP server
npm run build                                          # type check + build into client/dist/
```

The PHP server, the API smoke test and the browser tests are described in [client/README.md](client/README.md), [server/README.md](server/README.md) and [docs/deploy.md](docs/deploy.md#local-testing).

## Docs

All docs and what each one is for: **[docs/README.md](docs/README.md)**. The design lives in **[docs/GDD.md](docs/GDD.md)**, the source of truth for design decisions; read it before building features.
