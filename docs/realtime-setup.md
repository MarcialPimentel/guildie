# Setting up the realtime rooms (the living city, 0.9.0)

The living city shows other players moving around the guild quarters live. SiteGround can't do that (it can't keep connections open), so a small free service on **Cloudflare** runs the "rooms". It only carries positions, waves and slaps. Ducats, items, trades and orders stay on SiteGround.

**Until you do this, nothing breaks:** the quarters still show stalls, townsfolk and echoes of recent activity, with "Quiet day: other merchants can't be seen right now" at the bottom. You can do it any time.

It takes about 15 minutes. You'll create three secrets and paste them in two places. Keep them in your password manager, never in the repo or in chat.

## What it costs

The Cloudflare **Workers Free** plan (checked 2026-10-28): 100,000 requests a day, and rooms cost nothing while nobody moves. Guildie's estimate for 20 daily players is under 4% of that (`docs/living-city.md` §7.2). No card is needed for the free plan. If the daily allowance ever runs out, the rooms stop until midnight UTC and the game shows "Quiet day"; the paid plan is $5 a month if that happens often.

## 1. Create a Cloudflare account

1. Go to <https://dash.cloudflare.com/sign-up>.
2. Enter your email and a password, then **Sign up**. Confirm the email Cloudflare sends you.
3. Skip any "add a website" or domain step: you don't need one.

## 2. Pick your workers.dev address

1. In the Cloudflare dashboard, open **Compute (Workers)** → **Workers & Pages** in the left menu.
2. The first time, Cloudflare asks you to choose a **workers.dev subdomain**. Pick something short, e.g. `marz`. Your rooms will live at `https://guildie-realtime.marz.workers.dev`.
3. If it offers a plan, choose **Free**.

## 3. Copy your Account ID

1. Still on **Workers & Pages**, look at the right-hand side for **Account ID**.
2. Click the copy icon. Save it in your password manager as "Cloudflare Account ID".

## 4. Create an API token for GitHub

1. Click your profile icon (top right) → **My Profile** → **API Tokens**.
2. Click **Create Token**.
3. Next to **Edit Cloudflare Workers**, click **Use template**.
4. Under **Account Resources**, choose **Include** → your account. Under **Zone Resources**, choose **All zones** (there are none, which is fine).
5. Click **Continue to summary**, then **Create Token**.
6. Copy the token (it's shown only once). Save it as "Cloudflare API token (Guildie)".

## 5. Make up the shared secret

Make up a long random phrase of at least 32 characters (your password manager's generator is ideal, letters and numbers only). Save it as "Guildie realtime secret". The game server uses it to sign each player's pass, and the rooms use it to check the pass.

## 6. Add three secrets to GitHub

1. Open the repository on GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Click **New repository secret** three times:

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the API token from step 4 |
| `CLOUDFLARE_ACCOUNT_ID` | the Account ID from step 3 |
| `REALTIME_SECRET` | the phrase from step 5 |

From the next merge to `main`, the **realtime** job in the deploy run puts the rooms on Cloudflare. (Before that, the job says "Realtime deploy skipped" and does nothing.)

## 7. Check the rooms are up

After the next deploy, open `https://guildie-realtime.YOUR-SUBDOMAIN.workers.dev` in a browser (use your subdomain from step 2). It should say **Guildie realtime: ok**. You can also find the address under **Workers & Pages** → **guildie-realtime**.

## 8. Tell the game server where the rooms are

1. SiteGround **Site Tools** → **Site** → **File Manager**.
2. Open the `guildie-private` folder (next to `public_html`, not inside it) and edit `config.php`.
3. Before the line `'debug' => false,` add these two lines, with your subdomain and your phrase:

```php
    'realtime_url'    => 'wss://guildie-realtime.YOUR-SUBDOMAIN.workers.dev',
    'realtime_secret' => 'THE SAME PHRASE AS REALTIME_SECRET',
```

4. Save. No deploy is needed: the next page load uses it.

## 9. Try it

1. On your computer, open the game in two different browsers (or one normal and one private window), logged in as two different players.
2. In both, click **Quarters** in the dock and go to the same quarter.
3. Each should see the other's merchant walk around, and the bottom line should say "1 other merchant here". Walk next to each other and press **F** to slap.

## Turning it off

Set `'realtime_url' => ''` in `config.php`. The quarters go back to stalls, townsfolk and echoes. Nothing else changes.

## If something goes wrong

- **"Quiet day" even after step 8:** check the address starts with `wss://` and the secret matches `REALTIME_SECRET` exactly. Open the address from step 7 to check the rooms answer.
- **The realtime job failed:** open the run on GitHub → **realtime** job. A token error means step 4's token lacks the Workers permission; make a new one from the template and replace the secret.
- **Players on `www.marz.gg`:** both `https://marz.gg` and `https://www.marz.gg` are allowed (`realtime/wrangler.toml`, `ALLOWED_ORIGINS`). Any other address needs adding there.
