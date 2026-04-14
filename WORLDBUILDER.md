# World Builder Guide — Into the Rift

Reference for generating biome tilesets and building rooms for Into the Rift.

## Visual Direction

The rift is dark, muted, and otherworldly. See `GDD/02_Art_and_Audio_Style.md` for full details.

**Key rules:**
- Darker palette than typical RPGs — twilight/underground feel
- Purple rift energy as unifying accent
- "Recognizable but strange" — familiar biomes with subtly wrong colors
- All biomes share a common dark green grass base for cohesion
- **Biomes are environmental, not type-based.** There is no "fire biome" or "dark biome" or "light biome" tied to riftling elemental types. Biomes describe the *place* (jungle, lava flow, crystal cave, badlands), and any riftling type can inhabit any biome. The `dark_` prefix on every biome name refers to the shared rift aesthetic (dark/muted/corrupted), not to the Dark elemental type. When planning new biomes, pick environmental themes — never map a biome one-to-one to a riftling type.

## Style Anchor Tileset

The **dark_grass_cliff** tileset is the style anchor. All other tilesets chain to it for palette consistency.

| Field | Value |
|---|---|
| PixelLab tileset ID | `1d119ba0-3335-4c77-8d15-9873098dcf26` |
| Library path | `tilesets_topdown/1d119ba0-3335-4c77-8d15-9873098dcf26` |
| Game path | `assets/tiles/dark_grass_cliff/` |
| Lower (floor) | Dark muted green grass, desaturated twilight tone |
| Upper (wall) | Dark slate grey cliff face with faint purple cracks |
| Transition size | 0.5 (cliff elevated above grass) |
| Generated with | `--no-chain` (this IS the anchor) |

## Tile Type System

| Value | Name | Walkable | Renders as | Use |
|---|---|---|---|---|
| 0 | void | No | Upper terrain (wang_15) | Out-of-bounds darkness |
| 1 | floor | Yes | Lower terrain (wang_0) + wang transitions | Walkable ground |
| 2 | wall | No | Upper terrain (wang_15) | Room boundary, impassable obstacles |
| 3 | door | Yes | Floor + blue highlight | Room connection points |
| 4 | water | Yes | Upper terrain (wang_15) | Walkable water/terrain features |

Tile type 4 was added for walkable terrain overlays (rivers, ponds). It renders visually as the "upper" terrain via the wang system but has no physics collision, so the player can walk through it.

## How to Generate a New Biome Tileset

### Step 1: Decide the terrain relationship

The wang system has a **lower** terrain (floor/walkable) and an **upper** terrain (wall/boundary). Decide which role each terrain plays:

| Scenario | Lower | Upper | transition_size | Notes |
|---|---|---|---|---|
| Grass + elevated wall | grass | cliff/stone | 0.5 | Standard — wall sits above grass |
| Grass + same-level feature | grass | road/path | 0.0 | Flat transition, no elevation |
| Grass + recessed feature | **feature** | **grass** | 0.25 | **Swap roles + flip wang indices** |

**Critical: If the non-grass terrain should sit BELOW the grass** (water, pits, crevasses), you must generate with swapped roles (feature as lower, grass as upper) and then flip the wang file indices after generation. See "Wang Index Flipping" below.

### Step 2: Generate the tileset

Base command structure:
```bash
export PIXELLAB_API_TOKEN=2be93e4c-910f-4ebe-b0e9-49eef88dad7a

python -m assetmanager "<description>" \
  --type tileset_topdown \
  --lower-desc "<lower terrain description>" \
  --upper-desc "<upper terrain description>" \
  --transition-desc "<edge description>" \
  --transition-size <0.0|0.25|0.5> \
  --tile-size 16 \
  --lower-base-tile-id 1d119ba0-3335-4c77-8d15-9873098dcf26 \
  --tileset-adherence 95 \
  --json
```

**Key parameters:**
- `--lower-base-tile-id` or `--upper-base-tile-id`: Chain to the style anchor. Use `--lower-base-tile-id` when grass is the lower terrain, `--upper-base-tile-id` when grass is the upper (swapped for recessed features).
- `--tileset-adherence 95`: High adherence ensures the grass matches the anchor. Lower values (default) cause visible grass color mismatch between biomes.
- `--transition-size`: Controls elevation. 0.0 = flat, 0.25 = slight elevation, 0.5 = clear cliff/ledge.
- `--no-chain`: Only use when generating a NEW style anchor, not for regular biomes.

### Step 3: Wang Index Flipping (for recessed terrain only)

If you generated with swapped roles (feature as lower, grass as upper), the wang indices are inverted from what the renderer expects. Flip them:

```bash
SRC="<library tiles path>"
DST="<game assets tiles path>"
for i in $(seq 0 15); do
  j=$((15 - i))
  cp "$SRC/wang_${i}.png" "$DST/wang_${j}.png"
done
```

After flipping: wang_0 = grass (floor), wang_15 = feature (water/pit). The renderer works correctly without code changes.

**Do NOT flip** for standard biomes where the upper terrain is elevated (cliff, stone wall). Only flip when the upper terrain in generation is actually the floor terrain in-game.

### Step 4: Wire into the engine

Three files need changes:

1. **`src/data/room_templates.ts`** — Add to `Biome` type union:
   ```typescript
   export type Biome = '...' | 'my_new_biome';
   ```

2. **`src/scenes/BootScene.ts`** — Add wang tile loading:
   ```typescript
   for (let i = 0; i < 16; i++) {
     this.load.image(`my_new_biome_${i}`, `assets/tiles/my_new_biome/wang_${i}.png`);
   }
   ```

3. **`src/data/room_templates.ts`** — Create room template with `biome: 'my_new_biome'` and add to the appropriate pool in `ROOM_TEMPLATES`.

### Step 5: Visual review

- Run `npx tsc --noEmit` to verify clean build
- Check the dev server (`npx vite`)
- Verify: grass matches between biomes, terrain reads correctly, transitions look natural, elevation direction is right

## Generated Biome Tilesets

### dark_grass_cliff (style anchor)
| Field | Value |
|---|---|
| PixelLab ID | `1d119ba0-3335-4c77-8d15-9873098dcf26` |
| Game path | `assets/tiles/dark_grass_cliff/` |
| Prompt | `"Dark muted grass to dark slate cliff, rift-themed 16-bit RPG tileset"` |
| Lower | `"dark muted green grass, desaturated twilight tone, subtle pixel texture, faint blue-green undertone, 16-bit RPG style"` |
| Upper | `"dark slate grey cliff face, jagged stone edge, faint purple cracks, 16-bit RPG style"` |
| Transition | `"crumbling dark stone edge with sparse dead grass"` |
| transition_size | 0.5 |
| Chaining | `--no-chain` |
| Used by | Start room (`grass_cliff` biome) |

### dark_grass_water
| Field | Value |
|---|---|
| PixelLab ID | `1c90bc68-6fc7-451b-9abd-ba6a8af21f24` |
| Game path | `assets/tiles/dark_grass_water/` |
| Prompt | `"Dark water to dark grass with slight bank elevation, rift-themed 16-bit RPG tileset"` |
| Lower | `"dark blue water, deep indigo-blue with subtle wave ripples, murky rift water, 16-bit RPG style"` |
| Upper | `"dark muted green grass, desaturated twilight tone, subtle pixel texture, faint blue-green undertone, 16-bit RPG style"` |
| Transition | `"grassy bank edge slightly raised above water level, muddy shoreline"` |
| transition_size | 0.25 |
| Chaining | `--upper-base-tile-id 1d119ba0-3335-4c77-8d15-9873098dcf26` (grass is upper) |
| Adherence | 95 |
| Wang flipped | **Yes** — generated with swapped roles, indices flipped so wang_0=grass, wang_15=water |
| Used by | Water combat room (`dark_grass_water` biome, tile type 4 for walkable water) |

### dark_forest
| Field | Value |
|---|---|
| PixelLab ID | `d957211b-af81-4ed6-b20c-38a4ef669a01` |
| Game path | `assets/tiles/dark_forest/` |
| Prompt | `"Dark muted grass with bare dirt patches to dense twisted tree wall, rift-themed 16-bit RPG tileset"` |
| Lower | `"dark muted green grass mixed with bare dirt patches and scattered dead leaves, desaturated twilight tone, faint purple undertone in shadows, subtle pixel texture, 16-bit RPG style"` |
| Upper | `"dense wall of dark twisted tree trunks, gnarled bark with faint violet moss, impassable forest edge, 16-bit RPG style"` |
| Transition | `"roots creeping into dirt and dead leaves at the forest edge, fallen twigs"` |
| transition_size | 0.25 |
| Chaining | `--lower-base-tile-id 1d119ba0-3335-4c77-8d15-9873098dcf26` (grass is lower) |
| Adherence | 95 |
| Wang flipped | No |
| Used by | `DARK_FOREST_ROOM` (Twisted Grove combat room), `DARK_FOREST_TEST_ROOM` (direct-load test) |
| Notes | Dirt patches are subtle at 16px — regenerate with stronger wording ("heavy bare dirt patches", "exposed earth") if they need to be more prominent after in-game review |

## Direct-Load Test Rooms

For iterating on a single room in isolation (no starter select flow, no dungeon path), append a query param to the dev URL:

```
http://localhost:5173/?testRoom=dark_forest
```

Registered test rooms live in `src/data/room_templates.ts → TEST_ROOMS`. To add a new one:
1. Create a `RoomTemplate` with the biome you want to test
2. Register it in the `TEST_ROOMS` map under a short key
3. Load via `?testRoom=<key>`

The direct-load path calls `generateTestDungeon()` (single-room dungeon, pre-cleared) instead of `generateDungeon()`, so there are no connected rooms, no combat, no timer pressure — just the room and the player trainer.

### dark_plains_bluff
| Field | Value |
|---|---|
| PixelLab ID | `cab5233d-66bc-4d88-af7b-99b1c3623795` |
| Game path | `assets/tiles/dark_plains_bluff/` |
| Prompt | `"Dry yellowed plains grass to sun-bleached earthen bluff, rift-themed 16-bit RPG tileset"` |
| Lower | `"dry yellowed grass mixed with muted dark green, amber seed-heads and faded olive blades, desaturated twilight tone, faint purple undertone in shadows, subtle pixel texture, 16-bit RPG style"` |
| Upper | `"sun-bleached earthen bluff, dry sod cliff face with hanging roots and crumbling dirt, faded dry grass tufts fringing the top, muted warm brown tones with faint purple shadows, 16-bit RPG style"` |
| Transition | `"crumbling sod edge, dangling roots, dry grass fringe spilling over"` |
| transition_size | 0.5 |
| Chaining | `--lower-base-tile-id 1d119ba0-3335-4c77-8d15-9873098dcf26` (grass is lower) |
| Adherence | 90 |
| Wang flipped | No |
| Used by | `PLAINS_ROOM` (Windswept Plains combat room, swarm-oriented), `PLAINS_TEST_ROOM` (direct-load test) |
| Notes | Upper terrain came back purple-dominant instead of earthen brown despite "muted warm brown" wording. Accepted as "rift-corrupted bluff" — aligns with the "purple rift energy bleeds into every biome" art direction and provides warm-cool tension with the yellowed grass. Regenerate with stronger brown wording and explicit "NO purple" if a more classical earthen plains look is wanted later. |

### dark_lava
| Field | Value |
|---|---|
| PixelLab ID | `29c32d47-35f1-47ea-a819-79f0dacbe58d` |
| Game path | `assets/tiles/dark_lava/` |
| Prompt | `"Molten rift-lava flowing below cracked volcanic stone bank, rift-themed 16-bit RPG tileset"` |
| Lower (generation) | `"molten rift-lava, deep red-orange magma with bright yellow hotspots and dark cooling crust swirls, faint purple rift energy shimmering across the surface, desaturated twilight tone, 16-bit RPG style"` |
| Upper (generation) | `"cracked dark volcanic stone bank, obsidian-black basalt with hairline fracture lines, faint purple rift glow seeping from the cracks, slight elevation above the lava flow, desaturated dark tone, subtle pixel texture, 16-bit RPG style"` |
| Transition | `"blackened stone bank edge dropping into glowing molten lava, cooled crust fringing the shore, glowing red-orange seams"` |
| transition_size | 0.25 |
| Chaining | `--no-chain` (no grass tiles to chain against — neither terrain matches the anchor) |
| Wang flipped | **Yes** — generated with lava as lower / stone as upper, then indices flipped so wang_0 = stone (walkable), wang_15 = lava (hazard) |
| Used by | `LAVA_TEST_ROOM` ("Rift Forge Scar", direct-load via `?testRoom=dark_lava`) |
| Notes | Lava renders via tile type 2 (wall) — impassable hazard that visually flows below the stone floor, like a river. Saturated lava provides the first warm element in the rift palette; purple-infused stone keeps it cohesive. |
| Renderer special case | `DungeonScene.renderBiomeTile` has a dark_lava-specific code path (`isDarkLavaEdgeWall`). Perimeter tile-2 walls render as `dark_grass_cliff_15` (dark stone cliff) instead of lava, and wang computation treats them as lower terrain, so the room boundary reads as a stone cliff wall rather than a cage of lava. Interior lava pools are unaffected. If you build another biome where wang_15 is a hazard rather than a natural wall (e.g. acid, void), you'll need similar handling. |

### dark_badlands
| Field | Value |
|---|---|
| PixelLab ID | `aa1e135f-c9c4-4c3c-a63c-7fdf1fe2aeac` |
| Game path | `assets/tiles/dark_badlands/` |
| Source | Imported pre-existing PixelLab tileset (not generated via assetmanager prompt) |
| Lower | Warm peach/sand desert floor with pink-clay speckles, seamless |
| Upper | Dark purple-brown basalt boulder clusters with bright rock inclusions |
| transition_size | n/a (pre-made) |
| Chaining | None — imported as-is |
| Wang flipped | No |
| Used by | `BADLANDS_TEST_ROOM` ("Sunbleached Badlands", direct-load via `?testRoom=dark_badlands`) |
| Intended for | Earth/rock riftling encounters — open rocky arena with boulder cover |
| Notes | **Palette mismatch vs other biomes.** This tileset is warm-toned (peach floor) and fails the rift cohesion "temperature" test — every other biome except `dark_lava` has a dark green grass base. Accepted intentionally as a contrasting themed area ("scorched outer rim" / desert fragment breaking through the rift). If used in a run alongside grass biomes, expect a visible tonal shift. Consider regenerating a cool-toned stone variant for general earth-habitat use if cohesion becomes a problem. |

### dark_jungle
| Field | Value |
|---|---|
| PixelLab ID | `9051b062-5545-4829-b5e6-c9e1c7444c99` |
| Game path | `assets/tiles/dark_jungle/` |
| Prompt | `"Dark mossy jungle floor to dense tangled vine wall, rift-themed 16-bit RPG tileset"` |
| Lower | `"damp dark mossy jungle floor, dark green grass with exposed gnarled roots and fallen dark leaves, faint purple bioluminescent moss patches, desaturated twilight tone, subtle pixel texture, 16-bit RPG style"` |
| Upper | `"dense wall of tangled dark vines and broad jungle leaves, thick liana curtains with faint violet orchid blooms glowing in shadow, impassable overgrowth, desaturated dark tone, 16-bit RPG style"` |
| Transition | `"creeping roots and vines spilling onto the floor, fern fringe at the base of the vine wall"` |
| transition_size | 0.25 |
| Chaining | `--lower-base-tile-id 1d119ba0-3335-4c77-8d15-9873098dcf26` (grass is lower) |
| Adherence | 95 |
| Wang flipped | No |
| Used by | `JUNGLE_TEST_ROOM` ("Tangled Rift Hollow", direct-load via `?testRoom=dark_jungle`) |
| Companion props | `giant_fern` (`ae218cdf-d96c-4b7a-9519-5e817318ae2b`) — understory anchor, 36px, no collision. Scene also reuses `twisted_dark_tree`, `corrupted_tree`, `hollow_log`, `glowing_mushroom`, `tall_grass_dark`. |
| Notes | Vine wall reads as dark mass at game scale — the violet orchid glow from the prompt is subtle and tonally cohesive rather than punchy. Good tradeoff for rift family consistency; if a more distinct jungle identity is wanted later, regenerate with stronger "glowing purple orchids" wording and higher saturation on the accent color. |

### dark_void
| Field | Value |
|---|---|
| PixelLab ID | `f221b7d3-335e-46ff-b18d-ee0f1c17a0d0` |
| Game path | `assets/tiles/dark_void/` |
| Prompt | `"Dark obsidian platform floating above swirling purple rift void, rift-themed 16-bit RPG tileset"` |
| Lower | `"cracked dark obsidian stone platform floor, deep black-violet basalt with faint purple rift glow seeping from hairline cracks, scattered cyan shard flecks embedded in the stone, desaturated twilight tone, subtle pixel texture, 16-bit RPG style"` |
| Upper | `"swirling purple rift void, deep violet abyss with brighter magenta energy filaments and faint cyan sparks drifting through, impassable otherworldly chasm, glowing unnatural depths, 16-bit RPG style"` |
| Transition | `"crumbling obsidian platform edge dropping into the glowing void, broken stone lip with faint cyan shard fragments clinging to the rim, purple energy bleeding over the edge"` |
| transition_size | 0.5 |
| Chaining | `--no-chain` (no grass in either terrain — same call as `dark_lava`) |
| Wang flipped | No — upper is hazard/impassable, standard orientation |
| Used by | `RIFT_SHARD_ROOM` (Rift Shard terminal reward chamber, `dark_void` biome); also direct-loadable via `?testRoom=dark_void` |
| Notes | Reads as a floating obsidian shrine suspended over rift void. Floor/void contrast is luminance-based rather than hue-based — both are purple, but the wang transition tiles have a visible cyan shard rim that clearly marks the edge at game scale. The rift shard trinket pickup auto-spawns in the chamber center (built-in to the `rift_shard` room type), so no pedestal prop is required. |

## Planned Biomes

Future tilesets to generate using this same process:

| Biome | Lower | Upper | transition_size | Flip? | Notes |
|---|---|---|---|---|---|
| dark_crystal | dark earth | cyan crystal formations | 0.25 | No | Tier 2 crystal caves |

## Lessons Learned

- **Tileset adherence must be 95+** when chaining to the anchor. Default adherence produces visible grass color mismatch between biomes. The grass should look identical across all biomes.
- **Water/pits need swapped generation + wang flipping.** PixelLab always elevates the "upper" terrain. To make something sit below grass, generate it as the "lower" terrain with grass as "upper", then flip all wang indices (wang_X → wang_(15-X)) so the renderer maps correctly.
- **`transition_size=0.0` still produces subtle elevation cues.** PixelLab's convention biases the upper terrain upward even at 0.0. For truly recessed features, use the swap+flip approach with 0.25 instead.
- **"dark blue water" reads better than "dark teal water"** for the rift aesthetic. Teal was too close to the dark green grass and lacked contrast. Indigo-blue provides clear visual distinction.
- **Always visually compare wang_0 between the new tileset and the anchor** before wiring in. If the grass doesn't match, regenerate with higher adherence.
