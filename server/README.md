# Guildie — Server (PHP 8 + MySQL)

_Current as of 0.19.0 (2026-10-30)._

The server is authoritative for all game state (GDD §11.1). Only a tiny entry point is public; everything else lives in a private folder the web can't reach.

| Repo folder | Deployed to (SiteGround) | Public? | Purpose |
|---|---|---|---|
| `server/api/` | `public_html/games/guildie/api/` | Yes | Thin entry point (`index.php`) that loads the app |
| `server/app/` | `guildie-private/app/` | **No** | Game logic, database helpers, `tick.php` |
| `server/config/config.example.php` | `guildie-private/config.php` (filled in) | **No** | Database credentials and settings |
| `server/migrations/` | `guildie-private/migrations/` | **No** | Database schema changes; the server applies new ones itself on the first request after a deploy (since 0.2.1, see `migrations/README.md`) |
| `server/tools/` | Uploaded only when needed, then deleted | — | One-off helpers such as `dbcheck.php` |

`guildie-private/` sits **next to** `public_html`, never inside it. See `docs/setup-siteground.md`.
