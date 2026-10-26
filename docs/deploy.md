# Deploying Guildie to SiteGround

**From 0.2.1, deploys are automatic.** Every merge to `main` runs the checks and, if they pass, uploads the new version to marz.gg over FTPS (`.github/workflows/deploy.yml`). Database updates apply themselves on the server's next request. Nothing to upload by hand.

- **[Automatic deploys](#automatic-deploys)**: how it works and the one-time setup (about 10 minutes).
- **[Manual deploy](#first-deploy-one-time)**: the old way, kept for emergencies or if FTP ever breaks.

Before anything, the [SiteGround setup guide](setup-siteground.md) must be done (database, user, folders, and `guildie-private/config.php`).

---

## Automatic deploys

### What happens on a merge

1. **Checks** (on every pull request too): PHP syntax, the content validator, the API smoke test against a throwaway MySQL database, the headless client test, and the Godot web export. A pull request shows a green check when they pass; its packages can be downloaded under the PR's **Checks → Deploy → Artifacts**.
2. **Upload server code** into `guildie-private/` (`app/`, `content/`, `migrations/`). `config.php` is never touched.
3. **Upload the game** into `public_html/games/guildie/`.
4. **Database updates:** the first request or cron tick after the upload applies any new `migrations/NNN_*.sql` file once (protected by a database lock) and records it in `game_state.schema_version`. The ping URL shows `"schema"`.

The build number shows as e.g. **0.2.1 (build 12)**: the `VERSION` file plus the GitHub run number.

### One-time setup

**1. Create an FTP account for deploys (SiteGround).**

1. Site Tools → **Site → FTP Accounts**.
2. Create an account: username `guildie-deploy` (SiteGround adds `@marz.gg`), a strong password (save it in your password manager), and as its folder the **site's top folder**, the one that contains both `public_html` and `guildie-private` (usually `/` in the folder picker). Not `public_html`: the deploy must reach `guildie-private` too.
3. On the new account: **⋮ → FTP Credentials**. Note the **Host** and **Port** (normally 21).

Pythio's `deploy@marz.gg` account can't be reused: its folder is `public_html/games`, which can't reach `guildie-private`.

**2. Add three secrets to the GitHub repo.**

Repo **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `FTP_SERVER` | the Host from step 1 |
| `FTP_USERNAME` | the full username, e.g. `guildie-deploy@marz.gg` |
| `FTP_PASSWORD` | its password |

GitHub encrypts them: nobody can read them back, only the deploy job can use them. The upload folders aren't secret; they're in the workflow file.

**3. Run it.** Merge the next PR, or GitHub → **Actions → Deploy → Run workflow** (on `main`). After a few minutes, the ping URL shows the new `build`.

### If an automatic deploy goes wrong

| What you see | Most likely cause | Fix |
|---|---|---|
| Deploy job says "FTP secrets not set yet" | Secrets missing or misspelt | Re-check the three names exactly |
| Upload step: login failed | Wrong username format or password | Username includes `@marz.gg`; re-enter `FTP_PASSWORD` |
| Upload step: TLS / certificate error | FTPS handshake | Change both `protocol: ftps` to `protocol: ftp` in `.github/workflows/deploy.yml` |
| Upload step: "folder not found" / files land in the wrong place | The FTP account's folder isn't the site root | Edit the account's folder to the site root, or tell Claude the folder it uses |
| Checks fail on a PR | A real bug caught before it went live | Nothing reached players; Claude fixes the PR |

To **roll back**, revert the PR on GitHub and merge the revert. A database change that already ran is not undone, so migrations must stay backward-compatible.

---

# Manual deploy (fallback)

## What you upload (manual)

Each deploy uses these files. Claude sends them to you in the chat for each version (they can also be attached to a GitHub release, under **Releases** on the right side of the repo page):

| File | Where it goes | What it is |
|---|---|---|
| `guildie-private-<version>.zip` | Extract into `guildie-private/` | Server code (`app/`) and game data (`content/`) |
| `guildie-public-<version>.zip` | Extract into `public_html/games/guildie/` | The game (Godot web build) and `api/index.php` |
| `001_init.sql` (and later migrations) | Import in phpMyAdmin | Database tables. Also in the repo under `server/migrations/`. |

Neither zip contains `config.php`, so extracting them never touches your database settings.

---

## First deploy (one time)

### Step 1: Create the database tables

1. Download `001_init.sql` (from the chat, or from `server/migrations/` in the repo: open the file, then use the download button).
2. In Site Tools, go to **Site → MySQL**, open the **phpMyAdmin** tab, and click **Access phpMyAdmin**.
3. In the left panel, click your Guildie database.
4. Open the **Import** tab, choose `001_init.sql`, and click **Go** (or **Import**) at the bottom.
5. You should see a success message, and the left panel should list six tables: `game_state`, `inventory`, `login_failures`, `players`, `sessions`, `tick_log`.

The file is safe to import twice; it won't duplicate anything.

### Step 2: Upload the server code

1. Go to **Site → File Manager** and open `guildie-private` (next to `public_html`).
2. Upload `guildie-private-<version>.zip` there.
3. Right-click the zip → **Extract**, and extract into the current folder.
4. Delete the zip.

`guildie-private` should now contain `app/`, `content/`, and your `config.php`.

### Step 3: Upload the game

1. Open `public_html/games/guildie/`.
2. Upload `guildie-public-<version>.zip` there.
3. Right-click → **Extract** into the current folder.
4. Delete the zip.

The folder should now contain `index.html`, `index.wasm`, `index.pck`, `index.js`, a few icons, and the `api/` folder with `index.php` inside.

### Step 4: Check the server

Open this in your browser:

**https://marz.gg/games/guildie/api/index.php?action=ping**

You should see something like:

```json
{"ok":true,"data":{"pong":true,"server_time":1792917495,"build":"0.1.0","tick":{...}}}
```

- `"ok":true` means the server code, config, and database are all connected.
- `"build"` should match the version you uploaded.

### Step 5: Set up the market tick (cron job)

The market tick runs on its own every 5 minutes, even when nobody is playing.

1. In Site Tools, go to **Devs → Cron Jobs**.
2. Under **Create New Cron Job**, enter this command (all one line):

   ```
   php /home/customer/www/marz.gg/guildie-private/app/tick.php > /dev/null 2>&1
   ```

3. For the interval, choose **every 5 minutes**. If there's no such preset, use the custom fields: Minute `*/5`, and `*` for Hour, Day, Month, and Weekday. (This must match `tick_interval_seconds` = 300 in `config.php`.)
4. Click **Create**.

**Check it after about 15 minutes:** open the ping URL again. In the `tick` section, `tick_count` should have gone up and `seconds_since` should be under `300`.

The `> /dev/null 2>&1` part stops SiteGround from emailing you every 5 minutes. If the tick ever stops, the ping page shows it (`seconds_since` keeps growing). The game also runs an overdue tick automatically on the next player request, so nothing breaks while you look into it.

### Step 6: Play it on your phone

1. Open **https://marz.gg/games/guildie/** on your phone.
2. The footer should show the client and server build you uploaded.
3. Tap **Create account**, pick a name and password, then choose a guild.
4. You should land in the Workshop with your gathering station partly full.

---

## Routine deploy (manual)

Only needed if automatic deploys are unavailable:

1. New migration files apply themselves from 0.2.1 on (they're inside the private zip). For older versions, import them in phpMyAdmin first (Step 1 above), in order.
2. Upload and extract `guildie-private-<version>.zip` into `guildie-private/` (Step 2). Say **yes** if asked to overwrite.
3. Upload and extract `guildie-public-<version>.zip` into `public_html/games/guildie/` (Step 3). Say **yes** to overwrite.
4. Open the ping URL and confirm the new `build`.
5. Open the game and confirm the footer shows the new client and server build.

The cron job only changes when a release says so.

---

## Deploying 0.2.0 (M1 Market Prototype)

This update adds professions, crafting, and the market. It also **starts everyone fresh**: all accounts and items are deleted, so every playtester begins equal. About 15 minutes.

Files (sent in the chat): `002_m1_market.sql`, `wipe_players.sql`, `guildie-private-0.2.0.zip`, `guildie-public-0.2.0.zip`.

### 1. Add the new tables

phpMyAdmin → your Guildie database → **Import** → choose `002_m1_market.sql` → **Go**.
The left panel should now also list: `activity`, `craft_jobs`, `gathering`, `listings`, `market_demand`, `market_items`, `player_professions`, `trades`.

### 2. Fresh start (deletes all accounts)

phpMyAdmin → your Guildie database → **Import** → choose `wipe_players.sql` → **Go**.
This deletes every player, including your M0 test account. Only do this once, now.

### 3. Upload the code

Same as Steps 2 and 3 of the first deploy: extract `guildie-private-0.2.0.zip` into `guildie-private/` and `guildie-public-0.2.0.zip` into `public_html/games/guildie/`, saying **yes** to overwrite.

### 4. Speed up the market tick to every 5 minutes

The market now moves on each tick, so it runs more often. Two changes, which must match:

1. **config.php:** File Manager → `guildie-private/config.php` → Edit. Change
   `'tick_interval_seconds' => 600,` to `'tick_interval_seconds' => 300,` and save.
2. **Cron job:** Site Tools → **Devs → Cron Jobs**. Edit the Guildie job (or delete it and create it again) with the same command, but set Minute to `*/5` (every 5 minutes).

### 5. Check it

1. Open **https://marz.gg/games/guildie/api/index.php?action=ping**: `"build":"0.2.0"`.
2. Open the game: footer shows **Client 0.2.0 · Server 0.2.0**.
3. Create a new account and choose a guild. You should land in the Workshop with your station partly full.
4. After 5–10 minutes, open **Market**: every item should have a price (the Guild Suppliers' stock appears after the first tick).

Then share the [playtest guide](playtest-m1.md) with your friends.

---

## Troubleshooting

| What you see | Most likely cause | Fix |
|---|---|---|
| Ping shows `not_installed` | `guildie-private/app/` is missing or in the wrong place | Redo Step 2; `guildie-private` must sit next to `public_html` |
| Ping shows `server_error` | Database tables missing, or a config typo | Do Step 1; recheck `config.php` against the setup guide |
| A blank white page or "500" on the ping URL | A typo in `config.php` (missing quote or comma) | Re-paste the template from the setup guide |
| Game footer says **server unreachable** | The API folder or files aren't where expected | Check that `public_html/games/guildie/api/index.php` exists |
| Game footer shows an **old build** | Your browser cached the previous version | Hard refresh (desktop: Ctrl+Shift+R / Cmd+Shift+R; phone: close the tab and reopen) |
| "Too many failed logins" | 10 wrong passwords from the same network in 15 minutes | Wait 15 minutes |
| `tick_count` never goes up | The cron command has a typo or the path is wrong | Compare it with Step 5 exactly |
| Ping shows `server_error` right after the 0.2.0 upload | `002_m1_market.sql` wasn't imported | Import it (0.2.0 step 1) |
| Market shows "—" for every price | No market tick has run since the update | Wait 5 minutes; check the cron job (0.2.0 step 4) |

If something else goes wrong, send Claude the exact message from the ping page or the game.

---

## For developers: building the packages

```
GODOT=/path/to/godot-4.7 tools/package.sh
```

The build number comes from the `VERSION` file at the repo root (plus `BUILD_NUMBER` if set, as CI does). Bump `VERSION` for each meaningful release; the script stamps it into both the server and the client. The zips are written to `dist/` (not committed).

To check a live deploy end to end from a computer:

```
python3 tools/smoke_test.py https://marz.gg/games/guildie/api/index.php
```

This creates throwaway `smoke_...` players. Crafting checks wait for real craft timers (a few minutes at playtest pace).

### Local testing

- **API:** run a local PHP server with `GUILDIE_PRIVATE` pointing at a private folder (config + app symlink) and `GUILDIE_CONTENT` at a content copy whose `economy.json` has `pace.time_multiplier` 0.05, then `python3 tools/smoke_test.py URL --tick "php server/app/tick.php --force"`.
- **Client:** `GUILDIE_API_URL=URL godot --headless --path client -s tests/client_smoke.gd`.
- **Economy:** `php tools/econ_sim.php --db-name=SCRATCH_DB --db-user=... --db-pass=... --players=6 --days=7` runs bot players through the real server code for a simulated week and prints prices, NPC vs player sales, and gold. It wipes the database you give it, so never point it at the live one.
