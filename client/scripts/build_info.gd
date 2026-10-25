## Build information. CLIENT_BUILD is stamped from the repo's VERSION file by tools/package.sh.
class_name BuildInfo
extends RefCounted

const CLIENT_BUILD := "dev"

## Used when running outside a browser (e.g. in the Godot editor).
## In the web build the API URL is worked out from the page address instead.
const DEFAULT_API_URL := "https://marz.gg/games/guildie/api/index.php"
