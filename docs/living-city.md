# Guildie — The Living City (0.9.0)

**Status:** Design built on Marz's decisions of 2026-10-28 (live presence, a merchant you steer, guild quarters, friends, gentlemanly slaps, the Duke's order). Released as **0.9.0**, after M2 step 2 (0.8.0). Desktop first; phones keep the classic view and get a list version of the quarters.

**In one sentence:** your bottega stays your quick 30-second home, and a short walk up the steps takes you to your guild's quarter, a piazza where you see other crafters move in real time, visit their stalls, trade at their door, wave, slap a glove across a rival's cheek, and pitch in on the Duke's order.

---

## 1. What changes for the player

| Today (0.7.0) | The living city (0.9.0) |
|---|---|
| A single-player harbor: only your quay | Your quay **plus three guild quarters** you walk to, shared with other players |
| No avatar: clicks fly the camera | **Your own blob merchant.** WASD or the arrow keys, or click the ground to walk. Clicking a place opens its panel at once while your merchant walks there |
| Other players are a list in the City tab | Other crafters **walk around the quarter live**. Their bottegas line the piazza, with their Mercato listings in the window |
| Trades start from a profile in a list | **Tap a player or their stall**: visit their shop window (buy), propose a trade, add them as a friend, wave, or slap |
| No friends | **Friends.** Their stalls appear first in every quarter you visit, and in a Friends list in the City panel |
| Orders are yours alone | **The Duke's order**: one city-wide order everyone works on, with a public board of who helped |

### 1.1 Pillars and the M2 bets

| Feature | Serves |
|---|---|
| Quarters by guild | Pillar 1 (*your profession is your identity*): you stand among your own guild, in their colors and hats |
| Stalls and trading at the door | Pillar 5 (*you need other crafters*) and Pillar 2 (*every craft is a market decision*): you see who sells what you need, right where they stand |
| Townsfolk and "echoes" when the quarter is quiet | Pillar 3 (*the market is always alive*): it never looks empty, even with 3 players |
| Click a place: the panel opens at once, your merchant walks over | Pillar 4 (*thirty seconds or thirty minutes*): check-ins stay exactly as fast as 0.7.0 |
| The Duke's order | Bet "customers with wants give every check-in a purpose", now shared: a reason to log in *together* |
| Slaps and waves | Fun and character between players; no effect on the economy |

---

## 2. The city's layout

```
                 Alchemists' quarter      Smiths' quarter       Tanners' quarter
                 (Piazza degli Speziali)  (Piazza dei Fabbri)   (Piazza dei Conciatori)
                            \                  |                    /
                             +------ the Steps (Scalinata) --------+
                                               |
   Mercato · station · stall · YOUR BOTTEGA · workbench · pier · storehouse · guild hall · Duke's herald
                                   (your quay: private, fast)
```

- **Your quay** stays exactly as in 0.7.0, plus your merchant, a **Duke's herald** by the pier (the Duke's order board) and the **Steps** at the east end (the signpost to the quarters).
- **A quarter** is a piazza with a fountain in the middle. Up to **12 bottegas** line it: friends first (from any guild), then the quarter's crafters who were active most recently. Each shows the owner's name on its sign and goods in the window when they have Mercato listings.
- The **guild hall** of each quarter stands on the north side. Its door is reserved for the **guild trainer** (M2 #49); until the trainer screen exists, it opens the City panel. The 3D code already has a `trainer` place for it.
- The Duke's notice is on the fountain in every quarter, so you can pitch in wherever you are.
- To go back, walk down the Steps or press **Home** (the camera fades back to your quay).

### 2.1 Instances

A quarter holds **30 visible players** [tune]. The 31st person to arrive opens a second copy of the piazza ("Piazza dei Fabbri · II"), and so on. You're placed in the first copy with room. Everyone's stalls are in every copy; only the walkers differ. Later: prefer the copy your friends are in.

### 2.2 When few people are online

- **Townsfolk:** up to 6 non-player blobs stroll between the stalls and the fountain (porters, a priest, a fishwife). Cosmetic, client-side.
- **Echoes:** crafters of this quarter who did something in the last 30 minutes but aren't here now appear as a faint blob at their stall, with a speech line: *"Bruno listed 3 Iron Ingots · 4 min ago."* Tap one to visit their stall. Built from the `activity` table by the `quarter` action, so it works even with presence turned off.
- Echoes and townsfolk thin out as real players arrive (at most 8 walkers in total that aren't real players).

---

## 3. Your merchant

- **Move:** WASD or the arrow keys; or click the ground to walk there. The camera follows gently; dragging still turns it.
- **Click a place** (or its label, or the dock button): the panel opens at once, as in 0.7.0, and your merchant hurries over (fast enough to arrive in about a second), so a check-in is never slower than before.
- **Doors can't be blocked:** players and townsfolk are not solid. You walk through each other (with a little squash), and clicking a shop opens it wherever you're standing.
- **Look:** a blob in your guild's dress, with the body color and hat you chose when you joined (0.10.0; accounts from before then start with a color picked from their player number and are invited once to choose). Your rank shows as a sash.
- **Wave:** `E` or the Wave button; **bow, cheer, shrug** (0.10.0): `1`, `2`, `3` or their buttons. **Slap:** `F` or the Slap button when you're next to someone (see §4).
- **Reduced motion:** no wobble or camera follow; walking still works.

---

## 4. Gentlemanly slaps

In Renaissance Italy a glove across the face was a challenge to a duel. Here it's harmless fun.

- Stand next to another merchant (within about 2.5 m) and press **F**, or tap them and choose **Slap**. An oversized white glove swings in, *thwack*, and they wobble and slide back a step. A "Challenge!" bubble appears over them.
- **Cosmetic only.** Nothing is lost or won. No physics engine: the wobble is a spring on the blob's squash and stretch, the knockback a short slide.
- **Opt-out:** a **Slaps on/off** switch in the world tools (saved on the server). With slaps off you can't slap or be slapped, and others see a little white flag over your hat.
- **Fair use:** the realtime room checks distance and allows one slap per 1.5 s per player. Slaps never move anyone off a door in a way that matters, because doors can't be blocked (§3).
- Each slap is also a duel challenge in name only for now. A later idea: a friendly "duel" (a rock-paper-scissors bow-off) that only gives bragging rights.

---

## 5. The Duke's order

One city-wide order that everyone works on together. Server-authoritative, built like the order board (systems.md 6.3).

- **What:** the Duke asks for goods from **all three guilds** at once, e.g. *"The Regatta fleet needs 60 Copper Lanterns, 60 Healing Draughts and 60 Hide Satchels."* Each line has a goal. Goals scale with how many crafters were active in the last 7 days.
- **How long:** 72 hours [tune] (scaled by the game's pace). Then the next order starts, from a list in `content/duke.json`.
- **Contribute:** at the Duke's herald (your quay), the fountain (any quarter), or the City tab on phones: pick a line and a quantity from your bag. You're paid **at once**: 1.25 × the item's usual value per unit.
- **Completion bonus:** if every line is filled before the deadline, everyone who helped gets **0.15 × usual value per unit** they delivered. So the whole reward is at most **1.40 ×** usual value, which stays under the Guild Suppliers' 1.5 × (the 0.5.1 supplier rule): you can't buy from the suppliers and deliver at a profit. The validator checks this.
- **Fair share:** one player can fill at most 40% of a line [tune] until the last quarter of the order's time; then anyone can finish it, so a quiet city can still complete it.
- **The public board:** the herald shows the top helpers by value delivered, how far each line is, and the time left. A finished order stays on the board as "Fulfilled, with thanks to …" until the next one starts.
- **News:** "The Duke's order is fulfilled" goes into every contributor's Activity Log (and the "While you were away" screen).

---

## 6. Friends

- **Add a friend** from a player's profile, their stall, or by tapping them in a quarter. It's one-way, like a bookmark: no request to accept, because everything it shows (stalls, listings, last seen) is already public. You can remove a friend any time.
- **Friends' stalls are everywhere:** they take the first stall slots in every quarter, whatever their guild, with a lemon star on the sign.
- **Friends list** in the City panel (and the City tab on phones): name, guild, last seen, what they're selling, and **Visit** / **Propose a trade**.
- Limit: 50 friends [tune].
- Needs **migration 007** (`friends` table).

---

## 7. Realtime architecture

### 7.1 The split

```
 Browser ──HTTPS──> PHP API on SiteGround (authoritative: ducats, items, trades, orders, the Duke's order, friends)
    │                    │
    │                    └─ presence_token: a short-lived signed pass (who you are, your guild, your look, slaps on/off)
    │
    └──WebSocket──> Realtime rooms on the DigitalOcean droplet (cosmetic only: positions, waves, slaps)
                    one room per quarter copy, at most 30 people each
```

- **The realtime service never touches the economy.** It only relays where merchants stand and the waves and slaps between them. Gold, items, trades, orders and friends stay on the PHP server.
- **Only logged-in players can join:** the PHP server signs a pass (HMAC-SHA256 with a secret shared by both sides) that's valid for 10 minutes. The room checks the signature and the expiry before letting anyone in, and takes the name, guild and look from the pass, never from the client.
- **Presence is optional:** if `realtime_url` isn't set in `config.php` (or the service is down, or out of its free quota), the game says "Quiet day: other merchants can't be seen right now" and the quarters show stalls, townsfolk and echoes. Everything else works as in 0.7.0.

### 7.2 Which service, and what it costs

**Chosen (2026-10-28): the DigitalOcean droplet that already runs Hormigas** (`hub`, 1 vCPU, 2 GB). Its Caddy already serves HTTPS and passes WebSockets through, and it has an automatic GitHub deploy. The rooms run as one more container (`guildie-realtime`) at `guildie.marz.gg`. No new account and no message quota; the load is tiny (small messages, only while people walk, no game simulation), about 50 MB of memory. If the droplet is down, quarters show "Quiet day" and nothing else is affected.

The hosted services compared first (checked on 2026-10-28 on each provider's pricing page):

| Option | Free plan | Fit for 30-player rooms |
|---|---|---|
| Cloudflare Workers + Durable Objects (runner-up) | 100,000 requests a day; 13,000 GB-s of running time a day; incoming WebSocket messages count 20 to 1 as requests; **outgoing messages are free**; rooms "hibernate" (cost nothing) when idle | Good. Each move is sent once and copied to the room for free. We write the room's rules ourselves (capacity, slap distance, signed passes) |
| Ably | 6 million messages a month, 200 connections, 50 messages a second per connection | Weak. Ably counts messages sent *and received*, so one move copied to 29 people counts about 30 times. A busy room would use the month's quota in days |
| Pusher Channels | 200,000 messages a day, 100 connections | Weak for the same reason, and a lower cap |
| Supabase Realtime | 2 million messages a month, 200 connections; free projects pause after 1 week without use | Possible, but pausing after a quiet week would switch presence off without warning |

**Estimate for Guildie:** a merchant sends at most 5 position updates a second, and only while walking (nothing while standing). Twenty players each playing 30 minutes a day and walking 40% of that time send about 72,000 messages a day; a full room of 30 walking non-stop is about 4,500 small messages a second going out, which one Node process handles easily. If Guildie ever outgrows the shared droplet, the same container moves to its own droplet (or the room rules move to Cloudflare); nothing in the game changes.

**Why not on SiteGround:** shared PHP hosting runs one short script per request and can't hold a connection open, so WebSockets can't run there.

### 7.3 The room protocol (short)

| From | Message | Meaning |
|---|---|---|
| client | `mv x z h` | I'm here, facing h (sent ≤ 5 times a second while moving, plus one when I stop) |
| client | `wave` / `emote e` / `slap to` / `pref slaps` | Wave; bow, cheer or shrug (0.10.0); slap a player; turn slaps on or off |
| room | `welcome you players[]` | Who's here, with names, guilds, looks and positions (from their passes) |
| room | `join p` / `leave id` / `mv id x z h` | Someone arrived, left or moved |
| room | `wave id` / `emote id e` / `slap from to` / `pref id slaps` | Show a wave, an emote or a slap; someone changed their slap setting |

The room clamps positions to the piazza, drops a client that floods it, refuses a slap if either player has slaps off, if they're more than 2.5 m apart, or if the slapper slapped in the last 1.5 s. When the tab is hidden for a minute, the client disconnects; it reconnects when you come back.

### 7.4 Where the code lives

- `realtime/`: the room rules (`room.js`), the pass check (`token.js`), the server (`server.mjs`: the same program in production, tests and local play), its `Dockerfile`, and the droplet snippets (`deploy/`).
- `server/app/lib/city.php`: the presence pass, slap setting, friends, and the quarters (stalls and echoes). `server/app/lib/duke.php`: the Duke's order.
- `client/src/world/`: blob merchants (`blobs.ts`), the quarters (`quarter.ts`) and the engine additions for walking, other players and slaps. `client/src/presence.ts`: the room connection.
- Setup for Marz: `docs/realtime-setup.md` (a DNS record, two GitHub secrets copied from Hormigas, a one-time change on the droplet, two lines in `config.php`). After that, each merge rebuilds and restarts the rooms automatically, like the game.

---

## 8. Data model (migration 007)

| Table | Owner (systems.md) | Columns |
|---|---|---|
| `friends` | Friends (7.6) | player_id, friend_id, created_at; primary key (player_id, friend_id) |
| `city_prefs` | Presence (7.5) | player_id, slaps (on/off), updated_at |
| `duke_orders` | The Duke's order (6.5) | id, order_key (title and text come from `content/duke.json`), order_lines (JSON: item, goal, delivered), pay_multiplier, bonus_multiplier, max_share, starts_at, ends_at, status (open, fulfilled, expired), resolved_at |
| `duke_contributions` | The Duke's order (6.5) | id, duke_order_id, player_id, item_id, quantity, paid, bonus, created_at |

New API actions: `presence_token`, `city_prefs`, `quarter` (stalls with echoes), `friends`, `friend_add`, `friend_remove`, `duke_order`, `duke_contribute`. Every write runs in one transaction with prepared statements.

---

## 9. The look: blob merchants

Short look pass; details and rules in [art-direction.md](art-direction.md) §9.

- **Body:** a chunky rounded blob (a squashed capsule) with no neck, two mitten hands, short stumpy feet. About 2 m tall: big enough to read from the default camera, still smaller than a doorway.
- **Wobble:** squash and stretch on a spring when walking, landing, waving or slapped; a little lean into turns. No ragdoll.
- **Dress by guild** (one glance tells you who's who): Smiths wear a soot-dark leather apron and a red felt cap; Alchemists a teal robe and a tall pointed hat with a lemon tassel; Tanners an olive jerkin and a wide straw hat. The body color varies per player from the plaster pastels.
- **The glove:** an oversized white cartoon glove with a lemon cuff, about the size of a blob's head. It pops in, swings, and pops out.
- **Townsfolk** use the same blob with plain dress (porter, priest, fishwife); **echoes** are the player's own blob at 45% opacity.
- Budget: a blob is 4 meshes, about 600 triangles; 30 players plus townsfolk stay under 150 draw calls.
- **0.10.0, the people of Portovela** (art-direction.md §9.1): you choose your body color and hat when you join a guild (and later with "Your look" in the 3D city; older accounts are invited once), a rank sash shows your rank, and bow, cheer and shrug join the wave. The order customers, market buyers, the herald and a guild trainer at each hall door act out what the server decided. A blob is now 3 draw calls and about 580 triangles.

---

## 10. Phones

Phones keep the classic view (GDD Decision Log, 2026-10-28). The **City** tab gains three sections, so nothing is desktop-only:

1. **The Duke's order:** progress, contribute, the board of helpers.
2. **Friends:** your list, with Visit and Propose a trade.
3. **Quarters:** the three quarters as lists: each crafter's stall (name, what they sell, last seen, an echo line if they acted recently). Tap one to open their shop window.

Phones don't show live walkers or slaps. That comes if and when phones get a 3D view.

---

## 11. Effects on M2 (steps 3 and 4)

- **#51 Workshop upgrades:** coal becomes **lamp oil and wages** (art-direction Decision, 2026-10-28). Upgrades become **visible changes on your quay in 3D** (scaffolding, then a new floor, a water wheel, a bigger forge), and other players see them on your stall in the quarter. Build them **after** the blob art style is set (this release), so the hired hands and the scaffolding workers are blobs too. `professions.md` §8 needs the lamp-oil update when #51 is built.
- **#50 Recipe ladder:** every new item needs an **icon** (and a prop if it's shown in the world: on stalls, in crates, in the Duke's order). That raises the content cost per recipe; keep a shared prop per item *type* (a sack, a jar, a bundle) so only icons are per item.
- **#49 Trainer:** lives in the guild hall of your quarter. The 3D place `trainer` is ready; the M2 screen plugs in.
- **#30 Ranks:** a rank can show on your blob (a guild sash) and on your stall's sign.

---

## 12. Decisions for Marz

Recommendations are marked; the build follows them unless you say otherwise.

1. **Realtime service: the existing DigitalOcean droplet** (decided 2026-10-28, instead of Cloudflare). One-time setup in `docs/realtime-setup.md`. Until then, the quarters work without live players.
2. **Friends are one-way bookmarks** (recommended): no friend requests. Alternative: requests that must be accepted.
3. **Duke's order pays 1.25 × now plus 0.15 × on completion; 40% cap per player; 72 hours** (all [tune]).
4. **Slaps are on by default**, with the switch in the world tools (recommended). Alternative: off by default.
5. **Quarter size 30**, then a second copy (as you asked).
