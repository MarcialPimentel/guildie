# Deploying Guildie to SiteGround

There are two kinds of deploy:

- **[First deploy](#first-deploy-one-time)** (once): database tables, files, and the cron job. About 20–30 minutes.
- **[Routine deploy](#routine-deploy)** (every update): upload two zips. About 5 minutes.

Before starting, make sure the [SiteGround setup guide](setup-siteground.md) is done (database, user, folders, and `guildie-private/config.php`).

## What you upload

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

The market tick runs on its own every 10 minutes, even when nobody is playing.

1. In Site Tools, go to **Devs → Cron Jobs**.
2. Under **Create New Cron Job**, enter this command (all one line):

   ```
   php /home/customer/www/marz.gg/guildie-private/app/tick.php > /dev/null 2>&1
   ```

3. For the interval, choose **every 10 minutes**. If there's no such preset, use the custom fields: Minute `*/10`, and `*` for Hour, Day, Month, and Weekday.
4. Click **Create**.
5. **Note the shortest interval SiteGround offered.** Tell Claude, because it answers GDD Open Question 5.

**Check it after about 20 minutes:** open the ping URL again. In the `tick` section, `tick_count` should have gone up and `seconds_since` should be under `600`.

The `> /dev/null 2>&1` part stops SiteGround from emailing you every 10 minutes. If the tick ever stops, the ping page shows it (`seconds_since` keeps growing). The game also runs an overdue tick automatically on the next player request, so nothing breaks while you look into it.

### Step 6: Play it on your phone

1. Open **https://marz.gg/games/guildie/** on your phone.
2. The footer should say **Client 0.1.0 · Server 0.1.0**.
3. Tap **Create account**, pick a name and password.
4. You should see **Gold: 100** and **Copper Ore × 5**.
5. Tap **Add test ore (+1)** a couple of times, then reload the page. You should still be logged in, and the ore count should have kept its new value.

If all of that works, **M0 is complete.**

---

## Routine deploy

For every update after the first one:

1. Check whether the update includes **new migration files** (`002_...sql`, etc.). If there are any, import them in phpMyAdmin first (Step 1 above), in order.
2. Upload and extract `guildie-private-<version>.zip` into `guildie-private/` (Step 2). Say **yes** if asked to overwrite.
3. Upload and extract `guildie-public-<version>.zip` into `public_html/games/guildie/` (Step 3). Say **yes** to overwrite.
4. Open the ping URL and confirm the new `build`.
5. Open the game and confirm the footer shows the new client and server build.

The cron job never needs changing.

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

If something else goes wrong, send Claude the exact message from the ping page or the game.

---

## For developers: building the packages

```
GODOT=/path/to/godot-4.7 tools/package.sh
```

The build number comes from the `VERSION` file at the repo root. Bump it for every deploy; the script stamps it into both the server and the client. The zips are written to `dist/` (not committed).

To check a live deploy end to end from a computer:

```
python3 tools/smoke_test.py https://marz.gg/games/guildie/api/index.php
```

This creates a throwaway `smoke_...` player.
