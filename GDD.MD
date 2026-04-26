# Into the Rift — GDD (Draft)

*Work-in-progress*

## High-Concept Pitch

A roguelite creature-collector where you build auto-battler teams on the fly while racing a clock through monster-filled dungeons. Configure your squad, prepare them for battle, and help command them in real-time all while you race a timer to reach the boss to descend to the next level.

The game blends three genres:
- **Pokémon** provides the creature collection, team-building, and typing fantasy
- **Megabonk** provides the real-time swarm combat and pacing.
- **Auto Chess / TFT** provides the pre-battle configuration with composition, synergy, and positioning

The player is a 'trainer' commanding a team of creatures called *ritflings*. The player does not fight directly instead they move around the battlefield, issue high-level commands, and configure their team between rooms — while their ritflings auto-battle the enemies swarming them.

## Core Loop

1. Start a run with one starter ritfling
2. Enter a time-limited level — a branching web of rooms a hidden boss
3. Clear rooms to earn XP, recruits, upgrades, and intel on the boss location
4. Manage team composition, synergies, and the bench between rooms
5. Find and defeat the boss before the timer runs out
6. Progress to the next decensions\level
7. Complete the run or die trying — either way, meta-progression advances

## Game Pillars

- **Commanding, not controlling.** The player directs a team, they don't pilot individuals. Decision load stays constant from 1-4 ritflings.
- **Fast hands, thoughtful head.** Combat is urgent and real-time. Decisions between combat are paused and deliberate.
- **Your collection is your progression.** The primary meta-progression is ritflings themselves — discovering and mastering them.
- **Every run tells a different story.** Synergies, recruits, upgrades, and room layouts combine so no two runs feel alike.
- **The clock is the villain.** Time pressure is the core tension that makes every other system matter, player must balance pushing for more upgrades vs looking for the boss. 

## Art & Presentation

- **Style:** 2D pixel art
- **Camera:** 3/4 top-down perspective (moderate angle — faces visible, ground reads as ground)
- **Sprite sizes (working targets):**
  - Trainer: ~32px
  - Ritflings: ~24–28px
  - Basic enemies: ~16–20px
  - Elite / boss ritflings: ~32–48px
- **Style notes:** Restricted palette for cohesion, outlined sprites for readability in crowded scenes, selective dynamic lighting reserved for boss rooms and special effects
- **Silhouette priority:** Ritflings should be distinguishable by silhouette alone, since role-reading at a glance is critical in horde combat
- **Shadows:** Every unit has a shadow circle to communicate vertical position clearly

## Combat System

Combat blends real-time and automatic. Ritflings fight on their own based on role(tank vs support ev etc) AI and equipped moves. The player influences combat through positioning, team-wide commands, pre-battle configuration, and limited control over the riftlings during combat.

### Control Model

The player controls the trainer character directly (movement) and issues team-wide commands:

- **Attack** — the team engages the target under the cursor or nearest enemy, each according to role
- **Rally** — the team pulls back tight around the player (defensive reposition)
- **Unleash** (longer cooldown) — every ritfling fires its equipped signature move at once; the team-wide ultimate moment

Plus a **stance toggle** (set and forget, changed occasionally):
- **Aggressive** — ritflings range farther to chase enemies
- **Balanced** — default
- **Defensive** — ritflings stay tight and prioritize survival

This gives the player ~4 inputs total during combat, keeping cognitive load constant whether the team is 1 ritfling or 4.

### Role AI Archetypes

Each ritfling has a role that determines its auto-behavior:

- **Chaser** — sprints at nearest enemy, high damage, fragile
- **Skirmisher** — keeps distance, fires ranged attacks, repositions when threatened
- **Anchor** — slow, tanky, taunts enemies toward itself
- **Support** — stays near the player, heals or buffs teammates
- **Bomber** — charges up, unleashes AoE on cooldown

Roles are the primary mechanism for making ritflings feel distinct on the field. Two fire ritflings with different roles should play very differently.

### Move System (Loadout, not Live Command)

Each ritfling has a pool of moves learned through level-ups and mastery. Before a run (and adjustable between rooms), the player chooses which moves the ritfling *brings* — typically 2-4 equipped out of a larger known pool. The ritfling uses these moves automatically during combat.

The Unleash command specifically triggers each ritfling's equipped signature move, so pre-battle loadout decisions have visible, specific consequences in combat.

**No** condition-based move programming (e.g., "use Ember when HP < 50%"). That path leads to spreadsheet gameplay and scales poorly with team size.

### Positioning / Formation

Rather than grid-based placement, the player sets a **role-based formation** that ritflings maintain relative to the trainer:
- Front-liners lead
- Skirmishers hang back
- Supports flank the player

Small tweaks are possible (e.g., place this chaser on left flank instead of point). This gives positioning control without requiring hex-grid placement in a real-time game.

**TODO:** Decide whether to also support a lightweight 3x3 "combat stance grid" (front/mid/back × left/center/right) for stricter formation control if playtesting shows the soft approach feels vague.

### Synergies (Auto-Battler Composition Layer)

Ritflings contribute to composition bonuses along two axes:

1. **Type** (Fire, Water, Grass, Electric, Rock, Shadow, etc.)
2. **Role** (Chaser, Skirmisher, Anchor, Support, Bomber, Swarmer)

Every ritfling has one type and one role. Synergies activate at thresholds:
- 2 of a kind: small bonus
- 3 of a kind: bigger bonus
- 4+ of a kind: strong bonus, hard to reach

Team size is small (4–6 active slots), so thresholds are tuned lower than TFT and the number of synergy categories is kept intentionally limited. A balanced team activates multiple small synergies; a committed team goes deep on one for a big payoff.

The UI surfaces active synergies clearly at all times, and hints when the player is one ritfling away from activating a new synergy. Players should never need a wiki to understand what's active.

### The Bench

A capped-size holding area (target: 4–6 slots) for ritflings and items not currently on the active team. Functions:

- **Holding space** for recruited ritflings the player isn't actively using
- **Swap station** between rooms — the player can freely swap active and benched ritflings/items when the timer is paused
- **Item stash** — trinkets and equipment that can be assigned to ritflings or the player for bonuses, also swappable between rooms
- **Recruitment buffer** — grab an interesting ritfling now, decide later if they fit the build

Swapping is free between rooms (timer paused), not allowed during active combat. This creates auto-battler pacing: commit to a composition for each fight, but adapt between fights.

### Typing (Soft, Not Hard)

Types use soft multipliers. Effective attacks do moderately more damage; resisted attacks do moderately less. A bad matchup is a disadvantage, not a wall.

- Fewer types than Pokémon (target: ~6–7 total)
- No dual types
- No immunities or 4× weaknesses
- Single-type ritflings only
- Minimum damage floor (~70%) so worst-case matchups still feel playable

Typing lives primarily as a *team composition and target prioritization* system, not as a mid-fight switching system. The player makes type decisions when building a team and when choosing which enemies to engage — rarely by swapping ritflings under pressure.

## World & Level Structure

### Levels as Branching Dungeons

Each level is a branching web of interconnected rooms — not a linear path, not an open procgen map. The structure is closer to an old-school Zelda dungeon with multiple paths and dead ends.

- Target: ~15–20 rooms per level (**TODO: tune**)
- Rooms come from a **pool** per level. A run samples ~10 from the pool, shuffled into a branching layout. More room templates = more variety for free, without procgen cost.
- The boss is hidden somewhere in the web. Its location is not marked at the start.
- Rooms fog-of-war on entry; the *shape* of the dungeon is visible, the *contents* are not.

### Rooms

Each room has:

- A **dominant type** with enemies mostly from that type
- A **secondary sprinkle** of off-type enemies (20–30%) to prevent hard-countering
- A **theme/gimmick** — shrine, hazard, elite, recruit opportunity, shop, healing spring, etc.

Room variety sources:
- Type variety (grass room, fire room, rock room, etc.)
- Theme variety (combat, shrine, shop, recruit, elite, event)
- Biome / structural variety (forest, cave, ruins, volcano)

### Finding the Boss

The boss location is discovered through exploration and intel:
- Defeating elites or minibosses can reveal clues ("the boss is to the north")
- Some rooms contain lore or scouting rewards that narrow down boss location
- Approaching the boss area eventually makes it obvious (density cues, environmental tells)

Smart players balance upgrade-hunting vs. intel-gathering vs. direct exploration.

### The Timer

Every level has a visible countdown timer. If the timer runs out before the player defeats the boss, the level (and likely the run) is failed.

**Timer design rules:**
- Always visible
- Generous early in a level, tight late — natural intensity curve
- Combat does **not** stop the clock
- The starting timer is consistent per level so players learn what's achievable

### Paused Time During Decisions

When the player opens a menu or is prompted for a decision, the timer fully pauses:

**Timer runs during:** walking, exploration, combat, using abilities, browsing the map, environment interaction
**Timer pauses during:** upgrade selection, recruit prompts, team management / bench swaps, shop menus, pause menu, modal dialogues

Rule of thumb: if the player can be hit while the screen is up, the timer runs. If the world is frozen to ask them something, the timer freezes too.

**Edge case:** opening certain decisions (shrines, shops) takes a brief vulnerable "open" animation before the menu appears, to prevent reflex-pause exploits. UI always clearly shows when the timer is paused (grayed text, "paused" indicator) and gives a brief warning when it resumes.

## Enemies

Riftlings themselves will be the enemy. 

**Wild** The player can battle wild riflting which will be rooms full of a bunch of riftlings that will attempt to swarm the player and their riltligs 
**Control** The player battles a riftlings lord that controls other riftlings. The lord will have team comps and have basic AI control over their riftlings
**Elite** The player battles one elite riftling. The elite will have more healthy, stronger moves, and basic AI.

## Progression

### Ritfling Leveling (Run-Scoped)

Ritflings level up during a run and reset between runs. Kills award XP to all ritflings with less for benched riftlings. On level-up, the riftling will gain some basic stats that are randomized. On some levels the riftlings can learn new moves which the player can choose to swap in for their active moves.

Upgrade density should be **high** — players feel constant forward momentum, never grinding.

### Recruiting Mid-Run

New ritflings can be acquired through:
- Post-battle recruit prompts from defeated wild ritflings
- From shops/chests
- Rescue encounters (rare rooms)
- Boss rewards (guaranteed high-tier recruit per boss)

Recruit decisions are quick (yes/no with full info), and if the team is full, the player picks a swap or sends the new recruit to the bench.

### Team Slots

Teams consist of 4 active riftligns and a number of bench slots (Which can be expanded in meta progression). 

## Meta-Progression

The goal: **expand the game, don't just power up the player.** Most meta-progression will give variety and content; a small amount of stat progression exists to help stuck players make gradual progress through the base game.

### Layer 1: Ritfling Collection (Primary)

Every ritfling encountered is permanently added to the player's roster. Unlocked ritflings can appear in future runs as starters, recruit offers, or shop stock.

- Collection is the main long-term goal
- Every run, including losing runs, makes collection progress
- Matches the Pokédex fantasy

### Layer 2: Ritfling Mastery (Lateral)

Each ritfling masters through repeated use. Mastery unlocks:

- **More upgrade options** in that ritfling's level-up pool (wider pool = more build variety, not more power)
- **Alternate behavior stances** (e.g., a mastered Emberpup can run as a Chaser or an Anchor) (TBD)
- **Greater Visibility into Stats** Outside of game the player can see stat ranges, trait options, move pools, and lore. In game the player can start to see how the riftlings stats will grow across levels (ie. More towards damange vs defence) and provide move bench slots for the riftlings.
- **More real-time control** Player gains more real-time control, riftlings become more responsible in combat to commands and open of more variety of commands (TBD). 
- **Evolutions / alternate forms** — thematic creature-collector payoff, tuned to be lateral power not vertical (TBD)

**Core rule:** mastery gives a ritfling more ways to play with small amount of benefits

### Layer 3: Trainer Progression (Mixed — Lateral + Small Stat Layer)

**Trinket loadout.** The player unlocks trinkets over time, but can only equip 1 (or a small fixed number) per run. More unlocks = more variety, but per-run power stays constant. Examples:
- Trainer's Whistle — Rally cooldown shorter
- Type-Compass — reveals dominant type of upcoming rooms
- Scholar's Lens — recruit encounters show full ritfling stats before accepting
- Scout's Map — start each level with 2–3 rooms revealed

**Knowledge unlocks.** Bestiary entries, enemy HP precision, boss warning shrines, expanded map UI — info-based rewards that feel meaningful without touching balance.

**Encounter unlocks.** New encounter types become possible in future runs (New room types). Expands content pool rather than buffing the player.

### Layer 4: The Bond Tree (Small Stat Progression Layer)

A modest, capped stat-progression tree that helps struggling players make gradual progress through the base game. Design rules:

- Total power gain from maxing the tree is approximately equivalent to **one ascension level of difficulty** — enough to help the stuck, not enough to trivialize the game
- Max in ~10–20 hours of play
- Upgrades are opt-in choices, not automatic
- Favor quality-of-life and resource upgrades over raw damage multipliers
- Player unlocks upgrades after a certain amount of runs or progress in a run.

Example nodes:
- Quick Whistle — Rally cooldown reduced
- Longer Hunt — start each level with +15 seconds
- Seasoned Eye — upgrade offers show 4 options instead of 3
- Boss Tracker — first boss hint of each level revealed automatically
- Deeper Pockets — bonus trinket slot
- Lucky Encounter — slightly higher recruit room frequency
- Trainer's Resolve — ritflings gain +5% HP per rank, max ~3 ranks
- Sharp Instincts — ritflings gain +5% damage per rank, max ~2 ranks

**Rule held firm:** the stat-progression tree should max out for *every* player, including struggling ones. Currency flow is tuned so losing runs still progress toward the tree.

### Layer 5: Descension (Post-Base-Game Difficulty)

Once the base game is beaten, descension ratchet difficulty upward. Each decension level adds more difficulty to the game. Example ways to scale difficulty. 

- Stronger enemies
- Less bench space
- Smarter AI
- Less time
- Fewer items


### Layer 6: Cosmetics & Flavor

Titles, trainer outfits, hub decorations, ritfling skins, music — no balance impact, but satisfying collectibles for completionists.

### Target Player Arc

- **Hours 1–2:** Learning the game. Die in level 1 a few times. Meet new ritflings each run.
- **Hours 3–5:** Beat level 1. ~8 ritflings collected.
- **Hours 6–15:** Expansion phase. Try many team comps. Beat level 2–3.
- **Hours 15–30:** Mastery phase. Chase remaining ritflings, master favorites, climb decsend earlier descension.
- **Hours 30+:** Endgame. Daily challenges, high ascensions, cosmetic goals, community content.

## Open Questions & TODOs

### Must decide before building

- **Run length & level count.** How many levels per run? How long does a single level's timer run for? What's the target length of a full run (Hades-ish ~30 min? FTL ~90 min?) — affects every other number in the game.
- **Starting ritflings.** How many starters to choose from at the start of the game? How are new starters unlocked?
- **Final synergy list.** Which types exist (target ~6–7) and which roles exist (~5–6)? What do the bonuses actually do at each threshold?
- **Enemy roster beyond ritflings.** What second category of enemy fits the game? Per-biome specifics.
- **Timer tuning.** Starting time per level, how much time actions refund, death penalty time.
- **Formation control depth.** Soft role-based formation only, or add a 3x3 stance grid?

### Likely iterate in demo / playtest phase

- Balance between complexity and depth — is the combined system (types + roles + moves + synergies + commands + timer) too much for new players?
- Tutorial and onboarding flow
- Exact stat-progression ceiling tuning
- Death penalty vs. run failure thresholds
- Room pool sizes and variety targets
- Whether to introduce live-active ritfling control (one-at-a-time piloting) as an escape hatch for players who want more agency

### Design rules to protect

- Mastery stays lateral, never vertical
- Every upgrade is a new option first, a bigger number second
- Stat progression has a reachable ceiling accessible to struggling players
- Typing is soft, not hard
- The timer is visible, predictable, and fair
- Decision menus always fully pause the clock
- Ritflings fight automatically; players command teams, not individuals
- Synergies surface in UI; players should never need a wiki

TODO: