# Client (Godot 4.7)

Portrait, mobile-first web build (GDD §10, §11.6). The client is a **view only**: it never decides gold, inventory, craft results, or trades. It asks the server.

## Structure

| Path | Purpose |
|---|---|
| `scenes/main.tscn` + `scripts/main.gd` | Root: shows the login or home screen based on the session |
| `scripts/autoload/api.gd` | `Api`: HTTP calls to the PHP API. In the browser, the API URL is worked out from the page address |
| `scripts/autoload/session.gd` | `Session`: login token (saved between visits) and the latest server state |
| `scripts/ui/` | Screens and shared styling (placeholder look until M4) |
| `scripts/build_info.gd` | Client build number, stamped from `/VERSION` by `tools/package.sh` |
| `tests/client_smoke.gd` | Headless test that drives the real screens against an API |

## Running outside the browser

In the Godot editor the client talks to `https://marz.gg/games/guildie/api/index.php` by default. To point it elsewhere, set the `GUILDIE_API_URL` environment variable.

## Headless test

```
GUILDIE_API_URL=http://127.0.0.1:8080/games/guildie/api/index.php \
  godot --headless --path client -s tests/client_smoke.gd
```
