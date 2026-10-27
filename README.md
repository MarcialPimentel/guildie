# Guildie

**Rise from apprentice to master in a guild city on the edge of the steam age.**

Guildie is a mobile-first browser crafting and trading game. Choose one profession, master it, and trade with every other crafter in a living, persistent market. Your workshop keeps working while you're away.

- **Client:** TypeScript + Preact web app (built with Vite)
- **Platform:** Mobile and desktop browsers
- **Status:** Pre-production (proof of concept)

## Design

The full design lives in **[docs/GDD.md](docs/GDD.md)**. It is the source of truth for all design decisions, and every working session should reference it before building features.

Quick links:
- [Systems breakdown](docs/systems.md)
- [Design Pillars](docs/GDD.md#2-design-pillars)
- [Core Loops](docs/GDD.md#4-core-loops)
- [Profession Framework](docs/GDD.md#5-profession-framework)
- [The Exchange](docs/GDD.md#6-the-exchange-auction-house)
- [Technical Architecture](docs/GDD.md#11-technical-architecture)
- [Milestones](docs/GDD.md#12-milestones)

## Setup and deploy

- [SiteGround setup](docs/setup-siteground.md): one-time database, folders, and config
- [Deploying](docs/deploy.md): first deploy and routine updates
- Current build: see [`VERSION`](VERSION)

## Roadmap

Milestones are tracked as GitHub milestones with issues:

1. **M0 Foundation:** project setup, PHP + MySQL backend, login, deploy steps
2. **M1 Market Prototype:** 3 professions, the Exchange, NPC market
3. **M2 Crafting Depth:** quality, procs, orders, workshop upgrades
4. **M3 Real Players:** shared market, leaderboards, anti-abuse
5. **M4 Look & Feel:** art, events, onboarding polish
