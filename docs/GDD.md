# Guildie — Game Design Document

**Version:** 0.11 · **Date:** 2026-10-29 · **Status:** M2 in progress (build 0.11.0, the Palazzo and the bottega upgrades)
**Owner:** Marz · **Client:** TypeScript + Preact web app · **Platform:** Mobile-first browser, desktop browser

> This document is the Guildie "bible." It is the source of truth for design decisions. Every AI or human working session should read the relevant sections before proposing or building features. Changes go through pull requests, and significant decisions are recorded in the [Decision Log](#15-decision-log).
>
> Numbers marked **[tune]** are placeholders for playtesting, not commitments.
>
> **Systems breakdown:** [systems.md](systems.md) splits the game into its systems (what each owns, its rules, tuning knobs, and which milestone builds it). Read it alongside this document before building features.

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

**Rise from apprentice to master in Portovela, a merchant harbor on the edge of the age of invention.** Choose one profession, master it, and trade with every other crafter in a living market. Your bottega keeps working while you're away.

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
- A heavyweight game engine (Unity and the like). The world is low-poly 3D in the browser, under HTML menus (decided 2026-10-28, see [Visual direction](#visual-direction)).
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

### 2.1 What makes Guildie fun (the M2 bets)

Playtest 0.3.0 found the game was a working machine with no tension: everything was done in 20 minutes. The fix is **decisions on three timescales**: *now* (sell or hold: the market ticker), *this session* (which orders to fill: the order board), and *this week* (which recipes to learn and which upgrade to save for). Each bet is checked in the playtest:

| Bet | Playtest question |
|---|---|
| Customers with wants give every check-in a purpose | "Did you open the game to fill an order?" |
| Readable price moves make trading a skill | "Did you ever sell or buy *because* of the arrows?" |
| Choosing recipes creates anticipation and identity | "What recipe are you saving up for, and why that one?" |
| Workshop upgrades make ranks feel like events | "What did reaching Journeyman feel like?" |

Every new feature should serve one of these bets or a pillar. Details: [professions.md](professions.md) §1–§5 and §8.

## 3. Setting & Tone

### The city

**Portovela**, a merchant republic on a cliff coast around 1500, in the spirit of Amalfi, Venice and Genoa. Its craft guilds (the *Arti*) are proud, traditional and hands-on, and every master runs a *bottega* where apprentices learn the trade. Galleys bring goods and news from across the sea, and the Mercato on the piazza never sleeps. New inventions (water wheels, gear trains, clockwork in the style of Leonardo's notebooks) are changing how workshops run. The tension between old craft and new machines fuels world events, NPC factions, and flavor.

### Progression as invention

The theme and the progression arc are the same story. The player begins as an apprentice with hand tools and rises into the age of invention, where water wheels and clockwork machines keep the bottega working overnight. (Until 0.6.0 this arc rose into the steam age; the mechanics are unchanged.)

| Rank | Skill range [tune] | Feel | Example unlocks |
|---|---|---|---|
| Apprentice | 1–25 | Hand tools, manual work, tapping to gather | Basic recipes, two craft slots (live in M1) |
| Journeyman | 26–50 | Better tools, first mechanical aids | Third craft slot, first water-powered station |
| Expert | 51–75 | Water wheels and gear trains run while you're away | Automated gathering, longer high-value crafts |
| Master | 76–100 | A bottega of clockwork machines, prestige crafts | Masterwork recipes, second profession unlock |

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

Warm, sunny, lightly humorous, with a touch of opera buffa. Picture sea light, whitewashed walls, lemon terraces, lanterns on the quay and guild banners. NPC customers have personality, such as a nervous oarsman before the Regatta or a collector who only buys Masterwork. English stays the main language; Italian is seasoning (place names and a few craft terms, always next to plain English), never a caricature.

### Visual direction

The full art direction, palette, interaction map and asset pipeline live in [art-direction.md](art-direction.md) (approved 2026-10-28).

- **A world, not a spreadsheet.** Every system gets a place in the harbor and a verb: you pump the forge, empty the mine cart, set out your stall and meet the ships. Menus stay for reading numbers and making choices, and open from the world. The server still decides every result.
- **Low-poly 3D in the browser**, seen from a 3/4 view in the spirit of a Clash of Clans base: your bottega on the harbor quay. HTML menus sit on top, so a phone that can't run 3D still plays the whole game.
- **Palette:** sea teal, whitewash, lemon and roof-tile terracotta, with a night version of the same harbor. Text always passes WCAG AA contrast.
- **Type:** Fraunces for headings, Nunito for text, bundled with the game.
- **Icons:** chunky, ink-outlined item icons on light majolica tiles, readable on phone screens.
- **Rollout:** 0.6.0 applied the palette, fonts, icons and names to the screens. **0.7.0 makes the 3D harbor the home screen on desktop browsers**: every place opens a side panel with the same screens. Phones keep the classic screens for now and move toward the 3D world step by step (touch controls and full-screen panels already work with `?view=3d`). The final art pass stays in M4.

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
  → Unlock and upgrade water wheels and machines
  → Collect rare recipes and Masterwork results
  → Max profession → unlock a second profession (prestige)
  → (Later) Join a guild, contribute to guild projects
```

### 4.5 Goals available to the player

- **Mastery:** max your profession and collect every recipe.
- **Wealth:** grow your gold (weekly profit leaderboard).
- **Collection:** rare recipes, Masterwork items, rare materials.
- **Invention:** build the most efficient machine-powered bottega.
- **Social (later):** guild rank and guild projects.

---

## 5. Profession Framework

### 5.1 Design principle

> **The profession web** ([professions.md](professions.md)): the M2 fun loop (orders, market ticker, learning recipes), skill 1–100 and XP, the full recipe ladder, how the guilds need each other (rules W1–W7), and workshop upgrades.

All professions share **one framework**. Each profession adds **one signature mechanic**. This keeps content cost manageable and lets new professions be added mostly as data.

### 5.2 Shared systems

**Skill and ranks**
- Skill from 1 to 100, grouped into four ranks (see [Section 3](#progression-as-invention)). Shown as "x/100" (max stays 100, decided 2026-10-27). *Decided and built in 0.8.0 (#30): skill comes from crafting XP that falls off on easy recipes, plus orders and a first-craft (discovery) bonus per recipe, replacing the random skill-up chance below. See [professions.md §5](professions.md#5-skill-1100-and-xp).*
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
- **Chosen and bought at the guild trainer** (gold sink): one free starter recipe per rank, the rest bought as you choose. **Rare recipes** come only from orders and rare finds, and they're trophies. No specialization branches for now. Details: [professions.md](professions.md) §4.
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
- Optional active mechanics give a bonus to quality, proc chance, or yield [tune: roughly +25–50% value]. **Since 0.15.0 these are minigames** (systems.md 5.5): first at the station, where a short round pays extra raws (Strike: pickaxe, sickle, snare); later on crafts for quality (Focus, such as forge heat or volatile brewing). A round tires you, so grinding fades instead of flooding the market.
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

### 5.5 Launch item list (18 items) [tune]

The live numbers (recipes, times, values) are in `/content`; this table shows the structure.

| Item | Type | Made by | Inputs | Used by |
|---|---|---|---|---|
| Copper Ore | Raw | Blacksmith (Mine) | — | Blacksmith |
| Iron Ore | Raw (rank 15+) | Blacksmith (Mine) | — | Blacksmith |
| Brass Fittings | Component | Blacksmith | Copper Ore | **Alchemist, Leatherworker** |
| Iron Ingot | Component | Blacksmith | Iron Ore + **Smelting Flux** | Blacksmith |
| Copper Lantern | Finished | Blacksmith | Copper Ore | NPC buyers *(added in M1)* |
| Iron Sword | Finished | Blacksmith | Iron Ingot + **Leather Grip** | NPC buyers |
| Sunleaf | Raw | Alchemist (Garden) | — | Alchemist |
| Ember Moss | Raw (rank 15+) | Alchemist (Garden) | — | Alchemist |
| Healing Draught | Finished | Alchemist | Sunleaf | NPC buyers (staple) |
| Smelting Flux | Component | Alchemist | Ember Moss | **Blacksmith** |
| Tanning Solution | Component | Alchemist | Sunleaf + Ember Moss | **Leatherworker** |
| Lemon Tonic (`steam_tonic`) | Finished (premium) | Alchemist | Ember Moss + **Brass Fittings** | NPC buyers |
| Raw Hide | Raw | Leatherworker (Lodge) | — | Leatherworker |
| Thick Hide | Raw (rank 15+ / long expeditions) | Leatherworker (Lodge) | — | Leatherworker |
| Leather Grip | Component | Leatherworker | Raw Hide | **Blacksmith** |
| Cured Leather | Component | Leatherworker | Thick Hide + **Tanning Solution** | Leatherworker |
| Hide Satchel | Finished | Leatherworker | Raw Hide | NPC buyers *(added in M1)* |
| Rugged Jerkin | Finished | Leatherworker | Cured Leather + **Brass Fittings** | NPC buyers |

**Dependency summary**
- **Blacksmith** needs Smelting Flux (Alchemist) and Leather Grip (Leatherworker) for the iron tier.
- **Alchemist** needs Brass Fittings (Blacksmith) for Lemon Tonic.
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
- **Deposit:** a small non-refundable fee to list, scaled to duration and the item's reference value [tune]. It is **taken from the sale money**, never charged up front, so a player with 0 gold can always list. On cancel or expiry, the unpaid part is charged only if the player can afford it; otherwise it's waived.
- **Exchange cut:** 5% of the sale price [tune].
- Expired or cancelled listings return to the seller's inventory (a mailbox comes once inventory has a cap).
- **Sell to guild** *(0.2.2)*: an instant sale with no listing, deposit or cut. It pays 0.5 × R, dropping about 3% with each unit a player sells of that item (never below 0.15 × R) and recovering over time [tune]. The rule is hidden, but the exact total is always shown before confirming, and the sale is refused if the offer dropped in between. The guild consumes the goods (a sink). It's a safety valve, never the best way to sell: it always pays less than the Traders' quick sale.

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
| **Sailors / Regatta crews** | Swords, draughts, tonics | — | Big spike before the weekly Regatta |
| **Collectors** | Masterwork and rare items | — | Rare appearances, pay well above the ceiling |
| **Traders** | Anything listed at 0.8 × R or less | Relist near R | Punish underpricing, keep prices honest, and give players a "quick sale" |
| **Guild Workshops** *(M1)* | A little of every component | — | Components are never a dead end |
| **Guild Suppliers** *(M1)* | — | 5 of every item at 1.5 × R | Nothing is ever unavailable |
| **Prospectors** | — | Raw materials | Occasionally flood a material and crash its price |
| **The Arsenal** | Raw materials in bulk | Cheap mass-produced Common goods | Thematic rival (the republic's great shipyard and workshop): competes with low-tier crafters and gives a reason to craft higher quality |

### 6.4 Scaling with real players

- For each item, NPC participation **scales inversely with real-player volume** over the last 24 hours [tune].
- A busy item becomes player-driven, and a niche item stays NPC-supported.
- The UI distinguishes NPC trades from player trades (for example, "Bought by a sailor" versus "Bought by Kaelith") so real interactions feel special.

### 6.5 Market rhythm & events

**Weekly cycle ("Guild Week")** [tune]

| Day | Event | Effect |
|---|---|---|
| Monday | Restock | Prospectors and the Factory flood raw materials, so prices dip |
| Wednesday | Regatta announced | Weapon and draught demand starts rising |
| Friday | Regatta Day | Peak demand from sailors and crews |
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

### 6.8 Direct trades (0.3.0)

Players can trade with each other directly, beyond the Exchange. Real players are rarely online at the same moment on a phone, so trades are **offers that wait** rather than a live trade window.

- From a player's profile in the **City** tab: **Propose a trade** → items and/or gold you give, items and/or gold you ask for, and an optional note.
- **Your side is held** when you send the offer, and returned if it's declined, cancelled or expires (24 h [tune]).
- **Accept** swaps both sides at once. It's refused if the other player no longer has what was asked for.
- **Both sides must contain something:** no gifts for now.
- **No fee** for now. Direct trades skip the Exchange cut and the NPC price band; revisit at M3 if gold funnelling between accounts shows up (6.7).
- At most 5 open offers per player [tune].

### 6.9 The City: player directory (0.3.0, one list since 0.3.1)

The **City** tab lists every crafter in **one list** with **gold** and **crafts made** as separate columns (skill will be a third, M2). It's sorted by gold by default; tap a column heading to sort by it. Each row shows the crafter's guild and when they were last seen. The #1 crafter by gold carries the title **"Il Factotum della Città"** (after Rossini's *Largo al factotum*) on the list and on their profile. A profile shows their stats, recipes discovered, their Exchange listings (a "shop window" you can buy from) and the **Propose a trade** button. This is a simple version of the M3 leaderboards, pulled forward so players can find each other.

---

## 7. Economy: Faucets & Sinks

A permanent world will inflate without strong sinks. **NPC consumption of goods is the most important sink.**

| Faucets (value enters) | Sinks (value leaves) |
|---|---|
| NPC buyers paying gold for goods | NPC buyers consuming the goods they buy |
| Crafting order rewards | Exchange deposits and the 5% cut |
| Gathering stations producing materials | Recipe purchases from the guild trainer |
| Rare drops and procs | Workshop and station upgrades |
| | **Machine running costs (lamp oil and wages for hired hands)**: an ongoing cost for automation |
| | Tool durability and repairs |
| | Second profession unlock |

**Watch metrics:** total gold in circulation, median price per item over time, and the gold-in to gold-out ratio per day.

---

## 8. Workshop & Meta Layer

### 8.1 The workshop

The player's home screen is their **bottega** on the harbor quay, in low-poly 3D from a 3/4 view (Clash of Clans style). Until the 3D world ships, it is the Bottega tab.

| Building | Function | Upgrades improve |
|---|---|---|
| Workbench / Forge / Lab (per profession) | Crafting | Queue slots, craft speed, quality |
| Gathering station | Raw materials over time | Rate, storage cap, rare chance |
| Storehouse | Inventory | Capacity |
| Water Wheel (Journeyman+), later the Great Contraption | Powers automation | Machines supported, running-cost efficiency |
| Mailbox | Expired listings, order rewards | — |
| Guild Board | Orders, news, Exchange access | — |

Upgrades cost gold and materials, take time, and are gated by profession rank.

**Since 0.11.0 the bottega upgrade is the gate to the next rank** ([palazzo.md](palazzo.md) §2): your skill stops at the top of the rank your bottega allows (25 in the rundown shack, 50, 75, then 100), crafts give no XP there, and you build the next level with ducats plus goods from both other guilds to step into the next rank. Each level visibly rebuilds your bottega on the quay (shack, repaired workshop, two-storey bottega, fine bottega with a roof loggia) and adds craft slots, speed and station size. Players who held a rank before 0.11.0 keep it and build to get the look.

### 8.2 The return screen

"While you were away" is the retention engine. It should list crafts completed, materials gathered (and whether storage capped), items sold with prices, new orders, and news events.

### 8.3 Guilds (post-MVP)

The social layer for multiplayer. It serves Pillar 5 socially:

- **Guild orders** that require several professions to fill together.
- A **shared guild hall** members upgrade together.
- Guild rankings.
- A reason to recruit a blacksmith rather than just buy from one.

### 8.4 The living city (0.9.0)

Other players become people you see. Full design: [living-city.md](living-city.md).

- **Your merchant:** a blob merchant you steer (WASD, arrows or click-to-move). Clicking a place opens its panel at once while your merchant walks there.
- **Guild quarters:** the Smiths', Alchemists' and Tanners' piazzas, up the Steps from your quay. Each lines up to 12 bottegas (friends first, then recently active crafters of that guild) and shows other players moving **live**. A quarter copy holds 30 players; more open a second copy.
- **Tap a player or a stall:** visit their shop window (buy), propose a trade, add a friend, wave, or slap.
- **Friends:** one-way bookmarks; friends' stalls appear first in every quarter, and in a Friends list in the City tab.
- **Gentlemanly slaps:** a glove slap was a Renaissance duel challenge. Cosmetic, opt-out, can't block a door.
- **The Duke's order:** a city-wide order with lines from all three guilds and a public board of helpers. Pays 1.25 × usual value per unit at once, plus 0.15 × on completion (under the suppliers' 1.5 ×).
- **Never empty:** townsfolk and "echoes" of crafters who acted in the last 30 minutes fill quiet quarters.
- **Presence is cosmetic and optional:** positions, waves and slaps go through a small realtime service (a Node container on the DigitalOcean droplet that already hosts Hormigas); everything with value stays on the PHP server. With no service configured, the quarters still show stalls, townsfolk and echoes.
- **Phones:** the City tab lists the quarters, friends and the Duke's order.

### 8.5 The people of Portovela (0.10.0)

Everyone in the city is drawn from one character kit (art-direction.md §9): your merchant, other players, townsfolk, echoes, the nine named order customers (each with their own look), the market buyers, the Duke's herald, a guild trainer at each hall door, and (with #51) hired hands.

- **Your look:** pick a body color and one of three hats for your guild when you join, and change it any time in the 3D city ("Your look"). Accounts from before 0.10.0 keep their old look and are invited once to choose. Free and cosmetic (migration 008).
- **Rank sashes (#30):** none for Apprentice, then sea-glass, majolica blue, and lemon gold with a medallion for Master. The rank comes from your skill, via the signed presence pass.
- **Emotes:** wave, bow, cheer and shrug (E, 1, 2, 3), relayed by the realtime room like waves.
- **People act out what the server decided:** customers walk up and say their order line, take the goods when you fill it (and shrug when you turn it down); buyers of the right kind walk to your stall for new sales (at most 3 at once); the herald trumpets new and fulfilled Duke's orders. Nothing a character does changes ducats, items or results.

---

## 9. Onboarding (First-Time User Experience)

Goal: the player feels the whole loop within about **three minutes**.

1. Short intro to Portovela and the guilds.
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
- Core screens: Bottega (home: station, craft queue and recipes on one screen), Mercato (the Exchange: Browse / Sell / My Listings), Inventory (Bag), City (players, profiles, trades), Orders, News.
- Money is shown as a number with a ducat coin; text says "ducats". The server and database still call it gold.
- **Two views of the same game (0.7.0).** On desktop (a wide screen with a mouse) the home screen is the **3D harbor**: the station, workbench, customers, your stall, the Mercato, the storehouse, the guild hall, the news galley and the bottega's ledger are places you click, each opening a side panel with the classic screen for it. A dock lists every place as a button, and floating labels show live numbers (station fill, craft timers, customers ready to fill). On phones the **classic view** (tabs) stays the default. A header button switches views and the choice is remembered; `?view=3d` or `?view=classic` in the address forces one. If 3D can't start, the game falls back to the classic view.
- On the sell form, **listing on the Exchange comes first**; the instant guild sale sits underneath as the fallback.
- Every timer shows remaining time and absolute finish time.
- Offline progress is calculated on the server from timestamps.
- Push notifications are optional (installable web app later) and the loop must not depend on them.
- A visible **build number** confirms deployed versions are current.

---

## 11. Technical Architecture

### 11.1 Principle: the server is authoritative

The web client is **a view**. It never decides inventory, gold, craft results, procs, timers, or trades. Every state change is a server action that validates and applies it in a single transaction. This is non-negotiable for a persistent, multiplayer economy running in a browser, and it is far cheaper to do from day one than to retrofit.

### 11.2 Stack (decided): PHP + MySQL on SiteGround

Everything runs on the existing SiteGround hosting, on one domain.

```
[ TypeScript web client ] ── HTTPS/JSON ──>  [ PHP API ]  ──>  [ MySQL ]
  marz.gg/games/guildie/                    .../guildie/api/       SiteGround database
                                                 ▲
                              [ SiteGround cron job → tick.php (market tick) ]
```

- **Same domain for client and API**, so there are no cross-origin (CORS) issues.
- **Plain PHP 8 with PDO**: prepared statements everywhere, and InnoDB transactions for every game action.
- **JSON in, JSON out.** One small router (`api/index.php`) dispatches actions.
- **Secrets** (database credentials) live in `guildie-private/config.php`, outside `public_html`. Setup steps: `docs/setup-siteground.md`.
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

### 11.6 Web client structure (0.4.0)

- **TypeScript + Preact**, built by **Vite** into plain static files (one HTML page, one script, one stylesheet, about 25 KB of code compressed, plus about 100 KB of bundled fonts cached after the first visit). It loads in about a second, even on a phone.
- **3D harbor (0.7.0):** plain **Three.js** inside the Preact app (`client/src/world/`), as a separate file of about 140 KB compressed that only the 3D view downloads. The static town is merged into a few meshes, waves run on the GPU, shadows are drawn once and redrawn only on change, the frame rate drops to 30 when nothing moves, and the pixel ratio adapts to the machine. Today's scene: about 40 draw calls and 35k triangles. The engine only shows the server's state. Budgets are in [art-direction.md](art-direction.md) §5.
- **Responsive:** one column with a bottom tab bar on phones. From 900 px wide, the tabs move to the top and busy screens (Workshop, sell form, City trades) use two columns.
- `src/api.ts` (HTTP wrapper), `src/session.ts` (auth, player state, server clock offset; every action goes through it), `src/ui/*` (one file per screen: Login, Profession, GameScreen, Workshop, Market, Bag, City, Feedback).
- Uses the browser's own text boxes, keyboard, scrolling and password autofill.
- Data-driven from what the server sends, so a profession, building, or NPC persona can be added mostly through data, in line with the "systems" approach used in Pythio.
- Tested by a Playwright browser test (`client/tests/play.spec.ts`) that plays every screen on a phone-sized and a desktop-sized screen against a real API.

### 11.7 Repo layout

```
/client             Web client (TypeScript + Preact, Vite)    -> built into public_html/games/guildie/
/server/api         Public entry point      -> public_html/games/guildie/api/
/server/app         Private game logic       -> guildie-private/app/ (includes tick.php)
/server/config      Config template          -> guildie-private/config.php (filled in, never committed)
/server/migrations  SQL files (001_init.sql, ...), applied automatically by the server after a deploy
/server/tools       One-off helpers (upload, use, delete)
/content            JSON definitions: items, recipes, professions, buildings, personas, events
/docs               GDD, setup and deploy guides
```

**Public versus private:** only the thin entry point in `api/` is reachable from the web. Game logic, `tick.php`, and the config with database credentials live in `guildie-private/`, a folder next to `public_html` that a browser can't open.

`/content` is the single source of truth for static game data. The PHP server reads them and sends the client what it needs to display.

### 11.8 Hosting & deploy

- Web build and API hosted on SiteGround alongside other projects (proposed path: `marz.gg/games/guildie/`).
- Deploys are automatic from 0.2.1: a merge to `main` runs the checks, then GitHub uploads the server code to `guildie-private/` and the game to `public_html/games/guildie/` over FTPS. The server applies new database migrations itself. Details and the manual fallback: `docs/deploy.md`.
- Build number comes from the repo's `VERSION` file, stamped into both server and client, and shown in the client footer.
- Client: TypeScript + Preact web app built by Vite (0.4.0; replaced the Godot 4 web export, see the Decision Log).
- Development environment separate from the demo environment once real players join.

---

## 12. Milestones

Each milestone ends with a playtest and a clear exit question.

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M0 Foundation** ✅ | Repo, Godot project, MySQL database and PHP API on SiteGround (step-by-step setup guide), name + password login, read and write one inventory item through the server, cron job running a test tick, deploy steps, build number | Open on a phone, log in, see server-owned gold and an item |
| **M1 Market Prototype** (live, playtesting) | 3 professions (choice + starter recipes), 18 items, gathering stations, crafting with timers and batches, the Exchange with 3 NPC personas, liquidity band, market tick, Activity Log, economy simulator. Plain text UI. See [systems.md §9](systems.md#9-milestone-matrix). | **"Is making one good trade fun?"** |
| **M2 Crafting Depth** | Built fun-first, shipped in steps (0.5.0 = step 1) ([professions.md](professions.md) §9): **1.** order board, market ticker with Guild Week and events, "while you were away" screen, surprises on collect · **2.** skill and XP, learning recipes, rare recipes · **3.** the recipe ladder to 100 and the web rules · **4.** workshop upgrades as rank-up milestones. Quality tiers, gathering decisions and the Focus prototype follow if time allows | **"Do I want to come back tomorrow?"** |
| **M3 Real Players** | Shared market with multiple players, NPC scaling, leaderboards (gold and rank progress; a simple City directory shipped early in 0.3.0), anti-abuse | **"Does trading with real people feel different and better?"** |
| **M4 Look & Feel** | Final low-poly 3D art (hero models, icons rendered from models), machine progression visuals, sound, onboarding polish, installable web app. Pulled forward: the Portovela look shipped in 0.6.0, and the 3D harbor became the desktop home screen in 0.7.0 (low-poly shapes built in code, to be replaced by modelled assets) | **"Would I show this to a stranger?"** |
| **Later** | Guilds, specializations, second profession, more professions | — |

### Backlog (not scheduled)

- Player-to-player crafting orders
- Auction bidding
- Guest login

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

1. ~~**Gold leaderboard: total gold or net worth?**~~ **Decided 2026-10-27: total gold** (City tab, 0.3.0). Net worth stays an option if holding stock starts to feel punished.
2. **Exact skill curve and craft timers** to hit the pacing targets in [Section 3](#target-pacing). Tune in M1–M2 playtests.
3. **Active bonus size:** how much more should active play reward than idle without making idle feel bad?
4. **Second profession carryover:** what transfers from the first profession, if anything?
5. **Gold sinks before slowing the pace:** players accumulate gold quickly in M1 with little to spend it on. Which M2 sinks come first?
6. ~~**City name**~~ **Decided 2026-10-28: Portovela** ("port of sails"), replacing the working name Brassmere.
7. **Skill source (#30):** replace random skill-ups with crafting XP plus a first-craft bonus? How big should the bonus be, and should gathering give XP? The current 12 recipes can't fill the 100-point curve, so more recipes are needed in M2.
8. ~~**Player interaction beyond the Exchange**~~ **Decided 2026-10-27:** a player directory and direct trade offers ship in 0.3.0 (6.8, 6.9). Gifts and a trade fee are not decided yet.
9. ~~**Italian / mercantile flavour?**~~ **Decided 2026-10-28:** Guildie is set in Portovela, a Renaissance merchant republic; the steam age becomes the age of invention. Names, palette and icons changed in 0.6.0. See [art-direction.md](art-direction.md).
10. ~~**Client engine (#40)**~~ **Decided 2026-10-27: TypeScript web client** (0.4.0). Original question: keep Godot, or move the client to a web stack (TypeScript)? Playtest 0.3.0 found the browser UI feels like a phone app on desktop and loads slowly. To decide before more client work.

**Playtest 1 feedback (2026-10-27):** Marz (Blacksmith) hit 0 gold and could neither list nor buy (#27, safety valve #28); asked for visible WoW-style skill points, e.g. 100/100 (#30); found no way to meet or trade with players outside the Exchange (#31, #32).

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
| 2026-10-25 | Build number lives in a `VERSION` file, not server config | Deploys can't drift out of sync with a hand-edited config value |
| 2026-10-25 | Session tokens sent in an `X-Guildie-Token` header and stored hashed | Some shared hosts strip the standard Authorization header; hashing protects players if the database leaks |
| 2026-10-25 | Market tick runs every 10 minutes from cron | SiteGround allows shorter intervals (resolves the cron Open Question); 10 minutes is enough until the NPC market exists, and can be shortened in M1 by changing cron and `tick_interval_seconds` together |
| 2026-10-26 | Game broken into systems in `docs/systems.md` | Every feature belongs to one system with clear data ownership; milestones are defined per system |
| 2026-10-26 | Systems defaults P1–P6 confirmed | Gathering-station decisions; skill unlocks *what*, buildings *how much*, rank caps buildings; Focus as active play (M2 prototype); Activity Log and economy simulator in M1; batch crafting |
| 2026-10-26 | M1 deploy wipes all accounts | Every playtester starts equal |
| 2026-10-26 | M1 playtest runs at fast pace (`pace.time_multiplier` 1.0: crafts in seconds to minutes, stations fill in ~1 hour) | A week of testing shows the whole loop; one setting slows everything later |
| 2026-10-26 | Market tick every 5 minutes | The market should visibly move during a session |
| 2026-10-26 | Copper Lantern and Hide Satchel added | Every profession needs a self-sufficient finished good to earn from day one (Alchemists already had Healing Draught) |
| 2026-10-26 | Guild Workshops persona added; scarcity pricing; NPC demand scales with active players | Economy simulator showed tier-2 goods were never made, undercutting deflated prices, and fixed demand overwhelmed small groups (systems.md M1 tuning notes) |
| 2026-10-26 | Automatic deploys from GitHub (FTPS, same approach as Pythio) with self-applying migrations | Removes manual uploads and phpMyAdmin imports from every release |
| 2026-10-26 | Two crafting slots, batches up to 10, 150 starting gold | Lets a player make a component and a finished good at the same time; enough gold to buy a first cross-guild input |
| 2026-10-27 | Listing deposit is taken from the sale money; on cancel/expiry charged only if affordable | Playtest 1: charging it up front soft-locked a player at 0 gold (#27) |
| 2026-10-27 | Sell to guild: instant sale at a low price that drops with each unit sold and recovers over time; rule hidden, price always shown | A guaranteed way out of 0 gold that never beats listing on the Exchange (#28) |
| 2026-10-27 | In-game Feedback button with a private reading page | Playtest notes reach Marz directly, with the screen, gold and build attached (#29) |
| 2026-10-27 | City tab (player directory) pulled forward from M3; Wealth board ranks by **total gold** | Playtest 1: no way to meet other players; resolves Open Question 1 (#31) |
| 2026-10-27 | Direct trades as asynchronous offers with the sender's side held; both sides must contain something (no gifts yet); no fee for now | Players are rarely online together on phones; keeps alt funnelling harder until anti-abuse lands in M3 (#32) |
| 2026-10-27 | Workshop and Craft merged into one check-in screen; tab bar is Workshop, Market, Bag, City | The 30-second check-in (collect, then queue crafts) shouldn't need a tab switch (#39) |
| 2026-10-27 | City shows one list with gold and crafts columns; #1 by gold is "Il Factotum della Città" | Two sorted lists repeated the same people; separate columns leave room for skill; a title gives the top a name (#38) |
| 2026-10-27 | Sell form lists on the Exchange first, guild sale below; raw materials say they have no city buyers | The Exchange is the main way to sell (Pillar 2); answers "will it sell if I'm alone?" (#37) |
| 2026-10-27 | **Client moves from Godot 4 to a TypeScript + Preact web app** (0.4.0) | Guildie is almost all menus and lists, which browsers do natively: about 20 KB instead of tens of MB, loads in a second, adapts to phone and desktop, real text boxes and keyboard. Only the client was rewritten; server, database, API tests and content are unchanged. Isometric art (M4) can use a canvas library (#40) |
| 2026-10-28 | M2's goal is fun before content: decisions on three timescales (market ticker, order board, recipe choice); see §2.1 | Playtest 0.3.0: "done everything in 20 minutes"; more recipes alone wouldn't fix a loop with no decisions |
| 2026-10-28 | Order board lives in the Workshop; orders can ask for several items, including other guilds' goods (from Journeyman); rewards include things the market can't give (XP, rare materials, rare recipes) | Making belongs to the Workshop; bundle orders drive trade |
| 2026-10-28 | Market ticker: every price shown versus usual with green/red arrows, moved by learnable causes (Guild Week, news events, supply) and drifting back to usual | Price moves must be readable to make trading a skill, not a gamble |
| 2026-10-28 | Recipes are chosen and bought at the trainer (one free starter per rank); rare recipes from orders; no specialization branches for now | Anticipation, identity, and the gold sink the economy needs |
| 2026-10-28 | XP falls off on easy recipes (orange/yellow/green/grey), +25% on recipes using another guild's goods, double XP on the first craft of the day | Push players to new recipes; reward trade partners; reward short check-ins |
| 2026-10-28 | Workshop upgrades are the rank-up milestones, capped by rank and costing gold plus other guilds' parts | Ranks should feel like events; the strongest everyday reason to trade |
| 2026-10-28 | Web rules W1–W7 and the 16-recipe ladder per guild adopted ([professions.md](professions.md)); one big M2 release | A framework every recipe follows, checked by the validator |
| 2026-10-28 | New professions, specialization branches and the second profession are on hold | Make the three guilds fun first |
| 2026-10-28 | M2 step 1 (the fun core) ships on its own as 0.5.0 | Marz asked to ship it, so the fun bets get playtested before the content is built |
| 2026-10-28 | Until skill ranks exist, bundle orders unlock at 30 crafts made (standing in for Journeyman); collectors are rare high-paying orders (more on Sunday) | Lets 0.5.0 test bundle orders and collectors without waiting for step 2 |
| 2026-10-28 | "While you were away" shows after 15 minutes away, even if nothing happened | Predictable; a quiet summary still tells the player the world kept going |
| 2026-10-28 | Order rewards are priced from usual value and stay below the Guild Suppliers' price (whole reward ≤ 1.45× value, rare material included); suppliers never sell below 1.5× usual; collectors pay a guaranteed rare material instead of 3× gold | 0.5.1 exploit fix: collector (3×) and bundle (1.7×) orders could be filled with supplier stock (1.5×) for free gold. Collectors can pay big again once they ask for Fine/Masterwork goods that suppliers don't sell (quality tiers, M2) |
| 2026-10-28 | Raw prices follow the median of trades clamped to the NPC band, counted only with 2+ different sellers and buyers | 0.5.1 exploit fix: two friends trading one unit at 20× could pin a raw's price at its cap, then sell raws to Traders at the inflated price |
| 2026-10-28 | **Theme: Portovela**, a Renaissance merchant republic on the coast; steam is replaced by the age of invention (water wheels, gears, clockwork) | Italian guilds, the bottega and the Rialto make a crafting-and-trading game feel native. Only names and flavor change; game rules stay the same. Replaces the 2026-10-25 steam theme and the Brassmere working name ([art-direction.md](art-direction.md)) |
| 2026-10-28 | New look: sea teal, whitewash, lemon and terracotta, day and night palettes; Fraunces and Nunito; item icons on majolica tiles | Guildie shared Hormiga's brass-and-dark-brown palette; this one is its own and passes WCAG AA |
| 2026-10-28 | Display renames: gold → **ducats**, the Exchange → **the Mercato**, Workshop → **Bottega**, Tournament → **Regatta**, Steam Tonic → **Lemon Tonic**, Adventurers → **Sailors** | Fit the new setting. IDs, API fields and database columns are unchanged |
| 2026-10-28 | **3D in the browser:** Three.js through React Three Fiber (Preact → React), under HTML menus; not Unity | Keeps the stack, server and tests; every system gets a place and a verb. Replaces the 2026-10-25 "2D, UI-driven" decision |
| 2026-10-28 | Machines cost lamp oil and wages for hired hands (replaces coal) | Still a sink that grows with automation, in the new setting |
| 2026-10-28 | Art pulled forward: 0.6.0 reskins today's screens, then a hidden 3D test slice beside M2; final art stays in M4 | Marz asked for a release with the new look before more gameplay |
| 2026-10-28 | **The 3D harbor is the desktop home screen (0.7.0); phones keep the classic view for now** and move toward 3D step by step | Marz asked for a functional 3D overhaul optimized for browsers, with the classic view kept for mobile. Panels reuse the classic screens, so both views stay in step |
| 2026-10-28 | **Three.js directly in the Preact app, not React Three Fiber** (replaces the React + R3F choice above) | The scene is mostly hand-animated, so R3F's declarative layer adds little; plain Three.js keeps the client on Preact (no app-wide React swap), keeps the 3D in its own lazily loaded file, and gives full control of the render loop for battery and speed. R3F can still come later if the scene grows into many interactive pieces |
| 2026-10-28 | **0.8.0 progression (M2 step 2):** skill and XP live on the server; XP is counted at collection. Orders pay 3× (collectors 4×) recipe XP with no fall-off; the first finished batch each UTC day pays double | Orders are "the best XP for the time" (professions.md §2); a daily check-in always moves the bar (Pillar 4) |
| 2026-10-28 | **Players craft only recipes they know.** New players get the free Apprentice starter; players from before 0.8.0 keep every recipe of their guild and both raws, and their skill is replayed from their past crafts | Choosing recipes is the bet; nobody loses access they already had (#30, #49) |
| 2026-10-28 | **Bundle orders unlock at Journeyman** (replaces the 30-crafts stand-in); Apprentice orders ask only for goods from recipes you know or can learn now | The stand-in existed only until ranks arrived |
| 2026-10-28 | **Rare recipes are better variants of existing goods for now** (2 per guild: more output per craft and 1.5× XP), taught by orders up to 10 skill above yours | Trophies without new items and icons; step 3 (#50) can add rare goods with their own art |
| 2026-10-28 | Raw 2 (Iron Ore, Ember Moss, Thick Hide) unlocks at skill 15 for new players | professions.md §5; Apprentice recipes before 15 use only raw 1 |
| 2026-10-27 | Profession skill max stays at 100, shown as "x/100" | Considered 200 after playtest 1; 100 means less progression to balance. Can be tweaked later |
| 2026-10-28 | **The living city (0.9.0):** live presence of other players through a small realtime service next to SiteGround: a **Node container on the existing DigitalOcean droplet** (behind its Caddy, `guildie.marz.gg`), carrying only cosmetic things (positions, waves, slaps); the PHP server signs a 10-minute pass so only logged-in players join | Marz wants to see other players move. Shared PHP hosting can't hold WebSockets. The droplet is already paid for, already serves HTTPS and WebSockets for Hormigas, and has no message quota; no new account. Cloudflare Durable Objects (free plan) was the runner-up; Ably and Pusher count every delivery. Presence is optional: without the service the game is unchanged ([living-city.md](living-city.md) §7) |
| 2026-10-28 | Player-steered merchant (WASD, arrows, click-to-move); clicking a place opens its panel at once while the merchant walks there | Walking around is the fun; the 30-second check-in must not get slower |
| 2026-10-28 | **Guild quarters** (Smiths', Alchemists', Tanners') instead of one long street; 30 visible players per quarter copy, more open a new copy; townsfolk and echoes from recent activity fill quiet quarters | Meeting your own guild serves Pillar 1; a long street of every player doesn't scale and is empty with few players (Pillar 3) |
| 2026-10-28 | **Friends** as one-way bookmarks (no requests); friends' stalls first in every quarter (migration 007) | Everything a friend sees is already public, so no consent step is needed; simplest version to test |
| 2026-10-28 | **Gentlemanly slaps:** a cosmetic glove slap (a Renaissance duel challenge), opt-out, rate- and distance-limited by the realtime room; players aren't solid, so nobody can block a door | Character and fun between players with no effect on the economy |
| 2026-10-28 | **People become wobbly blob merchants** in guild dress and hats, with an oversized slap glove (art-direction.md §9) | Reads from far away, funny without faces, cheap to animate (spring wobble, no skeleton or physics engine) |
| 2026-10-28 | **The Duke's order:** one city-wide order with lines for all three guilds, 72 h, pays 1.25 × usual value per unit at once plus 0.15 × on completion, at most 40% of a line per player until its last quarter of time, public board of helpers | "Together, first": a shared goal everyone can see. The whole reward (1.40 ×) stays under the suppliers' 1.5 × (the 0.5.1 supplier rule) |
| 2026-10-28 | Living city on phones: the City tab gets the Duke's order, Friends and Quarters as lists; no live walkers on phones yet | Every feature must work in the classic view (Decision of 2026-10-28) |
| 2026-10-29 | **The people of Portovela (0.10.0):** one code-built character kit for everyone; the nine order customers get their own looks; customers speak and take the goods; buyers walk to your stall for real sales; bow, cheer and shrug; idle moves; the trainer at the hall door and the herald's trumpet | Marz approved the character proposal (all eight decisions). Characters only act out what the server already decided |
| 2026-10-29 | **Rank sashes** (#30): none, sea-glass, majolica, gold with a medallion; rank comes from skill in the signed presence pass | Your rank is visible to other players without a new table |
| 2026-10-29 | **Choose your look:** six body colors and three hats per guild, free, picked when joining a guild and changeable in the 3D city; saved on the server (migration 008). Accounts from before 0.10.0 keep their look and get a one-time invitation | Marz: "players should select their character design upon new account creation". Unlocking hats by rank or events stays a later gameplay decision |
| 2026-10-29 | Characters stay **built in code** (merged vertex-colored shapes, spring wobble, no skeletons, no .glb files) | At this camera distance shapes and colors carry the read; keeps downloads small and the art fully in the repo |
| 2026-10-29 | **Smooth people (0.10.1):** characters are smooth-shaded with more segments (about 1,750 triangles each instead of 590; same draw calls); the town stays faceted. Townsfolk, customers and buyers ease in and out of walks, and other players glide without stop-start | Marz's playtest of 0.10.0: visible facet lines on the characters, and people moving in stops and starts |
| 2026-10-29 | **The new-player guide (0.14.0):** six server-checked first steps (collect, craft, train to skill 6, learn a recipe, walk up to the Palazzo, slap: optional) with ducats per step (20–30) and a 150-ducat purse at the end; a card with the next step, the button to press pulses, and in 3D an arrow points at the place | Marz asked for a Hormigas-style first-time experience. "Train to 6" is its own step because a new crafter can't learn a trainer recipe until skill 6. The Palazzo visit and the slap are reported by the client: the server can't see them, and the reward is small and one-time |
| 2026-10-29 | **One square (0.13.0):** the quay keeps only your own work (station, workbench, customers, bottega, storehouse); the guild quarters are removed and the Palazzo is the one shared square; the loop is "craft on the quay, trade and meet at the Palazzo" | Marz: "go to the middle, mess around with friends, go back to the quay and craft". Fewer places makes the 30-second check-in clearer, and one square concentrates the few players we have (Pillar 3) |
| 2026-10-29 | **The marketplace** (like a grand exchange) replaces the Wanted board in the middle of the Palazzo: one vendor per guild and a selling desk; the Wanted board's posts become **buy offers** at the desk. On a computer you trade there, not from the quay | Marz: "buying and selling should be at the main marketplace". Buy offers keep "ask for exactly what you need" (Pillar 5) |
| 2026-10-29 | **Il Factotum is the statue** in the middle (their own merchant in bronze) and their portrait hangs on the Palazzo | Marz's request: a public, visible goal |
| 2026-10-29 | **The new-player guide** comes in its own build after the square (0.14.0): collect, craft, learn a recipe, go to the square, slap (optional); ducats each step and a bigger purse at the end | Marz's choices. The guide points at places, so it's built on the final layout |
| 2026-10-29 | **The recipe ladder ships whole (0.12.0, #50):** all three guilds to skill 100 at once (36 trainer recipes, 6 rare, raws 3 and 4), with 42 hand-drawn icons in the majolica-tile style | Marz's choice. Nobody is near Expert yet, so Master goods are a visible goal; the validator can check the whole web at once |
| 2026-10-29 | **Machine running costs (lamp oil and wages) wait for the balance pass (#52)**; Lamp Oil is craftable from now on (Alchemist, skill 6) | Marz's choice. It's a gold sink that needs the simulator and the slower pace tuned together |
| 2026-10-29 | The Diving Suit uses Lamp Oil instead of Brass Fittings, and the Aviator's Harness is the Ornithopter Harness | Every Master guild needs a prestige good that needs two other guilds (rule W2); airplanes don't fit Portovela |
| 2026-10-29 | **Orders grow with rank:** one order value range per rank | Without it a Master's order would ask for one prestige good far over the target value |
| 2026-10-29 | **The 4th guild is the Glassblower** (Murano glass), not the Tinker; it opens when it's ready, with no player-count gate | Marz's choice. Nobody makes glass today, while a Tinker would take the Blacksmith's Gears and Clockwork; NPC customers and buyers already keep a quiet quarter alive (Pillar 3) |
| 2026-10-29 | **Guilds as data (0.10.3):** one guild description in `content/professions.json` that the server, realtime rooms and client all read, plus art kits found by file name; the validator enforces the web rules, icons and NPC demand. Built before the ladder (#50) | Marz asked for a modular, systematic design before new content ships; the architecture review found ~20 hand-written guild lists, several of which would have crashed with a 4th guild |
| 2026-10-29 | **Easier pointing (0.10.2):** invisible hover boxes around every clickable place and person, hover that forgives a brief slip, and labels that light up instead of growing on hover | Marz's playtest: thin places (the trapper's lodge, the Duke's notice board) lost the hover, and their labels seemed to jump |
| 2026-10-29 | **The Palazzo (0.11.0):** a shared square up the Steps, open to every guild and live like the quarters, with the city hall (Hall of honor), the Wanted board, the Duke's lectern and three officials ([palazzo.md](palazzo.md)) | Marz chose a new shared "city hall front". The quarters only gather one guild, but the game is built on needing the others (Pillar 5) |
| 2026-10-29 | **Bottega upgrades open the ranks (#51 reworked):** skill stops at the top of the rank your bottega allows; crafts give no XP at the cap; building the next level (ducats plus both other guilds' goods, a build time) steps you into the next rank. Each level visibly rebuilds the bottega, from a rundown shack to a fine bottega | Marz: "to progress in a rank, one must dump resources into infrastructure… as you progress your shop should get better looking." Replaces "rank caps the building level" (2026-10-28) |
| 2026-10-29 | An upgrade only asks for goods crafters **one rank lower** can make; levels 3 and 4 use today's Journeyman goods until the ladder's parts exist (#50) | Otherwise nobody could reach Journeyman: Journeyman goods only come from Journeymen |
| 2026-10-29 | Players from before 0.11.0 **keep their rank** but start in the shack; building gives them the look and bonuses | Marz: "keep rank, build to get the look" |
| 2026-10-29 | **The Wanted board:** paid requests from players; price per unit inside the market's fair band, ducats held when posting, the filler pays the Mercato cut, 3 open posts, 48 hours, then refunded | Marz's choice. The band stops funnelling ducats between accounts (GDD 6.7); the cut is a gold sink |
| 2026-10-29 | **The Hall of honor:** Il Factotum plus the richest, the most skilled, the Duke's best helpers and the finest bottegas | Public goals: the M3 leaderboards pulled forward as a place |
| 2026-10-29 | **Three officials** (notary, town crier, Duke's steward): rumors built from real game data, one favor a day each (1.2x usual value, under the suppliers' 1.5x, plus order XP), and flavor lines. The steward asks for another guild's goods | Marz asked for all three kinds of NPC interaction. Rumors make reading the market a skill (Pillar 2); favors give a 30-second visit a purpose (Pillar 4) |
| 2026-10-29 | City-wide prosperity (the city growing from Duke's orders) **revisited later** | Marz preferred each player's bottega growing with their rank first |
| 2026-10-29 | Machine running costs (lamp oil and wages) **come with the ladder and the balance pass**, not 0.11.0 | They need the ladder's Lamp Oil supply and a simulator run |
| 2026-10-29 | **Minigames (0.15.0):** optional, short games at your station that pay **extra raws**; active play comes to gathering first, and crafting Focus (quality) later on the same framework | Playtest feedback: idle collecting isn't fun. Quality tiers don't exist yet, so a quality bonus would have nothing to give (systems.md 5.4, 5.5) |
| 2026-10-29 | The first game is **Strike** (tap when the marker is over the sweet spot) with **three looks**: pickaxe, sickle, snare | Marz's pick: the smallest build that proves the fun and the framework; more kinds later |
| 2026-10-29 | Minigames **tire you**: each round pays less, recovering over a few hours; never a hard wall | Marz's pick. Unlimited full pay would flood the shared market with raws and crash prices for everyone (Pillar 2) |
| 2026-10-29 | **Modular minigames:** kinds (rules) and targets (what a round pays) are registries; each guild picks a kind, look and words in content, so a new profession needs no code | Marz asked for a system future professions can adapt |
| 2026-10-29 | Built as **0.15.0, after the guide and before the balance pass (#52)** | So #52 tunes the economy with minigame income included |

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **Exchange** | Guildie's auction house. Players see it as **the Mercato** (0.6.0) |
| **Bottega** | The player's workshop and home screen (the Workshop tab before 0.6.0) |
| **Ducat** | Guildie's money as players see it; the server and database call it gold |
| **Reference value (R)** | Server-side baseline price for an item |
| **Liquidity band** | The NPC floor and ceiling price range that players trade within |
| **Persona** | A type of NPC market participant with defined behavior |
| **Market tick** | Scheduled server job that runs NPC activity and updates prices |
| **Queue slot** | A concurrent crafting slot (Clash of Clans builder equivalent) |
| **Signature mechanic** | The one unique system each profession adds to the shared framework |
| **Crafting order** | A request for a specific item and quality, with a reward |
| **Sink / Faucet** | Systems that remove or add value to the economy |
