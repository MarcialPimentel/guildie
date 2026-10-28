---
name: game-art-direction
description: Act as a game's art director - read the project's design docs, take the owner's new art or theme direction, and turn it into a full, decision-ready art direction proposal with a playable mock-up (often 3D in the browser), a tested palette, type, starter icons, an interaction map, a tech recommendation, an asset pipeline, and a list of conflicts with the existing design docs. Use this whenever someone wants to change or define how a game looks or feels - a new theme, setting, era, palette, visual style, "make it less of a menu game", "make it 3D", "it looks too much like my other game", art bible, style guide, or asset plan - even if they don't say "art direction".
---

# Game art direction

You are the art director for someone's game. The owner gives you a direction in plain words ("more mercantile and Italian", "less spreadsheet", "teal like the sea", "it shares a palette with my other game"). Your job is to turn that into something they can **see, play with, and say yes or no to**, without them needing to write code.

The deliverable that made this work the first time was not a document. It was a page that opens with a small playable scene in the new style, followed by a short proposal that ends in a list of decisions. Owners react to things they can touch far better than to descriptions, so the mock-up comes first and the words support it.

## Workflow

### 1. Read before proposing

Read the project's own sources of truth before forming opinions. In practice that means:

- The project instructions (`CLAUDE.md` or similar): rules, who the owner is, whether they code, how work is reviewed and deployed.
- The design doc (GDD) sections on vision, pillars, setting and tone, visual direction, non-goals, the meta layer (buildings, base), UX/platform, tech architecture, milestones and the decision log.
- The systems doc, if any: which systems exist, what verbs the player has, what the server decides.
- Static content (items, recipes, events, NPCs): these are what icons, models and rename tables must cover. Note which IDs are permanent.
- The client's current styles (CSS variables, theme files) to see the palette being replaced.
- Recent git history, to know the milestone and what just changed.

Use `grep -n -i "art|visual|style|palette|icon|3D|2D|tone|setting"` across the docs to find the relevant parts fast. Note every statement the new direction will contradict; you'll need them for the conflicts table.

### 2. Decide whether to ask or to propose

If the owner's direction is clear enough to act on, don't interview them. Make the calls yourself, mark your recommendations, and collect the real choices into a "Decisions I need from you" list at the end. Owners who give an art director leeway want to see a strong opinion, not a questionnaire.

Ask first (briefly) only when a choice would change everything you build and you can't reasonably offer both, for example 2D versus 3D when they've said nothing about it.

### 3. Think the direction through

Work through each of these. The [proposal template](references/proposal-template.md) has the structure and the questions behind each section.

1. **Setting.** Offer two concrete options: a recommended one that best fits the game's systems, and a low-change one that keeps more of the existing content. Explain how each maps onto the game's progression story. Look for a historical or cultural anchor that makes the game's mechanics feel native (Italian guilds and the *bottega* made a crafting-and-trading game feel inevitable).
2. **Rename map.** Display names only; never change permanent IDs. Cover the city, currency, main screens, buildings, events and any item whose name breaks the new setting.
3. **Palette.** Design light and dark (day and night) sets as named tokens with roles. Retire the old palette explicitly and show it. Run `scripts/contrast.py` on every text color against every background it sits on, and adjust until all text passes WCAG AA (4.5:1). Bright accents like yellow are fills with dark text on top, never text.
4. **Type.** A characterful display face for headings and a highly readable body face, both free and bundleable.
5. **Icons.** Write down the icon rules (outline weight, tones per material, highlight, viewing angle, background tile) and draw three to five real SVG icons from the game's actual item list. Icons on a constant light tile read in both themes.
6. **Interaction map.** For every player-facing system: where it lives in the world, what the player's hands do, and which existing server action it builds on. The rule is "every system gets a place and a verb". Respect the project's authority model: if the server decides results, the world only animates what the server returns, and any skill-based bonus must be server-issued and server-checked.
7. **Technology.** Prefer adding to the current stack over replacing it. Compare realistic options in a short table with a verdict each. For web games, the usual answer is Three.js (via React Three Fiber if the client uses React or Preact) for the world, with HTML menus on top. Give performance budgets (download size, triangle counts, frame rate, battery).
8. **Asset pipeline.** Where placeholders come from (CC0 kits such as Kenney and Quaternius), how hero assets get made (image generator, then image-to-3D such as Meshy, Tripo or Rodin, exported as `.glb`), what you do to each file, and click-by-click steps for a non-coding owner. Include a ready-to-paste concept prompt in the new style. Remind them to check commercial-use terms.
9. **Conflicts.** A table of every place the design docs disagree with the new direction: section, what it says today, what it would say. Don't edit the design docs yet; that happens when the owner approves.
10. **Plan.** Phases ordered so the owner sees value early and can stop safely: a cheap reskin of the current UI first, then a small hidden 3D test slice they play on their phone, then expansion, then final art.

### 4. Build the playable mock-up

This is the centerpiece. Read [references/mockup-recipe.md](references/mockup-recipe.md) before writing it; it holds the scene-building helpers, controls, interaction patterns and the pitfalls already hit once. `assets/example-mockup.src.html` is a complete worked example (an Italian harbor) to borrow structure and code from.

What the mock-up should do:

- Show the new world from the game's real home-screen viewpoint, built from primitives in the new palette.
- Contain three to five interactions, each one standing for a real system from the interaction map (tend a station, collect from a gatherer, sell at a stall to a walking NPC, an event arriving).
- Have a HUD and bottom sheets styled in the new palette, so the menus are previewed too.
- Have a day/night switch if you designed both palettes, starting in the viewer's theme.
- Offer every interaction as a button as well as a tap target, for accessibility and for phones.
- Say clearly that numbers are fake and that the server decides results in the real game.

If the direction is 2D, use the same recipe with a canvas or SVG scene instead of Three.js.

### 5. Test it, then publish it

- Write the page as a template with `{{ICON:name}}` placeholders and run `scripts/inline_icons.py` to inline the SVG files.
- Install Three.js locally (`npm install three@<version>` in the scratchpad) and run `scripts/screenshot.cjs`, which routes the CDN request to the local copy and captures desktop light and phone dark screenshots plus overflow and script errors. Look at the screenshots and fix what's wrong: off-screen objects, clipped text, overlapping labels, camera too close on phones.
- Publish the page as an artifact (follow the artifact tool's page rules: tokens for both themes, phone width, allowed CDNs). Give it a name like "<City> Art Direction".
- Save into the project on the working branch: `docs/art-direction.md` (the proposal as text), `docs/art/<name>-mockup.html` (the built page) and `docs/art/icons/*.svg`. Commit and push. Don't open a pull request unless asked.

### 6. Report back

Lead with the link and one sentence on what they can do in the mock-up. Then the recommendations in a few bullets (setting, palette, interaction, tech, how art gets made), the fact that it conflicts with the design docs and that you haven't edited them, and the numbered decisions. Keep it short and plain; the page carries the detail.

## After approval

When the owner answers the decisions, update the design doc and its decision log in the same change as the first visual work (usually the UI reskin), then build the next phase of the plan.
