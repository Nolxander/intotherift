/**
 * Dungeon generation: hub-and-spoke layout.
 *
 * Each dungeon is a central hub room that radiates up to 7 doors:
 *   - Slots 0-5: regular, player-choice branches (short forward-only
 *     gauntlets ending in a terminal reward room).
 *   - Slot 7:    boss branch — a single-room fight. Locked until the player
 *     has cleared BOSS_UNLOCK_THRESHOLD regular branches.
 *
 * Level 1 additionally prepends an intro zone (start + 2 easy combats) so
 * new players build a team before reaching the hub's choices.
 *
 * Traversal rules (enforced at the scene layer, not in this file):
 *   - Branch entry rooms can't walk back into the hub once entered.
 *   - Branch combats can't walk back toward the hub mid-chain.
 *   - Branch terminal rooms teleport the player directly back to the hub.
 *   - Hub doors render with locked (red) / sealed (grey) overlays as state
 *     dictates; the scene only spawns walkable zones on active doors.
 *
 * DungeonScene depends on: flat `rooms[]` array indexed by id, bidirectional
 * `connections[]` per room (the no-backtrack filter uses the `visited` flag
 * to distinguish forward from back), and `hubDoorSlots` on the hub template
 * to place zones at authored tile positions.
 */

import { RoomTemplate, RoomType, Biome, ROOM_TEMPLATES } from './room_templates';
import { RIFTLING_TEMPLATES } from './party';
import { EliteTeamMember } from './room_templates';

// ---------- Types ----------

/** What sits at the end of a branch. Drives the terminal room template pick. */
export type BranchReward = 'elite' | 'recruit' | 'rift_shard';

/** Regular branches are player-chosen; key/boss are special mandatory branches. */
export type BranchKind = 'regular' | 'boss';

/**
 * Biomes eligible for regular branch selection. A branch rolls one biome
 * from this pool; species, elite team, recruit offerings, and tileset all
 * derive from the biome directly. Only biomes that have authored combat
 * room templates are listed — otherwise the branch's archetype biome and
 * the rendered tileset would diverge.
 */
const BRANCH_BIOMES: Biome[] = [
  'dark_lava',
  'dark_grass_water',
  'dark_grass_cliff',
  'dark_forest',
  'dark_plains_bluff',
  'dark_badlands',
  'dark_jungle',
];

/** Wild species pool per biome. Mixed-element on purpose — biomes are places,
 * not type filters. Keep in sync with the Biome union in room_templates.ts. */
const BIOME_SPECIES: Record<Biome, string[]> = {
  dungeon:            [],
  dark_lava:          ['emberhound', 'pyreshell', 'grindscale', 'cindertail', 'smolderpaw'],
  grass_water:        ['tidecrawler', 'rivelet', 'lumoth'],
  dark_grass_water:   ['tidecrawler', 'rivelet', 'wavecaller', 'dewspine', 'lumoth'],
  grass_cliff:        ['tremorhorn', 'grindscale'],
  dark_grass_cliff:   ['tremorhorn', 'grindscale', 'dawnstrike', 'sunfleece', 'crestshrike'],
  dark_forest:        ['barkbiter', 'gloomfang', 'solarglare', 'veilseer', 'rootlash'],
  dark_plains_bluff:  ['gloomfang', 'hollowcrow', 'emberhound', 'crestshrike', 'dawnstrike'],
  dark_badlands:      ['pyreshell', 'hollowcrow', 'grindscale', 'bogweft', 'curseclaw'],
  dark_jungle:        ['gloomfang', 'thistlebound', 'tremorhorn', 'nettlehide', 'bogweft'],
  dark_void:          [],
};

/** Species pool for a biome. Falls back to all species if the biome is
 * undefined or has no assigned pool (e.g. legacy 'dungeon'). */
export function speciesForBiome(biome: Biome | undefined): string[] {
  if (!biome) return Object.keys(RIFTLING_TEMPLATES);
  const pool = BIOME_SPECIES[biome];
  return pool && pool.length > 0 ? pool : Object.keys(RIFTLING_TEMPLATES);
}

/** Identity of a branch — biome + terminal reward. The biome drives tileset,
 * wild species pool, elite team, and recruit offerings. */
export interface BranchArchetype {
  biome: Biome;
  reward: BranchReward;
  /**
   * If true, the branch's penultimate room is an elite fight; the terminal
   * is still the reward. Rolled ~50% of regular branches. Ignored when the
   * branch is too short to fit both an elite and a reward (depth < 2).
   */
  hasElite?: boolean;
}

export interface Branch {
  id: number;
  kind: BranchKind;
  archetype: BranchArchetype;
  /** All rooms in this branch in traversal order (entry ... terminal). */
  roomIds: number[];
  entryRoomId: number;
  terminalRoomId: number;
  cleared: boolean;
}

/** A door on the hub perimeter leading to a branch. */
export interface HubDoor {
  branchId: number;
  /** Slot index around the hub perimeter; scene maps to tile position. */
  slot: number;
  /** True once the branch is cleared — door is greyed out, non-interactive. */
  sealed: boolean;
  /** True while prerequisites aren't met (key / boss doors). */
  locked: boolean;
}

export interface DungeonRoom {
  id: number;
  template: RoomTemplate;
  /** Grid position in the dungeon map (drives edge detection + minimap). */
  gridX: number;
  gridY: number;
  /**
   * Bidirectional connections to other rooms by id. Kept bidirectional so the
   * existing DungeonScene edge-detection / minimap code keeps working. The
   * "no-backtrack" rule is enforced at runtime by sealing hub doors and
   * disabling return traversal — not by removing entries here.
   */
  connections: number[];
  /** True on a branch's terminal room; hosts the return-to-hub door. */
  terminal?: boolean;
  /** Branch this room belongs to (undefined for the hub). */
  branchId?: number;
  /**
   * For elite terminals: procedurally built elite team drawn from the branch
   * biome's species pool. Overrides the shared ELITE_ROOM template's eliteTeam.
   */
  eliteTeamOverride?: EliteTeamMember[];
  /**
   * For recruit terminals: pre-rolled species keys (1-3) from the branch
   * biome's species pool. The scene spawns these as stationary riftling NPCs
   * for the player to walk up to and recruit. Combat is skipped in these rooms.
   */
  recruitOfferings?: string[];
  /**
   * For intro-zone combat rooms: forces an exact enemy spawn count, overriding
   * the template's base spawns + depth-based extraCount logic. Keeps the first
   * two rooms of a fresh run gentle while the player builds a team.
   */
  introSpawnCount?: number;
  /**
   * For rooms whose exit doors should render with a non-portal sprite (e.g. the
   * intro zone's stairs descending into the rift). When set, the door overlay
   * uses this decoration key instead of the biome portal.
   */
  doorOverlay?: string;
  cleared: boolean;
  visited: boolean;
}

export interface Dungeon {
  /** Flat list of all rooms; room.id is an index into this array. */
  rooms: DungeonRoom[];
  hubRoomId: number;
  /** Regular, player-choice branches radiating from the hub (slots 0-5). */
  branches: Branch[];
  /** Single-room boss branch. Locked until BOSS_UNLOCK_THRESHOLD branches cleared. */
  boss: Branch;
  /** All hub exits (regular branches + boss), keyed by slot. */
  doors: HubDoor[];
  currentRoomId: number;
  /** Which branch the player is currently inside; null when in the hub. */
  currentBranchId: number | null;
  /** 1-indexed level. Single level; boss clear = victory. */
  level: number;
}

/** Reserved slot index for the boss door on the hub's north wall. */
export const BOSS_SLOT = 7;
/** Number of regular branches the player must clear to unlock the boss. */
export const BOSS_UNLOCK_THRESHOLD = 2;

// ---------- Test helper (direct-load debug path) ----------

/**
 * Build a single-room "dungeon" wrapping the given template. Used by the
 * direct-load debug path (?testRoom=<key>) so world builders can iterate on
 * a biome/room in isolation without playing through the dungeon.
 */
export function generateTestDungeon(template: RoomTemplate): Dungeon {
  const room: DungeonRoom = {
    id: 0,
    template,
    gridX: 0,
    gridY: 0,
    connections: [],
    cleared: true,
    visited: true,
  };
  // Synthetic empty boss branch so downstream code can assume it
  // exists. It's unreachable in test-room mode.
  const emptyBoss: Branch = {
    id: -1,
    kind: 'boss',
    archetype: { biome: 'dungeon', reward: 'rift_shard' },
    roomIds: [],
    entryRoomId: 0,
    terminalRoomId: 0,
    cleared: true,
  };
  return {
    rooms: [room],
    hubRoomId: 0,
    branches: [],
    boss: emptyBoss,
    doors: [],
    currentRoomId: 0,
    currentBranchId: null,
    level: 1,
  };
}

// ---------- Internals ----------

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Pick a RoomTemplate of the given type, preferring ones matching the branch
 * biome. Falls back to any template of the type if no biome match exists —
 * some RoomTypes (elite, recruit, rift_shard) have a limited template pool.
 */
function pickTemplate(type: RoomType, biome?: Biome): RoomTemplate {
  const templates = ROOM_TEMPLATES[type];
  if (biome) {
    const matching = templates.filter((t) => t.biome === biome);
    if (matching.length > 0) return pickRandom(matching);
  }
  return pickRandom(templates);
}

/**
 * Pick the "easiest" template of the given type — the one with the fewest
 * enemy spawns. Used for the intro zone so new players aren't drowned by a
 * full combat room on their way to building a team.
 */
function pickEasiestTemplate(type: RoomType): RoomTemplate {
  const templates = ROOM_TEMPLATES[type];
  return [...templates].sort(
    (a, b) => a.enemySpawns.length - b.enemySpawns.length,
  )[0];
}

/**
 * Terminal reward pool for regular branches. Elite is not a terminal reward —
 * it's an optional penultimate combat encounter (rolled via hasElite) that
 * precedes one of these reward rooms.
 */
const TERMINAL_REWARDS: BranchReward[] = ['recruit', 'rift_shard'];

/** Probability that a regular branch has an elite fight before its reward. */
const ELITE_CHANCE = 0.5;

/**
 * Procedurally build a 3-member elite team from the theme's species pool.
 * Prefers unique species but allows repeats if the pool is smaller than 3.
 * Picks a variety of roles when possible so the team has frontline + backline.
 */
function buildBiomeEliteTeam(biome: Biome): EliteTeamMember[] {
  const pool = speciesForBiome(biome);
  if (pool.length === 0) return [];
  const shuffled = shuffle([...pool]);
  const picks: string[] = [];
  for (let i = 0; i < 3; i++) {
    picks.push(shuffled[i % shuffled.length]);
  }
  return picks.map((key) => ({ riftlingKey: key, equipped: [0, 1] as [number, number] }));
}

/**
 * Pick 3 unique species from the biome pool, biased toward different element
 * types so the player gets variety. Falls back to repeats only when the pool
 * itself has fewer than 3 species.
 */
function buildRecruitOfferings(biome: Biome): string[] {
  return pickDiverseSpecies(speciesForBiome(biome), 3);
}

/**
 * Select `count` species from `pool`, preferring species whose element type
 * hasn't been picked yet. Allows repeats only when the pool is exhausted.
 */
export function pickDiverseSpecies(pool: string[], count: number): string[] {
  if (pool.length === 0) return [];
  const shuffled = shuffle([...pool]);
  const picks: string[] = [];
  const usedTypes = new Set<string>();
  const usedKeys = new Set<string>();

  for (const key of shuffled) {
    if (picks.length >= count) break;
    const t = RIFTLING_TEMPLATES[key];
    if (!t) continue;
    if (!usedTypes.has(t.elementType)) {
      picks.push(key);
      usedTypes.add(t.elementType);
      usedKeys.add(key);
    }
  }

  for (const key of shuffled) {
    if (picks.length >= count) break;
    if (usedKeys.has(key)) continue;
    picks.push(key);
    usedKeys.add(key);
  }

  while (picks.length < count && picks.length < pool.length) {
    picks.push(shuffled[picks.length % shuffled.length]);
  }

  return picks;
}

/** Room type used for each terminal, keyed by reward. */
function terminalTypeFor(reward: BranchReward): RoomType {
  return reward;
}

/**
 * Per-slot grid layout for hub branches.
 *
 * Each slot pairs an entry-room grid offset (cardinal-adjacent to the hub
 * when possible, or 2 tiles out for diagonal slots) with a chain direction
 * that subsequent rooms step along. Slot indices must stay in sync with
 * HUB_ROOM.hubDoorSlots in room_templates.ts — slot N there is the same
 * door as slot N here.
 *
 * Chain direction is chosen so that each entry room's return-to-hub door
 * (inferred cardinally by the scene's edge detection) doesn't collide with
 * its forward-chain door.
 */
interface SlotLayout {
  /** Entry room grid position, relative to the hub at (0,0). */
  entry: { x: number; y: number };
  /** Step vector from each branch room to the next. */
  step: { dx: number; dy: number };
}

// Six slots: 3 on the west wall, 3 on the east wall. Chains extend outward
// (west or east) so each branch gets a distinct corridor. The return-to-hub
// edge for each entry is derived by the scene's cardinal fallback, and is
// chosen per slot so it doesn't collide with the forward-chain door.
const HUB_SLOT_LAYOUTS: SlotLayout[] = [
  // slot 0 — W top:    entry (-1,-1), return falls to 'south', chain goes west
  { entry: { x: -1, y: -1 }, step: { dx: -1, dy: 0 } },
  // slot 1 — W mid:    entry (-1, 0), return 'east',           chain west
  { entry: { x: -1, y: 0 },  step: { dx: -1, dy: 0 } },
  // slot 2 — W bot:    entry (-1, 1), return 'north',          chain west
  { entry: { x: -1, y: 1 },  step: { dx: -1, dy: 0 } },
  // slot 3 — E top:    entry (1, -1), return 'south',          chain east
  { entry: { x: 1, y: -1 },  step: { dx: 1, dy: 0 } },
  // slot 4 — E mid:    entry (1,  0), return 'west',           chain east
  { entry: { x: 1, y: 0 },   step: { dx: 1, dy: 0 } },
  // slot 5 — E bot:    entry (1,  1), return 'north',          chain east
  { entry: { x: 1, y: 1 },   step: { dx: 1, dy: 0 } },
];

interface BuildCtx {
  rooms: DungeonRoom[];
  nextId: number;
}

function addRoom(
  ctx: BuildCtx,
  type: RoomType,
  gridX: number,
  gridY: number,
  opts: {
    biome?: Biome;
    branchId?: number;
    terminal?: boolean;
  } = {},
): DungeonRoom {
  // `cleared` skips combat setup in safe rooms (start, hub). `visited` is
  // used by the no-backtrack door filter and the minimap fog-of-war, so it
  // must only be pre-set on the room the player actually spawns in. Pre-
  // marking the hub as visited would make the intro zone's final combat
  // skip its forward edge to the hub (treating it as "the way we came"),
  // leaving the room without an exit.
  const safe = type === 'start' || type === 'hub';
  const room: DungeonRoom = {
    id: ctx.nextId++,
    template: pickTemplate(type, opts.biome),
    gridX,
    gridY,
    connections: [],
    branchId: opts.branchId,
    terminal: opts.terminal,
    cleared: safe,
    visited: type === 'start',
  };
  ctx.rooms.push(room);
  return room;
}

function connect(a: DungeonRoom, b: DungeonRoom): void {
  a.connections.push(b.id);
  b.connections.push(a.id);
}

/**
 * Build one regular branch. Entry room sits at the slot's authored grid
 * offset from the hub; the rest of the chain steps along the slot's step
 * vector so each branch room is cardinal-adjacent to its neighbor (the
 * scene's edge detection needs cardinal connections to render doors).
 *
 * `depth` is the total number of rooms in the branch, including the
 * terminal — so depth=3 → 2 combat rooms + 1 terminal.
 */
function generateBranch(
  ctx: BuildCtx,
  branchId: number,
  archetype: BranchArchetype,
  hub: DungeonRoom,
  slot: number,
  depth: number,
): Branch {
  const layout = HUB_SLOT_LAYOUTS[slot];
  const { entry, step } = layout;
  const roomIds: number[] = [];

  // Entry room (branch room 0) — connects back to the hub.
  const entryRoom = addRoom(
    ctx,
    depth === 1 ? terminalTypeFor(archetype.reward) : 'combat',
    hub.gridX + entry.x,
    hub.gridY + entry.y,
    {
      biome: archetype.biome,
      branchId,
      terminal: depth === 1,
    },
  );
  connect(hub, entryRoom);
  roomIds.push(entryRoom.id);

  let prev = entryRoom;
  let cx = entryRoom.gridX;
  let cy = entryRoom.gridY;

  // Subsequent combat rooms. When hasElite is set, the last pre-terminal slot
  // becomes an elite encounter instead of a regular combat room.
  const eliteIdx = archetype.hasElite && depth >= 2 ? depth - 2 : -1;
  for (let i = 1; i < depth - 1; i++) {
    cx += step.dx;
    cy += step.dy;
    const roomType: RoomType = i === eliteIdx ? 'elite' : 'combat';
    const r = addRoom(ctx, roomType, cx, cy, {
      biome: archetype.biome,
      branchId,
    });
    if (roomType === 'elite') {
      r.eliteTeamOverride = buildBiomeEliteTeam(archetype.biome);
    }
    connect(prev, r);
    roomIds.push(r.id);
    prev = r;
  }

  // Terminal room with the reward (skip if depth === 1; entry is terminal).
  if (depth > 1) {
    cx += step.dx;
    cy += step.dy;
    const terminal = addRoom(
      ctx,
      terminalTypeFor(archetype.reward),
      cx,
      cy,
      { biome: archetype.biome, branchId, terminal: true },
    );
    connect(prev, terminal);
    roomIds.push(terminal.id);
  }

  // Attach themed payloads to the terminal room.
  const terminalRoom = ctx.rooms[roomIds[roomIds.length - 1]];
  if (archetype.reward === 'elite') {
    // Only possible when depth === 1 (single-room branch). hasElite is
    // ignored in that case — there's no room for both fight and reward.
    terminalRoom.eliteTeamOverride = buildBiomeEliteTeam(archetype.biome);
  } else if (archetype.reward === 'recruit') {
    terminalRoom.recruitOfferings = buildRecruitOfferings(archetype.biome);
    // Recruit terminals are safe walk-in rewards — skip combat entirely.
    terminalRoom.cleared = true;
  }

  return {
    id: branchId,
    kind: 'regular',
    archetype,
    roomIds,
    entryRoomId: entryRoom.id,
    terminalRoomId: roomIds[roomIds.length - 1],
    cleared: false,
  };
}

/**
 * Build the boss branch: a single boss room floating at an isolated grid
 * position. Accessed only via the hub's boss door zone and exited via the
 * standard terminal-teleport back to hub.
 */
function generateBoss(ctx: BuildCtx, branchId: number, hub: DungeonRoom): Branch {
  const biome: Biome = 'dark_lava';
  // Park the boss far off-grid so it doesn't collide with any branch chain.
  const bossRoom = addRoom(ctx, 'boss', 10, -10, {
    biome,
    branchId,
    terminal: true,
  });
  // Connect so the scene's terminal-teleport logic has a connection to
  // iterate over when sending the player back to the hub after the fight.
  connect(hub, bossRoom);
  return {
    id: branchId,
    kind: 'boss',
    archetype: { biome, reward: 'elite' },
    roomIds: [bossRoom.id],
    entryRoomId: bossRoom.id,
    terminalRoomId: bossRoom.id,
    cleared: false,
  };
}

// ---------- Generator ----------

/**
 * Build the level-1 intro zone: a safe start room followed by two easy combat
 * rooms that funnel the player into the hub. Post-combat recruit prompts are
 * handled by the normal wild-encounter flow, so the player reaches the hub
 * with up to two recruited riftlings and a real team to play with.
 *
 * Layout (the intro extends *south* of the hub, freeing N/E/W for branches):
 *
 *   intro_start (0, 3)
 *     |
 *   combat1    (0, 2)     easy combat — fewest-spawn template
 *     |
 *   combat2    (0, 1)     easy combat — fewest-spawn template
 *     |
 *   hub        (0, 0)
 */
function generateIntroZone(ctx: BuildCtx, hub: DungeonRoom): DungeonRoom {
  const introStart = addRoom(ctx, 'start', 0, 3);
  introStart.doorOverlay = 'rift_stairs_down';

  // Each intro room rolls its own biomed combat template so the tileset +
  // wild species pool match. Skip the default-biome stubs so we pick from the
  // real authored templates (water_combat, dark_forest, plains, lava, etc.).
  const biomedCombat = ROOM_TEMPLATES.combat.filter((t) => t.biome !== undefined);
  const rollIntroTemplate = (): RoomTemplate =>
    pickRandom(biomedCombat.length > 0 ? biomedCombat : ROOM_TEMPLATES.combat);

  const combat1: DungeonRoom = {
    id: ctx.nextId++,
    template: rollIntroTemplate(),
    gridX: 0,
    gridY: 2,
    connections: [],
    cleared: false,
    visited: false,
    introSpawnCount: 2,
    doorOverlay: 'rift_stairs_down',
  };
  ctx.rooms.push(combat1);

  const combat2: DungeonRoom = {
    id: ctx.nextId++,
    template: rollIntroTemplate(),
    gridX: 0,
    gridY: 1,
    connections: [],
    cleared: false,
    visited: false,
    introSpawnCount: 4,
    doorOverlay: 'rift_stairs_down',
  };
  ctx.rooms.push(combat2);

  connect(introStart, combat1);
  connect(combat1, combat2);
  connect(combat2, hub);

  return introStart;
}

/**
 * Generate a hub-and-spoke dungeon.
 *
 * A central hub room hosts regular branch doors (5 for L1, 6 otherwise),
 * plus a boss door on the hub's north wall. Each regular branch is a short
 * forward-only chain ending in a terminal reward. Level 1 additionally
 * prepends an intro zone (start + 2 easy combats) so new players build a
 * team before reaching the hub's choices.
 *
 * Branch count:
 *   - 6 regular branches (slots 0-5) at all levels
 *   + boss (slot 7) in all cases, unlocked after BOSS_UNLOCK_THRESHOLD
 *   regular branches are cleared.
 */
export function generateDungeon(
  opts: { level?: number; branchCount?: number; intro?: boolean } = {},
): Dungeon {
  const level = opts.level ?? 1;
  const intro = opts.intro ?? level === 1;

  // All six hub slots are side-wall doors (3 west, 3 east) so the intro's
  // south corridor doesn't collide with any branch chain — intro-mode and
  // no-intro mode can both use the full slot pool.
  const slotPool = [0, 1, 2, 3, 4, 5];

  const defaultBranchCount = 6;
  const branchCount = Math.min(
    opts.branchCount ?? defaultBranchCount,
    slotPool.length,
  );

  const ctx: BuildCtx = { rooms: [], nextId: 0 };
  const hub = addRoom(ctx, 'hub', 0, 0);

  // Pick distinct biomes for each branch; rewards cycle and shuffle so the
  // branch types feel varied across runs. Biome drives tileset, wild species
  // pool, and terminal (elite / recruit) offerings.
  const biomes = shuffle([...BRANCH_BIOMES]).slice(0, branchCount);
  const rewards: BranchReward[] = [];
  for (let i = 0; i < branchCount; i++) {
    rewards.push(TERMINAL_REWARDS[i % TERMINAL_REWARDS.length]);
  }
  shuffle(rewards);

  // Depth scales mildly with level: L1 = 3 rooms, L2+ = 4 rooms per branch.
  const depth = level >= 2 ? 4 : 3;

  const branches: Branch[] = [];
  const doors: HubDoor[] = [];
  for (let i = 0; i < branchCount; i++) {
    const archetype: BranchArchetype = {
      biome: biomes[i],
      reward: rewards[i],
      hasElite: Math.random() < ELITE_CHANCE,
    };
    const slot = slotPool[i];
    const branch = generateBranch(ctx, i, archetype, hub, slot, depth);
    branches.push(branch);
    doors.push({ branchId: branch.id, slot, sealed: false, locked: false });
  }

  // Boss branch — single room, locked until the player clears
  // BOSS_UNLOCK_THRESHOLD regular branches.
  const boss = generateBoss(ctx, branchCount, hub);
  doors.push({
    branchId: boss.id,
    slot: BOSS_SLOT,
    sealed: false,
    locked: true, // unlocked at runtime when enough branches are cleared
  });

  // Intro zone: extends south from the hub. Player spawns at intro_start.
  const spawnRoom = intro ? generateIntroZone(ctx, hub) : hub;

  return {
    rooms: ctx.rooms,
    hubRoomId: hub.id,
    branches,
    boss,
    doors,
    currentRoomId: spawnRoom.id,
    currentBranchId: null,
    level,
  };
}
