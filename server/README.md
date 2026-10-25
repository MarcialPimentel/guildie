# Server (PHP 8 + MySQL)

The server is authoritative for all game state (GDD §11.1). Only a tiny entry point is public; everything else lives in a private folder the web can't reach.

| Repo folder | Deployed to (SiteGround) | Public? | Purpose |
|---|---|---|---|
| `server/api/` | `public_html/games/guildie/api/` | Yes | Thin entry point (`index.php`) that loads the app |
| `server/app/` | `guildie-private/app/` | **No** | Game logic, database helpers, `tick.php` |
| `server/config/config.example.php` | `guildie-private/config.php` (filled in) | **No** | Database credentials and settings |
| `server/migrations/` | Not deployed; applied in phpMyAdmin | — | Database schema changes, applied in order |
| `server/tools/` | Uploaded only when needed, then deleted | — | One-off helpers such as `dbcheck.php` |

`guildie-private/` sits **next to** `public_html`, never inside it. See `docs/setup-siteground.md`.
