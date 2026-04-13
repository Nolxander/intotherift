/**
 * Dungeon generation: hub-and-spoke layout.
 *
 * Each dungeon is a central hub room that radiates up to 8 doors:
 *   - Slots 0-5: regular, player-choice branches (short forward-only
 *     gauntlets ending in a terminal reward room).
 *   - Slot 6:    key-path branch — a longer combat gauntlet. Locked until
 *     `level` regular branches are cleared; clearing it sets hasOrb.
 *   - Slot 7:    boss branch — a single-room fight. Locked until hasOrb.
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

// ---------- Types ----------

/** What sits at the end of a branch. Drives the terminal room template pick. */
export type BranchReward = 'elite' | 'recruit' | 'rift_shard';

/** Regular branches are player-chosen; key/boss are special mandatory branches. */
export type BranchKind = 'regular' | 'key' | 'boss';

/** Identity of a branch — biome theme + terminal reward. */
export interface BranchArchetype {
  biome: Biome;
  reward: BranchReward;
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
  cleared: boolean;
  visited: boolean;
}

export interface Dungeon {
  /** Flat list of all rooms; room.id is an index into this array. */
  rooms: DungeonRoom[];
  hubRoomId: number;
  /** Regular, player-choice branches radiating from the hub (slots 0-5). */
  branches: Branch[];
  /** Special key-path branch. Terminal clear sets hasOrb and unlocks boss. */
  keyPath: Branch;
  /** Single-room boss branch. Locked until hasOrb === true. */
  boss: Branch;
  /** All hub exits (regular branches + key path + boss), keyed by slot. */
  doors: HubDoor[];
  currentRoomId: number;
  /** Which branch the player is currently inside; null when in the hub. */
  currentBranchId: number | null;
  /** Set true when the key-path terminal is cleared. Unlocks the boss door. */
  hasOrb: boolean;
  /** 1-indexed level. 3 levels total; level 3 clear = victory. */
  level: number;
}

/** Reserved slot indices for the special branches on the hub's north wall. */
export const KEY_PATH_SLOT = 6;
export const BOSS_SLOT = 7;

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
  // Synthetic empty key/boss branches so downstream code can assume they
  // exist. They're unreachable in test-room mode.
  const emptyBranch: Branch = {
    id: -1,
    kind: 'key',
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
    keyPath: { ...emptyBranch, kind: 'key' },
    boss: { ...emptyBranch, kind: 'boss' },
    doors: [],
    currentRoomId: 0,
    currentBranchId: null,
    hasOrb: false,
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

/** Biome pool for regular branches. Expand per level in Stage 4. */
const BRANCH_BIOMES: Biome[] = [
  'grass_cliff',
  'grass_water',
  'dark_forest',
  'dark_plains_bluff',
  'dark_grass_cliff',
  'dark_grass_water',
];

const BRANCH_REWARDS: BranchReward[] = ['elite', 'recruit', 'rift_shard'];

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
  opts: { biome?: Biome; branchId?: number; terminal?: boolean } = {},
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

  // Subsequent combat rooms.
  for (let i = 1; i < depth - 1; i++) {
    cx += step.dx;
    cy += step.dy;
    const r = addRoom(ctx, 'combat', cx, cy, {
      biome: archetype.biome,
      branchId,
    });
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
 * Build the key-path branch: a longer, combat-only gauntlet ending in a
 * terminal "rift shard" room that grants the orb. Entry room sits directly
 * north of the hub at (0,-1), chain extends further north in column x=0.
 * Length scales with level (L1=5 rooms, L2=6, L3=7).
 */
function generateKeyPath(
  ctx: BuildCtx,
  branchId: number,
  hub: DungeonRoom,
  level: number,
): Branch {
  const depth = 4 + level; // L1=5, L2=6, L3=7
  const biome: Biome = 'dark_lava';
  const roomIds: number[] = [];

  let cx = 0;
  let cy = -1;
  const entry = addRoom(ctx, 'combat', cx, cy, { biome, branchId });
  connect(hub, entry);
  roomIds.push(entry.id);

  let prev = entry;
  for (let i = 1; i < depth - 1; i++) {
    cy -= 1;
    const r = addRoom(ctx, 'combat', cx, cy, { biome, branchId });
    connect(prev, r);
    roomIds.push(r.id);
    prev = r;
  }

  // Terminal — the "orb shrine". Uses rift_shard template as the visual
  // placeholder; the scene marks dungeon.hasOrb when this branch seals.
  cy -= 1;
  const terminal = addRoom(ctx, 'rift_shard', cx, cy, {
    biome,
    branchId,
    terminal: true,
  });
  connect(prev, terminal);
  roomIds.push(terminal.id);

  return {
    id: branchId,
    kind: 'key',
    archetype: { biome, reward: 'rift_shard' },
    roomIds,
    entryRoomId: entry.id,
    terminalRoomId: terminal.id,
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
  // Park the boss far off-grid so it doesn't collide with key path chain.
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
  const combat1: DungeonRoom = {
    id: ctx.nextId++,
    template: pickEasiestTemplate('combat'),
    gridX: 0,
    gridY: 2,
    connections: [],
    cleared: false,
    visited: false,
  };
  ctx.rooms.push(combat1);
  const combat2: DungeonRoom = {
    id: ctx.nextId++,
    template: pickEasiestTemplate('combat'),
    gridX: 0,
    gridY: 1,
    connections: [],
    cleared: false,
    visited: false,
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
 * plus a key-path branch and a boss branch on the hub's north wall. Each
 * regular branch is a short forward-only chain ending in a terminal reward.
 * Level 1 additionally prepends an intro zone (start + 2 easy combats) so
 * new players build a team before reaching the hub's choices.
 *
 * Branch count:
 *   - L1 with intro: 5 regular branches (slots 0-4)
 *   - L2+ no intro:  6 regular branches (slots 0-5)
 *   + key path (slot 6) and boss (slot 7) in all cases.
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

  const defaultBranchCount = intro ? 5 : 6;
  const branchCount = Math.min(
    opts.branchCount ?? defaultBranchCount,
    slotPool.length,
  );

  const ctx: BuildCtx = { rooms: [], nextId: 0 };
  const hub = addRoom(ctx, 'hub', 0, 0);

  // Pick distinct biomes for each branch; rewards cycle and shuffle so the
  // branch types feel varied across runs.
  const biomes = shuffle([...BRANCH_BIOMES]).slice(0, branchCount);
  const rewards: BranchReward[] = [];
  for (let i = 0; i < branchCount; i++) {
    rewards.push(BRANCH_REWARDS[i % BRANCH_REWARDS.length]);
  }
  shuffle(rewards);

  // Depth scales mildly with level: L1 = 3 rooms, L2+ = 4 rooms per branch.
  const depth = level >= 2 ? 4 : 3;

  const branches: Branch[] = [];
  const doors: HubDoor[] = [];
  for (let i = 0; i < branchCount; i++) {
    const archetype: BranchArchetype = { biome: biomes[i], reward: rewards[i] };
    const slot = slotPool[i];
    const branch = generateBranch(ctx, i, archetype, hub, slot, depth);
    branches.push(branch);
    doors.push({ branchId: branch.id, slot, sealed: false, locked: false });
  }

  // Key path branch — longer combat gauntlet, locked until the player
  // clears `level` regular branches (L1=1, L2=2, L3=3).
  const keyPath = generateKeyPath(ctx, branchCount, hub, level);
  doors.push({
    branchId: keyPath.id,
    slot: KEY_PATH_SLOT,
    sealed: false,
    locked: true, // unlocked at runtime when enough branches are cleared
  });

  // Boss branch — single room, locked until the key path terminal is
  // cleared (hasOrb === true).
  const boss = generateBoss(ctx, branchCount + 1, hub);
  doors.push({
    branchId: boss.id,
    slot: BOSS_SLOT,
    sealed: false,
    locked: true, // unlocked at runtime when hasOrb is set
  });

  // Intro zone: extends south from the hub. Player spawns at intro_start.
  const spawnRoom = intro ? generateIntroZone(ctx, hub) : hub;

  return {
    rooms: ctx.rooms,
    hubRoomId: hub.id,
    branches,
    keyPath,
    boss,
    doors,
    currentRoomId: spawnRoom.id,
    currentBranchId: null,
    hasOrb: false,
    level,
  };
}
