# SiteGround Setup Guide (one-time)

This guide sets up everything Guildie needs on SiteGround before any game code is deployed. It takes about **15–20 minutes**. You only do this once.

> Menu names below match SiteGround's Site Tools as of late 2026. If a label is slightly different on your screen, look for the closest match, and tell Claude if something doesn't line up.

## What you'll end up with

| Thing | Where | Why |
|---|---|---|
| A MySQL database and user | Site Tools → MySQL | Stores all game state |
| `public_html/games/guildie/` | File Manager | The Godot web build (the game page) |
| `public_html/games/guildie/api/` | File Manager | The public PHP entry point |
| `guildie-private/` | File Manager, **next to** `public_html` | Config with the database password, plus game logic. The web can't reach it. |
| `guildie-private/config.php` | File Manager | Database credentials and settings |

Keep a password manager or a private note open. You'll save three values: **database name, database user, database password.**

---

## Step 1: Check the PHP version (look only, don't change it)

1. Open **Site Tools** for `marz.gg`.
2. Go to **Devs → PHP Manager**.
3. Note the PHP version shown for the site.

**Do not change the version.** It also affects your WordPress site. Guildie needs **PHP 8.0 or newer**. If you see 7.x, stop and tell Claude before continuing.

---

## Step 2: Create the database

1. In Site Tools, go to **Site → MySQL**.
2. On the **Databases** tab, click **Create Database**.
   - SiteGround generates a name with a prefix (something like `dbxxxxxxxxxx`). That's fine.
   - Optional: use the menu next to it to add a label such as `guildie` so you can recognize it later.
3. **Save the database name** in your password manager.

## Step 3: Create a database user

1. Switch to the **Users** tab and click **Create User**.
2. SiteGround generates a username and a strong password.
3. **Save the username and the password** in your password manager now. You may not be able to view the password again.

## Step 4: Give the user access to the database

1. Still on the **Users** tab (or back on **Databases**), find your new database and choose **Add New User** (or the equivalent "manage access" option).
2. Pick the user from Step 3.
3. Grant **All Privileges**, then confirm.

The database is ready. The host for Guildie is simply `localhost`, because the PHP code runs on the same server.

---

## Step 5: Create the folders

1. In Site Tools, go to **Site → File Manager**.
2. Find the folder that **contains** `public_html` (usually `www/marz.gg/`). This is the "site root."

Create these:

| Create this folder | Inside |
|---|---|
| `guildie-private` | The site root, **next to** `public_html` (not inside it) |
| `games/guildie` | `public_html` (`games` probably already exists from Pythio) |
| `api` | `public_html/games/guildie/` |

When you're done, the structure should look like this:

```
www/marz.gg/
├── guildie-private/          ← new, private
└── public_html/
    └── games/
        ├── pythio/
        └── guildie/          ← new
            └── api/          ← new
```

**Why the private folder matters:** anything inside `public_html` can be opened from a browser. `guildie-private` is outside it, so the database password can never be downloaded.

---

## Step 6: Create the config file

1. In File Manager, open `guildie-private`.
2. Create a new file named **`config.php`**.
3. Open it for editing and paste this, replacing the three empty values with what you saved in Steps 2–3:

```php
<?php
return [
    'db' => [
        'host'    => 'localhost',
        'name'    => 'PASTE_DATABASE_NAME',
        'user'    => 'PASTE_DATABASE_USER',
        'pass'    => 'PASTE_DATABASE_PASSWORD',
        'charset' => 'utf8mb4',
    ],
    'tick_interval_seconds' => 600,
    'debug' => false,
];
```

4. Save. Keep the quotes around each value.

(If your `config.php` has a `'build' => '0.0.1',` line from an earlier version of this guide, that's fine. It's no longer used; the build number now comes from the uploaded code.)

**Never** paste this password into a chat, an issue, or the repo. Only this one file on the server holds it.

---

## Step 7: Test the connection

This uses a small one-time test file from the repo: [`server/tools/dbcheck.php`](../server/tools/dbcheck.php).

1. Download `dbcheck.php` from GitHub (open the file, then use the download button).
2. In File Manager, upload it into `public_html/games/guildie/api/`.
3. In your browser, open **https://marz.gg/games/guildie/api/dbcheck.php**.
4. You should see:
   ```
   PHP version: 8.x.x
   Private folder: /home/.../guildie-private
   OK: connected to the database. MySQL version: ...
   ```
5. **Copy the "Private folder" line.** Claude needs this path later to set up the cron job (issue #7). It isn't a secret.
6. **Delete `dbcheck.php`** from the server.

### If it says FAIL

| Message | Most likely cause |
|---|---|
| `config.php was not found` | `guildie-private` is in the wrong place (it must sit next to `public_html`), or the file isn't named exactly `config.php` |
| `could not connect` | A typo in the name, user, or password, or Step 4 (adding the user to the database) was skipped |
| A blank page or a "500" error | Usually a PHP syntax slip in `config.php`, such as a missing quote or comma. Re-paste the template. |

---

## Step 8: Report back

Send Claude:

- ✅ "Database connected" (or the FAIL message you saw)
- The **PHP version**
- The **Private folder** path from Step 7

**Do not send** the database name, user, or password. Claude doesn't need them.

That's it. Next: [deploy.md](deploy.md) walks through uploading the game and creating the database tables.
