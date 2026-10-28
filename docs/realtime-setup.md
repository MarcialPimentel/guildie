# Setting up the realtime rooms (the living city, 0.9.0)

The living city shows other players moving around the guild quarters live. SiteGround can't do that (it can't keep connections open), so a small "rooms" program runs on the **DigitalOcean droplet** that already hosts Hormigas, as one more container next to it. It only carries positions, waves and slaps. Ducats, items, trades and orders stay on SiteGround.

**Until you do this, nothing breaks:** the quarters still show stalls, townsfolk and echoes of recent activity, with "Quiet day: other merchants can't be seen right now" at the bottom. You can do it any time after 0.9.0 is merged.

It takes about 15 minutes, once. The droplet's address and how to log in are in your private doc "Hormigas — Hosting & Session Handoff (private)". Keep secrets in your password manager, never in the repo or in chat.

## How it fits on the droplet

```
guildie.marz.gg ──> Caddy (already there: HTTPS) ──> guildie-realtime container (new)
hormigas.marz.gg     ──> Caddy                        ──> hormigas container (unchanged)
```

The new container uses about 50 MB of memory and almost no CPU. If it ever stops, Hormigas is unaffected and Guildie's quarters just say "Quiet day".

## 1. Add the web address (SiteGround DNS) ✓ done 2026-10-28

1. SiteGround **Site Tools** → **Domain** → **DNS Zone Editor**.
2. Choose **A** record. **Name:** `guildie`. **Points to:** the droplet's IP (the same IP as the `hormigas` record). Leave TTL as it is. Click **Create**.

`guildie.marz.gg` only carries the live rooms. If someone opens it in a browser, Caddy sends them to the game at `marz.gg/games/guildie/`.

## 2. Make up the shared secret

Make up a long random phrase of at least 32 characters (your password manager's generator, letters and numbers only). Save it as "Guildie realtime secret". The game server uses it to sign each player's pass, and the rooms use it to check the pass.

## 3. Add two secrets to the Guildie repo on GitHub ✓ done 2026-10-28

These let GitHub restart the rooms after each merge. They're the same values the Hormigas repo already uses (GitHub never shows a saved secret, so copy them from the source):

1. Open the **guildie** repository on GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret** `DROPLET_HOST`: the droplet's IP address.
3. **New repository secret** `DROPLET_SSH_KEY`: open the `hormigas-deploy` private key file from your PC's `.ssh` folder in Notepad, and paste **all** of it, including the `-----BEGIN` and `-----END` lines.

## 4. After merging 0.9.0: make the rooms' image public

The merge's deploy run builds the rooms as a package on GitHub (`guildie-realtime`). New packages start private, and the droplet can only download public ones (same as Hormigas):

1. On GitHub, click your profile picture → **Your profile** → **Packages** → **guildie-realtime**.
2. **Package settings** (bottom right) → **Change visibility** → **Public** → type the name to confirm.

## 5. One-time change on the droplet

Log in as in your private doc (`ssh deploy@…`), then `cd /opt/hub`. Three small edits, then a restart of the new container. The text to paste is in this repo's `realtime/deploy/` folder.

1. **The secret.** Run `nano .env` and add this line at the end, with your phrase from step 2:
   ```
   GUILDIE_REALTIME_SECRET=your-phrase-here
   ```
   Save with **Ctrl+O**, **Enter**, then exit with **Ctrl+X**.
2. **The container.** Run `nano docker-compose.yml`. Paste the block from `realtime/deploy/compose-service.yml` (from `  guildie-realtime:` down) just above the line `volumes:` near the end, keeping its two-space indent. Save and exit.
3. **The web address.** Run `nano Caddyfile` and paste the block from `realtime/deploy/Caddyfile-block` at the end. Save and exit.
4. **Start it:**
   ```
   docker compose up -d guildie-realtime
   docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
   ```
   The second line makes Caddy pick up the new address without restarting Hormigas.
5. **Check:** `docker compose ps` should list `guildie-realtime` as running (healthy after half a minute). In a browser, `https://guildie.marz.gg/health` should show `{"ok":true,…}`. If the page doesn't load yet, the DNS record from step 1 may still be on its way: wait and try again.
6. **Keep the repo copy in step:** the Hormigas repo keeps a copy of these files in `deploy/hub/`. Add the same two blocks there (or ask a session to), as your private doc says.

From now on, every merge to Guildie's `main` rebuilds the rooms and restarts the container by itself (the **realtime** job in the deploy run). Players in a quarter reconnect on their own within a few seconds.

## 6. Tell the game server where the rooms are

1. SiteGround **Site Tools** → **Site** → **File Manager**.
2. Open the `guildie-private` folder (next to `public_html`, not inside it) and edit `config.php`.
3. Before the line `'debug' => false,` add these two lines, with your phrase from step 2:

```php
    'realtime_url'    => 'wss://guildie.marz.gg',
    'realtime_secret' => 'THE SAME PHRASE AS GUILDIE_REALTIME_SECRET',
```

4. Save. No deploy is needed: the next page load uses it.

## 7. Try it

1. On your computer, open the game in two different browsers (or one normal and one private window), logged in as two different players.
2. In both, click **Quarters** in the dock and go to the same quarter.
3. Each should see the other's merchant walk around, and the bottom line should say "1 other merchant here". Walk next to each other and press **F** to slap.

## Turning it off

Set `'realtime_url' => ''` in `config.php`. The quarters go back to stalls, townsfolk and echoes. To stop the container too: `docker compose stop guildie-realtime` on the droplet.

## If something goes wrong

- **"Quiet day" after step 6:** open `https://guildie.marz.gg/health`. If it answers, check that `realtime_url` starts with `wss://` and that the two secrets match exactly. If it doesn't answer, see the next items.
- **502 Bad Gateway** on that address: Caddy is fine but the container is down. On the droplet: `docker compose ps` and `docker compose logs guildie-realtime`. A line "Set REALTIME_SECRET" means step 5.1 is missing or misspelled.
- **The page doesn't load at all:** the DNS record (step 1) isn't active yet, or Caddy wasn't reloaded (step 5.4).
- **The realtime job says "Realtime restart skipped":** the two GitHub secrets (step 3) aren't set, or the container isn't in `docker-compose.yml` yet (step 5). The image is still built.
- **The realtime job fails to pull:** the package isn't public yet (step 4).
- **Players on `www.marz.gg`:** both `https://marz.gg` and `https://www.marz.gg` may connect (`ALLOWED_ORIGINS` in the compose block). Any other address needs adding there.
