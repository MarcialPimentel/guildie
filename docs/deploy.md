# Deploying Guildie to SiteGround

**From 0.2.1, deploys are automatic.** Every merge to `main` builds the game (the full checks already passed on the PR) and uploads the new version to marz.gg over FTPS through two locked-down FTP accounts (`.github/workflows/deploy.yml`). Database updates apply themselves on the server's next request. Nothing to upload by hand.

- **[Automatic deploys](#automatic-deploys)**: how it works and the one-time setup (about 10 minutes).
- **[Manual deploy](#first-deploy-one-time)**: the old way, kept for emergencies or if FTP ever breaks.

Before anything, the [SiteGround setup guide](setup-siteground.md) must be done (database, user, folders, and `guildie-private/config.php`).

---

## Automatic deploys

### What happens on a merge

1. **Checks run on the pull request, not again on the merge.** On every PR: PHP syntax, the content validator, the API smoke test against a throwaway MySQL database, the web client build (type check), and a browser test that plays the game on a phone-sized and a desktop-sized screen (about 8 minutes). A PR shows a green check when they pass; its packages can be downloaded under the PR's **Checks → Deploy → Artifacts**. The merge itself only re-checks PHP syntax and the content, builds the game and uploads it, so it's live **about 2 minutes** after the merge (from 0.17.2; it used to run every test again, about 8 minutes). The "up to date" rule below makes sure the PR tested exactly what gets merged. To deploy with every test anyway: GitHub → **Actions → Deploy → Run workflow** on `main`.
2. **Upload server code** into `guildie-private/` (`app/`, `content/`, `migrations/`). `config.php` is never touched.
3. **Upload the game** into `public_html/games/guildie/`.
4. **Database updates:** the first request or cron tick after the upload applies any new `migrations/NNN_*.sql` file once (protected by a database lock) and records it in `game_state.schema_version`. The ping URL shows `"schema"`.

The build number shows as e.g. **0.2.1 (build 12)**: the `VERSION` file plus the GitHub run number.

### One-time setup

Two SiteGround FTP accounts, each limited to the one folder it needs, so neither password can reach WordPress or anything else on the site.

> The actual account names, home folders and server paths are kept out of this public repo. They're in Marz's private hosting doc and in `hosting.private.md` on Marz's PC (git-ignored).

**1. FTP account for the server code (SiteGround).**

1. Site Tools → **Site → FTP Accounts**.
2. Create an account with a strong password (save it in your password manager) whose home path is the **`guildie-private`** folder.
3. On the account: **⋮ → FTP Credentials**. Note the **Host**.

**2. FTP account for the game files.** An account whose home path is **`public_html/games/`** (Guildie shares Pythio's).

**3. Add five secrets to the Guildie repo.**

Repo **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `FTP_SERVER` | the Host (the same for both accounts) |
| `FTP_USERNAME` | the server-code account's full username |
| `FTP_PASSWORD` | its password |
| `FTP_PUBLIC_USERNAME` | the game-files account's full username |
| `FTP_PUBLIC_PASSWORD` | its password |

GitHub encrypts them: nobody can read them back, only the deploy job can use them. Until all five exist, merges run the checks and skip the upload (the Deploy job says which secret is missing).

**4. Run it.** Merge the next PR, or GitHub → **Actions → Deploy → Run workflow** (on `main`). After a few minutes, the ping URL shows the new `build`.

**5. Only merge PRs that are up to date with `main` (one time, about 3 minutes).** Merges no longer re-run the tests, so a PR must have been tested on top of the latest `main`. This GitHub rule enforces it:

1. On the Guildie repo page: **Settings → Rules → Rulesets → New ruleset → New branch ruleset**.
2. **Ruleset name:** `main`. **Enforcement status:** **Active**.
3. **Target branches → Add target → Include default branch**.
4. Under **Rules**, leave "Restrict deletions" and "Block force pushes" ticked, and tick **Require status checks to pass**.
5. Under it, tick **Require branches to be up to date before merging**, then **+ Add checks**, type `checks` and pick **checks** (GitHub Actions).
6. Click **Create** at the bottom.

From then on, if another PR merged first, GitHub asks for the branch to be updated before merging. Claude does that (it re-runs that PR's tests, about 8 minutes), then merges.

### If an automatic deploy goes wrong

| What you see | Most likely cause | Fix |
|---|---|---|
| Deploy job says "Upload skipped: these secrets aren't set yet" | Secrets missing or misspelt | It names the missing ones; add them exactly as written |
| Upload step: login failed | Wrong username format or password | The username includes the `@` and domain part; re-enter the password secret |
| Upload step: TLS / certificate error | FTPS handshake | Change both `protocol: ftps` to `protocol: ftp` in `.github/workflows/deploy.yml` |
| Upload step: "folder not found" / files land in the wrong place | An account's home path differs from the setup above | Check the home paths in FTP Accounts, or tell Claude what they are |
| Checks fail on a PR | A real bug caught before it went live | Nothing reached players; Claude fixes the PR |
| "Live check blocked by captcha" warning | SiteGround's bot protection blocked GitHub's check (the upload itself worked) | Open the ping URL in a browser and look for the new `build`; Claude can check it from your PC |

To **roll back**, revert the PR on GitHub and merge the revert. A database change that already ran is not undone, so migrations must stay backward-compatible.

---

# Manual deploy (fallback)

## What you upload (manual)

Each deploy uses these files. Claude sends them to you in the chat for each version (they can also be attached to a GitHub release, under **Releases** on the right side of the repo page):

| File | Where it goes | What it is |
|---|---|---|
| `guildie-private-<version>.zip` | Extract into `guildie-private/` | Server code (`app/`) and game data (`content/`) |
| `guildie-public-<version>.zip` | Extract into `public_html/games/guildie/` | The game (web client: `index.html`, `assets/`, `.htaccess`) and `api/index.php` |
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

The folder should now contain `index.html`, `.htaccess`, an `assets/` folder, and the `api/` folder with `index.php` inside.

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
2. Under **Create New Cron Job**, enter this command (all one line), with your site's full folder path in place of `SITE_ROOT` (the exact command is in your private hosting notes):

   ```
   php SITE_ROOT/guildie-private/app/tick.php > /dev/null 2>&1
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

## Deploying 0.2.2 (0-gold fix, Sell to guild, Feedback)

Automatic: merging the PR deploys it, and the server adds the new database tables by itself (migration `003`). The only manual step is turning on your private feedback page, once.

### 1. Check the deploy

1. Wait for the GitHub Action to finish (about 3–5 minutes after the merge).
2. Open **https://marz.gg/games/guildie/api/index.php?action=ping**. You should see `"build":"0.2.2 (build …)"` and `"schema":3`.

### 2. Turn on the feedback page (one time, about 3 minutes)

Players' feedback is saved from day one; this step only lets you read it.

1. Make up a long secret phrase with no spaces: three or four random words joined by dashes, plus a number. Keep it to yourself (and in `hosting.private.md` on your PC, so Claude can read feedback); never put it in the repo or the docs. Anyone who knows it can read the feedback, so don't reuse a password.
2. SiteGround **Site Tools → Site → File Manager**.
3. Open the folder **`guildie-private`** (next to `public_html`, not inside it).
4. Right-click **`config.php`** → **Edit**.
5. Find the line `'debug' => false,` and add this line **just above it** (keep the quotes and the comma):
   ```php
   'feedback_key' => 'YOUR-PHRASE',
   ```
   (with your phrase in place of `YOUR-PHRASE`).
6. Click **Save**. Then reload the ping URL: if it still shows `"ok":true`, the edit is fine. If it shows a blank page or an error, a quote or comma is missing: open the file again and check the line.
7. Open your feedback page and bookmark it:
   **https://marz.gg/games/guildie/api/index.php?action=feedback_list&key=YOUR-PHRASE**
   It shows every note, newest first, with the player, guild, gold, screen, build and time. A wrong or missing phrase shows "Unknown action".

---

## Deploying 0.3.0 (City tab and direct trades)

Fully automatic: merging deploys it, and the server adds the new `trade_offers` table by itself (migration `004`). No SiteGround steps.

**Check it:** the ping URL shows `"build":"0.3.0 (build …)"` and `"schema":4`. In the game, the tab bar has a fifth tab, **City**.

---

## Deploying 0.3.1 (sell form order, one City list, Workshop + Craft)

Fully automatic, with no database changes. Check that the ping URL shows `"build":"0.3.1 (build …)"`, and that the game has four tabs: Workshop, Market, Bag, City.

---

## Deploying 0.4.0 (the new web client)

Fully automatic, with no database changes and no SiteGround steps. The deploy replaces the Godot files (`index.wasm`, `index.pck`, …) with the web client: the upload tool removes files that are no longer part of the game.

**Check it:**
1. The ping URL shows `"build":"0.4.0 (build …)"`.
2. Open the game: it should appear almost instantly, with no Godot loading bar. The login screen's footer shows **Client 0.4.0 · Server 0.4.0**.
3. **Everyone logs in once more**, because the new client keeps the login in a different place. Accounts and progress are unchanged.
4. On a computer, the game uses the full window: tabs at the top, two columns on the Workshop.

---

## Deploying 0.14.0 (the new-player guide)

Fully automatic. Migration 010 adds the guide's table and marks every existing player's guide as finished; it runs on its own on the first request after the upload. The ping URL shows `"build":"0.14.0 (build …)"` and `"schema":10`.

What players notice: a **new** merchant sees a "First steps" card with one step at a time and ducats to claim; on a computer an arrow points at the place. Existing players see nothing new.

---

## Deploying 0.13.0 (one square)

Fully automatic, with no database change. The ping URL shows `"build":"0.13.0 (build …)"`. The realtime rooms restart on the droplet as usual; passes now list only the `palazzo` room.

What players notice:
- On a computer, the quay has only your workshop places, and the Steps go straight to the Palazzo.
- The Palazzo has the marketplace (a vendor per guild and the selling desk), the Factotum's bronze statue and portrait, and the Hall of honor with players, friends and trades.
- The guild quarters are gone. On phones, City → Quarters is gone, and buy offers are in the Mercato tab.

---

## Deploying 0.12.0 (the recipe ladder to 100)

Fully automatic, with no database change (new items and recipes are content). The ping URL shows `"build":"0.12.0 (build …)"`.

What players notice:
- The guild trainer lists 16 recipes per guild, up to skill 94.
- Stations start a third raw at skill 40 and a fourth at 65; players already past those skills get them on their next visit.
- 42 new items in the Mercato, each with its own icon.
- Orders are bigger at higher ranks.
- Bottega level 4 needs Gears, Machine Oil and Drive Belts.

---

## Deploying 0.10.3 (guilds as data)

Fully automatic, with no database change. The ping URL shows `"build":"0.10.3 (build …)"` and `"schema":8`. The realtime rooms restart on the droplet as usual (the deploy does it).

Players notice nothing new: the game should look and play exactly as 0.10.2. Behind the scenes every guild's names, colors and hats now come from `content/professions.json`, and the art for each guild lives in its own kit file, so a new guild (the Glassblower) is mostly content. Two small fixes ride along: rare finds keep working once raws 3 and 4 arrive, and a bundle order never asks for another guild's goods above your rank.

---

## Deploying 0.9.0 (the living city)

Automatic. Migration **007** (friends, slap settings, the Duke's order) applies itself; the ping URL shows `"build":"0.9.0 (build …)"` and `"schema":7`. It needs 0.8.0 (migration 006) merged first.

**Optional, any time: live players.** Other merchants only appear live once the realtime rooms run on the DigitalOcean droplet: [realtime-setup.md](realtime-setup.md) (about 15 minutes, one time; no new account). Until then everything else works, and quarters say "Quiet day".

What players notice:

- **On a computer:** you have your own blob merchant. Walk with **WASD** or the arrow keys, or click the ground. Clicking a place still opens it at once while your merchant walks over.
- **Quarters:** click **Quarters** in the dock (or the arch at the east end of the quay) and pick a guild. Its piazza has up to 12 bottegas (friends first), townsfolk, and faint "echoes" of crafters who did something in the last 30 minutes. Click a stall, an echo or a player to open their bottega: shop window, **Propose a trade**, **Add friend**.
- **Live players** (with the rooms set up): others walk around with you. **E** waves; **F** slaps the nearest merchant (a gentlemanly duel challenge, cosmetic only). **Slaps: on/off** in the top bar opts out.
- **The Duke's order:** the herald's board by the storehouse, the fountain in every quarter, or **City → Duke's order** on phones. Give goods, get paid at once, and a bonus for everyone if every line fills in time.
- **On a phone:** the City tab gains **Quarters**, **Friends** and **Duke's order**.

---

## Deploying 0.7.0 (the 3D harbor)

Fully automatic, with no database or server changes. The ping URL shows `"build":"0.7.0 (build …)"` and `"schema":5`.

What players notice:

- **On a computer**, the game opens on the **3D harbor**. Click a place (or its floating label, or the buttons along the bottom) to open it in a panel on the right: the station, the workbench, customers at your door, your stall, the Mercato, the storehouse, the guild hall, the news galley and your bottega's ledger. Drag to turn the view, right-drag to move, scroll to zoom. **Classic view** in the header switches back to the tabs (remembered next time).
- **On a phone**, nothing changes: the classic view stays, and the 3D file is never downloaded.
- To try the harbor on a phone, open the game with `?view=3d` at the end of the address (for example `https://marz.gg/games/guildie/?view=3d`). One finger turns, two fingers zoom. Tap **Classic view** in the header to go back.
- Add `?debug=1` to see how fast the harbor runs (frames per second, draw calls).

---

## Deploying 0.6.0 (the Portovela look)

Fully automatic, with no database changes. The ping URL shows `"build":"0.6.0 (build …)"` and `"schema":5`.

What players notice:

- A new look: light sea-teal colors by day, and a night palette when their phone is in dark mode. New fonts, and an icon for every item.
- New names: money is **ducats** (shown with a coin), the Workshop tab is **Bottega**, the Market tab is **Mercato**, the weekly Tournament is the **Regatta**, Steam Tonic is **Lemon Tonic**, and events and customers have Portovela names.
- Nothing about gold amounts, items, prices or progress changes. Old lines in the activity log written before the update still say "g" for money.

If the game still looks brown and gold after the deploy, the phone has the old page cached: pull down to refresh, or flush the SiteGround cache (Site Tools → Speed → Caching → Dynamic Cache → Flush).

---

## Deploying 0.5.2 (safer deploys, no duplicate orders, return screen on phones)

Fully automatic, with no database changes.

From this release, **the deploy checks itself**: after uploading, GitHub waits until the live server reports the new build and database version, and the game page serves the new client. If not, the run fails and shows why. If the game page is still cached by SiteGround, the run shows a **"Stale cache"** warning instead: flush the cache (Site Tools → Speed → Caching → Dynamic Cache → Flush).

New database updates (from `006`) only run once their file has fully arrived (each ends with a `-- END NNN` line), so a request that lands mid-upload can no longer half-apply one.

---

## Deploying 0.5.1 (exploit fixes)

Fully automatic, with no database changes. The ping URL shows `"build":"0.5.1 (build …)"` and `"schema":5`. Orders already on boards keep the reward they were created with; new orders use the new pricing.

---

## Deploying 0.5.0 (order board, market ticker, news, surprises)

Fully automatic. The server adds its new tables by itself (migration `005`: orders, price history, world events). No SiteGround steps.

**Check it:**
1. The ping URL shows `"build":"0.5.0 (build …)"` and `"schema":5`.
2. Open the game page and check that the footer says **Client 0.5.0**. If it still shows the old version, flush the SiteGround cache (Site Tools → Speed → Caching → Dynamic Cache → Flush).
3. The Workshop shows **Orders** with three customers, and the Market shows **City news** and green/red arrows. Sparklines fill in over the first hour as prices are recorded.

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
tools/package.sh
```

Needs Node.js 20+ (the script runs `npm ci` and `npm run build` in `client/`), plus `python3` and `zip`; CI has all of them.

The build number comes from the `VERSION` file at the repo root (plus `BUILD_NUMBER` if set, as CI does). Bump `VERSION` for each meaningful release; the script stamps it into both the server and the client. The zips are written to `dist/` (not committed).

To check a live deploy end to end from a computer:

```
python3 tools/smoke_test.py https://marz.gg/games/guildie/api/index.php
```

This creates throwaway `smoke_...` players. Crafting checks wait for real craft timers (a few minutes at playtest pace).

### Local testing

- **API:** run a local PHP server with `GUILDIE_PRIVATE` pointing at a private folder (config + app symlink) and `GUILDIE_CONTENT` at a content copy whose `economy.json` has `pace.time_multiplier` 0.05, then `python3 tools/smoke_test.py URL --tick "php server/app/tick.php --force"`.
- **Client (development):** `cd client && npm install`, then `GUILDIE_API_TARGET=http://127.0.0.1:8080 npm run dev` opens the game at http://localhost:5173 and forwards `api/index.php` to that server.
- **Client (browser test):** build the client, serve `client/dist/` next to the API (like `public_html/games/guildie/`), then `npx playwright install chromium` once and `GUILDIE_URL=http://127.0.0.1:8080/games/guildie/ npx playwright test` in `client/`.
- **Economy:** `php tools/econ_sim.php --db-name=SCRATCH_DB --db-user=... --db-pass=... --players=6 --days=7` runs bot players through the real server code for a simulated week and prints prices, NPC vs player sales, and gold. It wipes the database you give it, so never point it at the live one.
