# Core Mechanics

## 1. Core Gameplay Loop

1. **Start** a run with one starter riftling
2. **Enter** a timed level — a branching web of rooms with a hidden boss
3. **Clear rooms** to earn XP, recruits, and upgrades
4. **Manage** team composition and bench between rooms (timer paused)
5. **Find and defeat** the boss before the timer runs out
6. **Progress** to the next level or end the run

## 2. Combat System

Combat is real-time and automatic. Riftlings fight on their own based on their role AI and equipped moves. The player influences combat through movement, team-wide commands, and pre-battle configuration.

### 2a. Player Control Model

The player directly controls the trainer character (WASD movement) and issues team-wide commands:

| Command | Key | Effect |
|---|---|---|
| **Attack** | Left Click / Space | Team engages target under cursor or nearest enemy |
| **Rally** | R | Team pulls back tight around the player (defensive reposition) |
| **Unleash** | Q | Every riftling fires its signature move at once (longer cooldown) |
| **Stance Toggle** | Tab | Cycle: Aggressive / Balanced / Defensive |

**Stances:**
- **Aggressive** — riftlings range farther to chase enemies
- **Balanced** — default behavior
- **Defensive** — riftlings stay tight, prioritize survival

Total combat inputs: ~4. Cognitive load stays constant whether the team is 1 riftling or 4.

### 2b. Role AI Archetypes

Each riftling has a role that determines its auto-behavior:

| Role | Behavior | Position | Tier |
|---|---|---|---|
| **Chaser** | Sprints at nearest enemy, high damage, fragile | Front | 1 |
| **Anchor** | Slow, tanky, taunts enemies toward itself | Front | 1 |
| **Skirmisher** | Keeps distance, fires ranged attacks, repositions when threatened | Back | 1 |
| **Support** | Stays near player, heals or buffs teammates | Mid | 2 |
| **Bomber** | Charges up, unleashes AoE on cooldown | Back | 2 |

Roles are the primary mechanism for making riftlings feel distinct. Two fire riftlings with different roles play very differently.

### 2c. Formation

Role-based formation relative to the trainer (not grid-based):
- Chasers and Anchors lead at the front
- Skirmishers hang back
- Supports flank the player

No hex-grid or 3x3 placement for Tier 1. Riftlings maintain soft positions relative to the trainer and break formation naturally when combat starts.

### 2d. Move System (Loadout, Not Live Command)

Each riftling has a pool of 3 moves. Between rooms, the player chooses which 2 to equip from the pool. Riftlings use these moves automatically during combat — each move has its own independent cooldown, and the riftling fires whichever equipped move comes off cooldown first that has a valid target.

**Move Kinds** — each move has a `kind` that determines what it actually does:

| Category | Kind | Mechanic |
|----------|------|----------|
| **Damage** | `strike` | Single-target hit (basic attack) |
| | `blast` | AoE — hits target + 60% splash damage to nearby enemies |
| | `pierce` | Single-target, ignores defense entirely |
| | `barrage` | Hits 2–3 random enemies for 60% power each |
| **Support** | `heal` | Restores HP to the lowest-HP ally (below 60%) |
| | `shield` | Grants temporary defense buff to an ally |
| | `rally_buff` | Buffs attack + speed of all nearby allies for a duration |
| **Utility** | `drain` | Damages enemy, heals attacker for 30–35% of damage dealt |
| | `slow` | Damages enemy + reduces their speed by 40% temporarily |
| | `taunt` | Forces nearby enemies to attack the taunter for a duration |

**AI targeting rules** — riftlings use moves intelligently without player micromanagement:
- Heal is only used when an ally is below 60% HP (not wasted at full health)
- Shield targets the lowest-HP ally without an active shield
- Rally buff is skipped if all nearby allies are already buffed
- Taunt fires when 2+ enemies are nearby and not already taunted
- Damage moves always target the nearest enemy

**Signature moves** — one move per riftling is marked as signature. Signature moves get a screen shake and enhanced projectile visual when they fire.

**Unleash** specifically triggers each riftling's equipped signature move, so loadout decisions have visible, specific consequences.

**No** condition-based move programming. No "use X when HP < 50%."

### 2d-ii. Move Visuals

Each move kind has distinct combat visuals so the player can read what's happening in a swarm fight:

| Kind | Projectile | Impact |
|------|-----------|--------|
| `strike` | Element-colored dot | Element-colored flash |
| `pierce` | White dot, faster, fading trail | White flash |
| `blast` | Element-colored dot | Expanding AoE circle at impact |
| `barrage` | Multiple smaller dots, staggered | Element-colored flash per hit |
| `drain` | Green-tinted dot | Green flash + green orb returns to attacker |
| `slow` | Cyan dot | Cyan flash + "SLOWED" text |
| `heal` | (no projectile) | Green tint + green "+HP" text on ally |
| `shield` | (no projectile) | Blue tint + "+DEF" text on ally |
| `taunt` | (no projectile) | Red expanding ring + "TAUNT" text on enemies |
| `rally_buff` | (no projectile) | Gold expanding ring + "+ATK +SPD" text on allies |

Ally projectiles are colored by element type (fire = orange, water = blue, earth = brown, nature = green, light = yellow, dark = purple). Enemy projectiles are always red.

### 2e. Stats

Each riftling has 7 visible combat stats:

| Stat | Abbrev | Effect | Range |
|---|---|---|---|
| **HP** | HP | Health points. Reaching 0 = KO. | 40–120 base |
| **Attack** | ATK | Base damage added to attacks. | 4–9 base |
| **Defense** | DEF | Flat damage reduction on incoming hits (minimum 1 damage always dealt). | 0–6 base |
| **Speed** | SPD | Movement speed in pixels/sec. | 30–80 base |
| **Attack Speed** | A.SPD | Time between attacks in ms. Lower = faster. | 600–1500 base |
| **Crit Rate** | CRIT | % chance per hit to deal 1.5x damage. Capped at 50%. | 3–20 base |
| **Evasion** | EVA | % chance per incoming hit to dodge entirely (0 damage). Capped at 40%. | 0–18 base |

Additionally, **Range** (Melee ~28px / Ranged ~80px) is a fixed species trait that defines engagement distance. Melee riftlings charge in; ranged riftlings hang back and kite.

Stats grow on level-up with randomized gains, influenced by the riftling's temperament.

### 2e-ii. Status Effects

Moves like `shield`, `rally_buff`, `slow`, and `taunt` apply temporary status effects during combat:

- **Buffs** (shield, rally_buff): increase a stat (DEF, ATK, SPD) for a duration, then revert
- **Debuffs** (slow): decrease a stat temporarily. Slow reduces speed by 40% for 2.5–3 seconds
- **Taunt**: forces affected enemies to target the taunter for 4–5 seconds

Status effects are applied immediately and reverted automatically when they expire or when the affected unit dies. Effects do not persist between rooms — `startEncounter` rebuilds all combat stats from party data.

### 2f. Temperament

Every riftling is born with a **temperament** — a personality trait that shapes how its stats grow on level-up. Two riftlings of the same species with different temperaments will diverge significantly by mid-run.

| Temperament | Boosted Stat | Reduced Stat | Fantasy |
|---|---|---|---|
| **Fierce** | ATK | DEF | All-in aggression |
| **Stalwart** | DEF | SPD | Immovable wall |
| **Swift** | SPD | ATK | Fast but hits lighter |
| **Keen** | CRIT | HP | Precision hunter |
| **Elusive** | EVA | ATK | Hard to pin down |
| **Relentless** | A.SPD | DEF | Rapid-fire attacks |
| **Hardy** | HP | CRIT | Built to endure |
| **Balanced** | — | — | No particular leaning |

**How it works:**
- The **boosted stat** gets a guaranteed bonus on every level-up (on top of any random roll)
- The **reduced stat** never rolls a random gain on level-up (it can still grow from other sources)
- By level 10, two riftlings with different temperaments diverge meaningfully in their boosted/reduced stats
- **Balanced** has no modifier — pure random growth

**Design rules:**
- Temperament is assigned randomly when a riftling is created (recruited or starter)
- Visible in the Party Screen (with boosted stat shown in green, reduced in red)
- Visible in the Recruit Prompt so the player can make informed decisions
- Temperament does not affect base stats — only growth on level-up
- 8 temperaments × 8 species (Tier 1) = 64 possible combinations, keeping replayability high

### 2g. Typing (Soft, Not Hard)

6 types with a clean effectiveness loop:

| Type | Strong Against | Weak Against |
|---|---|---|
| Fire | Nature | Water |
| Water | Fire | Earth |
| Earth | Water | Nature |
| Nature | Earth | Fire |
| Light | Dark | Dark |
| Dark | Light | Light |

Fire/Water/Earth/Nature form a four-way loop. Light and Dark are mirrors — each strong and weak against the other.

**Design rules:**
- Effective attacks: ~1.5x damage
- Resisted attacks: ~0.7x damage (minimum floor — bad matchups are a disadvantage, not a wall)
- No dual types, no immunities, no 4x weaknesses
- Single type per riftling
- Typing is a team composition and target prioritization system, not a mid-fight switching system

### 2h. Synergies (Composition Layer)

Riftlings contribute to composition bonuses along two axes: **Type** and **Role**.

**Thresholds (team of 4):**
- 2+ of a type: activates the type synergy bonus
- With 6 types and 2 creatures per type, reaching a synergy requires committing 2 of 4 active slots to one element — a meaningful choice

**Type Synergy Bonuses (activate at 2+ matching riftlings):**

| Type | Synergy Name | Bonus |
|------|-------------|-------|
| Fire | Blaze | +3 Attack |
| Water | Tidewall | +2 Defense |
| Earth | Bedrock | +15 Max HP |
| Nature | Overgrowth | Regen 2 HP/s during combat |
| Light | Radiance | +8 Crit Rate |
| Dark | Eclipse | +6 Evasion |

Bonuses are flat values applied to matching riftlings at the start of each combat encounter. Active synergies are always visible in the UI. Players should never need a wiki.

[TODO: Define role synergy bonuses]

## 3. The Timer

Every level has a visible countdown. If it runs out before the boss is defeated, the run fails.

**Timer runs during:** walking, exploration, combat, abilities, map browsing
**Timer pauses during:** upgrade selection, recruit prompts, team management, bench swaps, pause menu

**Design rules:**
- Always visible, prominent on HUD
- Generous early, tight late — natural intensity curve
- Combat does NOT stop the clock
- Consistent starting time per level so players learn pacing

**Tier 1 target:** 5-7 minutes per level

## 4. The Bench

A holding area for riftlings not on the active team:
- **Active slots:** 4
- **Bench slots:** 4 (Tier 1)
- Swapping is free between rooms (timer paused), not allowed during combat
- Recruitment buffer — grab now, decide later if it fits the build

## 5. Recruiting

New riftlings acquired through:
- Post-room recruit prompts (defeated wild riftlings have a chance to offer to join)
- Rare: rescue encounters, shrine rewards
- Boss defeat: guaranteed high-tier recruit

Recruit decisions are quick — yes/no with full info visible (type, role, stats, moves). If the team is full, player picks a swap target or sends the new recruit to bench.

## 6. Riftling Roster

12 riftlings across 6 types, 2 per type. Each type pair offers two distinct playstyles. Creatures are borrowed from the Riftling game's compendium with established lore and visual designs.

| # | Name | Type | Role | Range | Concept |
|---|---|---|---|---|---|
| 1 | **Emberhound** | Fire | Chaser | Melee | Aggressive ash-wolf. Fast, loyal. |
| 2 | **Pyreshell** | Fire | Anchor | Melee | Heavy tortoise with volcano shell. Slow, erupts AoE. |
| 3 | **Tidecrawler** | Water | Anchor | Melee | Armored coral crab. Tanky, draws aggro. |
| 4 | **Riptide** | Water | — | — | Serpentine water creature. *(no sprite yet)* |
| 5 | **Barkbiter** | Nature | Chaser | Melee | Stout badger in bark armor. Healer with teeth. |
| 6 | **Briarwood** | Nature | — | — | Bipedal root creature. *(no sprite yet)* |
| 7 | **Lumoth** | Light | Skirmisher | Ranged | Oversized glowing moth. Blinds and slows. |
| 8 | **Solarglare** | Light | Skirmisher | Ranged | Spectral stag radiating light. Multi-target burst. |
| 9 | **Gloomfang** | Dark | Chaser | Melee | Obsidian panther. Glass cannon with lifesteal. |
| 10 | **Voidweaver** | Dark | — | — | Floating cloak of darkness. *(no sprite yet)* |
| 11 | **Tremorhorn** | Earth | Anchor | Melee | Massive rhino. Tankiest riftling, AoE + taunt. |
| 12 | **Pebblet** | Earth | — | — | Floating rock cluster. *(no sprite yet)* |

### 6a. Move Assignments (Implemented Roster)

8 riftlings with sprites and full move sets:

| Species | Role | Move 1 | Move 2 (Signature) | Move 3 |
|---------|------|--------|---------------------|--------|
| **Emberhound** | Chaser | Ember Strike `strike` | Fire Dash `pierce` | Flame Charge `drain` |
| **Pyreshell** | Anchor | Magma Slam `strike` | Eruption `blast` | Lava Shield `shield` |
| **Solarglare** | Skirmisher | Light Lance `pierce` | Solar Flare `blast` | Prism Shot `barrage` |
| **Lumoth** | Skirmisher | Dust Blast `slow` | Luminova `blast` | Moth Dive `strike` |
| **Tidecrawler** | Anchor | Claw Crush `strike` | Tidal Slam `blast` | Shell Guard `taunt` |
| **Gloomfang** | Chaser | Shadow Bite `drain` | Void Rend `pierce` | Dusk Dash `slow` |
| **Barkbiter** | Chaser | Sap Leech `heal` | Thornburst `barrage` | Root Snap `slow` |
| **Tremorhorn** | Anchor | Horn Charge `strike` | Earthquake `blast` | Stone Bash `taunt` |

**Role-move patterns:**
- **Anchors** all have `taunt` or `shield` — they hold the line and protect squishier allies
- **Chasers** get `drain`, `pierce`, `slow` — aggressive moves with sustain or utility
- **Skirmishers** get `barrage`, `blast`, `pierce` — ranged AoE and multi-hit from safety
- **Barkbiter** is the only healer in the roster — a nature chaser with a support angle

**Starter:** The player begins each run with Emberhound. [TODO: starter selection]

**Recruitment:** Riftlings appear as recruitable encounters during the run. Each level draws from the roster, so the player won't see all 12 every run — different runs surface different team-building options.
