# World & Level Structure

## 1. Setting

The player is a trainer who descends into a massive rift that has torn open in the world. Each level is a deeper layer of the rift — stranger, more dangerous, more unstable. The dungeon *is* the rift.

## 2. Levels as Hub-and-Spoke

Each level is a central **hub room** with branches radiating from its side walls. The hub is the choice engine: the player sees every branch door in one place, picks one, commits to it, and returns when it's cleared. Branches are short forward-only gauntlets, each with its own biome theme and a terminal reward room. No backtracking inside a branch — once you're in, you push through to the terminal and teleport home.

This replaces an earlier "branching graph of rooms" idea. Hub-and-spoke does the same "meaningful choice between paths" job with far less spatial confusion — every decision happens in one readable room instead of across a sprawling map.

### Tier 1 (Jam Build)
- **3 levels**, each a separate hub with its own branch set.
- **Level 1** begins with a short intro zone (safe start → 2 easy combat rooms with recruits allowed) that feeds the player into the hub with a real team before any real decisions are required. Levels 2-3 drop the intro — the player is expected to have a team by then.
- **5-6 regular branches** per hub, each 3-5 rooms long (scales mildly with level depth).
- Each branch has a distinct **biome theme** (grass cliff, water grass, dark forest, plains, lava, etc.) and a **terminal reward type** (elite fight, recruit, rift shard).
- **Key path branch** — a longer combat-only gauntlet on the hub's north wall. Locked until `level` regular branches are cleared (L1 = 1, L2 = 2, L3 = 3). Its terminal grants the orb that unlocks the boss door.
- **Boss branch** — a single room on the hub's north wall. Locked until the orb is claimed.
- **Victory condition:** clear all 3 levels' bosses. Run wipes mid-branch = run over.

### Tier 2 (Expanded)
- More branches per hub (widen past 6), deeper branch chains, and procedural archetype pools so no two runs use the same 6 combinations.
- Add Shrine / Shop / Event branch archetypes in addition to Combat / Recruit / Rift-Shard / Elite.
- Each level's branch pool is theme-skewed (forest level favors forest biomes, volcanic favors lava, etc.).

## 3. Room Types

| Room Type | Contents | Tier |
|---|---|---|
| **Hub** | Central nexus with branch doors on the side walls, key path + boss doors on the north wall, a healing fountain in the middle, and a one-way intro return door on the south wall. Safe — no enemies, no combat. | 1 |
| **Combat (Wild)** | Swarm of wild riftlings. Clear them all to complete the room. Branch combat rooms have recruiting disabled (reward is the terminal). | 1 |
| **Combat (Elite)** | One powerful riftling with more HP, stronger moves, basic AI. Used as a regular-branch terminal reward. | 1 |
| **Boss** | Level boss encounter — see Section 5 | 1 |
| **Recruit** | Terminal room with a guaranteed recruit. Only branch type where post-combat recruiting runs. | 1 |
| **Rift Shard** | Terminal room that grants a trinket; also used as the key-path "orb shrine." | 1 |
| **Healing Spring** | Restores party HP. Safe room, no enemies. (The hub also hosts one of these at its center.) | 1 |
| **Shrine** | Choose one of 2-3 upgrades (stat boost, new move, item) | 2 |
| **Shop** | Spend collected resources on items/upgrades | 2 |
| **Event** | Narrative encounter with a choice (risk/reward) | 2 |
| **Combat (Control)** | Riftling lord with a team and basic tactical AI | 2 |

Each combat room has:
- A **dominant type** — enemies are mostly one element
- A **secondary sprinkle** (~20-30% off-type enemies) to prevent hard-countering a room with a single type

**Recruiting rules:** wild-encounter recruits are only offered in the intro zone combats and in `recruit`-type branch terminals. Regular branch combats do **not** offer recruits — the branch's terminal room is the recruit payoff, if that's its archetype. This keeps branch choice meaningful: you pick a branch to get a specific reward, not to farm recruits along the way.

## 4. Enemies

Riftlings themselves are the enemies. Three encounter categories:

### Wild (Tier 1)
Rooms full of riftlings that swarm the player and their team. Strength in numbers. The bread-and-butter encounter. Wild riftlings have simple AI: move toward the nearest target and attack.

### Elite (Tier 1)
A single powerful riftling. More HP, stronger moves, and smarter AI (targets weakest party member, retreats when low HP). Defeating an elite may reveal the boss location. Higher recruit chance.

### Control (Tier 2)
A riftling lord that commands a small team. The lord has its own composition and issues basic tactical commands (attack focus, rally, unleash). Functions as a mini-boss that mirrors the player's own command system.

## 5. Boss Encounters

Each level ends with a boss fight. The boss is a significantly larger, more dangerous riftling.

**Boss design principles:**
- Multiple attack phases with escalating difficulty
- Unique mechanics per boss (AoE patterns, summons, terrain hazards)
- Tests whether the player built a coherent team — a disjointed composition struggles
- Defeating the boss is guaranteed to offer a high-tier recruit

### Tier 1 Boss
A single boss at the end of Level 1. Clear, learnable attack patterns. Two phases: normal attacks, then an enraged phase at low HP with faster/stronger attacks and periodic summons.

[TODO: Design specific Tier 1 boss — element, mechanics, phases]

### Tier 2 Bosses
Each level has a thematically distinct boss matching the level's biome. Bosses introduce new mechanics the player hasn't seen in regular rooms.

## 6. Unlocking the Boss

The boss is always visible — a door on the hub's north wall with a locked indicator. The player sees the goal from the moment they enter the hub, which teaches the full loop at a glance.

### Unlock chain (Tier 1)
1. **Clear `level` regular branches.** Each cleared branch seals its hub door (grey-out) and counts toward the key path unlock. At L1 that threshold is 1, at L2 it's 2, at L3 it's 3 — the level asks for more commitment before handing you the key.
2. **Clear the key path.** Once unlocked, the key-path door turns interactable (visual cue TBD). The key path is a longer combat gauntlet with no recruits, no healing, and enemies pulled from a harder pool. Its terminal grants the **orb**.
3. **Clear the boss.** With the orb claimed, the boss door unlocks. Enter, fight, win → advance to the next level (or victory on L3).

This is the meta decision of a run: do you push through the minimum 2-3 branches needed to unlock the key path, or do you clear extra branches first to stack rewards before committing to the hard gauntlet? Extra branches mean more risk (attrition is irreversible with no backtracking) but a stronger team entering the key path.

### Tier 2
The unlock chain stays intact, but more branches, more biomes, and more terminal archetypes mean richer composition decisions. Directional intel from elites and scouting rewards bias the player toward specific branches without removing the choice.

## 7. Traversal Rules

**No backtracking.** Once the player commits to a branch, they can't return to the hub until they reach the terminal. Combat rooms mask the "way we came" door on entry; the player has to push forward. Getting wiped mid-branch is a **run over** — this is deliberate, so branch choice carries weight.

**Terminal rooms teleport home.** Every branch terminal (elite, recruit, rift-shard, key-path shrine, boss) redirects all its doors to the hub, so the player walks into any exit and lands straight in the hall without walking back through combat corridors.

**The hub is the safe room.** Returning heals the party (fountain at the center), resets the heal on every visit, and is the only place the player can decide what to do next. Combat pacing inside a branch is relentless; the hub is the breath between commitments.

**Room flow inside a branch:**
1. Player enters from the hub (or from the previous branch room).
2. Combat starts, enemies spawn.
3. Combat resolves; XP + level-ups distribute.
4. Recruit prompt only appears in intro combats or recruit-type terminals.
5. Doors unlock; player walks forward to the next room (or the terminal teleports them home).
