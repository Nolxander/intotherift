# Into the Rift — Master Index

**Game Title:** Into the Rift
**Genre:** Roguelite Creature-Collector Auto-Battler
**Visual Style:** 2D Pixel Art, 3/4 Top-Down

## Elevator Pitch

A roguelite creature-collector where you command auto-battling squads of riftlings through timed dungeons. Build your team on the fly, configure synergies between rooms, and race the clock to find and defeat the boss before time runs out. Pokemon meets TFT meets Megabonk.

## Jam Context

**Competition:** Vibe Jam 2026 (vibej.am)
**Deadline:** May 1, 2026 @ 13:37 UTC
**Constraints:** Web browser only, no login, 90% AI-coded, must embed jam widget
**Scope strategy:** Tier 1 is the shippable jam build. Tier 2 expands if time allows. Tier 3 is the post-jam full game.

## Scope Tiers

### Tier 1 — Shippable Jam Build
- **3 levels**, each a hub-and-spoke layout: central hub hall with 5-6 regular branches + a locked key-path gauntlet + a locked boss door
- Level 1 prepends an intro zone (safe start → 2 easy combats with recruits) so the player builds a team before facing the hub's choices
- Branches are short forward-only chains with a biome theme and a terminal reward (elite / recruit / rift shard). No backtracking; terminal rooms teleport home
- Key path unlock scales per level (L1=1 regular branch cleared, L2=2, L3=3); boss unlocks on key-path clear
- 12 riftlings, 6 types (2 per type), roles TBD
- Core commands (Attack / Rally / Unleash + stance)
- Recruit, bench, swap between rooms
- 5-7 min timer, 1 boss per level; L3 clear = victory
- Basic synergy (2-of-a-kind type bonus)
- Everything unlocked, no meta-progression

### Tier 2 — Expanded Jam Build
- 2-3 levels with scaling difficulty
- Additional riftlings beyond the core 12
- 5 roles (add Support, Bomber)
- Deeper synergies (3-of-a-kind thresholds)
- More room types (shrines, shops, events)
- Control encounters (riftling lords)
- Multiple distinct bosses

### Tier 3 — Post-Jam Full Game
- Meta-progression (collection, mastery, bond tree, descension)
- 15-20+ riftlings
- Procedural room pooling
- Full onboarding, polish, audio

status: jam_development

## Document Index

* [01. Core Mechanics](./01_Core_Mechanics.md)
* [02. Art & Audio Style](./02_Art_and_Audio_Style.md)
* [03. World & Level Structure](./03_World_and_Levels.md)
* [04. Progression & Economy](./04_Progression_and_Economy.md)
* [05. Tech Stack](./05_Tech_Stack.md)
* [06. Decisions](./06_Decisions.md)

## Original Draft

The full-scope GDD (including post-jam meta-progression, descension, and all design notes) is preserved in [GDD.MD](../GDD.MD) at the project root.
