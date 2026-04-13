# Art & Audio Style

## 1. Visual Direction

- **Style:** 2D pixel art
- **Camera:** 3/4 top-down perspective (moderate angle — faces visible, ground reads as ground)
- **Era:** 16-bit inspired, restricted palette for cohesion
- **Outline:** Single-color outlines on all sprites for readability in crowded scenes

## 2. Sprite Sizes (Working Targets)

| Entity | Size | Notes |
|---|---|---|
| Trainer | ~32px | Player character |
| Riftlings (ally) | ~24-28px | Party members |
| Basic enemies | ~16-20px | Swarm fodder |
| Elite / boss | ~32-48px | Imposing presence |

## 3. Design Priorities

- **Silhouette priority:** Riftlings must be distinguishable by silhouette alone — role-reading at a glance is critical in horde combat
- **Shadows:** Every unit has a shadow circle to communicate vertical position
- **Readability over detail:** In a swarm game, clarity beats polish. Fewer animation frames but distinct movement silhouettes
- **Color coding:** Each type has a dominant hue so type is readable at a glance:
  - Fire = orange / red
  - Water = blue / teal
  - Nature = green / brown
  - Electric = yellow (Tier 2)
  - Shadow = purple / black (Tier 2)
  - Crystal = cyan / white (Tier 2)

## 4. Environment Art

- **Tile size:** 16px base tiles
- **Tileset format:** 16-tile Wang sets (wang_0–wang_15) sourced from PixelLab. Each tileset defines a lower terrain (base/floor) and an upper terrain (wall/boundary). Wang tile autotiling computes corner indices from the tile grid to produce smooth transitions between walkable and impassable terrain.
- **Biome system:** Each room template specifies a `biome` that selects its Wang tileset. The renderer is biome-agnostic — adding a new biome only requires importing a tileset and registering the name. Current biomes:
  - `grass_cliff` — green grass floor with sandy cliff walls (used for start room)
  - `grass_water` — grass floor with walkable water features (rivers, ponds)
  - `dungeon` — legacy flat floor/wall/void tiles (used for combat rooms, pending migration)
- **Fog of war:** Unexplored rooms on the map are darkened; explored rooms show their type icon

### Visual Tone: The Rift

The game takes place inside a massive rift — a fractured, otherworldly space. The world should feel **recognizable but strange**, like familiar environments that have been subtly warped. Grass grows but the color is slightly off. Water flows but it shimmers with unnatural hues. Stone formations follow impossible geometry.

**Core palette direction:**
- **Darker overall** — muted, desaturated base tones. No bright sunny greens or clean blues. The rift filters everything through a dim, twilight atmosphere.
- **Unnatural accent colors** — purple rift energy bleeds into every biome. Faint violet tints in shadows, occasional cyan or magenta crystalline highlights. These accents signal "this is not the surface world."
- **Warm-cool tension** — biomes lean toward cool (teal, slate, deep blue-green) with isolated warm pockets (amber light sources, lava vents, glowing flora) that create focal points.

**Biome design principles:**
- **Recognizable but wrong** — a forest biome should read as "forest" instantly, but the bark is too dark, the leaves have a purple undertone, the ground has faint luminescent patches. The player should feel uneasy, not confused.
- **World feel, not dungeon feel** — the rift contains varied natural environments: grassy clearings, caverns, volcanic rock, dark forests, flooded ruins. Rooms should feel like zones in a living fractured landscape, not corridors in a dungeon.
- **Rift corruption gradient** — deeper levels show more corruption. Early levels have subtle wrongness (slightly off colors, occasional rift debris). Later levels have overt distortion (floating terrain, inverted gravity pockets, void tears).
- **Each biome tells a story** — the rift has swallowed pieces of the surface world. A water biome is a flooded ruin or a displaced riverbed, not a pristine lake. A forest biome is a grove that grew in unnatural darkness, not a sunny woodland.

**Tileset generation guidelines:**
- Use darker, more muted base terrain colors than typical RPG tilesets
- Add subtle purple/teal tint to shadows and dark areas
- Transition edges should feel slightly organic/corrupted — not clean geometric borders
- Current bright tilesets (`grass_cliff`, `grass_water`) will need regeneration to match this darker palette once the target look is locked in
- All biomes should share a common shadow color (deep purple-black) for cohesion across the rift

**Planned biomes (by rift depth):**
- **Tier 1 (shallow rift):** Dark grass/cliff, murky water, twisted forest
- **Tier 2 (deep rift):** Volcanic/lava, void/crystal, flooded ruins
- **Rift-universal elements:** Purple energy cracks in terrain, faintly glowing ground patches, corrupted vegetation

[TODO: Define specific hex palette with dark rift colors]
[TODO: Generate style anchor tileset with the target dark aesthetic]

## 5. UI Art

- **Minimal chrome:** Timer, active synergies, and command cooldowns always visible during combat
- **Team portraits:** Small riftling portraits with HP bars along the bottom or side of the screen
- **Between-room screen:** Full team view with bench, move loadouts, synergy summary, and dungeon map
- **Synergy indicators:** Active synergies glow; nearly-active synergies (one away) pulse subtly

## 6. Audio Direction

- **Music:** Chiptune / lo-fi electronic. Uptempo during combat, ambient during team management. Timer-low warning shifts the music or adds urgency layers
- **SFX:** Punchy retro attack sounds, distinct per type (fire crackle, water splash, nature rustle)
- **Priority for jam:** SFX over music. A few good hit/recruit/unleash/timer-warning sounds matter more than a full soundtrack

### Color Palette Direction

The rift's palette is built around **muted natural tones with unnatural accents**:

| Role | Color Direction | Notes |
|---|---|---|
| Primary ground | Dark desaturated green (#2a3a2a) or slate grey-green | Not bright — think twilight grass |
| Secondary ground | Deep brown-grey (#3a3030) | Dirt, stone, dead terrain |
| Water | Dark teal (#1a3a4a) with subtle shimmer | Not clean blue — murky, slightly luminous |
| Shadow / void | Deep purple-black (#1a0a2a) | Unified shadow color across all biomes |
| Rift energy accent | Purple-violet (#6a2aaa) | Cracks, glows, corruption veins |
| Warm accent | Amber-orange (#aa6a20) | Lava, torches, glowing flora — rare focal points |
| Crystal accent | Cyan-white (#40dddd) | Rift shards, crystalline features |
| Vegetation | Dark olive (#2a4a1a) to muted teal (#1a4a3a) | Plants that grew without sunlight |

These are directional, not final. The exact hex values will be locked when we generate the first style anchor tileset.

**Style anchor established:** `dark_grass_cliff` tileset (PixelLab ID `1d119ba0-3335-4c77-8d15-9873098dcf26`). All biome tilesets chain to this for palette cohesion. See `WORLDBUILDER.md` for the full generation recipe and parameter reference.

[TODO: Extract final hex palette from the style anchor tileset]
[TODO: Reference art / mood board images]
