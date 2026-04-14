/**
 * Room templates for dungeon generation.
 *
 * Each template is a 2D grid where:
 *   0 = void (impassable darkness)
 *   1 = floor (walkable)
 *   2 = wall (impassable border)
 *   3 = door (walkable, connection point)
 *
 * Templates are 30 tiles wide x 20 tiles tall (480x320 px = one screen).
 * Doors are placed at cardinal edges to connect rooms.
 */

export type RoomType = 'combat' | 'elite' | 'boss' | 'recruit' | 'healing' | 'rift_shard' | 'start' | 'hub';

/**
 * Authored door position on a hub template. The hub bypasses the default
 * cardinal edge detection because it may have more than 4 doors; each slot
 * maps to an explicit tile coordinate. Branches in Dungeon.doors[] reference
 * these slots by index.
 */
export interface HubDoorSlot {
  slot: number;
  tx: number;
  ty: number;
}

/**
 * Biome determines which tileset renders the room.
 * 'dungeon' = legacy floor/wall/void images.
 * Wang-tile biomes use 16 autotiled wang tiles (wang_0–wang_15).
 */
export type Biome = 'dungeon' | 'grass_cliff' | 'grass_water' | 'dark_grass_cliff' | 'dark_grass_water' | 'dark_forest' | 'dark_plains_bluff' | 'dark_lava' | 'dark_badlands' | 'dark_jungle' | 'dark_void';

/**
 * A decorative prop placed in a room. The sprite is a key from
 * `DECORATION_CATALOG` (see `src/data/decorations.ts`); x/y are tile coordinates
 * of the sprite center and may be fractional (e.g. 5.5) to position a prop
 * between tiles. Collision is determined by the catalog entry, not by this
 * placement — `trees collide, grass doesn't` is baked into the catalog.
 */
export interface Decoration {
  sprite: string;
  x: number;
  y: number;
}

/**
 * A pre-made enemy on an elite trainer's team. Unlike wild enemies (random
 * species, no moves), elite members reference a specific species and can
 * override the default equipped moves the player's leveling system would pick.
 */
export interface EliteTeamMember {
  riftlingKey: string;
  /** Indices into the species' moves array. Omit to use the species' first two moves. */
  equipped?: [number, number];
  /** Level offset added to the room's computed difficulty level (e.g. +2 for a "captain"). */
  levelBonus?: number;
}

export interface RoomTemplate {
  name: string;
  type: RoomType;
  width: number;
  height: number;
  tiles: number[][];
  /** Spawn points for enemies (tile coords) */
  enemySpawns: { x: number; y: number }[];
  /** Player spawn point (tile coords) */
  playerSpawn: { x: number; y: number };
  /** Biome tileset to use for rendering (default: 'dungeon') */
  biome?: Biome;
  /**
   * Per-tile path overlay mask. 1 = tile is a walkable dirt path, 0 = not.
   * When present, the hub renderer overlays a second wang tileset
   * (hub_dirt_path_*) on top of the base biome floor for any tile with
   * `paths[y][x] === 1`. Currently used only by the handcrafted hub room.
   */
  paths?: number[][];
  /** Decorative props placed on the floor. Rendered above the tileset. */
  decorations?: Decoration[];
  /**
   * Elite trainer's pre-made team. When present on an 'elite' or 'boss' room,
   * overrides random enemy generation and spawns this fixed squad with
   * player-style move slots instead of a wild swarm. Positioning is computed
   * at runtime from team roles and entry side, so only the roster is authored.
   */
  eliteTeam?: EliteTeamMember[];
  /**
   * For hub rooms only: authored door tile positions indexed by slot. When
   * present, DungeonScene skips cardinal edge masking and spawns door zones
   * at these explicit positions, wired from the Dungeon.doors[] list.
   */
  hubDoorSlots?: HubDoorSlot[];
}

/**
 * Room overrides — JSON files in `assets/rooms/*.json` that replace
 * the in-code definition. Used by the in-browser room builder (F4) to
 * persist edits across reloads. On save, the builder POSTs to
 * `/api/save-room` which writes `assets/rooms/<key>.json` to disk; the
 * next page reload picks up the override via `import.meta.glob` (Vite
 * re-evaluates the glob on HMR and full reloads).
 *
 * If no override exists for a key, the in-code builder runs as before —
 * this whole system is additive and reversible (delete the JSON to
 * revert to the code definition).
 */
const roomOverrides: Record<string, Partial<RoomTemplate>> = (() => {
  const modules = import.meta.glob('../../assets/rooms/*.json', {
    eager: true,
    import: 'default',
  }) as Record<string, Partial<RoomTemplate>>;
  const map: Record<string, Partial<RoomTemplate>> = {};
  for (const [path, data] of Object.entries(modules)) {
    const key = path.split('/').pop()!.replace('.json', '');
    map[key] = data;
  }
  return map;
})();

/**
 * Apply a JSON override (if present) on top of the in-code base template.
 * The override is a shallow merge — JSON fields replace the base fields
 * wholesale. Use keyed room IDs that match the file names under
 * `assets/rooms/`, e.g. 'dark_forest_test' → `assets/rooms/dark_forest_test.json`.
 */
function applyOverride<T extends RoomTemplate>(key: string, base: T): T {
  const override = roomOverrides[key];
  if (!override) return base;
  return { ...base, ...override } as T;
}

/**
 * Stable editor key for a room template. The builder uses this to route
 * save requests to the correct JSON file. Rooms without a key cannot
 * be edited in the in-browser builder (e.g. procedural combat rooms).
 */
export function getRoomKey(tmpl: RoomTemplate): string | null {
  return (tmpl as RoomTemplate & { __editorKey?: string }).__editorKey ?? null;
}

/**
 * Generate a rectangular room with potential doors on all 4 edges.
 * At load time, DungeonScene determines which edges are actually connected
 * and masks inactive doors as walls.
 */
function makeRoom(
  type: RoomType,
  name: string,
  enemySpawns: { x: number; y: number }[] = [],
): RoomTemplate {
  const W = 30;
  const H = 20;
  const tiles: number[][] = [];

  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) {
      const isEdge = x === 0 || x === W - 1 || y === 0 || y === H - 1;
      if (isEdge) {
        const isDoor =
          (y === 0 && x >= 13 && x <= 16) ||
          (y === H - 1 && x >= 13 && x <= 16) ||
          (x === 0 && y >= 8 && y <= 11) ||
          (x === W - 1 && y >= 8 && y <= 11);
        row.push(isDoor ? 3 : 2);
      } else {
        row.push(1);
      }
    }
    tiles.push(row);
  }

  return {
    name,
    type,
    width: W,
    height: H,
    tiles,
    enemySpawns,
    playerSpawn: { x: 15, y: 17 },
  };
}

// --- Combat room: open arena, enemies scattered ---
export const COMBAT_ROOM_1: RoomTemplate = makeRoom(
  'combat',
  'Open Arena',
  [{ x: 10, y: 7 }, { x: 20, y: 7 }],
);

// --- Combat room: pillared hall with cover ---
export const COMBAT_ROOM_2: RoomTemplate = (() => {
  const room = makeRoom(
    'combat',
    'Pillared Hall',
    [{ x: 10, y: 8 }, { x: 20, y: 8 }, { x: 15, y: 12 }],
  );
  // Add pillar obstacles (walls inside the room)
  const pillars = [
    { x: 7, y: 5 },
    { x: 22, y: 5 },
    { x: 7, y: 14 },
    { x: 22, y: 14 },
  ];
  for (const p of pillars) {
    room.tiles[p.y][p.x] = 2;
    room.tiles[p.y + 1][p.x] = 2;
    room.tiles[p.y][p.x + 1] = 2;
    room.tiles[p.y + 1][p.x + 1] = 2;
  }
  return room;
})();

// --- Elite room: rift trainer commands a pre-made squad of three ---
// The squad roster is authored; positioning is computed at runtime from
// team roles and the player's entry side. The trainer NPC vanishes on victory.
export const ELITE_ROOM: RoomTemplate = (() => {
  const room = makeRoom('elite', 'Rift Warden\'s Sanctum', []);
  room.eliteTeam = [
    { riftlingKey: 'pyreshell',    equipped: [0, 1] }, // fire anchor — melee frontline
    { riftlingKey: 'tidecrawler',  equipped: [0, 1] }, // water anchor — melee frontline
    { riftlingKey: 'thistlebound', equipped: [0, 2] }, // nature hunter — ranged backline
  ];
  return room;
})();

// --- Boss room: large open space ---
export const BOSS_ROOM: RoomTemplate = makeRoom(
  'boss',
  'Boss Arena',
  [{ x: 15, y: 7 }],
);

// --- Healing room: safe, no enemies ---
export const HEALING_ROOM: RoomTemplate = makeRoom('healing', 'Rift Spring');

// --- Recruit room: safe walk-in reward. ---
// No enemy spawns — the room contains 1-3 stationary riftlings (spawned at
// runtime by the scene from the branch's biome pool) that the player walks
// up to and chooses one to recruit.
export const RECRUIT_ROOM: RoomTemplate = makeRoom(
  'recruit',
  'Rift Gathering',
  [],
);

// --- Rift Shard room: safe, trinket reward ---
// Floating obsidian shrine chamber suspended over the purple rift void.
// The rectangle is carved into an octagonal apse by filling the corners
// with void (tile 2, renders as wang_15 purple swirl). Doors on all four
// sides are preserved so the dungeon generator can connect the room from
// any direction — DungeonScene masks inactive doors as walls at load.
export const RIFT_SHARD_ROOM: RoomTemplate = (() => {
  const room: RoomTemplate = {
    ...makeRoom('rift_shard', 'Rift Shard'),
    biome: 'dark_void',
  };
  const W = room.width;
  const H = room.height;

  const trim = (x: number, y: number) => { room.tiles[y][x] = 2; };

  // NW corner wedge
  for (let y = 1; y <= 5; y++) {
    for (let x = 1; x <= 6 - y; x++) trim(x, y);
  }
  // NE corner wedge
  for (let y = 1; y <= 5; y++) {
    for (let x = W - 2; x >= W - 7 + y; x--) trim(x, y);
  }
  // SW corner wedge
  for (let y = H - 2; y >= H - 6; y--) {
    const depth = y - 13;
    for (let x = 1; x <= depth; x++) trim(x, y);
  }
  // SE corner wedge
  for (let y = H - 2; y >= H - 6; y--) {
    const depth = y - 13;
    for (let x = W - 2; x >= W - 1 - depth; x--) trim(x, y);
  }

  room.playerSpawn = { x: 15, y: 16 };

  room.decorations = [
    // Outer altar plinths — large crystal formations anchor the four alcove
    // quadrants. Collide, so placed well clear of the N/S/E/W door lanes.
    { sprite: 'rift_crystal_formation', x: 7,  y: 5  },
    { sprite: 'rift_crystal_formation', x: 22, y: 5  },
    { sprite: 'rift_crystal_formation', x: 7,  y: 14 },
    { sprite: 'rift_crystal_formation', x: 22, y: 14 },

    // Inner wards — tall rift shards marking the sacred diamond around the
    // central trinket pedestal. Non-colliding so the player can approach freely.
    { sprite: 'rift_crystal_shard', x: 11, y: 6  },
    { sprite: 'rift_crystal_shard', x: 18, y: 6  },
    { sprite: 'rift_crystal_shard', x: 11, y: 13 },
    { sprite: 'rift_crystal_shard', x: 18, y: 13 },

    // Stone-set crystal outcrops in the apse alcove edges — wall-hugging
    // accents that reinforce the corner carve silhouette.
    { sprite: 'rift_crystal_outcrop', x: 3,  y: 3  },
    { sprite: 'rift_crystal_outcrop', x: 26, y: 3  },
    { sprite: 'rift_crystal_outcrop', x: 3,  y: 16 },
    { sprite: 'rift_crystal_outcrop', x: 26, y: 16 },

    // Small crystal clusters — scattered ambient shard fragments on the
    // obsidian floor, ground-level accents with no collision.
    { sprite: 'rift_crystal_cluster', x: 5,  y: 9  },
    { sprite: 'rift_crystal_cluster', x: 24, y: 9  },
    { sprite: 'rift_crystal_cluster', x: 5,  y: 10 },
    { sprite: 'rift_crystal_cluster', x: 24, y: 10 },
    { sprite: 'rift_crystal_cluster', x: 10, y: 2  },
    { sprite: 'rift_crystal_cluster', x: 19, y: 2  },
    { sprite: 'rift_crystal_cluster', x: 10, y: 17 },
    { sprite: 'rift_crystal_cluster', x: 19, y: 17 },

    // Stepping stones — ritual path flanking the approach from the south door.
    { sprite: 'stepping_stone', x: 13, y: 17 },
    { sprite: 'stepping_stone', x: 16, y: 17 },
    { sprite: 'stepping_stone', x: 13, y: 14 },
    { sprite: 'stepping_stone', x: 16, y: 14 },
  ];

  return applyOverride('rift_shard', {
    ...room,
    __editorKey: 'rift_shard',
  } as RoomTemplate & { __editorKey: string });
})();

// --- Start room: player entry, no enemies ---
export const START_ROOM: RoomTemplate = applyOverride('start', {
  ...makeRoom('start', 'Rift Entrance'),
  biome: 'dark_grass_cliff',
  __editorKey: 'start',
} as RoomTemplate & { __editorKey: string });

// --- Water combat room: river crossing with pond ---
// Tile 4 = walkable water (renders as upper terrain but no collision)
export const WATER_COMBAT_ROOM: RoomTemplate = (() => {
  const W = 30;
  const H = 20;
  // 0=void, 1=floor, 2=wall(boundary), 3=door, 4=walkable water
  // Horizontal river across the center, pond in SW corner
  const layout: number[][] = [
    // y=0: top wall with north door
    [2,2,2,2,2,2,2,2,2,2,2,2,2,3,3,3,3,2,2,2,2,2,2,2,2,2,2,2,2,2],
    // y=1
    [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
    // y=2
    [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
    // y=3
    [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
    // y=4
    [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
    // y=5
    [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
    // y=6
    [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
    // y=7: river starts — slight curve
    [2,4,4,4,4,4,4,4,4,4,4,4,4,4,4,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
    // y=8: river center band
    [2,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,2],
    // y=9: river center band
    [2,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,2],
    // y=10: river center band
    [2,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,2],
    // y=11: river ends — slight curve
    [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,4,4,4,4,4,4,4,4,4,4,4,4,4,2],
    // y=12
    [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
    // y=13: pond area starts (SW corner)
    [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
    // y=14
    [2,1,1,4,4,4,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
    // y=15
    [2,1,4,4,4,4,4,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
    // y=16
    [2,1,4,4,4,4,4,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
    // y=17
    [2,1,1,4,4,4,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
    // y=18
    [2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2],
    // y=19: bottom wall with south door
    [2,2,2,2,2,2,2,2,2,2,2,2,2,3,3,3,3,2,2,2,2,2,2,2,2,2,2,2,2,2],
  ];

  return applyOverride('water_combat', {
    name: 'River Crossing',
    type: 'combat' as RoomType,
    width: W,
    height: H,
    tiles: layout,
    enemySpawns: [
      // North side of river
      { x: 8, y: 4 },
      { x: 22, y: 3 },
      // South side of river
      { x: 20, y: 14 },
      { x: 15, y: 15 },
    ],
    playerSpawn: { x: 15, y: 17 },
    biome: 'dark_grass_water' as Biome,
    __editorKey: 'water_combat',
  } as RoomTemplate & { __editorKey: string });
})();

// --- Dark Forest combat room: twisted grove with interior tree clumps ---
// Wall obstacles placed as small 2x2 clusters to read as individual tree stands
// and exercise the wang-tile transitions on interior edges, not just the perimeter.
// Each wall clump gets a tree sprite rendered on top so the purple wall reads
// as an actual tree cluster, plus scattered grass + a rift corruption node for
// environmental storytelling.
export const DARK_FOREST_ROOM: RoomTemplate = (() => {
  const room = makeRoom(
    'combat',
    'Twisted Grove',
    [{ x: 9, y: 6 }, { x: 20, y: 6 }, { x: 15, y: 13 }],
  );
  // Interior tree clumps (2x2 wall blocks, staggered, asymmetric)
  const clumps: { x: number; y: number }[] = [
    { x: 5,  y: 4  },
    { x: 23, y: 5  },
    { x: 12, y: 9  },
    { x: 18, y: 11 },
    { x: 6,  y: 13 },
    { x: 24, y: 13 },
  ];
  for (const c of clumps) {
    room.tiles[c.y][c.x]         = 2;
    room.tiles[c.y][c.x + 1]     = 2;
    room.tiles[c.y + 1][c.x]     = 2;
    room.tiles[c.y + 1][c.x + 1] = 2;
  }
  room.biome = 'dark_forest';
  room.decorations = [
    // One tree per clump, centered on the 2x2. Alternating species for variety.
    { sprite: 'dark_pine_tree',    x: 6,  y: 4.5  },
    { sprite: 'twisted_dark_tree', x: 24, y: 5.5  },
    { sprite: 'twisted_dark_tree', x: 13, y: 9.5  },
    { sprite: 'dark_pine_tree',    x: 19, y: 11.5 },
    { sprite: 'dark_pine_tree',    x: 7,  y: 13.5 },
    { sprite: 'twisted_dark_tree', x: 25, y: 13.5 },
    // Grass tufts scattered around the clump bases — tight clusters
    { sprite: 'tall_grass_dark', x: 4,  y: 6 },
    { sprite: 'tall_grass_dark', x: 5,  y: 7 },
    { sprite: 'tall_grass_dark', x: 8,  y: 5 },
    { sprite: 'tall_grass_dark', x: 22, y: 7 },
    { sprite: 'tall_grass_dark', x: 25, y: 7 },
    { sprite: 'tall_grass_dark', x: 14, y: 11 },
    { sprite: 'tall_grass_dark', x: 17, y: 13 },
    { sprite: 'tall_grass_dark', x: 20, y: 9 },
    { sprite: 'tall_grass_dark', x: 5,  y: 15 },
    { sprite: 'tall_grass_dark', x: 22, y: 15 },
    // One storytelling accent — rift node near center-west clump
    { sprite: 'rift_corruption_node', x: 14, y: 11 },
  ];
  return applyOverride('dark_forest', {
    ...room,
    __editorKey: 'dark_forest',
  } as RoomTemplate & { __editorKey: string });
})();

// --- Dark Forest test room: full 30x20 showcase for the biome. ---
// Used for direct-load iteration on the biome tileset AND the prop kit.
// Load via ?testRoom=dark_forest. Organized as four corner compositions plus
// a central focal point so you can judge each prop type side-by-side.
export const DARK_FOREST_TEST_ROOM: RoomTemplate = (() => {
  const room: RoomTemplate = {
    ...makeRoom('start', 'Dark Forest (Test)'),
    biome: 'dark_forest',
  };
  room.decorations = [
    // --- NW composition: dark pine cluster with grass underbrush ---
    { sprite: 'dark_pine_tree',  x: 4,  y: 3 },
    { sprite: 'dark_pine_tree',  x: 6,  y: 4 },
    { sprite: 'dark_pine_tree',  x: 3,  y: 5 },
    { sprite: 'tall_grass_dark', x: 5,  y: 6 },
    { sprite: 'tall_grass_dark', x: 7,  y: 5 },
    { sprite: 'tall_grass_dark', x: 4,  y: 7 },

    // --- NE composition: twisted tree + fallen hollow log story ---
    { sprite: 'twisted_dark_tree', x: 24, y: 3 },
    { sprite: 'twisted_dark_tree', x: 26, y: 4 },
    { sprite: 'hollow_log',        x: 23, y: 6 },
    { sprite: 'tall_grass_dark',   x: 22, y: 5 },
    { sprite: 'tall_grass_dark',   x: 25, y: 6 },
    { sprite: 'tall_grass_dark',   x: 27, y: 5 },

    // --- Center focal: corrupted tree with rift nodes + glowing mushroom ---
    { sprite: 'corrupted_tree',       x: 15, y: 9  },
    { sprite: 'rift_corruption_node', x: 13, y: 10 },
    { sprite: 'rift_corruption_node', x: 17, y: 10 },
    { sprite: 'glowing_mushroom',     x: 12, y: 8  },

    // --- SW composition: stepping stone trail through grass ---
    { sprite: 'stepping_stone', x: 3,  y: 14 },
    { sprite: 'stepping_stone', x: 4,  y: 15 },
    { sprite: 'stepping_stone', x: 5,  y: 16 },
    { sprite: 'stepping_stone', x: 6,  y: 17 },
    { sprite: 'tall_grass_dark', x: 2,  y: 13 },
    { sprite: 'tall_grass_dark', x: 7,  y: 14 },
    { sprite: 'tall_grass_dark', x: 3,  y: 17 },

    // --- SE composition: second twisted tree + mushroom accent ---
    { sprite: 'twisted_dark_tree', x: 25, y: 14 },
    { sprite: 'twisted_dark_tree', x: 27, y: 16 },
    { sprite: 'glowing_mushroom',  x: 23, y: 16 },
    { sprite: 'tall_grass_dark',   x: 22, y: 15 },
    { sprite: 'tall_grass_dark',   x: 26, y: 13 },
  ];
  return applyOverride('dark_forest_test', {
    ...room,
    __editorKey: 'dark_forest_test',
  } as RoomTemplate & { __editorKey: string });
})();

// --- Dark Plains combat room: open plains with bluff cover and ambush grass ---
// Swarm-oriented. Interior bluff clusters (tile 2 walls) act as tactical cover;
// dense wild grass scatter in the open sightlines between bluffs creates
// ambush pockets for riftlings to hide in. Bluffs are placed asymmetrically
// to avoid grid-feel and leave clear lanes for player movement.
export const PLAINS_ROOM: RoomTemplate = (() => {
  const room = makeRoom(
    'combat',
    'Windswept Plains',
    [{ x: 8, y: 5 }, { x: 22, y: 5 }, { x: 15, y: 12 }, { x: 6, y: 14 }, { x: 24, y: 14 }],
  );
  // NW bluff — L-shape, 4 tiles
  room.tiles[4][5]  = 2;
  room.tiles[4][6]  = 2;
  room.tiles[5][5]  = 2;
  room.tiles[5][6]  = 2;
  // NE bluff — small 2x2 plateau
  room.tiles[5][22] = 2;
  room.tiles[5][23] = 2;
  room.tiles[6][22] = 2;
  room.tiles[6][23] = 2;
  // Center-south bluff — horizontal ridge 3x2
  room.tiles[13][13] = 2;
  room.tiles[13][14] = 2;
  room.tiles[13][15] = 2;
  room.tiles[14][13] = 2;
  room.tiles[14][14] = 2;
  room.tiles[14][15] = 2;

  room.biome = 'dark_plains_bluff';
  room.decorations = [
    // NW grass cluster — thick ambush pocket east of NW bluff
    { sprite: 'tall_grass_wild', x: 8,  y: 3 },
    { sprite: 'tall_grass_wild', x: 9,  y: 4 },
    { sprite: 'tall_grass_wild', x: 10, y: 3 },
    { sprite: 'tall_grass_wild', x: 9,  y: 6 },
    { sprite: 'tall_grass_wild', x: 10, y: 5 },
    { sprite: 'tall_grass_dark', x: 11, y: 6 },
    { sprite: 'tall_grass_wild', x: 11, y: 4 },
    // NE grass cluster — mirrors NW, bridges to the NE bluff
    { sprite: 'tall_grass_wild', x: 19, y: 3 },
    { sprite: 'tall_grass_wild', x: 20, y: 4 },
    { sprite: 'tall_grass_wild', x: 21, y: 3 },
    { sprite: 'tall_grass_wild', x: 19, y: 5 },
    { sprite: 'tall_grass_wild', x: 20, y: 7 },
    { sprite: 'tall_grass_dark', x: 18, y: 6 },
    // Central corridor — sparse to keep sightlines, grass trailing off the ridge
    { sprite: 'tall_grass_wild', x: 13, y: 9 },
    { sprite: 'tall_grass_wild', x: 16, y: 9 },
    { sprite: 'tall_grass_wild', x: 10, y: 10 },
    { sprite: 'tall_grass_wild', x: 18, y: 10 },
    { sprite: 'tall_grass_wild', x: 12, y: 11 },
    { sprite: 'tall_grass_wild', x: 17, y: 11 },
    // Rift corruption node at the ridge's east end — storytelling focal point
    { sprite: 'rift_corruption_node', x: 16, y: 14 },
    { sprite: 'glowing_mushroom',     x: 16, y: 12 },
    // SW grass cluster — dense, hides the SW corner. Enemy spawns here.
    { sprite: 'tall_grass_wild', x: 3,  y: 12 },
    { sprite: 'tall_grass_wild', x: 4,  y: 13 },
    { sprite: 'tall_grass_wild', x: 5,  y: 12 },
    { sprite: 'tall_grass_wild', x: 3,  y: 14 },
    { sprite: 'tall_grass_dark', x: 5,  y: 15 },
    { sprite: 'tall_grass_wild', x: 7,  y: 15 },
    { sprite: 'tall_grass_wild', x: 4,  y: 16 },
    // SE grass cluster — includes hollow log story beat
    { sprite: 'tall_grass_wild', x: 22, y: 12 },
    { sprite: 'tall_grass_wild', x: 22, y: 13 },
    { sprite: 'tall_grass_wild', x: 25, y: 12 },
    { sprite: 'tall_grass_dark', x: 26, y: 14 },
    { sprite: 'tall_grass_wild', x: 21, y: 15 },
    { sprite: 'tall_grass_wild', x: 26, y: 16 },
    { sprite: 'hollow_log',      x: 24, y: 11 },
    // South-central grass trailing off the center bluff toward player spawn
    { sprite: 'tall_grass_wild', x: 11, y: 16 },
    { sprite: 'tall_grass_wild', x: 13, y: 17 },
    { sprite: 'tall_grass_wild', x: 18, y: 17 },
    { sprite: 'tall_grass_dark', x: 19, y: 16 },
    // Stepping stones trailing in from the south edge — "you came from here"
    { sprite: 'stepping_stone', x: 15, y: 18 },
    { sprite: 'stepping_stone', x: 14, y: 16 },
    { sprite: 'stepping_stone', x: 16, y: 15 },
  ];
  return applyOverride('plains', {
    ...room,
    __editorKey: 'plains',
  } as RoomTemplate & { __editorKey: string });
})();

// --- Dark Plains test room: biome showcase for ?testRoom=plains ---
// Denser scatter and more bluff variety than the combat room so you can
// judge the biome, the grass scatter, and the bluff walls side-by-side.
export const PLAINS_TEST_ROOM: RoomTemplate = (() => {
  const room: RoomTemplate = {
    ...makeRoom('start', 'Windswept Plains (Test)'),
    biome: 'dark_plains_bluff',
  };
  // Bluff showcase — one cluster per quadrant, varied shapes
  // NW: L-shape
  room.tiles[3][4]  = 2;
  room.tiles[3][5]  = 2;
  room.tiles[4][4]  = 2;
  // NE: small plateau
  room.tiles[3][24] = 2;
  room.tiles[3][25] = 2;
  room.tiles[4][24] = 2;
  room.tiles[4][25] = 2;
  // Center: isolated outcrop
  room.tiles[9][15] = 2;
  room.tiles[10][15] = 2;
  // SW: single-tile bluff
  room.tiles[15][5] = 2;
  // SE: ridge
  room.tiles[15][23] = 2;
  room.tiles[15][24] = 2;
  room.tiles[16][23] = 2;
  room.tiles[16][24] = 2;

  room.decorations = [
    // NW composition — dense wild grass around the L-bluff + hollow log story
    { sprite: 'tall_grass_wild', x: 3,  y: 5  },
    { sprite: 'tall_grass_wild', x: 6,  y: 3  },
    { sprite: 'tall_grass_wild', x: 7,  y: 4  },
    { sprite: 'tall_grass_wild', x: 5,  y: 6  },
    { sprite: 'tall_grass_dark', x: 3,  y: 7  },
    { sprite: 'tall_grass_wild', x: 8,  y: 5  },
    { sprite: 'tall_grass_wild', x: 2,  y: 4  },
    { sprite: 'tall_grass_wild', x: 7,  y: 6  },
    { sprite: 'hollow_log',      x: 8,  y: 3  },

    // NE composition — wild grass + darker accent + glowing mushroom focal
    { sprite: 'tall_grass_wild', x: 22, y: 3  },
    { sprite: 'tall_grass_wild', x: 23, y: 5  },
    { sprite: 'tall_grass_wild', x: 26, y: 5  },
    { sprite: 'tall_grass_wild', x: 24, y: 6  },
    { sprite: 'tall_grass_dark', x: 22, y: 6  },
    { sprite: 'tall_grass_wild', x: 27, y: 4  },
    { sprite: 'tall_grass_wild', x: 26, y: 7  },
    { sprite: 'glowing_mushroom', x: 23, y: 7  },

    // Central scatter around the outcrop — the focal point
    { sprite: 'tall_grass_wild', x: 13, y: 8  },
    { sprite: 'tall_grass_wild', x: 17, y: 8  },
    { sprite: 'tall_grass_wild', x: 14, y: 11 },
    { sprite: 'tall_grass_wild', x: 16, y: 11 },
    { sprite: 'rift_corruption_node', x: 15, y: 12 },
    { sprite: 'tall_grass_dark',  x: 13, y: 11 },
    { sprite: 'tall_grass_wild',  x: 17, y: 11 },
    // Stepping stone trail from center outcrop trailing south
    { sprite: 'stepping_stone',  x: 15, y: 13 },
    { sprite: 'stepping_stone',  x: 14, y: 14 },
    { sprite: 'stepping_stone',  x: 16, y: 15 },

    // SW composition — dense ambush patch
    { sprite: 'tall_grass_wild', x: 3,  y: 14 },
    { sprite: 'tall_grass_wild', x: 4,  y: 15 },
    { sprite: 'tall_grass_wild', x: 6,  y: 14 },
    { sprite: 'tall_grass_wild', x: 7,  y: 16 },
    { sprite: 'tall_grass_dark', x: 3,  y: 16 },
    { sprite: 'tall_grass_wild', x: 5,  y: 17 },
    { sprite: 'tall_grass_wild', x: 2,  y: 12 },
    { sprite: 'tall_grass_wild', x: 7,  y: 13 },

    // SE composition — grass trailing off the ridge
    { sprite: 'tall_grass_wild', x: 21, y: 14 },
    { sprite: 'tall_grass_wild', x: 22, y: 17 },
    { sprite: 'tall_grass_wild', x: 25, y: 17 },
    { sprite: 'tall_grass_dark', x: 26, y: 15 },
    { sprite: 'tall_grass_wild', x: 20, y: 17 },
    { sprite: 'tall_grass_wild', x: 27, y: 13 },
    { sprite: 'tall_grass_wild', x: 21, y: 12 },
    { sprite: 'glowing_mushroom', x: 25, y: 13 },
  ];
  return applyOverride('plains_test', {
    ...room,
    __editorKey: 'plains_test',
  } as RoomTemplate & { __editorKey: string });
})();

// --- Dark Lava combat room: "Rift Forge Scar" ---
// Combat arena built around a dramatic central lava chasm with a stone
// bridge. Enemies spawn on the far (north) side of the chasm, pulling the
// player across the bridge or around the flanks to engage. The chasm
// creates clear tactical geometry: defenders can funnel enemies at the
// bridge, or force them to commit to a flank.
export const LAVA_ROOM: RoomTemplate = (() => {
  const room = makeRoom(
    'combat',
    'Rift Forge Scar',
    // Enemy spawns: 2 north of chasm (force bridge crossing or flank),
    // 1 each on east/west flanks (pressure the player while crossing),
    // 1 mid-south to threaten the player's safe zone.
    [
      { x: 10, y: 4 },
      { x: 19, y: 4 },
      { x: 5,  y: 10 },
      { x: 24, y: 10 },
      { x: 15, y: 14 },
    ],
  );
  room.biome = 'dark_lava';

  // Central lava chasm — same shape as the test room, dead center with a
  // 2-tile stone bridge between the two halves at cols 14-15.
  const centralChasm: [number, number][] = [
    // West half
    [8, 9], [8, 10], [8, 11], [8, 12], [8, 13],
    [9, 9], [9, 10], [9, 11], [9, 12], [9, 13],
    [10, 9], [10, 10], [10, 11], [10, 12], [10, 13],
    [11, 10], [11, 11], [11, 12],
    // East half
    [8, 16], [8, 17], [8, 18], [8, 19], [8, 20],
    [9, 16], [9, 17], [9, 18], [9, 19], [9, 20],
    [10, 16], [10, 17], [10, 18], [10, 19], [10, 20],
    [11, 17], [11, 18], [11, 19],
  ];
  // NW accent pool — small flank hazard, forces enemy pathing
  const nwAccent: [number, number][] = [
    [4, 5], [4, 6],
    [5, 5], [5, 6],
  ];
  // SE accent pool — mirrors NW for symmetry
  const seAccent: [number, number][] = [
    [14, 23], [14, 24],
    [15, 23], [15, 24],
  ];

  for (const [y, x] of [...centralChasm, ...nwAccent, ...seAccent]) {
    room.tiles[y][x] = 2;
  }

  room.decorations = [
    // Rift corruption flanking the chasm — story focal
    { sprite: 'rift_corruption_node', x: 15, y: 6  },
    { sprite: 'rift_corruption_node', x: 15, y: 13 },
    // Glowing mushrooms provide cool-tone ambient against the hot lava
    { sprite: 'glowing_mushroom',     x: 11, y: 12 },
    { sprite: 'glowing_mushroom',     x: 19, y: 7  },
    { sprite: 'glowing_mushroom',     x: 4,  y: 12 },
    { sprite: 'glowing_mushroom',     x: 25, y: 12 },
    // Periphery rift nodes for visual variety and scale reference
    { sprite: 'rift_corruption_node', x: 8,  y: 3  },
    { sprite: 'rift_corruption_node', x: 22, y: 15 },
  ];

  return applyOverride('lava', {
    ...room,
    __editorKey: 'lava',
  } as RoomTemplate & { __editorKey: string });
})();

// --- Dark Lava test room: "Rift Forge Scar" biome showcase ---
// Cracked volcanic stone battlefield with a single dramatic lava chasm at its
// heart. Lava uses tile type 2 (wall) so it renders as wang_15 (molten lava)
// and blocks collision — the player cannot walk through the molten flow.
//
// Design philosophy: interior lava is kept at least 3 tiles from every room
// edge, leaving a thick walkable stone buffer ring. Combined with the
// perimeter (which the engine renders as lava wall in this biome), this
// frames the arena as "a stone battlefield on the edge of a rift scar"
// rather than "a cage of lava". One central focal chasm + two small accent
// pools give the eye clear hierarchy and let the cliff-drop wang tiles shine.
// Load via ?testRoom=dark_lava.
export const LAVA_TEST_ROOM: RoomTemplate = (() => {
  const room: RoomTemplate = {
    ...makeRoom('start', 'Rift Forge Scar (Test)'),
    biome: 'dark_lava',
  };

  // Central lava chasm — the dramatic focal feature. 4 tiles tall x 8 wide,
  // split into two connected pools with a narrow stone bridge at col 14-15.
  // Placed dead center so the cliff drops are visible from every approach.
  const centralChasm = [
    // West half of chasm
    [8, 9], [8, 10], [8, 11], [8, 12], [8, 13],
    [9, 9], [9, 10], [9, 11], [9, 12], [9, 13],
    [10, 9], [10, 10], [10, 11], [10, 12], [10, 13],
    [11, 10], [11, 11], [11, 12],
    // East half of chasm
    [8, 16], [8, 17], [8, 18], [8, 19], [8, 20],
    [9, 16], [9, 17], [9, 18], [9, 19], [9, 20],
    [10, 16], [10, 17], [10, 18], [10, 19], [10, 20],
    [11, 17], [11, 18], [11, 19],
  ];

  // NW accent pool — small 2x2, well away from perimeter (min col 5, min row 4)
  const nwAccent = [
    [4, 5], [4, 6],
    [5, 5], [5, 6],
  ];

  // SE accent pool — mirror, small 2x2
  const seAccent = [
    [14, 23], [14, 24],
    [15, 23], [15, 24],
  ];

  for (const [y, x] of [...centralChasm, ...nwAccent, ...seAccent]) {
    room.tiles[y][x] = 2;
  }

  // Rift corruption nodes flanking the central chasm — story focal point.
  // Glowing mushrooms scattered on the stone battlefield for scale + ambient.
  room.decorations = [
    // Flanking the central chasm (north and south edges of the bridge)
    { sprite: 'rift_corruption_node', x: 15, y: 6 },
    { sprite: 'rift_corruption_node', x: 15, y: 13 },
    { sprite: 'glowing_mushroom',     x: 11, y: 12 },
    { sprite: 'glowing_mushroom',     x: 19, y: 7  },
    // Ambient accents around the battlefield periphery (away from perimeter)
    { sprite: 'glowing_mushroom',     x: 4,  y: 12 },
    { sprite: 'glowing_mushroom',     x: 25, y: 12 },
    { sprite: 'rift_corruption_node', x: 8,  y: 3  },
    { sprite: 'rift_corruption_node', x: 22, y: 15 },
  ];

  return applyOverride('dark_lava', {
    ...room,
    __editorKey: 'dark_lava',
  } as RoomTemplate & { __editorKey: string });
})();

// --- Dark Badlands test room: biome showcase for ?testRoom=dark_badlands ---
// Warm-toned rocky biome — cracked desert floor with dark basalt boulder
// outcrops. Home for earth/rock riftlings. The walls are scattered boulder
// clusters rather than a continuous ridge, so the arena reads as "open
// badlands with cover" instead of a walled canyon.
export const BADLANDS_TEST_ROOM: RoomTemplate = (() => {
  const room: RoomTemplate = {
    ...makeRoom('start', 'Sunbleached Badlands (Test)'),
    biome: 'dark_badlands',
  };
  // NW boulder cluster — chunky L
  room.tiles[3][4]  = 2;
  room.tiles[3][5]  = 2;
  room.tiles[4][4]  = 2;
  // N-center isolated pair
  room.tiles[3][14] = 2;
  room.tiles[4][14] = 2;
  // NE boulder cluster — small 2x2
  room.tiles[3][24] = 2;
  room.tiles[3][25] = 2;
  room.tiles[4][24] = 2;
  room.tiles[4][25] = 2;
  // Center outcrop — single focal boulder
  room.tiles[9][15] = 2;
  room.tiles[10][15] = 2;
  // SW cluster
  room.tiles[14][5] = 2;
  room.tiles[15][5] = 2;
  room.tiles[15][6] = 2;
  // SE ridge
  room.tiles[15][22] = 2;
  room.tiles[15][23] = 2;
  room.tiles[16][22] = 2;
  room.tiles[16][23] = 2;
  room.tiles[16][24] = 2;

  room.decorations = [
    // NW composition — cracked boulder anchor + cluster + small scatter
    { sprite: 'badlands_cracked_boulder', x: 8,  y: 5  },
    { sprite: 'badlands_rock_cluster',    x: 10, y: 6  },
    { sprite: 'badlands_small_rock',      x: 7,  y: 7  },
    { sprite: 'badlands_small_rock',      x: 9,  y: 8  },
    // N-center — rubble trailing from the isolated bluff pair
    { sprite: 'badlands_small_rock',      x: 13, y: 6  },
    { sprite: 'badlands_rock_cluster',    x: 15, y: 7  },
    { sprite: 'badlands_small_rock',      x: 16, y: 5  },
    // NE composition — boulder flanking the 2x2 bluff
    { sprite: 'badlands_cracked_boulder', x: 21, y: 6  },
    { sprite: 'badlands_small_rock',      x: 22, y: 8  },
    { sprite: 'badlands_rock_cluster',    x: 19, y: 4  },
    // Center — accent around the focal boulder
    { sprite: 'badlands_small_rock',      x: 14, y: 10 },
    { sprite: 'badlands_small_rock',      x: 17, y: 11 },
    { sprite: 'badlands_rock_cluster',    x: 12, y: 12 },
    // SW composition
    { sprite: 'badlands_cracked_boulder', x: 8,  y: 14 },
    { sprite: 'badlands_small_rock',      x: 3,  y: 13 },
    { sprite: 'badlands_small_rock',      x: 10, y: 16 },
    // SE composition — cluster bridging the ridge
    { sprite: 'badlands_rock_cluster',    x: 20, y: 14 },
    { sprite: 'badlands_small_rock',      x: 25, y: 15 },
    { sprite: 'badlands_small_rock',      x: 18, y: 16 },
    // Sparse ambient scatter
    { sprite: 'badlands_small_rock',      x: 5,  y: 17 },
    { sprite: 'badlands_small_rock',      x: 24, y: 3  },
  ];

  return applyOverride('dark_badlands', {
    ...room,
    __editorKey: 'dark_badlands',
  } as RoomTemplate & { __editorKey: string });
})();

// --- Dark Jungle test room: biome showcase for ?testRoom=dark_jungle ---
// Dense rift-jungle with tangled vine thickets for cover. Wall clusters are
// "impassable overgrowth" rather than stone — arena reads as scattered
// thickets in a mossy clearing. Home for vine/ambush-type riftlings.
export const JUNGLE_TEST_ROOM: RoomTemplate = (() => {
  const room: RoomTemplate = {
    ...makeRoom('start', 'Tangled Rift Hollow (Test)'),
    biome: 'dark_jungle',
  };
  // NW thicket
  room.tiles[4][5]  = 2;
  room.tiles[4][6]  = 2;
  room.tiles[5][5]  = 2;
  // N-center vine pillar
  room.tiles[3][14] = 2;
  room.tiles[3][15] = 2;
  room.tiles[4][15] = 2;
  // NE thicket
  room.tiles[4][23] = 2;
  room.tiles[5][23] = 2;
  room.tiles[5][24] = 2;
  // Center focal thicket — forces flanking
  room.tiles[9][14] = 2;
  room.tiles[9][15] = 2;
  room.tiles[10][14] = 2;
  room.tiles[10][15] = 2;
  // SW thicket
  room.tiles[14][5] = 2;
  room.tiles[15][5] = 2;
  room.tiles[15][6] = 2;
  // SE thicket
  room.tiles[14][23] = 2;
  room.tiles[15][23] = 2;
  room.tiles[15][24] = 2;

  room.decorations = [
    // NW composition — twisted tree anchor with fern understory and shrooms
    { sprite: 'twisted_dark_tree', x: 3,  y: 6  },
    { sprite: 'giant_fern',        x: 7,  y: 8  },
    { sprite: 'glowing_mushroom',  x: 8,  y: 5  },
    { sprite: 'tall_grass_dark',   x: 5,  y: 9  },
    { sprite: 'tall_grass_dark',   x: 3,  y: 9  },
    // N-center — hollow log beside the vine pillar, shrooms on the dark side
    { sprite: 'hollow_log',        x: 13, y: 6  },
    { sprite: 'giant_fern',        x: 11, y: 5  },
    { sprite: 'glowing_mushroom',  x: 17, y: 4  },
    // NE composition — corrupted tree focal, ferns spilling out
    { sprite: 'corrupted_tree',    x: 21, y: 6  },
    { sprite: 'giant_fern',        x: 25, y: 5  },
    { sprite: 'tall_grass_dark',   x: 24, y: 8  },
    { sprite: 'glowing_mushroom',  x: 22, y: 8  },
    // Center focal thicket — ring of ferns and shrooms around the cover pillar
    { sprite: 'giant_fern',        x: 12, y: 11 },
    { sprite: 'giant_fern',        x: 17, y: 11 },
    { sprite: 'glowing_mushroom',  x: 14, y: 12 },
    { sprite: 'tall_grass_dark',   x: 16, y: 8  },
    // SW composition — fallen log anchor + understory
    { sprite: 'hollow_log',        x: 3,  y: 13 },
    { sprite: 'giant_fern',        x: 7,  y: 14 },
    { sprite: 'glowing_mushroom',  x: 5,  y: 15 },
    { sprite: 'tall_grass_dark',   x: 9,  y: 16 },
    // SE composition — twisted tree pair with ferns
    { sprite: 'twisted_dark_tree', x: 20, y: 13 },
    { sprite: 'giant_fern',        x: 25, y: 14 },
    { sprite: 'tall_grass_dark',   x: 22, y: 16 },
    { sprite: 'glowing_mushroom',  x: 18, y: 15 },
    // Sparse ambient scatter across the open floor
    { sprite: 'tall_grass_dark',   x: 10, y: 14 },
    { sprite: 'tall_grass_dark',   x: 19, y: 9  },
    { sprite: 'glowing_mushroom',  x: 26, y: 11 },
  ];

  return applyOverride('dark_jungle', {
    ...room,
    __editorKey: 'dark_jungle',
  } as RoomTemplate & { __editorKey: string });
})();

// --- Hub room: narrow vertical hall ---
//
// Layout (22 wide, 26 tall). Branches hang off the east and west walls
// (3 per side = 6 regular branches, slots 0-5). The north wall carries
// two special doors: the key path (slot 6) and the boss (slot 7), both
// locked at run start and unlocked by the scene via refreshHubDoorStates
// based on dungeon progress. The south end is the one-way intro return
// door — walkable on entry but no scene zone, which is how we enforce
// "no backtrack to intro". A healing fountain sits at the vertical
// center of the hall and resets every time the player returns here.
//
//        [key path] [boss]
//   +----------------------+
//   |                      |
// [slot 0]            [slot 3]
//   |                      |
//   |                      |
// [slot 1]    (heal)   [slot 4]
//   |                      |
//   |                      |
// [slot 2]            [slot 5]
//   |                      |
//   +----------------------+
//            [intro return]
export const HUB_ROOM: RoomTemplate = (() => {
  const W = 22;
  const H = 26;
  // Authored door positions. Slots 0-5 are regular branches (HUB_SLOT_LAYOUTS
  // in dungeon.ts has the matching entry-room offsets). Slots 6 and 7 are
  // the key-path and boss doors — they live on the north wall and are
  // placed/unlocked by dungeon.ts independently of the regular slot pool.
  const slots: Array<{ slot: number; tx: number; ty: number }> = [
    { slot: 0, tx: 0,      ty: 5  }, // W-top
    { slot: 1, tx: 0,      ty: 13 }, // W-mid
    { slot: 2, tx: 0,      ty: 20 }, // W-bot
    { slot: 3, tx: W - 1,  ty: 5  }, // E-top
    { slot: 4, tx: W - 1,  ty: 13 }, // E-mid
    { slot: 5, tx: W - 1,  ty: 20 }, // E-bot
    { slot: 6, tx: 6,      ty: 0  }, // N-left — key path
    { slot: 7, tx: 14,     ty: 0  }, // N-right — boss
  ];
  // Intro return door (south-center). One-way; scene does not create a zone.
  const introDoorX = 10;
  const introDoorY = H - 1;

  const doorSet = new Set<string>();
  // Side-wall doors (slots 0-5, on x=0 and x=W-1) are 2 tiles tall.
  // North-wall doors (slots 6-7, on y=0) are 2 tiles wide.
  for (const s of slots) {
    doorSet.add(`${s.tx},${s.ty}`);
    if (s.ty === 0 || s.ty === H - 1) {
      doorSet.add(`${s.tx + 1},${s.ty}`);
    } else {
      doorSet.add(`${s.tx},${s.ty + 1}`);
    }
  }
  // Intro return door is 2 tiles wide on the south wall.
  doorSet.add(`${introDoorX},${introDoorY}`);
  doorSet.add(`${introDoorX + 1},${introDoorY}`);

  const tiles: number[][] = [];
  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) {
      const isEdge = x === 0 || x === W - 1 || y === 0 || y === H - 1;
      if (isEdge) {
        row.push(doorSet.has(`${x},${y}`) ? 3 : 2);
      } else {
        row.push(1);
      }
    }
    tiles.push(row);
  }

  // Hand-authored path mask. The hub renders as a forest clearing with
  // a dirt-trail wang overlay on top of the dark_forest grass, leading
  // from the central rift-crystal spring out to every door slot.
  //
  //        [slot 6]   [slot 7]
  //     +-----T------T-----+
  //     |     |      |     |
  //   [s0]----+      +---[s3]
  //     |          (plaza)  |
  //   [s1]----+  [spring]   [s4]
  //     |          +-----   |
  //   [s2]----+      +---[s5]
  //     |     |            |
  //     +-----S------+-----+
  //         [intro return]
  const paths: number[][] = [];
  for (let y = 0; y < H; y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) row.push(0);
    paths.push(row);
  }
  const mark = (x: number, y: number) => {
    if (x >= 0 && x < W && y >= 0 && y < H) paths[y][x] = 1;
  };
  // 5x5 plaza around the rift-crystal spring at (11, 13)
  for (let y = 11; y <= 15; y++) {
    for (let x = 9; x <= 13; x++) mark(x, y);
  }
  // West trunk: plaza -> west spine along y=13
  for (let x = 1; x <= 8; x++) mark(x, 13);
  // West spine: vertical corridor connecting slots 0/1/2
  for (let y = 5; y <= 21; y++) mark(1, y);
  mark(2, 5); mark(2, 6); // widen the slot-0 landing
  mark(2, 13); mark(2, 14); // widen the slot-1 landing
  mark(2, 20); mark(2, 21); // widen the slot-2 landing
  // East trunk: plaza -> east spine along y=13
  for (let x = 14; x <= 20; x++) mark(x, 13);
  // East spine: vertical corridor connecting slots 3/4/5
  for (let y = 5; y <= 21; y++) mark(20, y);
  mark(19, 5); mark(19, 6);
  mark(19, 13); mark(19, 14);
  mark(19, 20); mark(19, 21);
  // North trunk: plaza -> north wall along x=11
  for (let y = 1; y <= 10; y++) mark(11, y);
  // North branches east and west along y=1 to reach slots 6 and 7
  for (let x = 6; x <= 15; x++) mark(x, 1);
  mark(6, 2); mark(7, 2); // widen slot-6 landing
  mark(14, 2); mark(15, 2); // widen slot-7 landing
  // South trunk: plaza -> intro return along x=11
  for (let y = 16; y <= 24; y++) mark(11, y);
  mark(10, 23); mark(10, 24); // widen the intro landing

  // Decorative props — hand-placed corner groves, mid-wall tree accents,
  // rift-crystal shards ringing the spring, and a few understory details.
  // All coordinates avoid path tiles except the plaza crystals, which sit
  // on path corners around the spring by design.
  const decorations: Decoration[] = [
    // NW grove
    { sprite: 'twisted_dark_tree', x: 4,  y: 4  },
    { sprite: 'dark_pine_tree',    x: 6,  y: 3  },
    { sprite: 'twisted_dark_tree', x: 3,  y: 7  },
    // NE grove
    { sprite: 'dark_pine_tree',    x: 17, y: 4  },
    { sprite: 'twisted_dark_tree', x: 19, y: 3  },
    { sprite: 'dark_pine_tree',    x: 18, y: 7  },
    // SW grove
    { sprite: 'twisted_dark_tree', x: 4,  y: 23 },
    { sprite: 'dark_pine_tree',    x: 6,  y: 24 },
    { sprite: 'twisted_dark_tree', x: 3,  y: 18 },
    // SE grove
    { sprite: 'dark_pine_tree',    x: 17, y: 23 },
    { sprite: 'twisted_dark_tree', x: 19, y: 24 },
    { sprite: 'dark_pine_tree',    x: 18, y: 18 },
    // Mid-wall accents — fill the gaps between door spokes so the clearing
    // reads as a bounded grove, not an empty square.
    { sprite: 'hollow_log',     x: 5,  y: 10 },
    { sprite: 'hollow_log',     x: 17, y: 16 },
    { sprite: 'corrupted_tree', x: 4,  y: 14 },
    { sprite: 'corrupted_tree', x: 18, y: 14 },
    // Understory detail — glowing mushrooms near the groves
    { sprite: 'glowing_mushroom', x: 5,  y: 6  },
    { sprite: 'glowing_mushroom', x: 17, y: 6  },
    { sprite: 'glowing_mushroom', x: 5,  y: 21 },
    { sprite: 'glowing_mushroom', x: 16, y: 21 },
    // Rift-crystal shards ringing the spring at the plaza corners. Non-
    // colliding so the player can walk onto any plaza tile to trigger heal.
    { sprite: 'rift_crystal_shard',   x: 9,  y: 11 },
    { sprite: 'rift_crystal_shard',   x: 13, y: 11 },
    { sprite: 'rift_crystal_shard',   x: 9,  y: 15 },
    { sprite: 'rift_crystal_shard',   x: 13, y: 15 },
    { sprite: 'rift_crystal_cluster', x: 11, y: 11 },
    { sprite: 'rift_crystal_cluster', x: 11, y: 15 },
  ];

  const base: RoomTemplate = {
    name: 'Hub',
    type: 'hub',
    width: W,
    height: H,
    tiles,
    biome: 'dark_forest',
    paths,
    decorations,
    enemySpawns: [],
    // Arrival from the intro puts the player near the south door — spawn
    // just north of the intro doorway so they step into the hall.
    playerSpawn: { x: 10, y: 23 },
    hubDoorSlots: slots,
  };
  return applyOverride('hub', {
    ...base,
    __editorKey: 'hub',
  } as RoomTemplate & { __editorKey: string });
})();

// Named test rooms — used by direct-load debug mode (?testRoom=<key>).
// Add new entries here when you want a room to be directly loadable from a URL.
export const TEST_ROOMS: Record<string, RoomTemplate> = {
  dark_forest: DARK_FOREST_TEST_ROOM,
  plains: PLAINS_TEST_ROOM,
  dark_lava: LAVA_TEST_ROOM,
  lava: LAVA_ROOM,
  dark_badlands: BADLANDS_TEST_ROOM,
  dark_jungle: JUNGLE_TEST_ROOM,
  dark_void: RIFT_SHARD_ROOM,
  hub: HUB_ROOM,
};

// All templates by type for dungeon generation
export const ROOM_TEMPLATES: Record<RoomType, RoomTemplate[]> = {
  combat: [COMBAT_ROOM_1, COMBAT_ROOM_2, WATER_COMBAT_ROOM, DARK_FOREST_ROOM, PLAINS_ROOM, LAVA_ROOM],
  elite: [ELITE_ROOM],
  boss: [BOSS_ROOM],
  recruit: [RECRUIT_ROOM],
  healing: [HEALING_ROOM],
  rift_shard: [RIFT_SHARD_ROOM],
  start: [START_ROOM],
  hub: [HUB_ROOM],
};
