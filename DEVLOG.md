# Into the Rift — Dev Log

## Session 1 — April 11, 2026

### What was built

**Game Design Document (modular)**
- Created `GDD/` with 7 docs: Master Index, Core Mechanics, Art & Audio, World & Levels, Progression & Economy, Tech Stack, Decisions
- 12 riftling roster defined (borrowed from Riftling game): Emberhound, Pyreshell, Tidecrawler, Riptide, Barkbiter, Briarwood, Lumoth, Solarglare, Gloomfang, Voidweaver, Tremorhorn, Pebblet
- 6 types with effectiveness chart: Fire/Water/Earth/Nature loop + Light/Dark mirror
- Scoped into 3 tiers: Tier 1 (jam build), Tier 2 (expanded), Tier 3 (post-jam)
- Targeting Vibe Jam 2026 (deadline May 1)

**Project scaffold**
- Phaser 3 + TypeScript + Vite
- 480x320 pixel-perfect resolution, 16px tiles, arcade physics
- Vibe Jam widget embedded in index.html

**Room & dungeon system**
- Room templates: Start, 2x Combat, Elite, Boss, Healing, Recruit (30x20 tiles each)
- Dungeon generator: branching layout with 7 rooms connected as a graph
- Door transitions between rooms with camera flash
- Minimap in top-right (color-coded room types, fog of war, current room indicator)
- Room label HUD showing current room name and type

**Art assets**
- PixelLab-generated dungeon tileset (void/floor/wall Wang tiles) imported
- Player character (hooded adventurer, 56px, 8 directions)
- Emberhound (fire wolf, 56px, 8 directions) — starter companion
- Solarglare (light stag, 32px, 8 directions)
- Pyreshell (fire tortoise, 32px, 8 directions)
- Lumoth (light moth, 32px, 8 directions + 10 animations)
- All sprites support 8-directional facing based on movement

**Combat system**
- Auto-battle: companion chases nearest enemy and attacks on cooldown
- Wild riftlings spawn in combat rooms, chase the companion, attack on cooldown
- HP bars above all units
- Damage numbers (floating, fade out)
- Hit flash (red tint) and knockback on damage
- Death animation (fade + shrink)
- Room cleared when all enemies defeated
- Doors locked during active combat
- Difficulty tunable via multipliers in CombatManager (WILD_HP_MULT, WILD_ATK_MULT, etc.)

**Party & recruit system**
- Party data structure: active team (max 4) + bench (max 4)
- Riftling species templates with base stats (HP, attack, speed, cooldown) in `party.ts`
- After clearing a combat room, recruit prompt shows defeated riftling species
- Press 1-N to recruit, ESC to skip
- Recruited riftlings added to active team or bench
- Party HUD at bottom-left shows team slots with HP bars
- Timer pauses during recruit prompt

**Countdown timer**
- 6-minute countdown, always visible
- Color shifts: white → yellow at 2:00 → red at 1:00

### Current state of the game

The player spawns in a start room, walks through doors into combat rooms where their Emberhound auto-battles wild riftlings. After winning, they pick a riftling to recruit. The dungeon has 7 rooms total with a branching layout. Placeholder sprites exist for the trainer and some riftlings; real PixelLab art is in for tiles, the player character, and 4 riftlings.

### Known issues / gaps

- Recruited riftlings don't appear as companions yet (no companion swapping with Q)
- Only 1 companion fights at a time (no multi-riftling team combat)
- No boss encounter mechanics
- No healing room functionality
- Timer runs out with no consequence yet
- No game over / run end screen
- No move system (loadout, signature moves, Unleash command)
- Player commands (Attack/Rally/Unleash/Stance) not implemented
- Synergy bonuses not implemented
- Missing sprites for 7 riftlings (Tidecrawler, Riptide, Barkbiter, Briarwood, Gloomfang, Voidweaver, Tremorhorn, Pebblet)

## Session 2 — April 11, 2026

### What was built

**Recruit system fixes**
- Fixed `loadRoom` destroying the recruit prompt container and party HUD after room transitions — both are now preserved in a Set-based whitelist
- Added `pendingRecruit` flag to block door transitions during the post-combat "Room Cleared!" delay and recruit prompt
- Timer now pauses during recruit prompt and pending recruit (per GDD spec)
- Removed duplicate companion-wall collider in room transitions

**Multi-companion overworld system**
- Replaced the single companion sprite with a `companions` array — all active party riftlings now appear in the overworld
- Companions follow the trainer in a staggered formation (left-back, right-back, far-left, far-right offsets)
- `syncCompanions()` creates/updates sprites to match the party, called after recruitment and room transitions
- Companion textures are dynamic (use active riftling's texturePrefix, not hardcoded emberhound)

**Multi-companion combat**
- CombatManager upgraded to accept all active party members as `CompanionEntry[]`
- All companions fight simultaneously — enemies target the nearest ally
- HP synced back to party data for all allies after combat

**Room & door system overhaul**
- Room templates now have potential doors on all 4 edges
- `loadRoom` computes active edges from grid positions of connected rooms and masks inactive doors as walls
- `createDoorZones` maps connections to correct edges using spatial grid positions (no more order-dependent mapping)
- Player spawns near the entry door when transitioning (not always bottom center)
- Boss room now triggers combat (added `'boss'` to the combat room type check)

**Data model: roles & moves**
- Added `Role` type (chaser, anchor, skirmisher) and `Move` interface (name, power, cooldown, description, isSignature)
- All 4 riftling templates now have assigned roles and 3 moves each (1 signature + 2 regular)
- `PartyRiftling` extended with `role`, `moves`, and `equipped: [number, number]`

**Party management screen**
- Full-screen overlay opened with Tab, closed with Tab/Escape
- Left panel: clickable slots for active team (4) and bench (4) showing sprite icon, name, type badge, HP bar
- Right panel: selected riftling detail — large sprite, name, type + role, HP/ATK/SPD stats, move list with equipped/signature markers
- Click moves to swap equip slots; action buttons to move riftlings between active and bench
- Gameplay and timer freeze while party screen is open

**Playwright test suite**
- 19 automated tests across 4 spec files (smoke, recruit, companions, party-screen)
- Tests cover: game boot, party state, combat triggers, full recruit flow, multi-room recruit survival, door blocking during recruit, companion persistence, boss room combat, party screen open/close/pause, data model integrity

### Current state of the game

The player spawns in a start room with Emberhound. Walking through doors transitions between 7 rooms (start, combat x2, healing, recruit, elite, boss) with correct spatial door mapping. All combat rooms spawn wild riftlings that the full party auto-battles. After combat, a recruit prompt lets the player add defeated riftlings to their team — recruited riftlings immediately appear as overworld companions following in formation. Tab opens a party management screen showing full stats, roles, moves, and allows bench/active swapping.

### Known issues / gaps

- Healing room has no functionality yet (should restore HP)
- No boss encounter mechanics (boss room has a single enemy, no phases)
- Timer runs out with no consequence (no game over screen)
- No victory screen when boss is defeated
- No player commands (Attack/Rally/Unleash/Stance)
- Synergy bonuses not implemented
- Move system is data-only — equipped moves don't affect combat yet (combat still uses base stats)
- No title screen / main menu
- Missing sprites for 8 riftlings (Tidecrawler, Riptide, Barkbiter, Briarwood, Gloomfang, Voidweaver, Tremorhorn, Pebblet)
- Recruit "skip with Escape" test is occasionally flaky due to random combat timing

### Recommended next steps (priority order)

1. **Player commands** — Attack (Space), Rally (R), Unleash (Q). The ~4 inputs that define the control model.
2. **Boss encounter** — Level 1 boss with phases. Beating the boss = run complete.
3. **Game over / victory screens** — Timer expiry = run failed. Boss defeated = run won. Both return to title/restart.
4. **Title screen / main menu** — Start Run button, starter selection.
5. **More riftling sprites** — Generate remaining roster via PixelLab.
6. **Synergy system** — 2-of-a-kind type bonuses displayed in UI.
7. **Audio** — Background music and SFX.

## Session 3 — April 11, 2026

### What was built

**Multi-companion combat (full squad fights)**
- CombatManager now accepts all active party members as allies, not just one
- Enemies target the nearest alive ally instead of a single hardcoded companion
- HP synced back for all party members after combat ends
- Combat end checks all allies down (was single companion check)

**Shadow removal**
- Removed shadow circles from trainer, companions, and enemies across DungeonScene and CombatManager
- Shadows underneath sprites made characters look like they were floating in the 3/4 top-down perspective

**Sprite scaling**
- Trainer scaled up from 0.5 to 0.85 (~48px), companions from 0.45 to 0.7 (~39px)
- Characters are more readable on the 16px tile grid

**Post-combat movement freeze**
- Trainer and all companions now have velocity zeroed when combat ends
- Update loop freezes movement during `pendingRecruit` phase (the 1s "Room Cleared!" delay), not just when the recruit prompt is visible
- Fixes issue where player/riftlings would drift off-screen during recruit selection

**Healing room — Rift Spring**
- Glowing green pool with pulsing animation spawns in center of healing rooms
- "Walk here to heal" label guides the player
- On overlap: all active party riftlings heal to full HP, green camera flash, party HUD updates
- Spring fades out after use (one-use per visit)
- Cleaned up on room transition

**Difficulty scaling system**
- `startEncounter` accepts a `difficulty` multiplier that scales enemy HP, attack, speed, and cooldown
- Difficulty computed from rooms cleared (not room ID) × room type bonus
- Per-room scaling: +0.6 per room cleared
- Type multipliers: combat 1x, recruit 1.2x, elite 2.0x, boss 3.0x
- First combat room is always 1x difficulty; ramp kicks in after that

**Combat balance pass**
- All riftling attack stats halved (Emberhound 12→6, Lumoth 14→7, etc.)
- All move power values halved
- Wild enemy HP mult increased from 0.5 to 1.2 (enemies are tankier)
- Wild enemy attack mult lowered from 0.4 to 0.3
- Target fight duration: 10-20 seconds per room
- First combat room reduced from 3 to 2 enemy spawns

**Per-riftling attack range**
- Added `attackRange` field to riftling templates and CombatUnit
- Melee riftlings (Emberhound, Pyreshell): 28px range — charge in and fight up close
- Ranged riftlings (Solarglare, Lumoth): 80px range — engage from distance
- Ranged companions kite backwards at 60% speed when enemies close within 40% of their range
- Both ally and enemy AI use per-unit range instead of the old flat constant

**Expanded dungeon layout (9 rooms)**
- Added 2 more combat rooms for a total of 4 combat + 1 recruit before elite/boss
- New layout with two branch paths off combat1 and healing
- More fights = more recruit opportunities to build squad before the elite gatekeeper

### Current state of the game

The player spawns with Emberhound and explores a 9-room dungeon. All active party riftlings fight together in combat, with melee riftlings charging in and ranged riftlings hanging back and kiting. Difficulty ramps through the dungeon — early fights are manageable solo, later fights require a built-up squad. Healing rooms restore the full party. Recruit prompts let the player grow their team after each combat. The party screen (Tab) allows bench/active management and move equipping.

### Known issues / gaps

- No boss encounter mechanics (boss room has a single enemy, no phases)
- Timer runs out with no consequence (no game over screen)
- No victory screen when boss is defeated
- No player commands (Attack/Rally/Unleash/Stance)
- Synergy bonuses not implemented
- No title screen / main menu
- Missing sprites for 8 riftlings (Tidecrawler, Riptide, Barkbiter, Briarwood, Gloomfang, Voidweaver, Tremorhorn, Pebblet)

### Recommended next steps (priority order)

1. **Player commands** — Attack (Space), Rally (R), Unleash (Q). The ~4 inputs that define the control model.
2. **Boss encounter** — Level 1 boss with distinct behavior. Beating the boss = run complete.
3. **Game over / victory screens** — Timer expiry = run failed. Boss defeated = run won.
4. **Title screen / main menu** — Start Run button, starter selection.
5. **More riftling sprites** — Generate remaining roster via PixelLab.
6. **Synergy system** — 2-of-a-kind type bonuses displayed in UI.
7. **Audio** — Background music and SFX.

## Session 4 — April 11, 2026

### What was built

**Move system wired into combat**
- Allies now use their equipped moves in combat instead of flat base attack stats
- Each move has its own independent cooldown timer (`move.cooldown * MOVE_CD_SCALE` ms, currently `MOVE_CD_SCALE = 200`)
- When in attack range, the ally picks the first equipped move off cooldown and uses its power for damage
- Damage numbers for ally attacks now show the move name in gold (e.g. "Ember Strike -12")
- Enemies still use the old base-attack system (no moves)

**Combat inspection HUD** (`src/ui/CombatHUD.ts`)
- Compact bottom-center panel (140x20px) appears during combat, hides when room is cleared
- Shows selected riftling's name, HP bar, and 2 equipped move slots
- Each move slot shows: name (star prefix for signature moves), cooldown bar that fills as the move recharges
- Move slot highlights gold when the move fires, dims when on cooldown, bright when ready

**Riftling selection during combat**
- Q/E keys cycle through alive party members
- Click on any companion sprite to select it (24px click radius, world coords)
- Selected riftling highlighted in the party HUD with blue border and brighter background

**Party HUD overhaul** (bottom-left)
- Replaced opaque colored squares with proper portrait slots: sprite icon, truncated name, HP number, HP bar
- Uses a Container so all elements survive room transitions cleanly
- HP updates live during combat — party data syncs from CombatManager every frame
- Selected riftling slot visually distinguished during combat

**Test suite hardened**
- Bumped `waitForGameReady` timeout from 10–15s to 20s across all 4 test files
- Bumped `waitForRecruitPrompt` timeout from 10s to 30s (combat takes longer with move-based system + difficulty scaling)
- Updated room count assertion from 7 to 9
- All 19 tests passing

### Current state of the game

The player spawns with Emberhound and explores a 9-room dungeon. All active riftlings fight using their equipped moves with independent cooldowns — damage numbers show move names so the player can see what's happening. A compact HUD at bottom-center shows the selected riftling's moves and cooldown state. The party HUD at bottom-left shows all active riftlings with live HP that updates during combat, with the selected riftling highlighted in blue. Q/E cycles selection, clicking a companion selects it. After combat, a recruit prompt lets the player grow their team.

### Known issues / gaps

- No boss encounter mechanics (boss room has a single enemy, no phases)
- Timer runs out with no consequence (no game over screen)
- No victory screen when boss is defeated
- No player commands (Attack/Rally/Unleash/Stance)
- Synergy bonuses not implemented
- No title screen / main menu
- Missing sprites for 8 riftlings (Tidecrawler, Riptide, Barkbiter, Briarwood, Gloomfang, Voidweaver, Tremorhorn, Pebblet)
- Companion KO leaves room in ambiguous state (BUG-005 still open)
- Physics colliders still accumulate across room transitions (BUG-004 still open)

## Session 5 — April 11, 2026

### What was built

**Swarm scaling for wild encounters**
- Enemy spawn count now scales with rooms cleared in combat and recruit rooms
- Extra enemies per room = floor(roomsCleared × 1.5) on top of the template's base spawns
- Early rooms stay manageable (2–3 enemies), later rooms become proper swarms (6–9 enemies)
- Extra spawns placed only on verified walkable floor tiles to prevent enemies spawning stuck inside walls
- Elite and boss rooms keep their template counts (fewer, tougher foes)

**Combat stat additions**
- Added `defense` stat — flat damage reduction on incoming hits (minimum 1 damage)
- Added `critRate` — chance for 1.5× damage with orange flash and stronger knockback
- Added `evasion` — chance to dodge attacks entirely, shows "MISS" text
- All riftling templates tuned with per-species crit/evasion/defense values
- Wild enemies get reduced crit (50%) and evasion (30%) from their template values

**Ranged attack projectiles**
- Both `dealDamage` and `dealMoveDamage` now fire a visible projectile dot for ranged attacks (>40px distance)
- Gold projectile for ally attacks, red for enemy attacks
- Projectile tweens from attacker to defender; damage applies on arrival
- Melee attacks (<40px) still apply instantly

**Damage number improvements**
- Random x-offset (±12px) on all damage numbers so stacked hits spread out visually
- Distinct colors: gold for ally damage, red for enemy-on-ally damage
- Enemy damage on allies rendered slightly larger (11px vs 10px)
- Crit hits show "CRIT!" prefix in orange, larger font (12px)

**Ranged companion behavior fix**
- Removed the kiting/retreat behavior that caused ranged riftlings to endlessly run away from melee enemies into walls
- Ranged companions now hold their ground and keep fighting when enemies close in

**Temperament system**
- Each riftling gets a random temperament on creation (Fierce, Stalwart, Swift, Keen, Elusive, Relentless, Hardy, Balanced)
- Temperament guarantees one stat always grows on level-up and one stat never grows
- Adds build variety — two Emberhounds can grow very differently across a run

**4 new riftlings added (8 total → roster now at 8 with sprites)**
- Tidecrawler (Water/Anchor) — tanky crab, slow but heavily armored, HP 100, DEF 4
- Gloomfang (Dark/Chaser) — glass cannon panther, fastest riftling (SPD 80), high crit (20%)
- Barkbiter (Nature/Chaser) — scrappy badger, balanced attacker with thorns
- Tremorhorn (Earth/Anchor) — tankiest riftling in the roster (HP 120, DEF 6), very slow
- All four have 8-directional PixelLab sprites imported from the Riftling project
- Registered in BootScene loader and RIFTLING_TEMPLATES — appear as wild enemies and recruits immediately
- Roster now covers all 6 element types: Fire, Water, Nature, Earth, Light, Dark

### Current state of the game

The player spawns with Emberhound and explores a 9-room dungeon. Combat rooms spawn scaling swarms of wild riftlings — early rooms have 2–3 enemies, later rooms swarm with 6–9. All active party riftlings auto-battle using equipped moves with projectile visuals for ranged attacks. Damage numbers show crits, misses, and move names clearly. The roster now has 8 riftlings across all 6 types, each with a random temperament that shapes their stat growth. The party screen (Tab) allows bench/active management and move equipping.

### Known issues / gaps

- No boss encounter mechanics (boss room has a single enemy, no phases)
- Timer runs out with no consequence (no game over screen)
- No victory screen when boss is defeated
- No player commands (Attack/Rally/Unleash/Stance)
- Synergy bonuses not implemented
- No title screen / main menu
- Missing sprites for 4 riftlings (Riptide, Briarwood, Voidweaver, Pebblet)
- Companion KO leaves room in ambiguous state (BUG-005 still open)
- Physics colliders still accumulate across room transitions (BUG-004 still open)

### Recommended next steps (priority order)

1. **More biome tilesets** — Import/generate Wang tilesets for additional environmental themes (water, lava, jungle, crystal, void, etc.) and assign to room types. Biomes are environmental, not tied to riftling types — any type can inhabit any biome.
2. **Player commands** — Attack (Space), Rally (R), Unleash (Q). The ~4 inputs that define the control model.
3. **Boss encounter** — Level 1 boss with distinct behavior. Beating the boss = run complete.
4. **Game over / victory screens** — Timer expiry = run failed. Boss defeated = run won.
5. **Title screen / main menu** — Start Run button, starter selection.
6. **Remaining riftling sprites** — Generate Riptide, Briarwood, Voidweaver, Pebblet via PixelLab.
7. **Synergy system** — 2-of-a-kind type bonuses displayed in UI.
8. **Audio** — Background music and SFX.

## Session 6 — April 12, 2026

### What was built

**Biome tileset system (Wang tile autotiling)**
- Imported a grass/cliff Wang tileset from PixelLab (ID: `730067cb-0fef-4e4e-9d95-d3e6785bfc92`) — 16 tiles at 16px
- Added `Biome` type to `room_templates.ts` — rooms can now specify which tileset renders them
- Built `renderBiomeTile()` in DungeonScene — computes Wang tile index per cell using corner-based neighbor sampling
- Wang index formula: `(SE << 0) | (SW << 1) | (NE << 2) | (NW << 3)` — each corner checks 3 neighbors (2 cardinal + 1 diagonal), if any is wall/void/OOB → corner is "upper" terrain
- Door tiles treat OOB as floor (not wall) so exits show open grass extending outward, giving a clear visual signal
- Wall and void tiles render as full upper terrain (wang_15); floor and door tiles render autotiled transitions
- Legacy `dungeon` biome preserved — existing rooms render unchanged
- Physics colliders unified: walls and void tiles get invisible colliders regardless of biome

**Start room updated**
- Changed from `dungeon` to `grass_cliff` biome — green grass floor with sandy cliff walls forming natural boundaries
- Renamed from "Entrance" to "Rift Entrance"
- Exits show open grass where doors are, cliff walls everywhere else

**How to add a new biome:**
1. Import or generate a 16-tile Wang tileset → copy to `assets/tiles/<biome_name>/wang_0.png`–`wang_15.png`
2. Load in `BootScene.ts` with prefix `<biome_name>_`
3. Add name to the `Biome` type union in `room_templates.ts`
4. Set `biome: '<biome_name>'` on room templates
5. No renderer changes needed — `renderBiomeTile` is biome-agnostic

**GDD updates**
- Updated Art & Audio Style doc with biome tileset system, Wang tile format, world-not-dungeon direction
- Updated World & Levels doc to reflect "zones in a world" framing instead of "rooms in a dungeon"
- Updated Tech Stack with Wang tile autotiling reference

### Current state of the game

The start room now renders as a grassy clearing bounded by cliff walls with visible openings at exits — the first step toward a world feel rather than a dungeon feel. All other rooms still use the legacy dungeon tileset. The biome system is built and extensible: adding a new biome requires only a tileset import and a type registration, no renderer changes.

### Known issues / gaps

- Only 1 biome implemented (grass_cliff); all other rooms still use legacy dungeon tiles
- No boss encounter mechanics (boss room has a single enemy, no phases)
- Timer runs out with no consequence (no game over screen)
- No victory screen when boss is defeated
- No player commands (Attack/Rally/Unleash/Stance)
- Synergy bonuses not implemented
- No title screen / main menu
- Missing sprites for 4 riftlings (Riptide, Briarwood, Voidweaver, Pebblet)
- Companion KO leaves room in ambiguous state (BUG-005 still open)
- Physics colliders still accumulate across room transitions (BUG-004 still open)

## Session 7 — April 12, 2026

### What was built

**New riftling: Thistlebound**
- Nature/hunter rabbit riftling generated via PixelLab (ID: `1f52ae35-b6ec-4af6-82ab-0806b6e1a1da`)
- Imported into global library, copied to `assets/sprites/thistlebound/` (8 directions)
- Registered in `RIFTLING_TEMPLATES` and `BootScene` loader

**Base stat ranges (all 12 riftlings)**
- Every riftling now has a `baseStats: BaseStatRanges` object defining min/max for all 7 stats (HP, ATK, DEF, SPD, ASPD, CRIT, EVA)
- `createRiftling(key)` rolls each stat randomly within the species range — no two riftlings of the same species are identical
- Ranges designed so species identity is legible even at extremes (min-roll Gloomfang is still fast and fragile; max-roll Tremorhorn is still slow and tanky)

**Level-based enemy scaling**
- Extracted stat-growth logic from `awardXP` into shared `applyLevelUpGains(riftling)` helper
- New `createRiftlingAtLevel(key, targetLevel)`: creates level-1 riftling with randomized base stats, runs level-up logic N-1 times — enemies at all levels use the exact same growth system as player riftlings
- Enemy level derived from `difficulty` in `startEncounter`: `Math.round(difficulty)` clamped to MAX_LEVEL. First room = level 1, elite rooms = level 5-7, boss room = level 8-10

**Hunter role**
- Added `'hunter'` to the `Role` type
- Thistlebound and Gloomfang updated to `hunter`
- Hunter targeting: `leap` kind selects enemy with highest `attackRange` above 60px — stable backline proxy that doesn't loop when the hunter repositions

**Complete move system overhaul — all 12 riftlings**

Every riftling now has 3 mechanically distinct moves. New move kinds: `beam`, `spin`, `leap`.

New status systems on `CombatUnit`:
- `igniteStacks` / `nextIgniteTick` — fire DoT, stacks build/decay
- `blindMissChance` / `blindExpiresAt` — miss chance on attacker
- `briarDamage` / `briarExpiresAt` — counter-damage when unit attacks
- `knockbackImmuneUntil` — blocks knockback in `applyHit`
- `phaseUntil` — full damage immunity window
- `damageReductionAmount/Until` — flat % incoming damage reduction
- `markedDamageBonus` / `markedUntil` — all incoming damage amplified

New move flags: `repositions`, `dashThrough`, `phasesBeforeStrike`, `shadowStep`, `appliesSlowOnLand`, `appliesSlowToAllHit`, `rootTarget`, `stunsRadius`, `selfTarget`, `selfHealFallback`, `appliesIgnite`, `bonusPerIgnite`, `appliesBlind`, `appliesBriar`, `appliesStatDebuff`, `appliesHuntersMark`, `executeBonusPct`, `defenseScaledBonus`, `grantsDamageReduction`, `grantsKnockbackImmunity`, `selfBuffStat/Amount/Duration`, `refracts`, `pullsTarget`

**Visual systems added**
- Hit spark scatter — 3-5 element-colored dots scatter from every move impact
- Attacker confirmation flash — brief element-color tint when a move lands
- HP bar status indicator dots: orange (ignite) · white (blind) · green (briar) · grey (damage reduction) · purple above bar (Hunter's Mark)
- Bezier arc leap with shrinking ground shadow (Predator's Leap)
- Shadow step blink with smoke puff (Dusk Dash)
- Elemental dash trail using `TYPE_COLORS` — auto-matches attacker type
- Vine particles for root (Root Snap)
- Orbiting sparks for stun (Earthquake)
- Phasing shadow afterimages (Phantom Dive)
- Persistent glowing beam (Solar Flare)
- Radial ring sweep (Tidal Spin, Hex Screech)

**Other system improvements**
- `evasion` added to `StatusEffect` stat union
- `applyStatDebuff` refreshes duration on re-application instead of stacking
- All effect helpers (`applyBriar`, `applyBlind`, `applyRoot`, `applyStun`, `applyHuntersMark`, `applySelfBuffFromSlot`, `applyStatDebuff`) are shared across all executors
- Duplicate-prevention in stat debuffs prevents barrage moves from stacking the same debuff type

### Current state of the game

All 12 riftlings have fully implemented, mechanically distinct move sets. Each type has a coherent identity: fire = ignite stacking, water = waterlogged defense shred, nature = roots/briar control, earth = stuns/seismic/armor, light = blind disruption, dark = hunter's mark/phase/execute. 15+ distinct status effects and mechanics active in combat. Enemy riftlings scale through level-based stat growth rather than flat multipliers.

### Known issues / gaps

- No boss encounter mechanics
- Timer runs out with no consequence (no game over screen)
- No victory screen when boss is defeated
- No player commands (Attack/Rally/Unleash/Stance)
- No title screen / main menu
- Missing sprites for 4 riftlings (Riptide, Briarwood, Voidweaver, Pebblet)
- Companion KO leaves room in ambiguous state (BUG-005 still open)
- Physics colliders still accumulate across room transitions (BUG-004 still open)

### Recommended next steps (priority order)

1. **Player commands** — Attack (Space), Rally (R), Unleash (Q)
2. **Boss encounter** — Level 1 boss with phases. Beating the boss = run complete
3. **Game over / victory screens** — Timer expiry = failed. Boss defeated = won
4. **Title screen / main menu** — Start Run button, starter selection
5. **Remaining riftling sprites** — Generate Riptide, Briarwood, Voidweaver, Pebblet

---

## Session 8 — April 12, 2026

### What was built

**New biome: dark_plains_bluff**

Added the first plains biome to the rift — a dry, yellowed grassland with tactical bluff obstacles and dense ambush grass.

- **Tileset generated** (PixelLab ID `cab5233d-66bc-4d88-af7b-99b1c3623795`)
  - Lower: dry yellowed grass with amber seed-heads and muted dark green base
  - Upper: purple-tinted corrupted bluff (came back more violet than the "earthen brown" we prompted — accepted as rift-corrupted stone, which aligns with the "purple rift energy bleeds into every biome" art direction)
  - `transition_size: 0.5` for clear elevation
  - Chained to the `dark_grass_cliff` style anchor at adherence 90 so the grass base stays cohesive with other rift biomes
- **New scatter decoration:** `tall_grass_wild` — imported from global library (ID `36a9b9d8-d39e-4934-9a29-6db275cd80d2`), a yellow-green tuft of tall wild grass that bridges the plains palette with the darker biomes

**Room templates**
- `PLAINS_ROOM` (combat) — "Windswept Plains," swarm-oriented with three asymmetric bluff clusters (NW L-shape, NE plateau, center ridge) and dense grass scatter in the open sightlines between them. Five enemy spawns, compositions built for ambush gameplay. Includes a rift corruption node, glowing mushroom, hollow log, and a stepping stone trail leading to player spawn for environmental storytelling.
- `PLAINS_TEST_ROOM` — biome showcase for `?testRoom=plains`, four corner compositions plus a central outcrop with rift node focal point, designed for direct-load iteration on the biome
- Added `PLAINS_ROOM` to the `ROOM_TEMPLATES.combat` pool — it now shows up in normal dungeon runs
- Registered `TEST_ROOMS['plains']` for direct-load debug

**Engine wiring**
- `dark_plains_bluff` added to the `Biome` type union in `src/data/room_templates.ts`
- Wang tile loading added to `src/scenes/BootScene.ts`
- Tiles copied to `assets/tiles/dark_plains_bluff/`
- `WORLDBUILDER.md` updated with the full generation recipe, parameters, and notes on the purple-bluff decision

**Validation harness**
- Added `tests/plains_review.spec.ts` — loads the plains test room, validates decoration placement against the room layout, and captures a review screenshot
- Validator checks: decorations not on wall/void tiles, not on player spawn, no pairwise overlaps under 0.8 tiles
- All placements pass. Can be adapted for future biome reviews or deleted once the plains are signed off

### Known gaps for the plains biome

- **Terrain identity is subtle at game scale** — `wang_0`'s amber seed-head accents are visible in isolation but dominated by the dark green base once the camera zooms in. The "dry plains" read comes mostly from the scatter (`tall_grass_wild`) and bluffs, not the terrain itself. Regenerate at lower adherence (~80) with stronger "dry / parched / yellow" wording if a more differentiated floor is wanted
- **Bluffs are currently hard obstacles, not usable elevation** — placed as tile-2 walls, they function as cover and chokepoints. When the engine gets "riftlings stand on top of elevation" behavior, the existing bluff layouts will become tactical high ground with no room edits needed

---

## Session 9 — April 12, 2026

### What was built

**Dungeon redesign — hub-and-spoke layout**

Replaced the old linear-branching dungeon graph with a central hub room that radiates branches, locked in as [D-08](./GDD/06_Decisions.md). The old `Start → Combat1 → Healing → Recruit → Combat4 → Elite → Boss` graph is gone.

- **Hub room** (`HUB_ROOM` in `src/data/room_templates.ts`): a 22×26 vertical hall with a new `'hub'` RoomType. Authored door positions live in a new `hubDoorSlots[]` field on `RoomTemplate`, bypassing the default cardinal-edge door system so the hub can host more than 4 doors.
  - **Slots 0-2** on the west wall, **slots 3-5** on the east wall → 6 regular branch doors.
  - **Slot 6** (north-left) → key-path branch door.
  - **Slot 7** (north-right) → boss door.
  - **South-center** → one-way intro return door (walkable in, no zone out — enforces "no backtrack to intro").
  - **Healing fountain** at the hub's center. Reuses the existing `spawnHealingSpring()` and resets on every hub entry so the player can heal after each branch.

- **Branch generator** (`src/data/dungeon.ts`, rewritten end-to-end):
  - `HUB_SLOT_LAYOUTS[]` pairs each slot with an entry-room grid offset and a chain step vector. Each layout is chosen so the branch-entry room's return-to-hub door and forward-chain door land on different cardinal edges (no door collisions).
  - Regular branches: 3 rooms at L1, 4 at L2+. Entry + combats + terminal reward (elite / recruit / rift shard). Each branch picks a distinct biome from a pool.
  - `generateKeyPath()`: longer combat gauntlet at column x=0 north of the hub. Depth 5 at L1 (scales +1 per level). Terminal uses the `rift_shard` template as a placeholder orb shrine.
  - `generateBoss()`: single boss room at an isolated grid position, connected to the hub so the terminal-teleport logic has a link to follow.
  - `generateDungeon()` appends key-path and boss entries to `dungeon.doors[]` with `locked: true`; unlock logic is runtime.

- **Level 1 intro zone**: a short 3-room chain (`intro_start → easy combat → easy combat → hub`) that extends south from the hub. Both intro combats use the fewest-enemy-spawn combat template (`COMBAT_ROOM_1 "Open Arena"`) so new players aren't flattened before they have a team. Post-combat recruit prompts still run in the intro — this is the only place they do. Level 2+ drops the intro; the player is expected to have a team by then.

**Recruit gating rework**

Recruit prompts are no longer universal. New rules, enforced in `DungeonScene.ts` around line 1566:

| Room | Recruit prompt? |
|---|---|
| Intro zone combats | ✅ yes |
| Regular branch combats | ❌ no |
| Branch terminal — `recruit` type | ✅ yes (this is the reward) |
| Branch terminal — `elite` or `rift_shard` | ❌ no (different reward) |
| Hub | n/a (no combat) |

Branch fights now feel like clean attrition; reaching a `recruit` terminal is a distinct payoff instead of "one more free riftling on top of the reward."

**No-backtrack enforcement (scene layer)**

- `getActiveEdges()` and `createDoorZones()` skip connections to rooms with `visited === true` (for non-terminal rooms). Since the player can only enter a new room from a visited one, the "way we came" door gets masked to a wall, not rendered as a walkable-but-inert opening.
- Terminal rooms override the filter: all their doors redirect to the hub regardless of connections, implementing "teleport back to the hall."
- Hub doors have their own render path — `createDoorZones` iterates `dungeon.doors[]` and looks up authored tile positions in `hubDoorSlots`. Locked doors draw a red overlay, sealed doors draw a dark-grey overlay, and neither spawns a walkable zone.

**Progression commit points**

- `sealBranchIfLeavingTerminal(prevRoom)` fires at the top of every `transitionToRoom`. Leaving a terminal marks that branch `cleared`, seals its hub door, and — if it was the key path — sets `dungeon.hasOrb = true`.
- `refreshHubDoorStates()` recomputes lock state from current dungeon state. Rules: key-path door locked until `dungeon.level` regular branches cleared (L1=1, L2=2, L3=3); boss door locked until `hasOrb`. Called once at scene init and after every seal.

**QoL: terminal teleport back to hub**

Walking into any door on a terminal room now redirects to the hub directly, so the player never has to walk back through cleared combat corridors. Works for all terminal kinds (elite, recruit, rift_shard, key-path, boss).

**Camera fixes**

- `getEntrySpawn()` was hardcoded to `x: 15 * TILE` and `y: 10 * TILE` (the center of a 30×20 combat room). That put the trainer outside the 22-wide hub's world bounds, which is why the hub rendered with the player off-scene. Now uses `tmpl.width / 2` and `tmpl.height / 2` — robust for any room size.
- `setupCamera()` now:
  - Expands the camera bounds with a negative offset when the room is smaller than the viewport, so the room centers in the viewport instead of clamping to `[0, 0]`.
  - Calls `cam.centerOn(trainer.x, trainer.y)` right after `startFollow`, so the first rendered frame already has the camera positioned on the player instead of lerping in from the world origin.

**Documentation**

- `ARCHITECTURE.md` gains a **Dungeon Layout: Hub-and-Spoke** section: slot table, no-backtrack rules, progression commit points, intro zone details.
- `GDD/03_World_and_Levels.md` rewritten: "Levels as Hub-and-Spoke," traversal rules, unlock chain, updated room-type table, recruit gating.
- `GDD/00_Master_Index.md` Tier 1 bullet rewritten to describe 3 levels / hub-and-spoke / key path.
- `GDD/06_Decisions.md` adds **D-08** (hub-and-spoke decision with rejected alternatives).

### Current state of the game

- Level 1 is fully playable end-to-end: intro → hub → pick a branch → clear → teleport home → heal → repeat → key path unlocks → clear → boss unlocks → clear. After the L1 boss the player is stuck in the hub with all doors sealed (no L2 advance yet).
- Hub renders centered on the player; all 6 regular doors + key path + boss are visible, with locked/sealed overlays reflecting current state.
- No-backtrack is enforced — the player cannot walk back through a cleared room or return to the hub mid-branch.

### Deferred

- **Stage 4**: 3-level progression (L1 clear → regenerate hub as L2, L2 → L3, L3 boss clear → victory screen). The boss branch currently just seals on clear and leaves the player in a fully-sealed hub.
- **Stage 5**: Visual icons on hub doors showing each branch's archetype (biome tint + reward type). Currently all doors look identical except for locked/sealed state.
- **Minimap**: still positioned for the old grid layout; branches that extend into negative grid coords render oddly relative to the top-right minimap origin. Cosmetic, not blocking.

### Known rough edges

- The old linear layout code has been fully removed (`Stage 6` cleanup pass). No stale `Stage N` / `4-branch` / `4 cardinal` references remain in `src/`.
- BUG-004 / BUG-005 / BUG-006 / GAP-001 / GAP-007 from Session 8 are unchanged.

---

## Session 10 — April 14, 2026

### What was built

**Level-up reworked around player choice**

Leveling used to be fully automatic — every new level rolled random stat gains weighted by a riftling's temperament, and move power bumped silently every 3 levels. That removed all decision-making from the player. This session replaces the automatic path with a card-pick flow.

- **Stat card picker**: on every level-up, `generateStatCards(riftling)` draws 3 distinct cards from a pool of 7 possible stat bumps (HP +10, ATK +2, DEF +2, SPD +4, A.SPD −30 ms, CRIT +4%, EVA +4%). Weights are 10 by default, 25 for the riftling's temperament-boosted stat, and the reduced stat is excluded from the pool entirely. Capped stats (CRIT 50, EVA 40, A.SPD 400 ms floor) are also filtered out. Temperament now *biases* the pool instead of *overriding* choice.
- **HP is just another card.** There are no automatic stat gains on player level-up anymore — if the player never picks HP, the riftling never gains HP. This makes spec decisions real.
- **Move upgrades at L3 / L6 / L9**: each species gets a `upgradeMoves: [Move, Move, Move]` field. The L3 upgrade is the species' old third move (previously sitting unequipped in `moves[2]`), so only 24 new moves had to be authored (2 per species × 12). Full list in `src/data/party.ts` — each is themed to the species' role (e.g. Emberhound gets Cinder Trail / Inferno Pounce; Solarglare gets Sunspear / Zenith Nova).
- **3 move slots, 2 active**: `moves[]` is a dynamic buffer sized up to 3, `equipped` still picks 2. L3 offers the unlock with an empty slot available (pure addition). L6 and L9 require picking which existing move to replace. Skip is always an option.
- **Leveling path split** in `src/data/party.ts`:
  - Players go through `awardXP` → bumps level counter only → stat cards shown via the UI → `applyStatCard` + `applyMoveUpgrade` apply mutations post-pick.
  - Enemies still go through `createRiftlingAtLevel` → `applyAutoLevelUp` (the old logic, renamed), keeping enemy-scaling math unchanged so combat balance isn't silently perturbed.
- **Template isolation fix**: `createRiftling` now deep-clones `moves` from the template (`tmpl.moves.map((m) => ({ ...m }))`). Previously every instance shared the same array reference, which was a latent bug — the old per-3-level `move.power += 1` was mutating the shared template, and the new upgrade flow that replaces slots would have leaked across instances. Fixed preemptively.

**Level-up card prompt UI** (`src/ui/LevelUpCardPrompt.ts`, new file)

Modelled on `RecruitPrompt`: a single overlay container at depth 500, event-based DOM keydown handler, hide()/onChoice pattern.

- `showStatCards(riftling, cards, onPick)` — 3 cards side-by-side, keyboard 1–3 or click, ESC to skip.
- `showMoveUpgrade(riftling, newMove, onPick)` — new-move preview card at top, existing moves (+ one empty slot marker if `moves.length < 3`) below as replacement targets.
- **Current stats readout**: a compact one-line stats card sits between the header and the pick cards on the stat-card screen so the player can see what they already have. Stats that match one of the currently-offered cards are highlighted in gold; the rest are neutral. Wrapped in a dark rounded-rect panel to match the existing card-UI language.
- Portrait + name + level header, styled consistently with the rest of the UI.

**`DungeonScene` wiring**

- `showLevelUps` rewritten to walk the queued `LevelUpResult[]` sequentially. For each:
  1. Show stat cards, wait for pick, `applyStatCard`.
  2. If the new level is 3 / 6 / 9 and the species has an upgrade move for that slot, show the move-upgrade prompt, wait for pick, `applyMoveUpgrade`.
  3. Recurse into the next queued level-up, then call `onDone` (which then opens the recruit prompt if applicable).
- `__gameState.triggerLevelUp(index, targetLevel)` added as a QA hook — bumps the riftling's level and drives the real card flow, for Playwright-driven tests.
- `__gameState.isLevelUpActive()` added for test polling.
- `LevelUpCardPrompt` instance is now included in the persistent-children set in `loadRoom`, so its container survives room transitions.

**`LevelUpResult` reshape**

- Was `{ riftling, gains: { stat, amount }[] }`.
- Now `{ riftling, newLevel }`. The old `gains` array is gone because stat changes are now driven by player choice, not auto-rolls.

### Tests

- `tests/xp_leveling.spec.ts` updated: the "enough XP triggers a level-up" test now asserts `result.newLevel` and the level counter instead of `result.gains` and automatic HP growth. The `level-up HP gain matches level-2 expected range` and `boosted stat temperament always grants its bonus on level-up` tests were removed — both asserted the old automatic-gain behavior that no longer exists. Left a short comment noting temperament now biases the card pool, not direct gains.

### Verified in-browser (Playwright)

- **L2 stat pick**: 3 cards render correctly, pressing a number key applies the stat (verified speed went 82 → 86 on a +4 SPD pick), prompt dismisses.
- **L3 move unlock (add to empty slot)**: "New Move: Flame Charge" header, 2 existing moves in red replace-mode and 1 empty slot card in cyan. Picking the empty slot grew `moves[]` to 3, `equipped` stayed `[0, 1]`.
- **L6 move upgrade (replace)**: after clearing 3 queued stat prompts, "New Move: Cinder Trail" shown with all 3 slots in replace-mode and no empty slot. Picking slot 3 replaced Flame Charge with Cinder Trail cleanly.
- **Template isolation**: after mutating an existing Emberhound all the way to L6 with moves swapped, injecting a fresh Emberhound still produced the original 2 moves at original power. No cross-instance leakage.
- **Current-stats card**: renders between header and pick cards, highlights the three offered stats in gold.

### Current state of the game

- Player level-up is now a decision point, not a number-go-up moment. Specs diverge based on picks, and L3/L6/L9 unlocks give each riftling three authored power spikes over a run.
- Enemy scaling is untouched — `applyAutoLevelUp` still drives `createRiftlingAtLevel`, so combat tuning from earlier sessions is preserved.
- All 12 species have complete 3-move upgrade pools.

### Deferred

- **Elite enemies don't get upgrade moves.** `CombatManager` line ~535 has them equipping from the species' `moves[]` pool, which is still the 2 starting moves. Could be spiced up by giving elites access to `upgradeMoves` later — deferred to avoid scope creep.
- **No visual "card hover reveal" on the stats row**: right now all three offered stats are highlighted at once. A nicer UX would be hovering a card to highlight *just* that stat in the readout. Cosmetic, not blocking.
- **Move-upgrade skip is permanent.** Skipping an L3/L6/L9 upgrade throws the upgrade away for that run. Acceptable because move specialization is part of the decision, but worth watching in playtest.
- **The Full Riftling Roster tables below** still reflect the pre-upgrade-system moveset (3 moves per species, pre-refactor). They are historical. See `src/data/party.ts` for the current `moves[] + upgradeMoves[]` split.

### Known rough edges

- Nothing new from Session 9's list. BUG-004 / BUG-005 / BUG-006 / GAP-001 / GAP-007 still standing.

---

## Session 11 — April 17, 2026

### What was built

**Multi-level progression — runs can actually end now**

Session 9 left Stage 4 deferred: after clearing the L1 boss, the player was stranded in a fully-sealed hub with no way to advance. The run had no win state. This session closes that loop.

- **`sealBranchIfLeavingTerminal(room)` now returns a signal** (`'victory' | 'advance' | null`) instead of `void`. Non-terminal and non-boss terminal clears still return `null`. A boss clear returns `'advance'` when `dungeon.level < 3` and `'victory'` at `dungeon.level === 3`. Caller drives the flow.
- **`transitionToRoom` reads the signal before locking in the target room.** On `'victory'` it calls the new `launchVictory()` and returns early. On `'advance'` it regenerates the dungeon via `generateDungeon({ level: nextLevel })`, refreshes hub door states, fully heals active + bench riftlings, refills the timer to 360s, and redirects the transition to the new `hubRoomId`. Party, trinkets, XP, and levels all carry over. A `Level N` banner shows after the flow completes.
- **Why regenerate instead of reusing the existing dungeon?** Simpler than rewiring a live dungeon's branches/biomes/elite pools in place, and the hub-and-spoke layout is cheap enough to rebuild (single-digit ms). Also means each level rolls fresh biome/reward combinations, which is the behavior the GDD's "3 distinct levels" scope asks for anyway.

**Victory scene** (`src/scenes/VictoryScene.ts`, new file, registered in `main.ts`)

Mirrors the `GameOverScene` structure and fade-in timing.

- Title: "RIFT SEALED" in gold.
- Run summary: time remaining (mm:ss), total riftlings in party + bench, strongest riftling name + level.
- Buttons: Play Again (restarts the Dungeon scene) and Title Screen (back to main menu). Keyboard: SPACE/ENTER to replay, ESC for title.
- Data shape: `VictoryData { timeRemaining, partySize, strongestRiftling, strongestLevel }` — computed at launch time in `DungeonScene.launchVictory()` so the scene is a pure consumer.

**Test helper fix — every spec was silently broken since TitleScene was added**

Discovered during Session 11 playtesting. Every `waitForGameReady(page)` helper was calling `page.waitForFunction(() => !!window.__gameState)` and timing out at 20s. Root cause: `__gameState` is only set in `DungeonScene.create()`, but `TitleScene` is the first scene in `main.ts`'s scene array — the dev server boots into Title, which blocks `__gameState` forever without a SPACE press. Every spec that called `waitForGameReady` has been failing at step one since Title landed.

- **Fix** (12 spec files): `waitForGameReady` now waits on `__PHASER_GAME__` (also exposed in main.ts, in `import.meta.env.DEV`), then does `game.scene.stop('Title'); game.scene.start('Dungeon')` via `page.evaluate`, then waits for `__gameState`.
- **Why scene manipulation instead of pressing SPACE?** Canvas focus is flaky in headless Chromium — keypresses silently miss the listener about 50% of the time. Going through the Phaser scene manager directly is deterministic.
- **Coverage**: 47 tests pass post-fix (2 pre-existing screenshot drifts unrelated to this change).

**New test: `tests/level_progression.spec.ts`**

Validates the full L1 → L2 → L3 → Victory flow end-to-end. Walks the player into the boss room and back to the hub (the seal commit path) three times. Asserts:

- After seal #1: `dungeon.level === 2`, boss branch not cleared in the new dungeon, current room is hub.
- After seal #2: `dungeon.level === 3`.
- After seal #3: `Victory` scene is active on the Phaser game manager.

Uses direct warp rather than real combat — the seal logic doesn't check combat state, so the shortcut is equivalent for this test. Runs in ~5s.

### Current state of the game

- Runs are winnable. Clearing the L1 boss regenerates into L2 (full HP + fresh 6-minute timer). Clearing L2 regenerates into L3. Clearing L3 transitions to a Victory scene with the run summary.
- Party / bench / trinkets / XP all carry across level boundaries; HP and clock refill so the player goes into each level fresh.
- All previously-failing Playwright specs are back online — the harness is usable for regression tests again.

### Deferred / known rough edges

- **Timer refill is a flat 360s per level.** GDD hints at 5–7 min scaling; 6 min per level is inside that range but not tuned for difficulty. Adjust after playtesting L3.
- **No level banner screen.** Currently just a `showMessage` toast on hub entry. A proper "LEVEL 2 / 3" title card with a 1-2s pause would help the player register the transition. Cosmetic.
- **Boss-room entry from another dungeon's grid doesn't produce a perfect spawn position.** Because `prevRoom` from the old dungeon's grid gets compared to the new hub's grid in `getEntrySpawn`, the player may spawn at the template default rather than a door. Works in practice (player lands in a walkable tile) but not pretty. Could be polished by passing a "from-level-advance" flag that forces center-spawn.
- **`tests/smoke.spec.ts` snapshot `boot-dungeon.png` and `tests/synergy.spec.ts` `synergy-hud` are both stale** — look like they predate session 5–10 visual changes. Need regeneration via `npm run test:update-snapshots` once the current state is signed off.
- BUG-004 / BUG-005 / BUG-006 were all marked Fixed in Session 9 updates to `BUGS.md` — those entries are still valid. GAP-008 (smoke test reads pre-selection party) remains open.

### Remaining jam-ship blockers (from the ship-readiness audit)

| Priority | Item | Status |
|---|---|---|
| P0 | L1 → L2 → L3 → Victory | **Done this session** |
| P0 | Vibe Jam widget smoke test (`index.html:14` embed) | Open |
| P1 | Audio (0 sounds in codebase right now) | Open |
| P1 | TitleScene control hints mention Space/R/Q commands that aren't actually bound | Open |
| P1 | SynergyHUD depth vs CombatHUD — visibility during combat | Open |
| P2 | Minimap rendering on hub-and-spoke layout | Open (cosmetic, Session 9 noted) |

---

## Full Riftling Roster

### EMBERHOUND — Fire / Chaser
*Fast aggressive melee brawler. Builds ignite on targets that burns over time.*

| Move | Kind | CD | Effect |
|---|---|---|---|
| **Ember Strike** | strike | 3 | Damage + 2 ignite stacks on target |
| **Fire Dash** ⭐ | pierce | 8 | Pierce damage + repositions behind target; orange motion trail |
| **Flame Charge** | drain | 10 | Bonus damage ×1.5 per ignite stack on target + life drain |

**Ignite:** stacks from Ember Strike / Magma Slam; ticks damage = stacks then decay 1/tick. Max 12. Orange dot.

---

### PYRESHELL — Fire / Anchor
*Tanky fire tortoise. Holds the line with molten armor and area ignite.*

| Move | Kind | CD | Effect |
|---|---|---|---|
| **Magma Slam** | strike | 5 | Damage + 1 ignite stack |
| **Eruption** ⭐ | blast | 20 | AoE (45px) + 3 ignite stacks to all units in radius |
| **Lava Shield** | shield | 60 | Self: +4 DEF for 4s + thorns (2 dmg reflected per hit received) |

---

### SOLARGLARE — Light / Skirmisher
*Precision long-range attacker. Blinds enemies and sustains a beam.*

| Move | Kind | CD | Effect |
|---|---|---|---|
| **Light Lance** | strike | 4 | Damage + 10% blind 2s |
| **Solar Flare** ⭐ | beam | 25 | 300px sustained beam, 3s duration, 10 dmg/tick to all enemies in line |
| **Prism Shot** | barrage | 3 | 3 bolts; each refracts to nearest secondary target within 60px |

**Blind:** blinded units may miss their own attacks. White dot.

---

### LUMOTH — Light / Skirmisher
*Glass cannon disruptor. Survives on evasion; double-debuffs from range.*

| Move | Kind | CD | Effect |
|---|---|---|---|
| **Dust Blast** | slow | 3 | 40% slow 3s + 10% blind 2s simultaneously |
| **Luminova** ⭐ | blast | 11 | AoE (70px) + 15% blind 3s to all hit + Lumoth gains +15 evasion 2s |
| **Moonbolt** | strike | 6 | High-power ranged strike (power 9) — pure damage, no effects |

---

### TIDECRAWLER — Water / Anchor
*Armored crab. Controls the frontline through taunt, spin, and defense shred.*

| Move | Kind | CD | Effect |
|---|---|---|---|
| **Claw Crush** | strike | 4 | Damage + waterlogged (-2 DEF, 3s) |
| **Tidal Spin** ⭐ | spin | 10 | Hits all enemies within 50px simultaneously; radial knockback |
| **Shell Guard** | taunt | 8 | Taunts nearby enemies + +3 DEF 4s + knockback immune for duration |

**Waterlogged:** -DEF debuff (refreshes on re-application, no stacking). Water-type identity.

---

### RIVELET — Water / Chaser
*Fastest water unit. Dashes through groups and yanks targets in.*

| Move | Kind | CD | Effect |
|---|---|---|---|
| **Crystal Claw** | strike | 3 | Damage + waterlogged (-2 DEF, 3s) |
| **Torrent Rush** ⭐ | pierce | 9 | Dashes through enemy line; pierce + waterlogged each; elemental trail |
| **Undertow** | drain | 5 | Drain + pulls target toward Rivelet on hit |

---

### BARKBITER — Nature / Chaser
*Scrappy badger. Heals allies, roots enemies, spreads briar.*

| Move | Kind | CD | Effect |
|---|---|---|---|
| **Sap Leech** | heal | 5 | Heals most-injured ally below 60% HP; heals self if no ally needs it |
| **Thornburst** ⭐ | barrage | 9 | 3 bolts; applies briar (2 dmg when target attacks, 4s) to each |
| **Root Snap** | slow | 5 | Damage + full root 1.5s (speed → 0, attacks locked); vine particles |

**Briar:** briar'd units take flat damage when they attack. Green dot.

---

### THISTLEBOUND — Nature / Hunter
*Fast rabbit hunter. Spreads briar from range, leaps to enemy backline.*

| Move | Kind | CD | Effect |
|---|---|---|---|
| **Seed Barrage** | barrage | 3 | 3 bolts + refracts + 1 briar stack per bolt |
| **Predator's Leap** ⭐ | leap | 12 | Bezier arc to highest-range enemy (>60px); pierce + -5 EVA expose on landing |
| **Briar Bolt** | slow | 8 | 40% slow 3s + 2 briar stacks |

---

### TREMORHORN — Earth / Anchor
*Tankiest riftling. Pure sustain with seismic crowd control.*

| Move | Kind | CD | Effect |
|---|---|---|---|
| **Vine Leech** | drain | 4 | Power 3, drain ratio 0.7 — minimal damage, sustained healing |
| **Earthquake** ⭐ | blast | 12 | AoE (55px) + stuns all units hit 0.8s; orbiting spark visual |
| **Stone Bash** | taunt | 7 | Taunts + +5 DEF 5s + knockback immune for duration |

---

### GRINDSCALE — Earth / Anchor
*Armored roller. Defense powers offense; curls for near-invulnerability.*

| Move | Kind | CD | Effect |
|---|---|---|---|
| **Scale Slam** | strike | 5 | Damage = base 5 + floor(own DEF × 0.5) — scales with defense stat |
| **Stonegrind** ⭐ | pierce | 11 | Rolls through enemy line; pierce + armor shred (-3 DEF) to all hit |
| **Iron Curl** | taunt | 8 | Taunts + 40% damage reduction for 3s; grey dot |

---

### GLOOMFANG — Dark / Hunter
*Glass cannon assassin. Marks targets for the team then executes.*

| Move | Kind | CD | Effect |
|---|---|---|---|
| **Shadow Bite** | drain | 3 | Drain + Hunter's Mark: all sources deal +25% damage to target for 4s |
| **Void Rend** ⭐ | pierce | 10 | Pierce + execute bonus: +floor(missingHP% × 0.2) added damage |
| **Dusk Dash** | leap | 4 | Shadow-step blink to highest-range enemy; slow on arrival; smoke puff at departure |

**Hunter's Mark:** amplifies all damage to marked target from all sources. Purple dot above HP bar.

---

### HOLLOWCROW — Dark / Skirmisher
*Evasive disruptor. Hexes enemy attacks; phases to avoid damage.*

| Move | Kind | CD | Effect |
|---|---|---|---|
| **Peck Barrage** | barrage | 3 | 3 bolts; applies -2 ATK hex to each target (refreshes, no stack) |
| **Phantom Dive** ⭐ | pierce | 10 | Phases out 0.8s (fully immune, shadow afterimages); then pierce strike |
| **Hex Screech** | spin | 6 | AoE (60px): damage + 40% slow + -2 ATK hex to all in range |
