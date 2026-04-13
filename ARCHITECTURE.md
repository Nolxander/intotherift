# Into the Rift — Architecture & How-To Guide

Agent orientation doc. Read this before touching code.

---

## Codebase Map

```
src/
  scenes/
    BootScene.ts      — asset loading, animation registration, launches Dungeon
    DungeonScene.ts   — main game scene: room rendering, player movement,
                        companion follow, door transitions, all HUD wiring
  combat/
    CombatManager.ts  — all combat logic: AI, moves, damage, status effects,
                        pathfinding, setup phase, command handling
  data/
    party.ts          — riftling templates, party state, XP, synergies
    dungeon.ts        — dungeon graph generation
    room_templates.ts — room tile layouts, biome assignments, enemy spawns
    decorations.ts    — decoration catalog (auto-discovers assets/objects/)
    nav.ts            — SimpleNav BFS pathfinder used by movement code
    anims.ts          — walk animation helpers used by DungeonScene + CombatManager
    trinkets.ts       — trinket definitions and buffs
  ui/
    PartyScreen.ts    — Tab overlay: party management and move equipping
    RecruitPrompt.ts  — post-combat recruit flow
    CombatHUD.ts      — bottom-center move/cooldown display
    SynergyHUD.ts     — active synergy display
  editor/
    builder_mode.ts   — F4 in-browser room editor (dev only, tree-shaken in prod)

assets/
  sprites/
    player/           — idle: {dir}.png  |  walk: animations/walk/{dir}/frame_00N.png
    {riftling}/       — idle: {dir}.png  |  walk (future): animations/walk/{dir}/frame_00N.png
    objects/          — decoration props: {slug}/object.png
  tiles/              — floor/wall/void + biome Wang tilesets
```

**Directions** used throughout: `south south-west west north-west north north-east east south-east`

---

## Key Systems

### Depth / Rendering Order

Y-axis depth sorting is active. All moving sprites call `setDepth(10 + sprite.y / 10)` every frame so lower-on-screen objects render in front. Fixed depth layers:

| Layer | Depth | What |
|---|---|---|
| Void tiles | −2 | |
| Floor / wall tiles | −1 | |
| Door overlays | 0 | |
| World sprites (Y-sorted) | 10–42 | trainer, companions, enemies, decorations |
| HP bars | 200 | |
| Projectiles / effects | 245–260 | |
| Damage numbers | 300 | |
| HUD panels | 400–700 | |

Decoration `setDepth` is set once at spawn using the sprite's bottom-Y (`img.y`). Moving units update depth every frame in `DungeonScene.update()` and `CombatManager.update()`.

### Pathfinding

`SimpleNav` (`src/data/nav.ts`) does BFS on the room's tile grid with 8-directional movement, corner-cut prevention, and LOS-based path smoothing. It is rebuilt in `DungeonScene.loadRoom()` from the resolved tile grid and passed to `CombatManager.startEncounter()`.

Both companion follow (overworld) and combat AI use `moveUnitToward()` / nav waypoints with stuck detection (if a unit hasn't moved 4 px in 600 ms despite the target being far away, the path is recalculated).

### Dungeon Layout: Hub-and-Spoke

Each dungeon (`src/data/dungeon.ts`) is a central hub room plus branches radiating from the hub's walls. The `HUB_ROOM` template (`src/data/room_templates.ts`) is a 22×26 vertical hall with authored door tile positions in `hubDoorSlots[]`:

| Slot | Position | Role |
|---|---|---|
| 0-2 | West wall (top/mid/bot) | Regular branches |
| 3-5 | East wall (top/mid/bot) | Regular branches |
| 6 | North wall, left | Key path — locked until `level` regular branches cleared |
| 7 | North wall, right | Boss — locked until key path cleared (`hasOrb`) |
| — | South wall, center | Intro return (walkable into hub, no zone out) |

Regular branches are short forward chains (3 rooms at L1, 4 at L2+) with distinct biome + reward archetypes. The key path is a longer combat gauntlet (5+ rooms) whose terminal grants the orb. The boss is a single-room branch.

**No-backtrack enforcement** is runtime-only, in `DungeonScene`:
- `getActiveEdges` + `createDoorZones` skip connections to rooms whose `visited` flag is already set. Since the player can only enter a new room from a visited one, the "way we came" door gets masked as a wall.
- Terminal rooms override the filter and redirect **all** their door zones to the hub — this is the "teleport back to the hall" mechanic.
- The hub is special-cased in `createDoorZones`: it skips cardinal edge detection entirely and iterates `dungeon.doors[]`, looking up authored tile positions from `hubDoorSlots`. Locked doors get a red overlay, sealed doors get a grey overlay, and neither spawns a walkable zone.

**Progression commit points:**
- `sealBranchIfLeavingTerminal(prevRoom)` runs at the start of every `transitionToRoom`. If you're leaving a terminal room, the branch is marked cleared, its hub door is sealed, and `hasOrb` is set for the key path. `refreshHubDoorStates()` then recomputes lock state for the key path and boss doors.
- A fresh dungeon starts with key path + boss doors `locked: true`, which `refreshHubDoorStates()` reconciles against current progress on every call.

**Level 1 intro zone:** generated only when `intro` is true (default for level 1). It extends south from the hub via `(0, 3) → (0, 2) → (0, 1) → hub`, using the easiest combat template (fewest enemy spawns) for the two intro combats. The intro is the only place where post-combat recruit prompts run; branch combats have recruiting disabled so recruit-type terminals become the reward.

---

## How-To Guides

### Add Walk Animations for a Riftling

**Step 1 — Add frame assets**

```
assets/sprites/{riftling_name}/animations/walk/{dir}/frame_000.png
                                                      frame_001.png
                                                      …
                                                      frame_00N.png
```

One folder per direction (`south`, `south-west`, `west`, `north-west`, `north`, `north-east`, `east`, `south-east`). Frames are zero-padded to three digits (`frame_000`, `frame_001`, …).

**Step 2 — Load the frames in `BootScene.preload()`**

Follow the existing player pattern:

```ts
// In BootScene.preload()
const walkDirs = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'];
for (const dir of walkDirs) {
  for (let f = 0; f < FRAME_COUNT; f++) {
    this.load.image(
      `{riftling_name}_walk_${dir}_${f}`,
      `assets/sprites/{riftling_name}/animations/walk/${dir}/frame_00${f}.png`,
    );
  }
}
```

**Step 3 — Register the animations in `BootScene.create()`**

```ts
// In BootScene.create(), after the player registration line
import { registerWalkAnims } from '../data/anims';
registerWalkAnims(this, '{riftling_name}', FRAME_COUNT);
```

`registerWalkAnims` checks each direction independently — if a direction's first frame isn't loaded it skips that direction silently, so partial animation sets are safe.

**That's it.** No changes to `DungeonScene` or `CombatManager`. The `playWalkOrStatic` helper already checks `scene.anims.exists()` before playing, and falls back to the static directional texture if no animation is registered. Walk and idle work automatically everywhere the riftling appears.

**Animation key format** (for reference / debugging):
- Animation: `{prefix}_walk_{dir}` e.g. `emberhound_walk_south`
- Frame texture: `{prefix}_walk_{dir}_{index}` e.g. `emberhound_walk_south_0`
- Static idle texture: `{prefix}_{dir}` e.g. `emberhound_south`

---

### Add a New Biome Tileset

1. Import or generate a 16-tile Wang tileset → copy to `assets/tiles/{biome_name}/wang_0.png` … `wang_15.png`
2. Load in `BootScene.preload()`:
   ```ts
   for (let i = 0; i < 16; i++) {
     this.load.image(`{biome_name}_${i}`, `assets/tiles/{biome_name}/wang_${i}.png`);
   }
   ```
3. Add the name to the `Biome` type union in `src/data/room_templates.ts`
4. Set `biome: '{biome_name}'` on any room templates you want to use it
5. No renderer changes needed — `renderBiomeTile` in `DungeonScene` is biome-agnostic

Wang tile index formula: `(SE << 0) | (SW << 1) | (NE << 2) | (NW << 3)` — each corner is "upper" if any of the 3 tiles sharing that corner is wall/void/OOB.

---

### Add a New Decoration Prop

Decorations are auto-discovered from `assets/objects/` — no catalog edit required for basic props.

1. Place asset at `assets/objects/{slug}/object.png`
2. The catalog key is the slug with dashes → underscores: `dark-pine-tree` → `dark_pine_tree`
3. Default: 32px display size, no collision. To override, add an entry to `DECORATION_OVERRIDES` in `src/data/decorations.ts`:
   ```ts
   my_tree: {
     displaySize: 48,
     collides: true,
     collisionWidth: 8,   // trunk width in px
     collisionHeight: 6,  // trunk depth in px
   },
   ```
4. Place it in a room template's `decorations` array, or use the F4 in-browser builder

Collision bodies are placed at the **base** of the sprite (bottom-Y of the visual), not the tile center, so characters collide with the trunk and can walk behind the canopy.

---

### Add a New Riftling Species

1. Generate sprites (8 directions) → place in `assets/sprites/{name}/`
2. Add to the `riftlings` array in `BootScene.preload()` (auto-loads all 8 directions)
3. Add a `RIFTLING_TEMPLATES` entry in `src/data/party.ts` with role, moves, base stats, and `texturePrefix`
4. Add the key to `AVAILABLE_RIFTLINGS` in `src/data/party.ts` so it appears as a wild enemy and recruit
5. Optional walk animations: follow the **Add Walk Animations** guide above

---

## Open Bugs (as of Session 8)

See `BUGS.md` for full details.

| ID | Summary | File |
|---|---|---|
| BUG-004 | Physics colliders accumulate across room transitions | `DungeonScene.ts` |
| BUG-005 | All-companions-KO leaves room in broken state | `CombatManager.ts` |
| BUG-006 | `PartyScreen.toggleEquip` silently corrupts `equipped[]` | `PartyScreen.ts` |
| GAP-001 | Timer expiry has no consequence | `DungeonScene.ts` |
| GAP-007 | Temperament not shown in UI | `PartyScreen.ts`, `RecruitPrompt.ts` |
