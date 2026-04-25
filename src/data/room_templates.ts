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
  /**
   * Tiles the door spans along its wall. Defaults to 2. Side-wall doors
   * (east/west) span vertically; north/south-wall doors span horizontally.
   */
  span?: number;
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
  /** Per-instance override: force this decoration to be non-colliding
   *  even if its catalog entry is collidable. Used e.g. for the hub
   *  spring crystals so the player can walk onto the healing plaza. */
  noCollide?: boolean;
}

/**
 * Non-interactive creature sprite placed as set dressing — e.g. the Rift
 * Elite watching from the back of the boss arena. Different from
 * `decorations` (which uses the prop catalog at `assets/objects/`) because
 * the texture is loaded from a creature sprite folder and we play an idle
 * animation on it. Static actors are non-combat — they don't take or deal
 * damage and aren't tracked by the combat manager.
 */
export interface StaticActor {
  /**
   * Texture/animation key prefix matching what BootScene loaded. e.g.
   * 'rift_elite' resolves to `rift_elite_<dir>` static rotation textures
   * and `rift_elite_idle_<dir>` idle animation keys.
   */
  sprite: string;
  /** Tile coords (fractional allowed) of the actor's foot position. */
  x: number;
  y: number;
  /** Facing direction. Defaults to 'south' (toward the player entry). */
  direction?: 'south' | 'east' | 'west' | 'north';
  /** Render scale multiplier on top of native sprite size. Default 0.85 (matches the player). */
  scale?: number;
  /**
   * If true, the actor has a static collision body so combat units can't
   * walk through them. Default true — they read as substantive presences,
   * not background art.
   */
  collides?: boolean;
}

/**
 * A pre-made enemy on an elite trainer's team. Unlike wild enemies (random
 * species, no moves), elite members reference a specific species and can
 * override the default equipped moves the player's leveling system would pick.
 */
export interface EliteTeamMember {
  riftlingKey: string;
  /** Indices into the species' moves array. Omit to use the species' first two moves. */
  equipped?: number[];
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
   * Non-interactive creature sprites placed as set dressing (e.g. the Rift
   * Elite presiding over the boss arena). Spawned with idle animations.
   */
  staticActors?: StaticActor[];
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

// --- Elite room: "Rift Convergence" ---
// Editable via F4 builder → saves to assets/rooms/elite.json.
// Base template provides dark_void biome, corner cuts, and starter
// decorations. Manual edits override everything on next reload.
export const ELITE_ROOM: RoomTemplate = applyOverride('elite', (() => {
  const room: RoomTemplate = {
    ...makeRoom('elite', 'Rift Convergence', []),
    biome: 'dark_void',
  };

  const W = room.width;   // 30
  const H = room.height;  // 20

  // Carve octagonal corners — 3-tile wedges into the void so the room
  // reads as a floating platform, not a rectangle.
  const trim = (x: number, y: number) => { room.tiles[y][x] = 2; };
  // NW
  for (let y = 1; y <= 3; y++)
    for (let x = 1; x <= 4 - y; x++) trim(x, y);
  // NE
  for (let y = 1; y <= 3; y++)
    for (let x = W - 2; x >= W - 5 + y; x--) trim(x, y);
  // SW
  for (let y = H - 2; y >= H - 4; y--) {
    const depth = H - 1 - y;
    for (let x = 1; x <= 4 - depth; x++) trim(x, y);
  }
  // SE
  for (let y = H - 2; y >= H - 4; y--) {
    const depth = H - 1 - y;
    for (let x = W - 2; x >= W - 5 + depth; x--) trim(x, y);
  }

  room.eliteTeam = [
    { riftlingKey: 'pyreshell',    equipped: [0, 1] },
    { riftlingKey: 'tidecrawler',  equipped: [0, 1] },
    { riftlingKey: 'thistlebound', equipped: [0, 2] },
  ];

  room.decorations = [
    // ── Outer frame: corner crystal formations ────────────────────────
    { sprite: 'rift_crystal_formation', x: 5,  y: 4 },
    { sprite: 'rift_crystal_formation', x: 24, y: 4 },
    { sprite: 'rift_crystal_formation', x: 5,  y: 15 },
    { sprite: 'rift_crystal_formation', x: 24, y: 15 },

    // ── Cardinal markers: mid-wall outcrops ───────────────────────────
    { sprite: 'rift_crystal_outcrop', x: 15,  y: 2 },
    { sprite: 'rift_crystal_outcrop', x: 3,   y: 10 },
    { sprite: 'rift_crystal_outcrop', x: 26,  y: 10 },
    { sprite: 'rift_crystal_outcrop', x: 15,  y: 17 },

    // ── Inner ritual boundary: glowing shards ─────────────────────────
    { sprite: 'rift_crystal_shard', x: 15,  y: 5 },
    { sprite: 'rift_crystal_shard', x: 9,   y: 10 },
    { sprite: 'rift_crystal_shard', x: 21,  y: 10 },
    { sprite: 'rift_crystal_shard', x: 15,  y: 14 },

    // ── Convergence circuit: corruption nodes ─────────────────────────
    { sprite: 'rift_corruption_node', x: 8,   y: 3 },
    { sprite: 'rift_corruption_node', x: 4,   y: 7 },
    { sprite: 'rift_corruption_node', x: 21,  y: 3 },
    { sprite: 'rift_corruption_node', x: 25,  y: 7 },
    { sprite: 'rift_corruption_node', x: 4,   y: 13 },
    { sprite: 'rift_corruption_node', x: 8,   y: 16 },
    { sprite: 'rift_corruption_node', x: 25,  y: 13 },
    { sprite: 'rift_corruption_node', x: 21,  y: 16 },
    { sprite: 'rift_corruption_node', x: 12,  y: 7 },
    { sprite: 'rift_corruption_node', x: 18,  y: 7 },
    { sprite: 'rift_corruption_node', x: 12,  y: 13 },
    { sprite: 'rift_corruption_node', x: 18,  y: 13 },

    // ── Bioluminescent life: glowing mushrooms ────────────────────────
    { sprite: 'glowing_mushroom', x: 2,   y: 5 },
    { sprite: 'glowing_mushroom', x: 27,  y: 5 },
    { sprite: 'glowing_mushroom', x: 2,   y: 14 },
    { sprite: 'glowing_mushroom', x: 27,  y: 14 },
    { sprite: 'glowing_mushroom', x: 8,   y: 9 },
    { sprite: 'glowing_mushroom', x: 22,  y: 11 },

    // ── Dimensional debris: boulders ──────────────────────────────────
    { sprite: 'badlands_cracked_boulder', x: 10, y: 12 },
    { sprite: 'badlands_cracked_boulder', x: 20, y: 7 },
  ];

  (room as RoomTemplate & { __editorKey: string }).__editorKey = 'elite';
  return room;
})());

// --- Boss room: the Rift Tyrant's containment crucible ---
// Narrative: the Rift Elite stands silent at the back of the arena, having
// captured and weaponized the Tyrant. The fight the player thinks they're
// having (Tyrant smash) is the fight the Elite wants them to have. The
// player only realizes who the real threat was after the Tyrant falls.
//
// Visual language: floating obsidian shrine over the rift void (`dark_void`
// biome reused from the Rift Shard chamber, so the boss room reads as the
// *true* core of that shrine motif). Crystal wards ring a central dais
// where the Tyrant spawns; the Elite stands at the north wall flanked by
// two unlit braziers. Toppled stone in the south half implies prior
// failed challengers and gives ranged riftlings sightline-breakers.
export const BOSS_ROOM: RoomTemplate = applyOverride('boss', (() => {
  const room: RoomTemplate = {
    ...makeRoom('boss', 'Boss Arena', [{ x: 15, y: 10 }]),
    biome: 'dark_void',
  };

  // Seal every door except the south entry — the Elite IS the wall to the
  // north, and there is no escape sideways. makeRoom places door tiles at
  // x=13..16 of y=0 (N), x=13..16 of y=H-1 (S), y=8..11 of x=0 (W) and
  // x=W-1 (E). Convert all but S to wall (tile 2).
  const W = room.width;
  const H = room.height;
  for (let x = 13; x <= 16; x++) room.tiles[0][x] = 2;             // N sealed
  for (let y = 8; y <= 11; y++) room.tiles[y][0] = 2;              // W sealed
  for (let y = 8; y <= 11; y++) room.tiles[y][W - 1] = 2;          // E sealed
  // South door at y=H-1, x=13..16 stays as tile 3 (player entry).

  room.eliteTeam = [
    { riftlingKey: 'rift_tyrant', equipped: [0, 1, 2], levelBonus: 2 },
  ];

  // The shadowy figure presiding over the fight — non-combatant. Anchors
  // the central north axis between two crystal-outcrop braziers.
  room.staticActors = [
    { sprite: 'rift_core', x: 15, y: 1, direction: 'south', collides: false, scale: 1.0 },
    { sprite: 'rift_elite', x: 15, y: 3, direction: 'south' },
  ];

  room.decorations = [
    // Elite's flanking braziers — frame the figure like a throne. Larger
    // outcrops than the dais wards so the back of the room reads as
    // visually heavier than the front.
    { sprite: 'rift_crystal_outcrop',  x: 12, y: 4 },
    { sprite: 'rift_crystal_outcrop',  x: 18, y: 4 },

    // ── Control thread: Elite → Tyrant ─────────────────────────────────
    //   y=5  bright cluster at Elite's feet — origin of the leash
    //   y=6  paired clusters offset slightly — energy radiating outward
    //   y=7  central cluster — the line continues
    //   y=8  paired clusters — energy converging
    //   y=9  bright cluster on the Tyrant's edge — the leash terminates here
    { sprite: 'rift_crystal_cluster',  x: 15, y: 5 },
    { sprite: 'rift_corruption_node',  x: 14.3, y: 6 },
    { sprite: 'rift_corruption_node',  x: 15.7, y: 6 },
    { sprite: 'rift_crystal_cluster',  x: 15, y: 7 },
    { sprite: 'rift_corruption_node',  x: 14.3, y: 8 },
    { sprite: 'rift_corruption_node',  x: 15.7, y: 8 },
    { sprite: 'rift_crystal_cluster',  x: 15, y: 9 },

    // Dais wards — four tall shards forming a containment ritual around
    // the Tyrant spawn at (15, 10). Walls of light, not walls of stone.
    { sprite: 'rift_crystal_shard',    x: 12, y: 9 },
    { sprite: 'rift_crystal_shard',    x: 18, y: 9 },
    { sprite: 'rift_crystal_shard',    x: 12, y: 12 },
    { sprite: 'rift_crystal_shard',    x: 18, y: 12 },

    // ── Lava: corruption made literal ──────────────────────────────────
    // Pools of molten rift-fire seeping through the cracked obsidian.
    // Densest at the Elite's flanks and beneath the dais (the leash heats
    // the floor under the Tyrant); thinning out toward the south entry.
    // This sells the "fiery" read and provides the warm element the rift
    // palette otherwise lacks.

    // Elite's flanking pools — heat radiates from where the Elite stands.
    { sprite: 'lava_pool', x: 10, y: 4 },
    { sprite: 'lava_pool', x: 11, y: 5 },
    { sprite: 'lava_pool', x: 19, y: 5 },
    { sprite: 'lava_pool', x: 20, y: 4 },

    // North corner edges — embers along the wall.
    { sprite: 'lava_pool', x: 2,  y: 5 },
    { sprite: 'lava_pool', x: 3,  y: 6 },
    { sprite: 'lava_pool', x: 26, y: 6 },
    { sprite: 'lava_pool', x: 27, y: 5 },

    // Around the dais — the leash heats the ritual floor.
    { sprite: 'lava_pool', x: 10, y: 10 },
    { sprite: 'lava_pool', x: 10, y: 11 },
    { sprite: 'lava_pool', x: 20, y: 10 },
    { sprite: 'lava_pool', x: 20, y: 11 },
    { sprite: 'lava_pool', x: 14, y: 13 },
    { sprite: 'lava_pool', x: 16, y: 13 },

    // Mid-arena edges — fingers of lava reaching into the player's space.
    { sprite: 'lava_pool', x: 2,  y: 11 },
    { sprite: 'lava_pool', x: 3,  y: 12 },
    { sprite: 'lava_pool', x: 27, y: 11 },
    { sprite: 'lava_pool', x: 26, y: 12 },

    // South thinning — fewer, fading toward the entry causeway.
    { sprite: 'lava_pool', x: 4,  y: 17 },
    { sprite: 'lava_pool', x: 25, y: 17 },

    // Outer corner anchors — large formations frame the arena, reinforce
    // the "this is a sacred/sealed space" silhouette.
    { sprite: 'rift_crystal_formation', x: 4,  y: 3 },
    { sprite: 'rift_crystal_formation', x: 25, y: 3 },
    { sprite: 'rift_crystal_formation', x: 4,  y: 16 },
    { sprite: 'rift_crystal_formation', x: 25, y: 16 },

    // Toppled stone in the south half — broken cover, hints at prior
    // failed challengers. Off-center, asymmetric on purpose.
    { sprite: 'badlands_cracked_boulder', x: 9,  y: 13 },
    { sprite: 'badlands_cracked_boulder', x: 22, y: 14 },
    { sprite: 'badlands_rock_cluster',    x: 7,  y: 15 },
    { sprite: 'badlands_rock_cluster',    x: 21, y: 12 },

    // Floor litter near the entry causeway — small fragments fading toward
    // the dais. Reinforces the "things break here" reading.
    { sprite: 'rift_crystal_cluster', x: 13, y: 16 },
    { sprite: 'rift_crystal_cluster', x: 17, y: 16 },
    { sprite: 'rift_crystal_cluster', x: 8,  y: 11 },
    { sprite: 'rift_crystal_cluster', x: 22, y: 11 },
  ];

  (room as RoomTemplate & { __editorKey: string }).__editorKey = 'boss';
  return room;
})());

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
  decorations: [],
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

// --- Dark Forest variant: "Choked Thicket" ---
// Close-quarters combat variant of the dark_forest biome. Where Twisted Grove
// uses 6 widely-spaced clumps with open sightlines, Choked Thicket packs 9
// smaller 2x2 tree clumps in a zig-zag pattern that forces the player and
// enemies into tight flanking lanes. Good for melee-heavy encounters.
export const CHOKED_THICKET_ROOM: RoomTemplate = (() => {
  const room = makeRoom(
    'combat',
    'Choked Thicket',
    [{ x: 10, y: 5 }, { x: 20, y: 5 }, { x: 15, y: 10 }, { x: 8, y: 14 }, { x: 22, y: 14 }],
  );
  const clumps: { x: number; y: number }[] = [
    { x: 3,  y: 3  },
    { x: 13, y: 3  },
    { x: 23, y: 3  },
    { x: 8,  y: 7  },
    { x: 18, y: 7  },
    { x: 4,  y: 12 },
    { x: 14, y: 11 },
    { x: 24, y: 11 },
    { x: 10, y: 15 },
    { x: 20, y: 15 },
  ];
  for (const c of clumps) {
    room.tiles[c.y][c.x]         = 2;
    room.tiles[c.y][c.x + 1]     = 2;
    room.tiles[c.y + 1][c.x]     = 2;
    room.tiles[c.y + 1][c.x + 1] = 2;
  }
  room.biome = 'dark_forest';
  room.decorations = [
    // Trees on each clump — alternating species for variety
    { sprite: 'dark_pine_tree',    x: 4,  y: 3.5  },
    { sprite: 'twisted_dark_tree', x: 14, y: 3.5  },
    { sprite: 'dark_pine_tree',    x: 24, y: 3.5  },
    { sprite: 'twisted_dark_tree', x: 9,  y: 7.5  },
    { sprite: 'dark_pine_tree',    x: 19, y: 7.5  },
    { sprite: 'twisted_dark_tree', x: 5,  y: 12.5 },
    { sprite: 'corrupted_tree',    x: 15, y: 11.5 },
    { sprite: 'twisted_dark_tree', x: 25, y: 11.5 },
    { sprite: 'dark_pine_tree',    x: 11, y: 15.5 },
    { sprite: 'dark_pine_tree',    x: 21, y: 15.5 },
    // Understory — glowing mushrooms in the deep pockets between clumps
    { sprite: 'glowing_mushroom',  x: 11, y: 5  },
    { sprite: 'glowing_mushroom',  x: 16, y: 9  },
    { sprite: 'glowing_mushroom',  x: 7,  y: 10 },
    { sprite: 'glowing_mushroom',  x: 20, y: 13 },
    // Hollow logs as secondary cover in the lanes
    { sprite: 'hollow_log',        x: 18, y: 10 },
    { sprite: 'hollow_log',        x: 8,  y: 3  },
    // Rift corruption as focal beat at the center of the thicket
    { sprite: 'rift_corruption_node', x: 15, y: 14 },
    // Grass tufts tight around the clump bases
    { sprite: 'tall_grass_dark', x: 6,  y: 5 },
    { sprite: 'tall_grass_dark', x: 12, y: 6 },
    { sprite: 'tall_grass_dark', x: 17, y: 4 },
    { sprite: 'tall_grass_dark', x: 22, y: 6 },
    { sprite: 'tall_grass_dark', x: 3,  y: 10 },
    { sprite: 'tall_grass_dark', x: 26, y: 9  },
    { sprite: 'tall_grass_dark', x: 9,  y: 13 },
    { sprite: 'tall_grass_dark', x: 18, y: 14 },
    { sprite: 'tall_grass_dark', x: 13, y: 17 },
    { sprite: 'tall_grass_dark', x: 23, y: 17 },
  ];
  return applyOverride('choked_thicket', {
    ...room,
    __editorKey: 'choked_thicket',
  } as RoomTemplate & { __editorKey: string });
})();

// --- Dark Jungle combat: "Rotwood Hollow" ---
// Promotes the jungle biome from test-only to the live combat pool. Central
// focal thicket (2x2) with four satellite vine pillars — ring layout that
// forces flanking plays. Ferns and glowing mushrooms layer the understory.
export const ROTWOOD_HOLLOW_ROOM: RoomTemplate = (() => {
  const room = makeRoom(
    'combat',
    'Rotwood Hollow',
    [{ x: 15, y: 4 }, { x: 6, y: 9 }, { x: 24, y: 9 }, { x: 10, y: 14 }, { x: 20, y: 14 }],
  );
  // Central 2x2 thicket — the focal cover
  room.tiles[9][14]  = 2;
  room.tiles[9][15]  = 2;
  room.tiles[10][14] = 2;
  room.tiles[10][15] = 2;
  // NW satellite pillar
  room.tiles[5][6]  = 2;
  room.tiles[6][6]  = 2;
  // NE satellite pillar
  room.tiles[5][23] = 2;
  room.tiles[6][23] = 2;
  // SW satellite pillar
  room.tiles[13][6] = 2;
  room.tiles[14][6] = 2;
  // SE satellite pillar
  room.tiles[13][23] = 2;
  room.tiles[14][23] = 2;

  room.biome = 'dark_jungle';
  room.decorations = [
    // Central focal — corrupted tree towering over the thicket
    { sprite: 'corrupted_tree',       x: 15, y: 9.5  },
    { sprite: 'rift_corruption_node', x: 13, y: 11  },
    { sprite: 'rift_corruption_node', x: 17, y: 11  },
    { sprite: 'giant_fern',           x: 12, y: 9  },
    { sprite: 'giant_fern',           x: 18, y: 9  },
    { sprite: 'glowing_mushroom',     x: 16, y: 12 },
    // NW satellite — twisted tree flanked by ferns
    { sprite: 'twisted_dark_tree', x: 6.5, y: 5.5 },
    { sprite: 'giant_fern',        x: 4,   y: 7   },
    { sprite: 'giant_fern',        x: 8,   y: 6   },
    { sprite: 'glowing_mushroom',  x: 3,   y: 5   },
    // NE satellite — twisted tree + hollow log story
    { sprite: 'twisted_dark_tree', x: 23.5, y: 5.5 },
    { sprite: 'hollow_log',        x: 25,   y: 7   },
    { sprite: 'giant_fern',        x: 21,   y: 6   },
    { sprite: 'glowing_mushroom',  x: 26,   y: 5   },
    // SW satellite — fern-heavy ambush pocket
    { sprite: 'twisted_dark_tree', x: 6.5, y: 13.5 },
    { sprite: 'giant_fern',        x: 4,   y: 14  },
    { sprite: 'giant_fern',        x: 8,   y: 15  },
    { sprite: 'tall_grass_dark',   x: 3,   y: 15  },
    { sprite: 'tall_grass_dark',   x: 9,   y: 13  },
    // SE satellite — hollow log + fern
    { sprite: 'twisted_dark_tree', x: 23.5, y: 13.5 },
    { sprite: 'hollow_log',        x: 25,   y: 15  },
    { sprite: 'giant_fern',        x: 21,   y: 15  },
    { sprite: 'glowing_mushroom',  x: 26,   y: 13  },
    // Ambient scatter across the open floor
    { sprite: 'tall_grass_dark',   x: 11, y: 5  },
    { sprite: 'tall_grass_dark',   x: 19, y: 5  },
    { sprite: 'tall_grass_dark',   x: 11, y: 16 },
    { sprite: 'tall_grass_dark',   x: 19, y: 16 },
    { sprite: 'glowing_mushroom',  x: 14, y: 16 },
  ];
  return applyOverride('rotwood_hollow', {
    ...room,
    __editorKey: 'rotwood_hollow',
  } as RoomTemplate & { __editorKey: string });
})();

// --- Dark Badlands combat: "Sunbleached Arena" ---
// Promotes the badlands biome from test-only to the live combat pool. Open
// rocky arena — boulder clusters at the four cardinal midpoints provide cover
// without blocking lanes, so enemies have natural ambush points but the
// player can always reposition through the open middle.
export const SUNBLEACHED_ARENA_ROOM: RoomTemplate = (() => {
  const room = makeRoom(
    'combat',
    'Sunbleached Arena',
    [{ x: 15, y: 5 }, { x: 7, y: 9 }, { x: 23, y: 9 }, { x: 10, y: 14 }, { x: 20, y: 14 }],
  );
  // N boulder cluster
  room.tiles[4][14] = 2;
  room.tiles[4][15] = 2;
  room.tiles[5][14] = 2;
  // W boulder cluster
  room.tiles[9][4]  = 2;
  room.tiles[10][4] = 2;
  room.tiles[10][5] = 2;
  // E boulder cluster
  room.tiles[9][25]  = 2;
  room.tiles[10][24] = 2;
  room.tiles[10][25] = 2;
  // S boulder cluster
  room.tiles[14][15] = 2;
  room.tiles[15][14] = 2;
  room.tiles[15][15] = 2;
  // Center focal boulder — single tile, lonely anchor
  room.tiles[9][15]  = 2;

  room.biome = 'dark_badlands';
  room.decorations = [
    // N cluster — cracked boulder anchor
    { sprite: 'badlands_cracked_boulder', x: 15, y: 4.5 },
    { sprite: 'badlands_small_rock',      x: 13, y: 6  },
    { sprite: 'badlands_small_rock',      x: 17, y: 5  },
    // W cluster — rock cluster focal
    { sprite: 'badlands_rock_cluster',    x: 4.5, y: 10 },
    { sprite: 'badlands_small_rock',      x: 3,   y: 8  },
    { sprite: 'badlands_small_rock',      x: 6,   y: 11 },
    // E cluster — mirror
    { sprite: 'badlands_rock_cluster',    x: 24.5, y: 10 },
    { sprite: 'badlands_small_rock',      x: 26,   y: 8  },
    { sprite: 'badlands_small_rock',      x: 23,   y: 11 },
    // S cluster — cracked boulder
    { sprite: 'badlands_cracked_boulder', x: 15, y: 15 },
    { sprite: 'badlands_small_rock',      x: 13, y: 16 },
    { sprite: 'badlands_small_rock',      x: 17, y: 14 },
    // Center — focal boulder with rift accent
    { sprite: 'badlands_cracked_boulder', x: 15, y: 9.5 },
    { sprite: 'rift_corruption_node',     x: 14, y: 11  },
    // Ambient scatter — rubble trails between clusters
    { sprite: 'badlands_small_rock',      x: 9,  y: 4  },
    { sprite: 'badlands_small_rock',      x: 21, y: 4  },
    { sprite: 'badlands_small_rock',      x: 9,  y: 16 },
    { sprite: 'badlands_small_rock',      x: 21, y: 16 },
    { sprite: 'badlands_small_rock',      x: 19, y: 10 },
    { sprite: 'badlands_small_rock',      x: 11, y: 10 },
    // Stepping stones trailing in from south
    { sprite: 'stepping_stone',           x: 15, y: 18 },
    { sprite: 'stepping_stone',           x: 14, y: 17 },
  ];
  return applyOverride('sunbleached_arena', {
    ...room,
    __editorKey: 'sunbleached_arena',
  } as RoomTemplate & { __editorKey: string });
})();

// --- Dark Plains variant: "Windbreak Ridge" ---
// Alt plains combat layout. Two staggered ridge segments cut a loose diagonal
// NW→SE across the room, creating a shielded lee side to the south where
// enemies can mass. Contrasts with Windswept Plains' scattered cover pattern.
export const WINDBREAK_RIDGE_ROOM: RoomTemplate = (() => {
  const room = makeRoom(
    'combat',
    'Windbreak Ridge',
    [{ x: 8, y: 4 }, { x: 22, y: 4 }, { x: 15, y: 9 }, { x: 8, y: 15 }, { x: 22, y: 15 }],
  );
  // Upper ridge — NW diagonal segment
  room.tiles[5][4]  = 2;
  room.tiles[5][5]  = 2;
  room.tiles[6][5]  = 2;
  room.tiles[6][6]  = 2;
  room.tiles[7][7]  = 2;
  room.tiles[7][8]  = 2;
  // Lower ridge — SE diagonal segment
  room.tiles[12][21] = 2;
  room.tiles[12][22] = 2;
  room.tiles[13][22] = 2;
  room.tiles[13][23] = 2;
  room.tiles[14][24] = 2;
  room.tiles[14][25] = 2;

  room.biome = 'dark_plains_bluff';
  room.decorations = [
    // Upper ridge — grass piled in the wind-shadow (south side of the bluff)
    { sprite: 'tall_grass_wild', x: 4,  y: 7  },
    { sprite: 'tall_grass_wild', x: 6,  y: 8  },
    { sprite: 'tall_grass_wild', x: 8,  y: 9  },
    { sprite: 'tall_grass_dark', x: 3,  y: 8  },
    { sprite: 'tall_grass_wild', x: 9,  y: 10 },
    { sprite: 'tall_grass_wild', x: 5,  y: 9  },
    // Lower ridge — mirror pattern on the SE side
    { sprite: 'tall_grass_wild', x: 20, y: 14 },
    { sprite: 'tall_grass_wild', x: 22, y: 15 },
    { sprite: 'tall_grass_wild', x: 24, y: 16 },
    { sprite: 'tall_grass_dark', x: 26, y: 15 },
    { sprite: 'tall_grass_wild', x: 23, y: 17 },
    { sprite: 'tall_grass_wild', x: 19, y: 15 },
    // Open corridor — sparse scatter keeping the diagonal visible
    { sprite: 'tall_grass_wild', x: 14, y: 6  },
    { sprite: 'tall_grass_wild', x: 17, y: 5  },
    { sprite: 'tall_grass_wild', x: 12, y: 12 },
    { sprite: 'tall_grass_wild', x: 18, y: 13 },
    // NE pocket — hollow log + mushroom story beat behind the upper ridge
    { sprite: 'hollow_log',      x: 22, y: 6  },
    { sprite: 'glowing_mushroom', x: 24, y: 7  },
    { sprite: 'tall_grass_dark', x: 21, y: 8  },
    { sprite: 'tall_grass_wild', x: 25, y: 5  },
    // SW pocket — rift corruption node anchors the low ground
    { sprite: 'rift_corruption_node', x: 6,  y: 15 },
    { sprite: 'glowing_mushroom',     x: 8,  y: 13 },
    { sprite: 'tall_grass_wild',      x: 4,  y: 14 },
    { sprite: 'tall_grass_wild',      x: 7,  y: 16 },
    { sprite: 'tall_grass_dark',      x: 5,  y: 17 },
    // Stepping stones leading in from the south
    { sprite: 'stepping_stone',       x: 15, y: 17 },
    { sprite: 'stepping_stone',       x: 14, y: 15 },
  ];
  return applyOverride('windbreak_ridge', {
    ...room,
    __editorKey: 'windbreak_ridge',
  } as RoomTemplate & { __editorKey: string });
})();

// --- Dark Grass Cliff combat: "Crystal Flats" ---
// Combat variant of the start biome — open grass arena with scattered rift
// crystal pillars as asymmetric cover. Three small single-tile wall pillars
// under crystal formations give real collision cover without blocking the
// sweeping sightlines that define this biome.
export const CRYSTAL_FLATS_ROOM: RoomTemplate = (() => {
  const room = makeRoom(
    'combat',
    'Crystal Flats',
    [{ x: 10, y: 5 }, { x: 20, y: 5 }, { x: 15, y: 10 }, { x: 6, y: 14 }, { x: 24, y: 14 }],
  );
  // Three crystal pillars — asymmetric placement, single-tile collision each
  room.tiles[6][9]   = 2;
  room.tiles[8][20]  = 2;
  room.tiles[13][12] = 2;
  room.tiles[12][22] = 2;

  room.biome = 'dark_grass_cliff';
  room.decorations = [
    // Pillar 1 (NW) — cluster formation with shards
    { sprite: 'rift_crystal_formation', x: 9,  y: 6  },
    { sprite: 'rift_crystal_shard',     x: 7,  y: 7  },
    { sprite: 'rift_crystal_shard',     x: 11, y: 5  },
    { sprite: 'tall_grass_dark',        x: 8,  y: 8  },
    // Pillar 2 (NE) — outcrop with scatter
    { sprite: 'rift_crystal_outcrop',   x: 20, y: 8  },
    { sprite: 'rift_crystal_shard',     x: 22, y: 7  },
    { sprite: 'rift_crystal_shard',     x: 18, y: 9  },
    { sprite: 'tall_grass_dark',        x: 19, y: 6  },
    // Pillar 3 (center-SW) — cluster + rift corruption story beat
    { sprite: 'rift_crystal_cluster',   x: 12, y: 13 },
    { sprite: 'rift_corruption_node',   x: 14, y: 14 },
    { sprite: 'rift_crystal_shard',     x: 10, y: 14 },
    { sprite: 'tall_grass_dark',        x: 13, y: 12 },
    // Pillar 4 (SE) — outcrop twin
    { sprite: 'rift_crystal_outcrop',   x: 22, y: 12 },
    { sprite: 'rift_crystal_shard',     x: 24, y: 13 },
    { sprite: 'rift_crystal_shard',     x: 20, y: 13 },
    // Grass scatter across the open flats
    { sprite: 'tall_grass_dark', x: 4,  y: 4  },
    { sprite: 'tall_grass_dark', x: 15, y: 3  },
    { sprite: 'tall_grass_dark', x: 26, y: 4  },
    { sprite: 'tall_grass_dark', x: 5,  y: 10 },
    { sprite: 'tall_grass_dark', x: 17, y: 11 },
    { sprite: 'tall_grass_dark', x: 25, y: 10 },
    { sprite: 'tall_grass_dark', x: 4,  y: 16 },
    { sprite: 'tall_grass_dark', x: 16, y: 17 },
    { sprite: 'tall_grass_dark', x: 26, y: 17 },
    { sprite: 'glowing_mushroom', x: 8, y: 12 },
    { sprite: 'glowing_mushroom', x: 25, y: 6 },
    // Stepping stone trail from south
    { sprite: 'stepping_stone', x: 15, y: 16 },
    { sprite: 'stepping_stone', x: 14, y: 18 },
  ];
  return applyOverride('crystal_flats', {
    ...room,
    __editorKey: 'crystal_flats',
  } as RoomTemplate & { __editorKey: string });
})();

// --- Hub room: narrow vertical hall ---
//
// Layout (22 wide, 26 tall). Branches hang off the east and west walls
// (3 per side = 6 regular branches, slots 0-5). The north wall carries a
// single wide boss door (slot 7), locked at run start and unlocked by the
// scene via refreshHubDoorStates once enough regular branches are cleared.
// The south end is the one-way intro return door — walkable on entry but
// no scene zone, which is how we enforce "no backtrack to intro". A
// healing fountain sits at the vertical center of the hall and resets
// every time the player returns here.
//
//            [  boss  ]
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
  // in dungeon.ts has the matching entry-room offsets). Slot 7 is the wide
  // boss door at the top of the hall — placed/unlocked by dungeon.ts
  // independently of the regular slot pool.
  const slots: HubDoorSlot[] = [
    { slot: 0, tx: 0,      ty: 5  }, // W-top
    { slot: 1, tx: 0,      ty: 13 }, // W-mid
    { slot: 2, tx: 0,      ty: 20 }, // W-bot
    { slot: 3, tx: W - 1,  ty: 5  }, // E-top
    { slot: 4, tx: W - 1,  ty: 13 }, // E-mid
    { slot: 5, tx: W - 1,  ty: 20 }, // E-bot
    { slot: 7, tx: 9,      ty: 0, span: 4 }, // N-center — boss (4 tiles wide)
  ];
  // Intro return door (south-center). One-way; scene does not create a zone.
  const introDoorX = 10;
  const introDoorY = H - 1;

  const doorSet = new Set<string>();
  // Side-wall doors (y!=0 && y!=H-1) span vertically. North/south-wall
  // doors (on y=0 or y=H-1) span horizontally. Span defaults to 2.
  for (const s of slots) {
    const span = s.span ?? 2;
    const horizontal = s.ty === 0 || s.ty === H - 1;
    for (let i = 0; i < span; i++) {
      const tx = horizontal ? s.tx + i : s.tx;
      const ty = horizontal ? s.ty : s.ty + i;
      doorSet.add(`${tx},${ty}`);
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
  //             [slot 7]
  //     +--------T---------+
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
  // North trunk: plaza -> wide boss door landing at x=9..12, y=0..1
  for (let y = 1; y <= 10; y++) {
    for (let x = 10; x <= 11; x++) mark(x, y);
  }
  // Widen the top landing to match the 4-tile boss door
  for (let x = 9; x <= 12; x++) { mark(x, 1); mark(x, 2); }
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
    // Rift-crystal shards ringing the spring at the plaza corners. Per-
    // instance noCollide so the player can walk onto any plaza tile to
    // trigger heal — elsewhere in the game these crystals DO collide.
    { sprite: 'rift_crystal_shard',   x: 9,  y: 11, noCollide: true },
    { sprite: 'rift_crystal_shard',   x: 13, y: 11, noCollide: true },
    { sprite: 'rift_crystal_shard',   x: 9,  y: 15, noCollide: true },
    { sprite: 'rift_crystal_shard',   x: 13, y: 15, noCollide: true },
    { sprite: 'rift_crystal_cluster', x: 11, y: 11, noCollide: true },
    { sprite: 'rift_crystal_cluster', x: 11, y: 15, noCollide: true },
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
// Dedicated grass-rendering debug room: a 6x6 dense block of tall_grass_dark
// centered in a small empty arena, with the player spawned at the top-left of
// the patch so a Playwright test can step through it cell-by-cell and screenshot
// to validate the immersive split-sprite rendering.
export const GRASS_TEST_ROOM: RoomTemplate = (() => {
  const room: RoomTemplate = {
    ...makeRoom('start', 'Grass Render Test'),
    biome: 'dark_forest',
  };
  room.playerSpawn = { x: 12, y: 8 };
  const decos: { sprite: string; x: number; y: number }[] = [];
  for (let y = 9; y <= 14; y++) {
    for (let x = 12; x <= 17; x++) {
      decos.push({ sprite: 'tall_grass_dark', x, y });
    }
  }
  room.decorations = decos;
  return room;
})();

export const TEST_ROOMS: Record<string, RoomTemplate> = {
  grass_test: GRASS_TEST_ROOM,
  dark_forest: DARK_FOREST_TEST_ROOM,
  dark_forest_combat: DARK_FOREST_ROOM,
  plains: PLAINS_TEST_ROOM,
  plains_combat: PLAINS_ROOM,
  dark_lava: LAVA_TEST_ROOM,
  lava: LAVA_ROOM,
  dark_badlands: BADLANDS_TEST_ROOM,
  dark_jungle: JUNGLE_TEST_ROOM,
  dark_void: RIFT_SHARD_ROOM,
  hub: HUB_ROOM,
  choked_thicket: CHOKED_THICKET_ROOM,
  rotwood_hollow: ROTWOOD_HOLLOW_ROOM,
  sunbleached_arena: SUNBLEACHED_ARENA_ROOM,
  windbreak_ridge: WINDBREAK_RIDGE_ROOM,
  crystal_flats: CRYSTAL_FLATS_ROOM,
  elite: ELITE_ROOM,
  boss: BOSS_ROOM,
  start: START_ROOM,
  water_combat: WATER_COMBAT_ROOM,
};

// All templates by type for dungeon generation
export const ROOM_TEMPLATES: Record<RoomType, RoomTemplate[]> = {
  combat: [
    COMBAT_ROOM_1,
    COMBAT_ROOM_2,
    WATER_COMBAT_ROOM,
    DARK_FOREST_ROOM,
    PLAINS_ROOM,
    LAVA_ROOM,
    CHOKED_THICKET_ROOM,
    ROTWOOD_HOLLOW_ROOM,
    SUNBLEACHED_ARENA_ROOM,
    WINDBREAK_RIDGE_ROOM,
    CRYSTAL_FLATS_ROOM,
  ],
  elite: [ELITE_ROOM],
  boss: [BOSS_ROOM],
  recruit: [RECRUIT_ROOM],
  healing: [HEALING_ROOM],
  rift_shard: [RIFT_SHARD_ROOM],
  start: [START_ROOM],
  hub: [HUB_ROOM],
};
