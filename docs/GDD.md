# Guildie — Game Design Document

**Version:** 0.2 · **Date:** 2026-10-25 · **Status:** Pre-production
**Owner:** Marz · **Engine:** Godot 4 (web export) · **Platform:** Mobile-first browser, desktop browser

> This document is the Guildie "bible." It is the source of truth for design decisions. Every AI or human working session should read the relevant sections before proposing or building features. Changes go through pull requests, and significant decisions are recorded in the [Decision Log](#15-decision-log).
>
> Numbers marked **[tune]** are placeholders for playtesting, not commitments.

---

## Table of Contents

1. [Vision](#1-vision)
2. [Design Pillars](#2-design-pillars)
3. [Setting & Tone](#3-setting--tone)
4. [Core Loops](#4-core-loops)
5. [Profession Framework](#5-profession-framework)
6. [The Exchange (Auction House)](#6-the-exchange-auction-house)
7. [Economy: Faucets & Sinks](#7-economy-faucets--sinks)
8. [Workshop & Meta Layer](#8-workshop--meta-layer)
9. [Onboarding (First-Time User Experience)](#9-onboarding-first-time-user-experience)
10. [UX & Platform](#10-ux--platform)
11. [Technical Architecture](#11-technical-architecture)
12. [Milestones](#12-milestones)
13. [Metrics & Playtest Questions](#13-metrics--playtest-questions)
14. [Open Questions](#14-open-questions)
15. [Decision Log](#15-decision-log)
16. [Glossary](#16-glossary)

---

## 1. Vision

### Pitch

**Rise from apprentice to master in a guild city on the edge of the steam age.** Choose one profession, master it, and trade with every other crafter in a living market. Your workshop keeps working while you're away.

### Player fantasy

**A crafter who trades.** The player is a craftsman first. The workshop is home, crafting is the core activity, and the market (the Exchange) is where crafting decisions get their stakes: what to make, when to make it, and whether to sell or hold.

### Genre

Mobile-first browser crafting and trading game with idle/offline progression and a shared, persistent, multiplayer market.

### Target experience

- **Play as you want:** a 30-second check-in on a phone, or a 30-minute session working the market.
- **Progression on the side:** your workshop produces while you're away, and coming back always offers something to collect and decide.
- **A permanent world:** no wipes. Progress persists, and the market is always alive.

### Reference games

| Game | What we take from it |
|---|---|
| World of Warcraft professions (especially Dragonflight) | Skill-up colors, recipes as trophies, quality tiers, procs, crafting orders, specializations, the auction house fantasy |
| Clash of Clans | Meta structure: upgradeable base, builder slots → craft queue slots, timers with anticipation, clans → guilds |
| Melvor Idle | Proof that idle skilling works; offline progress |
| Shop Titans | Proof that crafting-and-selling works on mobile |
| Albion Online / EVE | Player-driven economies, specialization creating interdependence |

### Non-goals (for now)

- Combat. Adventurers exist only as NPC customers.
- 3D. The game is 2D and UI-driven.
- Monetization. This is a proof of concept, and no system should be designed around a paywall.

---

## 2. Design Pillars

Every feature must clearly serve at least one pillar. If it serves none, cut it.

| # | Pillar | What it means | Test question |
|---|---|---|---|
| 1 | **Your profession is your identity.** | You are a smith, an alchemist, or a leatherworker. Depth in one craft beats breadth. | Does this make my profession feel more distinct? |
| 2 | **Every craft is a market decision.** | What you make, when, and whether you sell or hold should always be a real choice. | Does this create a meaningful decision, or just a click? |
| 3 | **The market is always alive.** | With 5 players or 5,000, there is demand, supply, and something to react to. | Does this still work with almost no real players online? |
| 4 | **Thirty seconds or thirty minutes.** | Every session length is rewarding, and the game respects the player's time. | Is this satisfying in a short phone check-in? |
| 5 | **You need other crafters.** | At higher tiers, your best work depends on what others make. | Does this give players a reason to trade with each other? |

---

## 3. Setting & Tone

### The city

A guild city (working name: **Brassmere**) in the middle of an industrial revolution. The old craft guilds are proud, traditional, and hands-on. New steam-powered workshops and factories are rising around them. The tension between tradition and industry fuels world events, NPC factions, and flavor.

### Progression as industrialization

The theme and the progression arc are the same story. The player begins as a medieval apprentice and rises into the steam age.

| Rank | Skill range [tune] | Feel | Example unlocks |
|---|---|---|---|
| Apprentice | 1–25 | Hand tools, manual work, tapping to gather | Basic recipes, one craft slot |
| Journeyman | 26–50 | Better tools, first mechanical aids | Second craft slot, first powered station |
| Expert | 51–75 | Steam machines run while you're away | Automated gathering, longer high-value crafts |
| Master | 76–100 | Full steam workshop, prestige crafts | Masterwork recipes, second profession unlock |

### Target pacing

Mastering a profession should take **weeks**, through a hybrid of crafting a lot early and waiting on long crafts late.

| Rank | Target time for a regular player [tune] | How progress happens |
|---|---|---|
| Apprentice | First 1–2 days | Many short crafts (seconds to minutes). Lots of active crafting. |
| Journeyman | ~Day 4–5 | Mixed: short crafts plus the first longer ones |
| Expert | ~Week 2 | Longer crafts (an hour or more), automation, queue management |
| Master | ~Weeks 3–4 | Long, high-value crafts (several hours). Check-ins and planning matter most. |

"Regular player" means daily check-ins plus a couple of longer sessions per week. Early ranks reward volume. Late ranks reward planning and concurrency, not just patience.

**Why this matters:** Idle progress becomes the reward. Your machines work overnight because you earned them, and late-game long crafts feel like big machine operations rather than slow waiting.

### Tone

Warm, cozy-industrial, lightly humorous. Picture brass, soot, lantern light, and guild banners. NPC customers have personality, such as a nervous tournament squire or a collector who only buys Masterwork.

### Visual direction

- 2D. The workshop uses an isometric or 3/4 view in the style of a Clash of Clans base. Menus are flat, readable panels.
- Chunky, readable silhouettes and icons designed for phone screens.
- Art is out of scope until Milestone 4. Placeholder art and text UI come first.

---

## 4. Core Loops

### 4.1 The 30-second check-in (primary loop)

```
Open game
  → "While you were away" summary (crafts done, items sold, gold earned, new orders)
  → Collect finished crafts and gathered materials
  → Relist or adjust unsold items on the Exchange
  → Queue the next crafts
  → Close game
```

This must feel complete and rewarding on a phone in under a minute.

### 4.2 The session loop (5–15 minutes)

```
Check Exchange prices and the news board
  → Spot an opportunity (shortage, event, order)
  → Buy inputs (often from other professions)
  → Craft (manage queue, use the profession's signature mechanic)
  → Sell on the Exchange or fulfill an order
  → Reinvest: recipes, tools, workshop upgrades
```

### 4.3 The weekly loop

The market has a weekly rhythm (see [6.5](#65-market-rhythm--events)). Players learn when demand spikes and plan production around it, much like preparing for raid reset in WoW.

### 4.4 Long-term loop

```
Apprentice → Journeyman → Expert → Master
  → Unlock and upgrade steam machines
  → Collect rare recipes and Masterwork results
  → Max profession → unlock a second profession (prestige)
  → (Later) Join a guild, contribute to guild projects
```

### 4.5 Goals available to the player

- **Mastery:** max your profession and collect every recipe.
- **Wealth:** grow your gold (weekly profit leaderboard).
- **Collection:** rare recipes, Masterwork items, rare materials.
- **Industry:** build the most efficient steam workshop.
- **Social (later):** guild rank and guild projects.

---

## 5. Profession Framework

### 5.1 Design principle

All professions share **one framework**. Each profession adds **one signature mechanic**. This keeps content cost manageable and lets new professions be added mostly as data.

### 5.2 Shared systems

**Skill and ranks**
- Skill from 1 to 100, grouped into four ranks (see [Section 3](#progression-as-industrialization)).
- Skill rises by crafting recipes that are still challenging.

**Recipe difficulty colors** (inherited from WoW)

| Color | Meaning | Skill-up chance [tune] |
|---|---|---|
| Orange | Just learned, challenging | 100% |
| Yellow | Moderate | 75% |
| Green | Easy | 25% |
| Grey | Trivial | 0% |

This turns leveling into a light routing puzzle: what's the cheapest path to the next rank, given current market prices?

**Recipes**
- Learned from the guild trainer (gold sink), found as rare drops, or bought on the Exchange.
- Rare recipes are trophies and a major collection goal.

**Quality tiers**
- Each crafted item has a quality: **Common, Fine, Masterwork** [tune].
- Quality affects sale price and eligibility for some crafting orders.
- Quality is influenced by skill relative to recipe difficulty, tools, and the signature mechanic.

**Crafting stats and procs** (inspired by Dragonflight)

| Stat | Effect |
|---|---|
| Multicraft | Chance to produce extra items |
| Resourcefulness | Chance to refund some materials |
| Inspiration | Chance to bump the result up one quality tier |

Procs supply the small surprises that make routine crafts exciting.

**Craft queue**
- Crafts take real time and occupy a **queue slot** (the Clash of Clans "builder" equivalent).
- More slots unlock through rank and workshop upgrades. Concurrency is the main late-game constraint, not raw duration.

**Active play versus idle**
- Optional active mechanics (each profession's signature mechanic, such as forge heat or volatile brewing) give a bonus to quality, proc chance, or yield [tune: roughly +25–50% value].
- A 30-minute session is the "active" mode. It should naturally **end into idle**: players queue long crafts and expeditions before leaving.
- Idle play is never penalized. It just lacks the active bonus.

**Gathering station**
- Each profession owns a gathering station that produces its raw materials over time, including while offline.
- Stations have a storage cap, so check-ins matter but nothing is lost to absence beyond the cap.

**Crafting orders**
- NPC customers (and later players) post orders: an item, a minimum quality, a deadline, and a reward (gold, rare materials, or recipes).
- Orders give direction ("what should I make?") and guaranteed demand.

**Specializations** (post-MVP)
- Knowledge points earned through crafting are spent in a profession-specific tree (for example, Blacksmith: Weaponsmith or Armorsmith branches).
- Ties into the skill-tree interest from Pythio, but must stay simple on mobile.

### 5.3 What each profession defines (data template)

Every profession is defined as data so new ones can be added without new code where possible:

- `id`, `name`, flavor text
- Gathering station (materials produced, rates, storage cap, upgrades)
- Signature mechanic (type and parameters)
- Recipe list (inputs, outputs, difficulty, craft time, skill thresholds)
- Rank unlocks (slots, machines, recipes)
- Cross-profession inputs it needs, and outputs others need

### 5.4 Launch professions (MVP: 3)

These three are chosen to form a **dependency triangle**. Each is about 70% self-sufficient at low tiers and about 30% dependent on the others at higher tiers.

| Profession | Gathering station | Signature mechanic |
|---|---|---|
| **Blacksmith** | The Mine | **Veins:** choose which vein to work. Veins deplete and rare "rich veins" appear on a timer. Optional active "forge heat" bonus that improves quality. Idle play is never punished. |
| **Alchemist** | The Herb Garden | **Plots and volatile brewing:** plant herbs in plots with growth timers. Optional opt-in "volatile brew" that risks some ingredients for a chance at extra or higher-quality output. |
| **Leatherworker** | The Trapper's Lodge | **Expeditions:** send trappers out for a chosen duration. Short trips return common hides, and long trips have a chance at thick or rare pelts. This creates a risk-versus-time choice that fits the check-in rhythm. |

### 5.5 Launch item list (~16 items) [tune]

| Item | Type | Made by | Inputs | Used by |
|---|---|---|---|---|
| Copper Ore | Raw | Blacksmith (Mine) | — | Blacksmith |
| Iron Ore | Raw (rank 15+) | Blacksmith (Mine) | — | Blacksmith |
| Brass Fittings | Component | Blacksmith | Copper Ore | **Alchemist, Leatherworker** |
| Iron Ingot | Component | Blacksmith | Iron Ore + **Smelting Flux** | Blacksmith |
| Iron Sword | Finished | Blacksmith | Iron Ingot + **Leather Grip** | NPC buyers |
| Sunleaf | Raw | Alchemist (Garden) | — | Alchemist |
| Ember Moss | Raw (rank 15+) | Alchemist (Garden) | — | Alchemist |
| Healing Draught | Finished | Alchemist | Sunleaf | NPC buyers (staple) |
| Smelting Flux | Component | Alchemist | Ember Moss | **Blacksmith** |
| Tanning Solution | Component | Alchemist | Sunleaf + Ember Moss | **Leatherworker** |
| Steam Tonic | Finished (premium) | Alchemist | Ember Moss + **Brass Fittings** | NPC buyers |
| Raw Hide | Raw | Leatherworker (Lodge) | — | Leatherworker |
| Thick Hide | Raw (rank 15+ / long expeditions) | Leatherworker (Lodge) | — | Leatherworker |
| Leather Grip | Component | Leatherworker | Raw Hide | **Blacksmith** |
| Cured Leather | Component | Leatherworker | Thick Hide + **Tanning Solution** | Leatherworker |
| Rugged Jerkin | Finished | Leatherworker | Cured Leather + **Brass Fittings** | NPC buyers |

**Dependency summary**
- **Blacksmith** needs Smelting Flux (Alchemist) and Leather Grip (Leatherworker) for the iron tier.
- **Alchemist** needs Brass Fittings (Blacksmith) for Steam Tonic.
- **Leatherworker** needs Tanning Solution (Alchemist) and Brass Fittings (Blacksmith) for the higher tier.
- The copper, sunleaf, and raw-hide tiers are fully self-sufficient, so new players are never blocked.

### 5.6 Future profession candidates

More professions are planned, but the list is deliberately not decided yet. Candidates include Tailor, Jewelcrafter, Cook, and Arcanist (an enchanting equivalent that consumes crafted goods).

### 5.7 Second profession

- Unlocked when the first profession reaches **skill 80** (80% complete) [tune], at a significant gold cost (sink).
- The player can keep leveling the first profession to 100 alongside the second.
- Starts at skill 1, but carries over some benefits [to design], such as market knowledge, NPC reputation, or workshop buildings.
- Acts as New Game+ and a long-term goal for a permanent world.

---

## 6. The Exchange (Auction House)

### 6.1 Basics (MVP)

- **Buyout only** (no bidding). This is simpler and reads better on mobile. Bidding may be revisited much later.
- A listing has an item, quality, quantity, price, and duration (12h / 24h / 48h [tune]).
- **Deposit:** a small non-refundable fee to list, scaled to duration and the item's reference value [tune].
- **Exchange cut:** 5% of the sale price [tune].
- Expired listings return to the seller's mailbox.

### 6.2 Reference value and the liquidity band

Every item has a server-side **reference value (R)**, derived from its input costs plus a margin and nudged by events and recent trade prices.

- **NPC floor:** NPC buyers will always buy at about **0.6 × R** [tune], so there's always somewhere to sell.
- **NPC ceiling:** NPC sellers will always offer at about **1.5 × R** [tune], so items are never unavailable.
- Real players trade **inside the band**, which is where the margins and the skill live.

### 6.3 NPC personas

NPCs are **liquidity and demand**, not fake players. Their main job is to consume goods (demand plus sink) and to keep the market stocked.

| Persona | Buys | Sells | Behavior |
|---|---|---|---|
| **Townsfolk** | Low-tier finished goods (Healing Draughts, basic gear) | — | Steady daily demand, not very price-sensitive |
| **Adventurers / Tournament Squires** | Swords, draughts, tonics | — | Big spike before the weekly tournament |
| **Collectors** | Masterwork and rare items | — | Rare appearances, pay well above the ceiling |
| **Traders** | Anything listed well below R | Relist near R | Punish underpricing and keep prices honest |
| **Prospectors** | — | Raw materials | Occasionally flood a material and crash its price |
| **The Steam Factory** | Raw materials in bulk | Cheap mass-produced Common goods | Thematic rival: competes with low-tier crafters and gives a reason to craft higher quality |

### 6.4 Scaling with real players

- For each item, NPC participation **scales inversely with real-player volume** over the last 24 hours [tune].
- A busy item becomes player-driven, and a niche item stays NPC-supported.
- The UI distinguishes NPC trades from player trades (for example, "Bought by a Tournament Squire" versus "Bought by Kaelith") so real interactions feel special.

### 6.5 Market rhythm & events

**Weekly cycle ("Guild Week")** [tune]

| Day | Event | Effect |
|---|---|---|
| Monday | Restock | Prospectors and the Factory flood raw materials, so prices dip |
| Wednesday | Tournament announced | Weapon and draught demand starts rising |
| Friday | Tournament Day | Peak demand from Adventurers |
| Sunday | Market Day | Collectors more likely to appear, and more orders posted |

**World events** (rotating, announced on the news board)
Examples include a mine collapse (ore shortage), a plague (draught demand), a Factory strike (low-tier goods scarce), and a royal commission (a large special order).

### 6.6 Information

- Price history chart per item.
- A **news board** of rumors and announced events. Information itself has value, which rewards players who check in.
- The player's own sales history and profit summary.

### 6.7 Anti-abuse (required before Milestone 3)

- All transactions are server-authoritative (see [Section 11](#11-technical-architecture)).
- Listing limits per player [tune].
- Deposits and the cut make spam listing and wash trading expensive.
- Monitor for alt-account gold funneling.

---

## 7. Economy: Faucets & Sinks

A permanent world will inflate without strong sinks. **NPC consumption of goods is the most important sink.**

| Faucets (value enters) | Sinks (value leaves) |
|---|---|
| NPC buyers paying gold for goods | NPC buyers consuming the goods they buy |
| Crafting order rewards | Exchange deposits and the 5% cut |
| Gathering stations producing materials | Recipe purchases from the guild trainer |
| Rare drops and procs | Workshop and station upgrades |
| | **Steam machine fuel (coal)**: an ongoing running cost for automation |
| | Tool durability and repairs |
| | Second profession unlock |

**Watch metrics:** total gold in circulation, median price per item over time, and the gold-in to gold-out ratio per day.

---

## 8. Workshop & Meta Layer

### 8.1 The workshop

The player's home screen is an isometric or 3/4 view of their workshop (Clash of Clans style).

| Building | Function | Upgrades improve |
|---|---|---|
| Workbench / Forge / Lab (per profession) | Crafting | Queue slots, craft speed, quality |
| Gathering station | Raw materials over time | Rate, storage cap, rare chance |
| Storehouse | Inventory | Capacity |
| Steam Engine (Journeyman+) | Powers automation | Machines supported, fuel efficiency |
| Mailbox | Expired listings, order rewards | — |
| Guild Board | Orders, news, Exchange access | — |

Upgrades cost gold and materials, take time, and are gated by profession rank.

### 8.2 The return screen

"While you were away" is the retention engine. It should list crafts completed, materials gathered (and whether storage capped), items sold with prices, new orders, and news events.

### 8.3 Guilds (post-MVP)

The social layer for multiplayer. It serves Pillar 5 socially:

- **Guild orders** that require several professions to fill together.
- A **shared guild hall** members upgrade together.
- Guild rankings.
- A reason to recruit a blacksmith rather than just buy from one.

---

## 9. Onboarding (First-Time User Experience)

Goal: the player feels the whole loop within about **three minutes**.

1. Short intro to Brassmere and the guilds.
2. **Choose a profession** (identity moment, with a clear "you can learn another later").
3. Collect the first materials from the gathering station (already partly filled).
4. Craft a first item (short timer, guaranteed success).
5. **First sale is guaranteed** to an NPC buyer at a good price.
6. First crafting order appears, pointing the player toward their next goal.
7. Queue a longer craft and learn that it finishes while they're away.

---

## 10. UX & Platform

- **Portrait phone layout first.** Desktop gets the same layout, centered or widened.
- Large touch targets, with one-thumb reach for the most common actions (collect, queue, relist).
- Core screens: Workshop (home), Craft, Exchange (Browse / Sell / My Listings), Orders, Inventory, News, Profile.
- Every timer shows remaining time and absolute finish time.
- Offline progress is calculated on the server from timestamps.
- Push notifications are optional (installable web app later) and the loop must not depend on them.
- A visible **build number** confirms deployed versions are current.

---

## 11. Technical Architecture

### 11.1 Principle: the server is authoritative

The Godot client is **a view**. It never decides inventory, gold, craft results, procs, timers, or trades. Every state change is a server action that validates and applies it in a single transaction. This is non-negotiable for a persistent, multiplayer economy running in a browser, and it is far cheaper to do from day one than to retrofit.

### 11.2 Stack (decided): PHP + MySQL on SiteGround

Everything runs on the existing SiteGround hosting, on one domain.

```
[ Godot 4 web client ]  ── HTTPS/JSON ──>  [ PHP API ]  ──>  [ MySQL ]
  marz.gg/games/guildie/                    .../guildie/api/       SiteGround database
                                                 ▲
                              [ SiteGround cron job → tick.php (market tick) ]
```

- **Same domain for client and API**, so there are no cross-origin (CORS) issues.
- **Plain PHP 8 with PDO**: prepared statements everywhere, and InnoDB transactions for every game action.
- **JSON in, JSON out.** One small router (`api/index.php`) dispatches actions.
- **Secrets** (database credentials) live in a config file outside `public_html`.
- **Good enough for a friends-and-family demo.** Revisit hosting if the game grows beyond shared-hosting limits.

### 11.2.1 Accounts (proof of concept)

- **Name + simple password.** No email, no recovery.
- Passwords are hashed with PHP's built-in `password_hash` / `password_verify`. Plain-text passwords are never stored.
- On login the server issues a random session token (stored in the database) that the client sends with every request.
- Guest login can be added later.

### 11.2.2 Concurrency safety

- Purchases lock the listing row (`SELECT ... FOR UPDATE`) inside a transaction, so two players can't buy the same item.
- Gold and inventory changes always happen in the same transaction as the action that causes them.
- The trade ledger is append-only, for debugging and rollback.

### 11.3 Data model sketch

- **Static content** (versioned in the repo as data files, seeded into the database): items, recipes, professions, buildings, NPC personas, events.
- **Player state:** players, profession progress (skill, rank, knowledge), inventory (item, quality, quantity), buildings, gathering stations (last collected time, rates), craft jobs (recipe, start, end, status), mailbox.
- **Market state:** listings, trade ledger (every transaction, append-only), item market state (reference value, band, recent volume), active events, orders.

### 11.4 Server actions (initial list)

`start_craft`, `collect_craft`, `collect_station`, `list_item`, `cancel_listing`, `buy_listing`, `fulfill_order`, `upgrade_building`, `learn_recipe`, `get_state` (includes the "while you were away" summary).

### 11.5 Timers and the market tick

- **Timers are lazy:** store end timestamps and resolve them when the player collects or loads state. There is no per-second server work.
- **The market tick** runs from a SiteGround cron job (every 5–15 minutes [tune]). It runs NPC buys and sells, updates reference values and bands, expires listings, and advances events.
- **Catch-up guard:** the server records `last_tick_at`. If a tick is overdue (for example, cron was delayed), the next API request runs the missed tick first, protected by a database lock so it never runs twice at once.

### 11.6 Godot client structure

- Control-node UI, data-driven from content definitions.
- Autoload services: `Api` (HTTP wrapper), `Session` (auth and player state), `Content` (static definitions for display only), `Clock` (server time sync).
- Modular, so a profession, building, or NPC persona can be added mostly through data, in line with the "systems" approach used in Pythio.

### 11.7 Repo layout

```
/client     Godot 4 project
/server     PHP API, tick.php, config template
/server/migrations   SQL files (001_init.sql, 002_..., applied in order)
/content    JSON definitions: items, recipes, professions, buildings, personas, events
/docs       GDD and supporting docs
```

`/content` is the single source of truth for static game data. Both the PHP server and the Godot client read the same files.

### 11.8 Hosting & deploy

- Web build and API hosted on SiteGround alongside other projects (proposed path: `marz.gg/games/guildie/`).
- Initial deploys go through SiteGround's File Manager or FTP. Automated deploys from GitHub can come later.
- Build number shown in the client.
- Development environment separate from the demo environment once real players join.

---

## 12. Milestones

Each milestone ends with a playtest and a clear exit question.

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M0 Foundation** | Repo, Godot project, MySQL database and PHP API on SiteGround (step-by-step setup guide), name + password login, read and write one inventory item through the server, cron job running a test tick, deploy steps, build number | Open on a phone, log in, see server-owned gold and an item |
| **M1 Market Prototype** | 3 professions (basic recipes), ~16 items, gathering stations, crafting with timers, the Exchange with NPC personas, liquidity band, market tick. Plain text UI. | **"Is making one good trade fun?"** |
| **M2 Crafting Depth** | Skill ranks and colors, quality tiers, procs, signature mechanics, crafting orders, workshop upgrades, "while you were away" screen | **"Do I want to come back tomorrow?"** |
| **M3 Real Players** | Shared market with multiple players, NPC scaling, leaderboards (gold and rank progress), anti-abuse | **"Does trading with real people feel different and better?"** |
| **M4 Look & Feel** | Isometric workshop art, steam progression visuals, events and news board, onboarding polish, installable web app | **"Would I show this to a stranger?"** |
| **Later** | Guilds, specializations, second profession, more professions | — |

### Backlog (not scheduled)

- Player-to-player crafting orders
- Auction bidding
- Guest login
- Automated deploys from GitHub

---

## 13. Metrics & Playtest Questions

**Metrics (once there are players)**
- Day 1 / Day 7 return rate
- Sessions per day and session length (expect many short ones)
- Percentage of sales to players versus NPCs
- Gold-in to gold-out ratio and median price drift
- Time to reach each rank

**Playtest questions**
- After the first session, can the player explain what they'd craft next and why?
- Did the player notice and react to a market event?
- Did any player feel blocked by a dependency on another profession?
- Did the 30-second check-in feel worth opening the game for?

---

## 14. Open Questions

1. **Gold leaderboard: total gold or net worth?** Total gold is the current decision. Net worth (gold plus inventory and listings at reference value) would avoid punishing players who invest in materials or hold stock. Revisit before M3.
2. **Exact skill curve and craft timers** to hit the pacing targets in [Section 3](#target-pacing). Tune in M1–M2 playtests.
3. **Active bonus size:** how much more should active play reward than idle without making idle feel bad?
4. **Second profession carryover:** what transfers from the first profession, if anything?
5. **SiteGround cron:** confirm the shortest cron interval available on the current plan (affects tick frequency).
6. **City name:** "Brassmere" is the working name. Final name to be decided later.

---

## 15. Decision Log

| Date | Decision | Reason |
|---|---|---|
| 2026-10-25 | Player fantasy is "crafter who trades" | Workshop is the core; the market gives crafting stakes |
| 2026-10-25 | Real multiplayer is the goal, with NPCs as market liquidity | An empty auction house isn't an auction house; NPCs solve cold start and keep supply and demand alive |
| 2026-10-25 | Mobile-first browser, Clash of Clans-style meta structure | Short check-in sessions, upgradeable workshop, queue slots |
| 2026-10-25 | Permanent world (no wipes) | Long-term progression; requires strong sinks and newcomer protection |
| 2026-10-25 | Theme: medieval guild city industrializing into steam | Progression arc and idle automation are the same story |
| 2026-10-25 | Server-authoritative from M0 | Persistent multiplayer economy in a browser; retrofitting would require a rewrite |
| 2026-10-25 | 2D, UI-driven | The UI is the game; 3D adds cost with little gameplay value |
| 2026-10-25 | Launch with 3 interdependent professions | Smallest set that proves the dependency triangle |
| 2026-10-25 | Backend: PHP + MySQL on SiteGround | Uses existing hosting, low cost, fine for a proof of concept |
| 2026-10-25 | "Brassmere" as the working city name | Placeholder until a final name is chosen |
| 2026-10-25 | Mastering a profession takes weeks | Many short crafts early, long crafts and planning late |
| 2026-10-25 | Active play gives bonuses; sessions end into idle | Supports both 30-minute sessions and AFK progress |
| 2026-10-25 | Second profession unlocks at skill 80 in the first | Rewards near-mastery without requiring the full grind |
| 2026-10-25 | Exchange is buyout only | Simpler, especially on mobile |
| 2026-10-25 | Player-to-player orders moved to backlog | Not needed to prove the core |
| 2026-10-25 | Accounts: name + simple hashed password | Friends-only testing; hashing costs nothing extra |
| 2026-10-25 | Leaderboards: total gold and rank progress | Covers both player goals (wealth and mastery) |
| 2026-10-25 | Future professions not decided yet | Focus on the launch three |

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **Exchange** | Guildie's auction house |
| **Reference value (R)** | Server-side baseline price for an item |
| **Liquidity band** | The NPC floor and ceiling price range that players trade within |
| **Persona** | A type of NPC market participant with defined behavior |
| **Market tick** | Scheduled server job that runs NPC activity and updates prices |
| **Queue slot** | A concurrent crafting slot (Clash of Clans builder equivalent) |
| **Signature mechanic** | The one unique system each profession adds to the shared framework |
| **Crafting order** | A request for a specific item and quality, with a reward |
| **Sink / Faucet** | Systems that remove or add value to the economy |
