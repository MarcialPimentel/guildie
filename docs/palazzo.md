# Guildie — The Palazzo and the bottega upgrades (0.11.0)

_Current as of 0.19.0 (2026-10-30): the town's one shared square (since 0.13.0) and the bottega upgrades._

**In one sentence:** up the Steps there is now a shared square where all three guilds meet, with the city hall (the Palazzo), the Wanted board, the Hall of honor and three officials you can talk to; and your own bottega starts as a rundown shack that you rebuild, one upgrade per rank, to become a Journeyman, an Expert and a Master.

Decided with Marz on 2026-10-29 (`/next-build Living City`). Builds on the living city (`docs/living-city.md`) and M2 step 2 (skill and ranks, 0.8.0). Closes the redesigned #51 for levels 2 to 4 with today's goods; the recipe ladder (#50) swaps in its new parts later.

---

## 1. Why

- **The guild quarters only gather your own guild, but the game is built on needing the other guilds** (Pillar 5). Until now the city had no place where a smith, an alchemist and a tanner stand in the same square. The Palazzo is that place.
- **Ranks should feel like events** (M2 bet: "What did reaching Journeyman feel like?"). Marz: *"to progress in a rank, one must dump resources into infrastructure… as you progress your shop should get better looking."* So the upgrade is the exam for the next rank, and you can see it on the quay.

| Feature | Serves |
|---|---|
| A shared Palazzo square, live like the quarters | Pillar 5: the guilds meet in one place |
| The Wanted board | Pillar 5 and Pillar 2: ask for exactly what you need, at a fair price |
| The Hall of honor | Public goals (M3 leaderboards, pulled forward as a place) |
| Officials with rumors | Pillar 2: reading the market becomes a skill |
| Officials' daily favors | Pillar 4: a small, useful thing to do in a 30-second visit |
| The bottega as the rank gate | M2 bets: ranks are events; the strongest reason to trade |

---

## 0.13.0: one square

Decided with Marz on 2026-10-29: the loop is **gather and craft on your quay, then go up to the Palazzo to trade and meet people**, like a grand exchange.

- **The quay keeps only your own work:**
  - station, workbench (its Recipes list opens the guild trainer), customers, your bottega, the storehouse, and the Steps;
  - the Mercato loggia (renamed the **Dogana**), the guild hall and your stall stay as scenery, and buyers still come to the stall to pick up what they bought;
  - the news galley still sails in for events;
  - the herald only announces new Duke's orders.
- **No more guild quarters.** The Steps lead straight to the Palazzo, the one live room (`palazzo`). Clicking a player there opens their bottega.
- **The marketplace** replaces the Wanted board in the middle of the square: a ring of vendor stalls around the statue, open toward the Steps.
  - **One vendor per guild** (from content, so the Glassblower gets one automatically) shows that guild's goods.
  - **The selling desk** shows Sell, My listings and **Buy offers** (the Wanted board's rules unchanged, §4).
  - On a computer, trade happens here: Mercato links from the quay (the storehouse's Sell) walk you up the Steps. Phones keep the Mercato tab.
- **Il Factotum**, the richest merchant: their own merchant (guild dress, colour, hat and sash) stands on the plinth in bronze. Their portrait hangs in a gilded frame over the Palazzo's door, and the Hall of honor shows it too.
- **The Palazzo's door** opens the Hall of honor plus the city's merchants, friends and trades (the guild hall's lists).

---

## 2. The bottega upgrades (#51, reworked)

**The rule (Marz):** to go past the top of a rank, build the next workshop upgrade.

- Your skill **stops at the top of the rank your bottega allows**: 25 in the rundown shack, 50 in the repaired workshop, 75 in the two-storey bottega, 100 in the fine bottega.
- At that cap **crafts, orders and favors give no XP**. Crafting still matters: you craft (or buy) the goods the upgrade needs, and spend ducats on it.
- **Building costs ducats plus goods from both other guilds** and takes time. When it's ready you open it: you step into the next rank at once (+1 skill, the rank-up dialog, the rank's free recipe, the new raw).
- **Each upgrade only asks for goods crafters one rank lower can make.** Otherwise nobody could ever reach Journeyman: Journeyman goods only come from Journeymen.
- Each level also gives **how much and how fast** (never *what* you can make): craft slots, craft speed, station size and speed.

| Level | Looks like | Opens | Craft slots | Crafts | Station |
|---|---|---|---|---|---|
| 1 | Rundown shack | Apprentice (skill up to 25) | 2 | — | — |
| 2 | Repaired workshop | Journeyman (up to 50) | 3 | 10% faster | — |
| 3 | Two-storey bottega | Expert (up to 75) | 4 | 20% faster | holds 50% more |
| 4 | Fine bottega with a roof loggia | Master (up to 100) | 5 | 30% faster | holds 50% more, 25% faster |

**Costs** (`content/professions.json` → `workshop`; every number is [tune]):

| Guild | Level 2 (2 h) | Level 3 (6 h) | Level 4 (12 h) |
|---|---|---|---|
| Blacksmith | **Bellows forge**: 200 ducats, Leather Grip ×10, Smelting Flux ×4, Brass Fittings ×10 | **Water-wheel forge**: 2,000, Cured Leather ×10, Lemon Tonic ×8, Iron Ingot ×10 | **Trip-hammer works**: 7,500, Drive Belt ×10, Machine Oil ×12, Gears ×12 |
| Alchemist | **Copper still**: 200, Brass Fittings ×10, Hide Satchel ×4, Healing Draught ×10 | **Water-driven alembics**: 2,000, Iron Ingot ×6, Cured Leather ×8, Lemon Tonic ×10 | **Clockwork distillery**: 7,500, Gears ×10, Drive Belt ×8, Machine Oil ×14 |
| Leatherworker | **Tanning pits**: 200, Tanning Solution ×6, Copper Lantern ×4, Leather Grip ×10 | **Water-wheel tannery**: 2,000, Iron Ingot ×8, Lemon Tonic ×8, Cured Leather ×10 | **Mechanical tannery**: 7,500, Gears ×10, Machine Oil ×10, Drive Belt ×12 |

Level 3 uses Journeyman goods. Since 0.12.0 (the ladder, #50) level 4 uses the Expert parts: Gears, Drive Belts and Machine Oil.

**Players from before 0.11.0 (Marz: "keep rank, build to get the look"):** they keep the rank they hold (migration 009 saves it as `legacy_rank`) and can keep levelling inside it, but their bottega starts as a shack. Building gives them the look and the bonuses.

**Machine running costs (0.16.0, #52; Marz, 2026-10-30: "lamp oil and wages, soft"):** the two-storey bottega and the fine bottega (levels 3 and 4) run water wheels and clockwork, which need **Lamp Oil** and **hired hands**.

- Each craft burns Lamp Oil for each minute of the recipe's listed craft time (the time in `recipes.json`, before the pace settings, so slowing the game doesn't make oil cost more per item).
- The hands are paid once a day (UTC), on that day's first craft with the machines. Days you don't craft cost nothing.
- **Soft:** if you're short of oil or of ducats for the wages, nothing is taken and the craft is **made by hand**: it gets the repaired workshop's speed (10% faster) instead of 20% or 30%. Nothing is lost, and the activity log says so.
- Alchemists craft Lamp Oil (skill 6); the Guild Suppliers always sell a little at their usual premium, so nobody gets stuck.
- The Bottega card shows the costs (and how much oil you have); each recipe card says how much oil a batch burns and how long it takes by hand.
- Numbers: `economy.json` → `workshop.levels[].running` (`lamp_oil_per_minute`, `wages_per_day`) [tune]. The wages day is `player_professions.wages_day` (migration 012).

**In 3D:** your bottega on the quay shows its level (four buildings, one shown); while builders work, scaffolding goes up and a mason hammers at the door. In the quarters, a shack's stall has a weathered plank sign and a fine bottega's sign is gilded.

---

## 3. The Piazza del Palazzo

Up the Steps, next to the three guild quarters. **Open to every guild**, with live players like a quarter (the same realtime room rules; one room `palazzo`, 30 per copy).

- **The Palazzo** (city hall) on the north side: an arcaded loggia, two floors, crenellations, every guild's banner on the façade, and a bell tower with a clock. Its door opens the **Hall of honor**.
- **The Wanted board** on the west side.
- **The Duke's lectern** on the east side: the Duke's order lives here now (the herald on your quay and the fountains in the quarters stay as shortcuts).
- **A merchant's statue** in the middle.
- **Three officials** stand on the square (§5).
- **Phones:** City → **Palazzo** (Wanted, Hall of honor, the three officials) as lists.

---

## 4. Buy offers (the Wanted board until 0.13.0)

Players post paid requests: *"Wanted: 10 Leather Grips at 11 ducats each."* Any other crafter brings all or part of it.

**Rules (Marz):**
- The **price per unit sits in the market's fair band** (the NPC floor and ceiling, 0.6× to 1.5× the usual value). This stops ducats being funnelled between accounts.
- **The ducats are held** when you post; you get back whatever isn't used.
- Whoever fills it is **paid at once, minus the Mercato cut** (5%, a gold sink).
- **3 open requests** per player; a request lasts **48 hours**, then the rest is refunded.
- You can't fill your own request. Two crafters filling the last unit at the same moment: only one gets it.

---

## 5. The officials

| Official | Rumor (always real game data) | Daily favor |
|---|---|---|
| **Ser Benedetto**, the Palazzo's notary | The counting house: the biggest price moves right now | Your guild's raw materials |
| **Tonio**, the town crier | Tomorrow's Guild Week day and the goods it moves | Goods your guild makes |
| **Donna Lucrezia**, the Duke's steward | An announced event's goods before it starts, or the Duke's slowest line | **Another guild's goods** up to your rank (Pillar 5) |

- **One favor per official per player per day** (UTC), worth about 60 ducats of goods. It pays **1.2× the usual value** (under the Guild Suppliers' 1.5×, so it can't be farmed with bought goods) plus order XP (none at your bottega's cap).
- Each also has a few flavor lines. Text lives in `content/palazzo.json`.

---

## 6. Data and actions

**Migration 009:** `player_professions.workshop_level`, `legacy_rank`, `upgrade_to`, `upgrade_ready_at`; tables `wanted_posts` and `npc_favors`.

**Actions:**
- `workshop_upgrade`, `workshop_open`
- `wanted`, `wanted_post`, `wanted_fill`, `wanted_cancel`
- `honors`, `palazzo`, `npc_talk`, `npc_favor`

Each runs in one transaction. The market tick refunds expired Wanted posts.

**Realtime:** the presence pass lists `palazzo` as a room it may open, so the room server needs no change.

---

## 7. Decisions (Marz, 2026-10-29)

1. The "city hall front" is a **new shared Palazzo square**.
2. Player interactions first: **the Wanted board and the Hall of honor**.
3. City-wide prosperity: **revisit later**. Instead, **your bottega gets better as you rank up**, starting as a rundown shack.
4. NPCs: **all three kinds**: rumors tied to the market, small daily favors, and flavor lines.
5. **Upgrades are the milestones that open each rank**, and bring the visual upgrades with them.
6. At the cap, **crafts give no XP**; crafting still matters because you make the upgrade's goods.
7. Wanted board: **price in the market band, the Mercato fee**, 3 posts, 48 hours.
8. **One big build** (0.11.0), on top of 0.10.3 (guilds as data, PR #65).
9. Older players: **keep their rank, build to get the look**.

## 8. Later

- City prosperity (the whole city growing from Duke's orders), revisited after this playtest.
- Machine running costs (lamp oil and wages) with the ladder and the balance pass.
- Upgrades 3 and 4 switch to the ladder's parts (#50).
- The Hall of honor could show portraits; the statue could become this week's Factotum.
