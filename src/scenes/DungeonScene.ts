import Phaser from 'phaser';
import {
  generateDungeon,
  generateTestDungeon,
  Dungeon,
  DungeonRoom,
  KEY_PATH_SLOT,
  BOSS_SLOT,
} from '../data/dungeon';
import { RoomTemplate, Biome, TEST_ROOMS } from '../data/room_templates';
import { DECORATION_CATALOG } from '../data/decorations';
import { CombatManager, CompanionEntry, DefeatedRiftling } from '../combat/CombatManager';
import { Party, PartyRiftling, createStartingParty, createRiftling, addToParty, awardXP, getActiveSynergies, BENCH_XP_RATIO, LevelUpResult, RIFTLING_TEMPLATES, AVAILABLE_RIFTLINGS, TYPE_COLORS } from '../data/party';
import { getXPMultiplier, TRINKET_CATALOG, TrinketDef, addTrinket, ALL_TRINKET_IDS } from '../data/trinkets';
import { SimpleNav, NavPoint, NAV_ARRIVAL_RADIUS, STUCK_WINDOW_MS, STUCK_THRESHOLD_PX } from '../data/nav';
import { playWalkOrStatic, stopWalkAnim, directionFromVelocity } from '../data/anims';
import { RecruitPrompt } from '../ui/RecruitPrompt';
import { PartyScreen } from '../ui/PartyScreen';
import { CombatHUD } from '../ui/CombatHUD';
import { SynergyHUD } from '../ui/SynergyHUD';

const TILE = 16;
const TRAINER_SPEED = 90;

/** Pick `count` random unique trinkets from the catalog. */
function pickRandomTrinkets(count: number): TrinketDef[] {
  const ids = [...ALL_TRINKET_IDS];
  const picks: TrinketDef[] = [];
  for (let i = 0; i < count && ids.length > 0; i++) {
    const idx = Math.floor(Math.random() * ids.length);
    picks.push(TRINKET_CATALOG[ids.splice(idx, 1)[0]]);
  }
  return picks;
}

/** Map trinket to a display color for the UI. */
function trinketColor(trinket: TrinketDef): number {
  if (trinket.buffs?.attack) return 0xe85d30;
  if (trinket.buffs?.defense) return 0x6688cc;
  if (trinket.buffs?.speed) return 0x44ccaa;
  if (trinket.buffs?.hp) return 0xcc4444;
  if (trinket.buffs?.critRate) return 0xff8844;
  if (trinket.buffs?.evasion) return 0x9966cc;
  if (trinket.special === 'xp_bonus') return 0x4488ff;
  if (trinket.special === 'timer_bonus') return 0xffdd44;
  return 0x888888;
}

/**
 * Follow-formation offsets — used only as a fallback for the very first
 * frame after spawn (before any breadcrumb trail exists). The real follow
 * system is the trainer breadcrumb trail (`trainerTrail`), which produces
 * a snake-game style conga line that adapts to the trainer's heading.
 */
const FOLLOW_OFFSETS = [
  { x: -20, y: 10 },
  { x: 20, y: 10 },
  { x: -32, y: 22 },
  { x: 32, y: 22 },
];

/**
 * DungeonScene — room-based dungeon exploration.
 *
 * Renders one room at a time from a template. The player moves with WASD,
 * a companion riftling follows. Walking into a door tile transitions to
 * the connected room. A minimap shows the dungeon layout.
 */
/** Tracked tile render entry — kept so the in-browser builder can incrementally
 * update tiles without rebuilding the whole room. One entry per (x,y). The
 * `overlay` is the translucent blue rect added on top of active doors. */
interface TileEntry {
  image: Phaser.GameObjects.Image | null;
  overlay: Phaser.GameObjects.Rectangle | null;
  wallBody: Phaser.Physics.Arcade.Sprite | null;
}

/** Tracked decoration sprite — kept so the builder can remove individual props
 * by tile position without rebuilding the full decoration layer. */
interface DecorationEntry {
  sprite: string;
  x: number;
  y: number;
  img: Phaser.GameObjects.Image;
  body: Phaser.Physics.Arcade.Sprite | null;
}

interface CompanionState {
  sprite: Phaser.Physics.Arcade.Sprite;
  /** Current nav waypoints to follow. */
  waypoints: NavPoint[];
  /** The goal position when the path was last calculated. */
  lastNavGoal: NavPoint | null;
  /** Position sampled at lastPosTime for stuck detection. */
  lastPos: NavPoint;
  lastPosTime: number;
  /** Last facing direction — used to set idle texture when stopping. */
  dir: string;
}

/** Pixel arc-length between consecutive followers (and trainer→first follower). */
const FOLLOWER_SPACING = 22;
/** Min trainer movement (px) before a new breadcrumb is recorded. */
const TRAIL_SAMPLE_DIST = 3;
/** Max breadcrumbs retained — must comfortably exceed (party.length × FOLLOWER_SPACING / TRAIL_SAMPLE_DIST). */
const TRAIL_MAX_LEN = 240;

export class DungeonScene extends Phaser.Scene {
  private trainer!: Phaser.Physics.Arcade.Sprite;
  private companions: CompanionState[] = [];
  /** Recent trainer positions, newest first. Followers walk this trail. */
  private trainerTrail: { x: number; y: number }[] = [];
  private nav!: SimpleNav;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private doorZones: { zone: Phaser.GameObjects.Zone; targetRoomId: number }[] = [];

  /** Tile render tracking — [y][x]. Populated in loadRoom, used by the
   * in-browser builder's live-edit hooks. */
  private tileEntries: TileEntry[][] = [];

  /** Decoration render tracking — flat list. Builder removes by tile coord
   * via removeDecorationAt(); added via addDecoration(). */
  private decorationEntries: DecorationEntry[] = [];

  private dungeon!: Dungeon;
  private currentRoom!: DungeonRoom;

  private keys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  // HUD elements
  private timerText!: Phaser.GameObjects.Text;
  private roomLabel!: Phaser.GameObjects.Text;
  private timerSeconds = 360;
  private timerEvent!: Phaser.Time.TimerEvent;

  // Minimap
  private minimapGfx!: Phaser.GameObjects.Graphics;

  // Combat
  private combatManager!: CombatManager;
  private combatHud!: CombatHUD;
  private roomClearedText!: Phaser.GameObjects.Text | null;

  // Healing spring
  private healingSpring: { zone: Phaser.GameObjects.Zone; visual: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text } | null = null;
  private healingUsed = false;

  // Rift Shard (in-dungeon trinket pickup)
  private riftShard: { zone: Phaser.GameObjects.Zone; visual: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text } | null = null;
  private riftShardUsed = false;
  private riftShardSelecting = false;
  private riftShardUI: Phaser.GameObjects.Container | null = null;
  /** True while the starter riftling selection overlay is open. */
  private starterSelectActive = false;

  // Starter trinket selection overlay
  private trinketSelectUI: Phaser.GameObjects.Container | null = null;

  // In-browser world builder (dev-only, dynamic import)
  private builderDrawHook: (() => void) | null = null;
  private builderUpdateHook: ((dt: number) => void) | null = null;
  private builderActiveHook: (() => boolean) | null = null;

  // Animation state
  private trainerDir = 'south';

  // Party & recruiting
  private party!: Party;
  private activeCompanionIndex = 0;
  private selectedIndex = 0; // persistent selection for party HUD + move display
  private recruitPrompt!: RecruitPrompt;
  private pendingRecruit = false;
  private partyHud!: Phaser.GameObjects.Container;
  private partyScreen!: PartyScreen;
  private synergyHud!: SynergyHUD;

  constructor() {
    super({ key: 'Dungeon' });
  }

  create(): void {
    // Direct-load debug path: ?testRoom=<key> loads a single named room from
    // TEST_ROOMS in isolation so world builders can iterate on a biome without
    // playing through the dungeon. Unknown keys fall through to the normal path.
    const testKey = new URLSearchParams(window.location.search).get('testRoom');
    const testTemplate = testKey ? TEST_ROOMS[testKey] : undefined;
    this.dungeon = testTemplate ? generateTestDungeon(testTemplate) : generateDungeon();
    this.refreshHubDoorStates();
    this.currentRoom = this.dungeon.rooms[this.dungeon.currentRoomId];

    this.walls = this.physics.add.staticGroup();
    this.roomClearedText = null;
    this.party = createStartingParty(); // temporary default, replaced by starter select
    this.activeCompanionIndex = 0;
    this.setupInput();

    this.loadRoom(this.currentRoom);
    this.spawnTrainer(this.currentRoom.template);
    this.syncCompanions();
    this.combatManager = new CombatManager(this, this.walls);
    this.combatHud = new CombatHUD(this, this.combatManager, () => ({
      active: this.party.active,
      selectedIndex: this.selectedIndex,
    }));
    this.recruitPrompt = new RecruitPrompt(this);
    this.partyScreen = new PartyScreen(this, this.party, () => {
      this.syncCompanions();
      this.drawPartyHud();
      this.synergyHud?.refresh();
    });
    this.setupCamera(this.currentRoom.template);
    this.setupHUD();
    this.setupPartyHud();
    this.synergyHud = new SynergyHUD(this, () => this.party.active);
    this.synergyHud.refresh();
    this.setupMinimap();
    this.startTimer();

    this.spawnHealingSpring();
    this.spawnRiftShard();

    // Show starter riftling selection — timer paused, gameplay frozen until chosen
    this.showStarterSelect();

    // Dev-only: load the in-browser world builder. Dynamic import behind
    // import.meta.env.DEV so Rollup tree-shakes it out of prod builds.
    // F4 toggles the builder; Ctrl+S saves the current room to
    // `assets/rooms/<key>.json` via the vite-plugin-room-save dev endpoint.
    if (import.meta.env.DEV) {
      import('../editor/builder_mode').then((mod) => {
        mod.initBuilder(this);
        this.builderDrawHook = mod.drawOverlay;
        this.builderUpdateHook = mod.updateBuilder;
        this.builderActiveHook = mod.isBuilderActive;

        window.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'F4') {
            mod.toggleBuilder();
            e.preventDefault();
          }
        });

        // Drive the overlay redraw from Phaser's POST_RENDER event — this
        // runs once per frame after Phaser has rendered the game, which
        // is when we want to stamp the builder overlay on top.
        this.events.on(Phaser.Scenes.Events.POST_UPDATE, () => {
          if (this.builderActiveHook?.()) {
            this.builderUpdateHook?.(this.game.loop.delta / 1000);
          }
          this.builderDrawHook?.();
        });
      }).catch((err) => {
        console.error('[builder] Failed to load:', err);
      });
    }

    // Expose game state for automated testing
    (window as any).__gameState = {
      getParty: () => this.party,
      getRoom: () => this.currentRoom,
      isRecruitActive: () => this.recruitPrompt?.isActive ?? false,
      isCombatActive: () => this.combatManager?.isActive ?? false,
      getDungeon: () => this.dungeon,
      isPartyScreenActive: () => this.partyScreen?.isActive ?? false,
      getTimerSeconds: () => this.timerSeconds,
      /** Teleport to a room by ID — for QA testing only. */
      warpToRoom: (roomId: number) => this.transitionToRoom(roomId),
      /** Inject a riftling into the party by species key — for QA testing only. */
      injectRiftling: (key: string) => {
        const r = createRiftling(key);
        addToParty(this.party, r);
        this.syncCompanions();
        this.drawPartyHud();
        this.synergyHud?.refresh();
      },
      /** Active type synergies for the current party. */
      getActiveSynergies: () => getActiveSynergies(this.party.active),
      /** Grant XP to a specific active riftling by index — for QA testing only. */
      grantXP: (index: number, amount: number) => {
        const r = this.party.active[index];
        if (!r) return null;
        const result = awardXP(r, amount);
        this.drawPartyHud();
        return result;
      },
      isRiftShardSelecting: () => this.riftShardSelecting,
      /** Trinket inventory (equipped + bag). */
      getTrinkets: () => this.party.trinkets,
      /** Whether any startup or trinket-selection overlay is currently open. */
      isTrinketSelectOpen: () => this.starterSelectActive || !!this.riftShardUI,
      /**
       * Dismiss whichever selection overlay is open by simulating key '1'.
       * Handles the two-phase startup (riftling select → trinket select) atomically:
       * dispatching '1' for the riftling phase runs onStarterPicked synchronously,
       * which opens the trinket phase (setting riftShardUI), then we dispatch '1'
       * again so both are dismissed in one call — for QA testing only.
       */
      dismissTrinketSelect: () => {
        if (this.starterSelectActive) {
          // Phase 1: riftling selection — '1' picks emberhound and synchronously
          // calls showStarterTrinketSelect, which registers the trinket onKey handler.
          window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
          // Phase 2: trinket selection is now open (riftShardUI set); dismiss it too.
          if (this.riftShardUI) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
          }
          return;
        }
        if (this.riftShardUI) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
        }
      },
    };
  }

  // --- Room rendering ---

  private loadRoom(room: DungeonRoom): void {
    // Clear previous room visuals — preserve persistent HUD/player objects
    const persistentArr: (Phaser.GameObjects.GameObject | undefined)[] = [
      this.trainer,
      this.timerText, this.roomLabel, this.minimapGfx,
      this.partyHud, this.recruitPrompt?.getContainer(),
      this.partyScreen?.getContainer(),
      this.combatHud?.getContainer(),
      this.synergyHud?.getContainer(),
      this.riftShardUI ?? undefined,
      this.trinketSelectUI ?? undefined,
      this.synergyHud?.getTooltipContainer(),
    ];
    const persistent = new Set(persistentArr.filter(Boolean) as Phaser.GameObjects.GameObject[]);
    this.children.getAll().forEach((child) => {
      if (!persistent.has(child)) child.destroy();
    });
    this.companions = [];
    this.healingSpring = null;
    this.riftShard = null;
    this.walls.clear(true, true);
    this.doorZones = [];
    this.tileEntries = [];
    this.decorationEntries = [];

    const tmpl = room.template;
    const roomPixelW = tmpl.width * TILE;
    const roomPixelH = tmpl.height * TILE;
    const isHub = tmpl.type === 'hub';

    // Hub rooms bypass cardinal edge masking — their door tiles are authored
    // at explicit positions via tmpl.hubDoorSlots and always stay walkable.
    // Everything else resolves doors through getActiveEdges.
    const activeEdges = isHub ? new Set<string>() : this.getActiveEdges(room);

    // Build resolved tile grid (mask inactive doors as walls, except for
    // hub rooms where all authored doors stay open).
    const resolved: number[][] = [];
    for (let y = 0; y < tmpl.height; y++) {
      const row: number[] = [];
      for (let x = 0; x < tmpl.width; x++) {
        let t = tmpl.tiles[y][x];
        if (t === 3 && !isHub) {
          const edge = this.tileEdge(x, y, tmpl.width, tmpl.height);
          if (!edge || !activeEdges.has(edge)) t = 2;
        }
        row.push(t);
      }
      resolved.push(row);
    }

    // Safety net: make sure every active edge actually has a walkable door
    // in the resolved grid. Some templates (and some builder-edited overrides)
    // only author doors on a subset of edges — if the dungeon graph picks
    // that template for a room that needs an exit on a different edge, the
    // player would otherwise spawn into a sealed room. Carve a 2-tile
    // opening at the edge midpoint in that case. Hub rooms are exempt —
    // their doors are authored explicitly via hubDoorSlots.
    if (!isHub) {
      for (const edge of activeEdges) {
        if (this.edgeHasDoor(resolved, tmpl.width, tmpl.height, edge)) continue;
        this.carveEdgeDoor(resolved, tmpl.width, tmpl.height, edge);
      }
    }

    const biome = tmpl.biome || 'dungeon';

    // Initialize tracking grid
    for (let y = 0; y < tmpl.height; y++) {
      const row: TileEntry[] = [];
      for (let x = 0; x < tmpl.width; x++) {
        row.push({ image: null, overlay: null, wallBody: null });
      }
      this.tileEntries.push(row);
    }

    // Render tiles (populate tracking entries)
    for (let y = 0; y < tmpl.height; y++) {
      for (let x = 0; x < tmpl.width; x++) {
        this.renderTileAt(x, y, resolved, tmpl.width, tmpl.height, biome);
      }
    }

    // Decorative props (trees, grass, etc.) — rendered above the floor, below
    // the player. Collidable props add a static physics body to the `walls`
    // group so existing trainer/companion colliders apply without extra wiring.
    if (tmpl.decorations) {
      for (const dec of tmpl.decorations) {
        this.spawnDecorationSprite(dec.sprite, dec.x, dec.y);
      }
    }

    // Create door trigger zones using grid-position-based mapping
    this.createDoorZones(room, resolved);

    // Set physics bounds
    this.physics.world.setBounds(0, 0, roomPixelW, roomPixelH);

    // Compute the set of tiles blocked by decoration collision bodies so the
    // pathfinder routes around trees, logs, etc. instead of cutting straight
    // through them and leaving followers grinding against the collider.
    const decBlocked = new Set<number>();
    for (const entry of this.decorationEntries) {
      if (!entry.body) continue;
      const body = entry.body.body as Phaser.Physics.Arcade.StaticBody;
      const minTx = Math.floor(body.x / TILE);
      const maxTx = Math.floor((body.x + body.width - 1) / TILE);
      const minTy = Math.floor(body.y / TILE);
      const maxTy = Math.floor((body.y + body.height - 1) / TILE);
      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          if (tx >= 0 && tx < tmpl.width && ty >= 0 && ty < tmpl.height) {
            decBlocked.add(ty * tmpl.width + tx);
          }
        }
      }
    }

    // Build nav grid from the resolved tile map for this room (plus the
    // decoration-blocked tiles computed above).
    this.nav = new SimpleNav(resolved, TILE, decBlocked);

    room.visited = true;
  }

  /** Compute which edges (north/south/east/west) have connections. */
  private getActiveEdges(room: DungeonRoom): Set<string> {
    const edges = new Set<string>();
    for (const connId of room.connections) {
      const conn = this.dungeon.rooms[connId];
      // Non-backtrack: skip connections to visited rooms so the door tiles
      // for "the way we came" get masked to walls rather than rendering as
      // walkable-but-inert openings. Terminal rooms ignore this filter so
      // the teleport-back door stays visible.
      if (!room.terminal && conn.visited) continue;
      const dx = conn.gridX - room.gridX;
      const dy = conn.gridY - room.gridY;
      if (dx === 0 && dy < 0) edges.add('north');
      else if (dx === 0 && dy > 0) edges.add('south');
      else if (dy === 0 && dx > 0) edges.add('east');
      else if (dy === 0 && dx < 0) edges.add('west');
      else {
        // Diagonal — pick primary direction
        if (Math.abs(dy) >= Math.abs(dx)) edges.add(dy < 0 ? 'north' : 'south');
        else edges.add(dx > 0 ? 'east' : 'west');
      }
    }
    return edges;
  }

  /** True if the resolved grid has at least one door tile (3) on `edge`. */
  private edgeHasDoor(
    resolved: number[][],
    w: number,
    h: number,
    edge: string,
  ): boolean {
    if (edge === 'north') {
      for (let x = 0; x < w; x++) if (resolved[0][x] === 3) return true;
      return false;
    }
    if (edge === 'south') {
      for (let x = 0; x < w; x++) if (resolved[h - 1][x] === 3) return true;
      return false;
    }
    if (edge === 'west') {
      for (let y = 0; y < h; y++) if (resolved[y][0] === 3) return true;
      return false;
    }
    if (edge === 'east') {
      for (let y = 0; y < h; y++) if (resolved[y][w - 1] === 3) return true;
      return false;
    }
    return false;
  }

  /**
   * Carve a 2-tile door at the midpoint of `edge` by converting wall tiles
   * on that edge to door (3). Mutates the passed resolved grid in-place.
   * Used as a safety net when a picked template doesn't author a door on
   * an edge the dungeon graph requires.
   */
  private carveEdgeDoor(
    resolved: number[][],
    w: number,
    h: number,
    edge: string,
  ): void {
    if (edge === 'north' || edge === 'south') {
      const y = edge === 'north' ? 0 : h - 1;
      const cx = Math.floor(w / 2);
      resolved[y][cx - 1] = 3;
      resolved[y][cx] = 3;
    } else {
      const x = edge === 'west' ? 0 : w - 1;
      const cy = Math.floor(h / 2);
      resolved[cy - 1][x] = 3;
      resolved[cy][x] = 3;
    }
  }

  /** Which edge a tile sits on (or null if interior). */
  private tileEdge(x: number, y: number, w: number, h: number): string | null {
    if (y === 0) return 'north';
    if (y === h - 1) return 'south';
    if (x === 0) return 'west';
    if (x === w - 1) return 'east';
    return null;
  }

  /**
   * Render a single tile using a Wang-tile biome tileset.
   *
   * Wang index uses corner bits: (SE << 0) | (SW << 1) | (NE << 2) | (NW << 3)
   * A corner is "upper" (cliff/wall) if ANY of the 3 tiles sharing that corner
   * is a wall (2) or void (0) / out-of-bounds.
   *
   * Dark lava special case: the dark_lava biome's wang_15 is molten lava,
   * which is appropriate for interior hazard pools but wrong for the room
   * perimeter (a full lava frame around every room looks like a cage). So
   * for dark_lava, tile 2 walls on the room edge are treated as "lower" for
   * wang computation and rendered with dark_grass_cliff's wang_15 stone cliff.
   * Interior wall tiles (lava pools) keep the normal lava treatment.
   */
  private renderBiomeTile(
    biome: Biome,
    grid: number[][],
    x: number, y: number,
    w: number, h: number,
    px: number, py: number,
    tileType: number,
  ): Phaser.GameObjects.Image {
    // True for a tile 2 wall that sits on the room perimeter in dark_lava.
    // Such walls render as stone cliff (not lava) and count as "lower" for
    // wang index computation so neighboring floors don't show lava transitions.
    const isDarkLavaEdgeWall = (tx: number, ty: number): boolean => {
      if (biome !== 'dark_lava') return false;
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) return false;
      if (grid[ty][tx] !== 2) return false;
      return tx === 0 || tx === w - 1 || ty === 0 || ty === h - 1;
    };

    // For door tiles, OOB = open (grass extends outward through the exit).
    // For dark_lava floor tiles, OOB = lower (stone extends past the edge) so
    // edge floors don't render with lava transitions on their outer corners.
    // For all other tiles, OOB = upper (cliff closes the room boundary).
    const oobIsUpper = tileType !== 3 && !(biome === 'dark_lava' && tileType === 1);
    const isUpper = (tx: number, ty: number): boolean => {
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) return oobIsUpper;
      if (isDarkLavaEdgeWall(tx, ty)) return false;
      const t = grid[ty][tx];
      return t === 2 || t === 0 || t === 4; // wall, void, or walkable water
    };

    if (tileType === 0) {
      // Void: render full upper terrain
      return this.add.image(px, py, `${biome}_15`).setDepth(-2);
    }

    if (tileType === 2) {
      // Dark lava perimeter walls render as dark stone cliff (not lava) so
      // the room doesn't feel caged. Interior lava pools keep wang_15 lava.
      if (isDarkLavaEdgeWall(x, y)) {
        return this.add.image(px, py, 'dark_grass_cliff_15').setDepth(-1);
      }
      // Wall: render full upper terrain
      return this.add.image(px, py, `${biome}_15`).setDepth(-1);
    }

    if (tileType === 4) {
      // Walkable water: render as upper terrain but no collision
      return this.add.image(px, py, `${biome}_15`).setDepth(-1);
    }

    // Floor (1) or active door (3): compute Wang index from neighbors
    // A corner is "upper" if any of the 3 neighboring tiles at that corner is wall/void/OOB
    const nw = (isUpper(x - 1, y) || isUpper(x, y - 1) || isUpper(x - 1, y - 1)) ? 1 : 0;
    const ne = (isUpper(x + 1, y) || isUpper(x, y - 1) || isUpper(x + 1, y - 1)) ? 1 : 0;
    const sw = (isUpper(x - 1, y) || isUpper(x, y + 1) || isUpper(x - 1, y + 1)) ? 1 : 0;
    const se = (isUpper(x + 1, y) || isUpper(x, y + 1) || isUpper(x + 1, y + 1)) ? 1 : 0;

    const wangIndex = (se << 0) | (sw << 1) | (ne << 2) | (nw << 3);
    const img = this.add.image(px, py, `${biome}_${wangIndex}`).setDepth(-1);

    // Door highlight — also tracked on the tile entry for builder cleanup
    if (tileType === 3) {
      const overlay = this.add.rectangle(px, py, TILE, TILE, 0x66aaff, 0.25).setDepth(0);
      if (this.tileEntries[y]?.[x]) {
        this.tileEntries[y][x].overlay = overlay;
      }
    }
    return img;
  }

  /**
   * Render (or re-render) a single tile at (x,y) using the current room's
   * resolved tile grid. Destroys any previously tracked image/overlay/wall
   * body at that position first. Used by both initial room load and the
   * in-browser builder's live-edit path.
   */
  private renderTileAt(
    x: number,
    y: number,
    resolved: number[][],
    w: number,
    h: number,
    biome: Biome | 'dungeon',
  ): void {
    const entry = this.tileEntries[y]?.[x];
    if (!entry) return;

    // Clear previous render
    if (entry.image) { entry.image.destroy(); entry.image = null; }
    if (entry.overlay) { entry.overlay.destroy(); entry.overlay = null; }
    if (entry.wallBody) {
      this.walls.remove(entry.wallBody, true, true);
      entry.wallBody = null;
    }

    const tileType = resolved[y][x];
    const px = x * TILE + TILE / 2;
    const py = y * TILE + TILE / 2;

    if (biome !== 'dungeon') {
      entry.image = this.renderBiomeTile(biome, resolved, x, y, w, h, px, py, tileType);
    } else {
      switch (tileType) {
        case 0:
          entry.image = this.add.image(px, py, 'void').setDepth(-2);
          break;
        case 1:
          entry.image = this.add.image(px, py, 'floor').setDepth(-1);
          break;
        case 2:
          entry.image = this.add.image(px, py, 'wall').setDepth(-1);
          break;
        case 3:
          entry.image = this.add.image(px, py, 'floor').setDepth(-1);
          entry.overlay = this.add.rectangle(px, py, TILE, TILE, 0x66aaff, 0.25).setDepth(0);
          break;
      }
    }

    // Physics collider for walls/void
    if (tileType === 2 || tileType === 0) {
      const wallBody = this.walls.create(px, py, 'wall') as Phaser.Physics.Arcade.Sprite;
      wallBody.setVisible(false);
      wallBody.setSize(TILE, TILE);
      wallBody.refreshBody();
      entry.wallBody = wallBody;
    }
  }

  /**
   * Instantiate a decoration sprite + collision body at the given tile
   * coordinates and record it in decorationEntries. Returns false if the
   * sprite key is unknown.
   */
  private spawnDecorationSprite(sprite: string, tileX: number, tileY: number): boolean {
    const def = DECORATION_CATALOG[sprite];
    if (!def) {
      console.warn(`Unknown decoration sprite: ${sprite}`);
      return false;
    }
    const worldX = tileX * TILE + TILE / 2;
    const worldY = tileY * TILE + TILE / 2;
    const img = this.add.image(worldX, worldY, def.key);
    const longer = Math.max(img.width, img.height);
    const scale = def.displaySize / longer;
    img.setScale(scale);
    img.setOrigin(0.5, 1.0);
    img.y = worldY + (img.height * scale) / 2;
    // Depth based on bottom-Y so decorations sort correctly with characters
    img.setDepth(10 + img.y / 10);

    let body: Phaser.Physics.Arcade.Sprite | null = null;
    if (def.collides) {
      const bodyW = def.collisionWidth ?? Math.round(def.displaySize * 0.4);
      const bodyH = def.collisionHeight ?? Math.round(def.displaySize * 0.3);
      // Place collision at the sprite's base (trunk level) rather than tile center.
      // img.y is the bottom edge of the sprite (origin 1.0); center the box there.
      const bodyY = img.y - bodyH / 2;
      body = this.walls.create(worldX, bodyY, 'wall') as Phaser.Physics.Arcade.Sprite;
      body.setVisible(false);
      body.setSize(bodyW, bodyH);
      body.refreshBody();
    }

    this.decorationEntries.push({ sprite, x: tileX, y: tileY, img, body });
    return true;
  }

  // ─── In-browser builder live-edit hooks ────────────────────────────
  //
  // These methods are called by src/editor/builder_mode.ts to apply edits
  // to the running room without a full reload. They mutate both the
  // rendered sprites AND the currentRoom.template object so saves see the
  // latest state. They're intentionally public but gated on dev-only
  // builder import so prod builds don't reach them.

  /** Return the currently loaded room template (for builder readback). */
  public getCurrentTemplate(): RoomTemplate {
    return this.currentRoom.template;
  }

  /** Return the current Phaser camera (builder needs scrollX/scrollY). */
  public getCurrentCamera(): Phaser.Cameras.Scene2D.Camera {
    return this.cameras.main;
  }

  /** Return the physics walls group so the builder can inspect bodies. */
  public getWallsGroup(): Phaser.Physics.Arcade.StaticGroup {
    return this.walls;
  }

  /**
   * Re-render the tile at (x,y) and its 8 neighbors. Call after mutating
   * `currentRoom.template.tiles[y][x]` from the builder so wang transitions
   * stay consistent. No-op if coords are out of bounds.
   */
  public rebuildTileNeighborhood(x: number, y: number): void {
    const tmpl = this.currentRoom.template;
    if (x < 0 || y < 0 || x >= tmpl.width || y >= tmpl.height) return;

    const activeEdges = this.getActiveEdges(this.currentRoom);
    const resolved: number[][] = [];
    for (let ry = 0; ry < tmpl.height; ry++) {
      const row: number[] = [];
      for (let rx = 0; rx < tmpl.width; rx++) {
        let t = tmpl.tiles[ry][rx];
        if (t === 3) {
          const edge = this.tileEdge(rx, ry, tmpl.width, tmpl.height);
          if (!edge || !activeEdges.has(edge)) t = 2;
        }
        row.push(t);
      }
      resolved.push(row);
    }
    const biome = tmpl.biome || 'dungeon';

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= tmpl.width || ny >= tmpl.height) continue;
        this.renderTileAt(nx, ny, resolved, tmpl.width, tmpl.height, biome);
      }
    }
  }

  /**
   * Add a decoration to the currently loaded room at (tileX, tileY).
   * Mutates template.decorations AND spawns the sprite. Returns false if
   * the sprite key is unknown.
   */
  public addDecoration(sprite: string, tileX: number, tileY: number): boolean {
    const tmpl = this.currentRoom.template;
    if (!tmpl.decorations) tmpl.decorations = [];
    if (!this.spawnDecorationSprite(sprite, tileX, tileY)) return false;
    tmpl.decorations.push({ sprite, x: tileX, y: tileY });
    return true;
  }

  /**
   * Remove the topmost decoration at integer (tileX, tileY). Destroys the
   * sprite + collision body, removes from decorationEntries, and rewrites
   * template.decorations. Returns the removed sprite key, or null.
   */
  public removeDecorationAt(tileX: number, tileY: number): string | null {
    // Find the latest match — decorations may have fractional coords so
    // match by floor.
    for (let i = this.decorationEntries.length - 1; i >= 0; i--) {
      const e = this.decorationEntries[i];
      if (Math.floor(e.x) === tileX && Math.floor(e.y) === tileY) {
        e.img.destroy();
        if (e.body) this.walls.remove(e.body, true, true);
        this.decorationEntries.splice(i, 1);

        // Sync template.decorations — find the matching entry by sprite+coords
        const tmpl = this.currentRoom.template;
        if (tmpl.decorations) {
          const idx = tmpl.decorations.findIndex(
            d => d.sprite === e.sprite && d.x === e.x && d.y === e.y,
          );
          if (idx >= 0) tmpl.decorations.splice(idx, 1);
        }
        return e.sprite;
      }
    }
    return null;
  }

  private createDoorZones(room: DungeonRoom, resolved: number[][]): void {
    const tmpl = room.template;

    // Hub rooms: spawn one trigger zone per door in dungeon.doors[] at the
    // authored tile position from tmpl.hubDoorSlots, targeting the branch's
    // entry room. Locked doors get a red overlay, sealed doors a grey
    // overlay, and neither spawns a walkable zone. The intro return door
    // (south-center) is authored into the template but gets no zone —
    // that's how we enforce "no backtrack to the intro zone".
    if (tmpl.type === 'hub' && tmpl.hubDoorSlots) {
      const slotLookup = new Map<number, { tx: number; ty: number }>();
      for (const s of tmpl.hubDoorSlots) {
        slotLookup.set(s.slot, { tx: s.tx, ty: s.ty });
      }

      const overlay = this.add.graphics().setDepth(5);

      for (const door of this.dungeon.doors) {
        const pos = slotLookup.get(door.slot);
        if (!pos) continue;

        // Resolve the target branch — could be regular, key path, or boss.
        let branch = this.dungeon.branches.find((b) => b.id === door.branchId) ?? null;
        if (!branch && this.dungeon.keyPath.id === door.branchId) branch = this.dungeon.keyPath;
        if (!branch && this.dungeon.boss.id === door.branchId) branch = this.dungeon.boss;
        if (!branch) continue;

        if (door.sealed || door.locked) {
          // Draw a 2-tile overlay matching the door's orientation (side
          // walls are 2-tall, north wall doors are 2-wide).
          const onHorizontalWall = pos.ty === 0 || pos.ty === tmpl.height - 1;
          const w = onHorizontalWall ? TILE * 2 : TILE;
          const h = onHorizontalWall ? TILE : TILE * 2;
          const color = door.sealed ? 0x222222 : 0x552222;
          overlay.fillStyle(color, 0.75);
          overlay.fillRect(pos.tx * TILE, pos.ty * TILE, w, h);
          continue;
        }

        const zone = this.add.zone(
          pos.tx * TILE + TILE / 2,
          pos.ty * TILE + TILE / 2,
          TILE,
          TILE,
        );
        this.physics.add.existing(zone, true);
        this.doorZones.push({ zone, targetRoomId: branch.entryRoomId });
      }
      return;
    }

    // Non-hub rooms: infer edge → target from grid positions and spawn
    // trigger zones on active door tiles. For rooms that connect back to
    // the hub (branch entry rooms), the hub is treated as a single cardinal
    // neighbour via the same edge-inference fallback as any other link.
    //
    // Terminal rooms (end of a branch) redirect ALL door zones to the hub
    // instead of the previous branch room. This is the "teleport back to
    // the hall" — the player walks into any door in the terminal and lands
    // in the hub without backtracking through combat rooms.
    //
    // No-backtrack: for non-terminal branch rooms, connections to already
    // visited rooms are skipped. The player can only enter from a visited
    // room, so filtering those out leaves exactly the forward doors. Hub
    // is marked visited from spawn, so this also blocks branch-entry rooms
    // from walking back into the hub.
    const terminalTeleportTarget = room.terminal ? this.dungeon.hubRoomId : null;
    const edgeToRoom = new Map<string, number>();
    for (const connId of room.connections) {
      const conn = this.dungeon.rooms[connId];
      if (!room.terminal && conn.visited) continue;
      const dx = conn.gridX - room.gridX;
      const dy = conn.gridY - room.gridY;
      let edge: string;
      if (dx === 0) edge = dy < 0 ? 'north' : 'south';
      else if (dy === 0) edge = dx > 0 ? 'east' : 'west';
      else edge = Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? 'north' : 'south') : (dx > 0 ? 'east' : 'west');
      edgeToRoom.set(edge, terminalTeleportTarget ?? connId);
    }

    // Iterate the resolved grid (not tmpl.tiles) so door zones appear on
    // any door tile — including ones carved by loadRoom's safety net to
    // ensure every active edge has a walkable exit.
    for (let y = 0; y < tmpl.height; y++) {
      for (let x = 0; x < tmpl.width; x++) {
        if (resolved[y][x] !== 3) continue;
        const edge = this.tileEdge(x, y, tmpl.width, tmpl.height);
        if (!edge) continue;
        const targetRoomId = edgeToRoom.get(edge);
        if (targetRoomId === undefined) continue;

        const zone = this.add.zone(
          x * TILE + TILE / 2,
          y * TILE + TILE / 2,
          TILE,
          TILE,
        );
        this.physics.add.existing(zone, true);
        this.doorZones.push({ zone, targetRoomId });
      }
    }
  }

  // --- Trainer ---

  private spawnTrainer(tmpl: RoomTemplate): void {
    const spawnX = tmpl.playerSpawn.x * TILE + TILE / 2;
    const spawnY = tmpl.playerSpawn.y * TILE + TILE / 2;

    if (this.trainer) {
      this.trainer.setPosition(spawnX, spawnY);
      this.trainer.setVelocity(0, 0);
    } else {
      this.trainer = this.physics.add.sprite(spawnX, spawnY, 'player_south');
      this.trainer.setDepth(10 + spawnY / 10);
      this.trainer.setScale(0.85);
      this.trainer.body!.setSize(24, 24);
    }

    this.trainer.setCollideWorldBounds(true);
    this.physics.add.collider(this.trainer, this.walls);

    // Seed the trail with a straight line extending south from the trainer
    // so newly-spawned companions immediately appear in a conga line behind
    // them rather than all stacking on the trainer's tile.
    this.resetTrail(0, 1);
  }

  // --- Companions ---

  /**
   * Sync overworld companion sprites to match the current party.
   * Reuses existing sprites where possible, creates new ones for recruits,
   * and removes extras if the party shrinks.
   */
  private syncCompanions(): void {
    const active = this.party.active;

    for (let i = 0; i < active.length; i++) {
      const riftling = active[i];
      // Place each new/reset companion at its breadcrumb-trail slot so the
      // conga line is visually correct on frame 1. The trail is seeded by
      // resetTrail() in spawnTrainer / transitionToRoom before we get here.
      // Falls back to the legacy formation offset if the trail is empty.
      let tx: number;
      let ty: number;
      if (this.trainerTrail.length > 0) {
        const slot = this.trailPointAtArcDistance((i + 1) * FOLLOWER_SPACING);
        tx = slot.x;
        ty = slot.y;
      } else {
        const offset = FOLLOW_OFFSETS[i] ?? FOLLOW_OFFSETS[FOLLOW_OFFSETS.length - 1];
        tx = this.trainer.x + offset.x;
        ty = this.trainer.y + offset.y;
      }
      const texture = `${riftling.texturePrefix}_south`;

      if (i < this.companions.length && this.companions[i].sprite.active) {
        // Reuse existing companion — reposition and update texture; reset nav state
        this.companions[i].sprite.setPosition(tx, ty).setVelocity(0, 0).setTexture(texture);
        this.companions[i].waypoints = [];
        this.companions[i].lastNavGoal = null;
        this.companions[i].lastPos = { x: tx, y: ty };
        this.companions[i].lastPosTime = 0;
        this.companions[i].dir = 'south';
      } else {
        // Create new companion sprite
        const sprite = this.physics.add.sprite(tx, ty, texture);
        sprite.setDepth(10 + ty / 10);
        sprite.setScale(0.7);

        const entry: CompanionState = {
          sprite,
          waypoints: [],
          lastNavGoal: null,
          lastPos: { x: tx, y: ty },
          lastPosTime: 0,
          dir: 'south',
        };
        if (i < this.companions.length) {
          this.companions[i] = entry;
        } else {
          this.companions.push(entry);
        }
      }

      this.physics.add.collider(this.companions[i].sprite, this.walls);
    }

    // Remove excess companions if party shrunk
    while (this.companions.length > active.length) {
      const c = this.companions.pop()!;
      if (c.sprite.active) c.sprite.destroy();
    }
  }

  // --- Camera ---

  private setupCamera(tmpl: RoomTemplate): void {
    const roomPixelW = tmpl.width * TILE;
    const roomPixelH = tmpl.height * TILE;
    const cam = this.cameras.main;

    // If a room is smaller than the viewport on an axis, the default
    // [0, size] camera bounds clamp the camera's left/top to 0 and leave
    // dead space on the right/bottom. Expand the bounds with a negative
    // offset so the camera can scroll to a position that visually centers
    // the room within the viewport.
    const viewW = cam.width;
    const viewH = cam.height;
    const boundsX = roomPixelW < viewW ? -(viewW - roomPixelW) / 2 : 0;
    const boundsY = roomPixelH < viewH ? -(viewH - roomPixelH) / 2 : 0;
    const boundsW = Math.max(roomPixelW, viewW);
    const boundsH = Math.max(roomPixelH, viewH);
    cam.setBounds(boundsX, boundsY, boundsW, boundsH);

    cam.startFollow(this.trainer, true, 0.1, 0.1);
    // Snap the camera to the player's current position immediately —
    // otherwise the lerp starts from [0,0] and the first frame draws the
    // room shifted hard to the left while the camera catches up.
    cam.centerOn(this.trainer.x, this.trainer.y);
  }

  // --- Input ---

  private setupInput(): void {
    if (!this.input.keyboard) return;
    this.keys = {
      W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // Tab opens party screen (use DOM event — Phaser swallows Tab)
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (this.partyScreen?.isActive) return; // PartyScreen handles its own close
        if (this.recruitPrompt?.isActive || this.combatManager?.isActive) return;
        this.partyScreen?.show();
      }

      // Q/E to cycle selected riftling (works in and out of combat)
      if (e.key === 'q' || e.key === 'Q') {
        this.cycleSelectedIndex(-1);
      } else if (e.key === 'e' || e.key === 'E') {
        this.cycleSelectedIndex(1);
      }

      // R — Rally (all riftlings sprint to trainer)
      if ((e.key === 'r' || e.key === 'R') && this.combatManager?.isActive) {
        this.combatManager.rally(this.time.now);
      }

      // F — Unleash (all signature moves fire)
      if ((e.key === 'f' || e.key === 'F') && this.combatManager?.isActive) {
        this.combatManager.unleash(this.time.now);
      }
    });

    // Disable right-click context menu on canvas
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;
      const inCombat = this.combatManager?.isActive ?? false;

      // Right-click during combat: focus target
      if (pointer.rightButtonDown() && inCombat) {
        const hit = this.combatManager.setFocusTarget(worldX, worldY);
        if (!hit) this.combatManager.clearFocusTarget();
        return;
      }

      // Left-click: try selecting a companion first
      let bestDist = 24;
      let bestIndex = -1;
      for (let i = 0; i < this.companions.length; i++) {
        const c = this.companions[i];
        if (!c.sprite.active) continue;
        const dx = c.sprite.x - worldX;
        const dy = c.sprite.y - worldY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = i;
        }
      }
      if (bestIndex >= 0) {
        this.selectedIndex = bestIndex;
        if (inCombat) {
          this.combatManager.selectAllyBySprite(this.companions[bestIndex].sprite);
        }
        this.drawPartyHud();
        return;
      }

      // Left-click on ground during combat: reposition selected riftling
      if (inCombat) {
        this.combatManager.repositionSelected(worldX, worldY, this.time.now);
      }
    });
  }

  // --- Combat ---

  private getActiveCompanion(): PartyRiftling {
    return this.party.active[this.activeCompanionIndex];
  }

  /** Cycle the selected riftling index, wrapping around. Syncs to CombatManager if in combat. */
  private cycleSelectedIndex(dir: 1 | -1): void {
    if (this.party.active.length === 0) return;
    this.selectedIndex = (this.selectedIndex + dir + this.party.active.length) % this.party.active.length;
    if (this.combatManager?.isActive) {
      this.combatManager.cycleSelection(dir);
    }
    this.drawPartyHud();
  }

  private tryStartCombat(): void {
    const tmpl = this.currentRoom.template;
    const isCombatRoom = ['combat', 'elite', 'recruit', 'boss'].includes(tmpl.type);

    if (isCombatRoom && !this.currentRoom.cleared && tmpl.enemySpawns.length > 0 && this.companions.length > 0) {
      const entries: CompanionEntry[] = this.party.active.map((data, i) => ({
        data,
        sprite: this.companions[i].sprite,
      }));

      // Scale difficulty by room depth and type
      // Rooms cleared so far (not counting start room) drives the ramp
      const roomsCleared = this.dungeon.rooms.filter((r) => r.cleared && r.template.type !== 'start').length;
      const depthScale = 1 + roomsCleared * 0.6;
      const typeBonus: Record<string, number> = { combat: 1, recruit: 1.2, elite: 2.0, boss: 3.0 };
      const difficulty = depthScale * (typeBonus[tmpl.type] ?? 1);

      // Scale enemy count for swarm feel — later rooms spawn many more enemies
      // Elite/boss keep their template counts (they're meant to be fewer, tougher foes)
      const spawns = [...tmpl.enemySpawns];
      if (tmpl.type === 'combat' || tmpl.type === 'recruit') {
        const extraCount = Math.floor(roomsCleared * 1.5);
        // Only use walkable floor tiles (value 1) so enemies don't spawn stuck in walls
        const floorTiles: { x: number; y: number }[] = [];
        for (let ry = 2; ry < tmpl.height - 2; ry++) {
          for (let rx = 2; rx < tmpl.width - 2; rx++) {
            if (tmpl.tiles[ry][rx] === 1) floorTiles.push({ x: rx, y: ry });
          }
        }
        for (let i = 0; i < extraCount && floorTiles.length > 0; i++) {
          const idx = Math.floor(Math.random() * floorTiles.length);
          spawns.push(floorTiles[idx]);
        }
      }

      // Determine entry side from trainer position relative to room center
      const roomPxW = tmpl.width * TILE;
      const roomPxH = tmpl.height * TILE;
      const cx = roomPxW / 2;
      const cy = roomPxH / 2;
      const relX = this.trainer.x - cx;
      const relY = this.trainer.y - cy;
      let entrySide: 'north' | 'south' | 'east' | 'west';
      if (Math.abs(relX) > Math.abs(relY)) {
        entrySide = relX > 0 ? 'east' : 'west';
      } else {
        entrySide = relY > 0 ? 'south' : 'north';
      }

      this.combatManager.startEncounter(
        spawns,
        entries,
        (defeated) => this.onRoomCleared(defeated),
        difficulty,
        roomPxW,
        roomPxH,
        entrySide,
        this.party.trinkets,
        this.nav,
      );
      // CombatHUD is always visible — no show/hide needed
    }
  }

  // --- Healing Spring ---

  private spawnHealingSpring(): void {
    const type = this.currentRoom.template.type;
    if (type !== 'healing' && type !== 'hub') return;

    this.healingUsed = false;
    const tmpl = this.currentRoom.template;
    // Use the template's actual center so this works for both the 30x20
    // healing room and the 14x26 hub.
    const cx = Math.floor(tmpl.width / 2) * TILE + TILE / 2;
    const cy = Math.floor(tmpl.height / 2) * TILE + TILE / 2;
    const radius = 20;

    // Glowing pool visual
    const gfx = this.add.graphics().setDepth(0);
    gfx.fillStyle(0x22aa66, 0.3);
    gfx.fillCircle(cx, cy, radius);
    gfx.fillStyle(0x44ffaa, 0.2);
    gfx.fillCircle(cx, cy, radius * 0.6);

    // Pulsing glow
    this.tweens.add({
      targets: gfx,
      alpha: { from: 0.7, to: 1 },
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    const label = this.add
      .text(cx, cy - radius - 6, 'Walk here to heal', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#44ffaa',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(100);

    // Trigger zone
    const zone = this.add.zone(cx, cy, radius * 2, radius * 2);
    this.physics.add.existing(zone, true);

    this.healingSpring = { zone, visual: gfx, label };
  }

  private checkHealingSpring(): void {
    if (!this.healingSpring || this.healingUsed) return;

    const trainerBounds = this.trainer.getBounds();
    const zoneBounds = this.healingSpring.zone.getBounds();

    if (Phaser.Geom.Rectangle.Overlaps(trainerBounds, zoneBounds)) {
      this.healingUsed = true;

      // Heal all active party members to full
      for (const r of this.party.active) {
        r.hp = r.maxHp;
      }

      // Visual feedback — flash green and update label
      this.healingSpring.label.setText('Healed!');
      this.healingSpring.label.setColor('#ffffff');
      this.cameras.main.flash(300, 30, 80, 50);
      this.showMessage('Party fully healed!', '#44ffaa');
      this.drawPartyHud();

      // Fade out the spring
      this.tweens.add({
        targets: [this.healingSpring.visual, this.healingSpring.label],
        alpha: 0,
        duration: 1500,
      });
    }
  }

  // --- Trinket selection ---

  /** Show the starter trinket selection at run start. Pauses timer until chosen. */
  private showStarterSelect(): void {
    this.starterSelectActive = true;
    // Pause timer during selection
    if (this.timerEvent) this.timerEvent.paused = true;

    const keys = AVAILABLE_RIFTLINGS;
    const container = this.add.container(0, 0).setDepth(700).setScrollFactor(0);

    // Dim overlay
    const overlay = this.add.rectangle(240, 160, 480, 320, 0x000000, 0.7);
    container.add(overlay);

    // Title
    container.add(this.add.text(240, 28, 'Choose Your Starter', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffdd44',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5));

    container.add(this.add.text(240, 44, 'Select a riftling to begin your run', {
      fontFamily: 'monospace', fontSize: '8px', color: '#8866aa',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5));

    // Grid layout — 4 columns
    const cols = 4;
    const cardW = 100;
    const cardH = 72;
    const gapX = 10;
    const gapY = 10;
    const rows = Math.ceil(keys.length / cols);
    const totalW = cols * cardW + (cols - 1) * gapX;
    const totalH = rows * cardH + (rows - 1) * gapY;
    const gridStartX = 240 - totalW / 2 + cardW / 2;
    const gridStartY = 160 - totalH / 2 + cardH / 2 + 10;

    keys.forEach((key, i) => {
      const tmpl = RIFTLING_TEMPLATES[key];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = gridStartX + col * (cardW + gapX);
      const cy = gridStartY + row * (cardH + gapY);
      const typeColor = TYPE_COLORS[tmpl.elementType] ?? 0xaaaaaa;

      // Card background
      const cardBg = this.add.graphics();
      cardBg.fillStyle(0x1a1a2e, 0.9);
      cardBg.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 6);
      cardBg.lineStyle(1, 0x334466, 0.8);
      cardBg.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 6);
      container.add(cardBg);

      // Sprite preview
      const sprite = this.add.image(cx, cy - 14, `${tmpl.texturePrefix}_south`).setScale(0.5);
      container.add(sprite);

      // Name
      container.add(this.add.text(cx, cy + 12, tmpl.name, {
        fontFamily: 'monospace', fontSize: '8px', color: '#ffffff',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5));

      // Type + Role
      const typeHex = '#' + typeColor.toString(16).padStart(6, '0');
      container.add(this.add.text(cx, cy + 22, `${tmpl.elementType} ${tmpl.role}`, {
        fontFamily: 'monospace', fontSize: '7px', color: typeHex,
        stroke: '#000000', strokeThickness: 1,
      }).setOrigin(0.5));

      // Key hint
      container.add(this.add.text(cx + cardW / 2 - 6, cy - cardH / 2 + 4, `${i + 1}`, {
        fontFamily: 'monospace', fontSize: '7px', color: '#ffdd44',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5));

      // Hit area
      const hitArea = this.add.rectangle(cx, cy, cardW, cardH, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hitArea.on('pointerover', () => {
        cardBg.clear();
        cardBg.fillStyle(0x1a1a2e, 0.9);
        cardBg.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 6);
        cardBg.lineStyle(2, typeColor, 0.9);
        cardBg.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 6);
      });
      hitArea.on('pointerout', () => {
        cardBg.clear();
        cardBg.fillStyle(0x1a1a2e, 0.9);
        cardBg.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 6);
        cardBg.lineStyle(1, 0x334466, 0.8);
        cardBg.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 6);
      });
      hitArea.on('pointerdown', () => {
        window.removeEventListener('keydown', onKey);
        container.destroy(true);
        this.onStarterPicked(key);
      });
      container.add(hitArea);
    });

    // Keyboard: 1-9 then 0 for 10th, a for 11th, b for 12th
    const keyMap = ['1','2','3','4','5','6','7','8','9','0','a','b','c','d','e','f'];
    const onKey = (e: KeyboardEvent) => {
      const idx = keyMap.indexOf(e.key.toLowerCase());
      if (idx >= 0 && idx < keys.length) {
        window.removeEventListener('keydown', onKey);
        container.destroy(true);
        this.onStarterPicked(keys[idx]);
      }
    };
    window.addEventListener('keydown', onKey);
  }

  private onStarterPicked(key: string): void {
    this.starterSelectActive = false;
    // Replace the default party with the chosen starter
    this.party.active = [createRiftling(key)];
    this.party.bench = [];
    this.syncCompanions();
    this.drawPartyHud();
    this.synergyHud?.refresh();

    // Chain into trinket selection
    this.showStarterTrinketSelect();
  }

  private showStarterTrinketSelect(): void {
    // Pause the timer during selection
    if (this.timerEvent) this.timerEvent.paused = true;

    const choices = pickRandomTrinkets(3);
    this.showTrinketSelection(choices, (trinket) => {
      this.onTrinketPicked(trinket);
      // Resume timer and start combat if the start room is a combat room
      if (this.timerEvent) this.timerEvent.paused = false;
      this.tryStartCombat();
    }, 'Choose a Trinket', 'Select one to bring on your run');
  }

  // --- Rift Shard ---

  private spawnRiftShard(): void {
    if (this.currentRoom.template.type !== 'rift_shard') return;

    this.riftShardUsed = false;
    const cx = 15 * TILE + TILE / 2;
    const cy = 10 * TILE + TILE / 2;
    const radius = 18;

    // Glowing shard crystal visual
    const gfx = this.add.graphics().setDepth(0);
    // Outer glow
    gfx.fillStyle(0x7744cc, 0.2);
    gfx.fillCircle(cx, cy, radius + 6);
    // Crystal body — diamond shape
    gfx.fillStyle(0xaa66ff, 0.6);
    gfx.fillTriangle(cx, cy - radius, cx - 10, cy, cx + 10, cy);
    gfx.fillStyle(0x8844dd, 0.7);
    gfx.fillTriangle(cx, cy + radius, cx - 10, cy, cx + 10, cy);
    // Bright core
    gfx.fillStyle(0xddaaff, 0.5);
    gfx.fillCircle(cx, cy, 4);

    // Pulsing glow
    this.tweens.add({
      targets: gfx,
      alpha: { from: 0.7, to: 1 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
    });

    const label = this.add
      .text(cx, cy - radius - 10, 'Rift Shard', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#bb88ff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(100);

    // Trigger zone
    const zone = this.add.zone(cx, cy, radius * 2.5, radius * 2.5);
    this.physics.add.existing(zone, true);

    this.riftShard = { zone, visual: gfx, label };
  }

  private checkRiftShard(): void {
    if (!this.riftShard || this.riftShardUsed || this.riftShardSelecting) return;

    const trainerBounds = this.trainer.getBounds();
    const zoneBounds = this.riftShard.zone.getBounds();

    if (Phaser.Geom.Rectangle.Overlaps(trainerBounds, zoneBounds)) {
      this.riftShardSelecting = true;
      this.stopAllMovement();
      this.showTrinketSelection();
    }
  }

  private showTrinketSelection(choices?: TrinketDef[], onPicked?: (trinket: TrinketDef) => void, title = 'Rift Shard', subtitle = 'Choose a trinket'): void {
    if (!choices) choices = pickRandomTrinkets(2);
    if (!onPicked) onPicked = (t) => this.selectRiftShardTrinket(t);

    // Build selection UI as a container (screen-space)
    const container = this.add.container(0, 0).setDepth(700).setScrollFactor(0);
    this.riftShardUI = container;

    // Dim overlay
    const overlay = this.add.rectangle(240, 160, 480, 320, 0x000000, 0.6);
    container.add(overlay);

    // Title
    const titleText = this.add
      .text(240, 60, title, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffdd44',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    container.add(titleText);

    const subtitleLabel = this.add
      .text(240, 78, subtitle, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#8866aa',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5);
    container.add(subtitleLabel);

    // Trinket cards
    const cardW = 140;
    const cardH = 100;
    const gap = 20;
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
    const startX = 240 - totalW / 2 + cardW / 2;

    choices.forEach((trinket, i) => {
      const cx = startX + i * (cardW + gap);
      const cy = 160;

      const color = trinketColor(trinket);

      // Card background
      const cardBg = this.add.graphics();
      cardBg.fillStyle(0x1a1a2e, 0.9);
      cardBg.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 6);
      cardBg.lineStyle(1, 0x334466, 0.8);
      cardBg.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 6);
      container.add(cardBg);

      // Trinket icon (colored diamond)
      const icon = this.add.graphics();
      icon.fillStyle(color, 0.8);
      icon.fillTriangle(cx, cy - 30, cx - 8, cy - 18, cx + 8, cy - 18);
      icon.fillStyle(color, 0.6);
      icon.fillTriangle(cx, cy - 10, cx - 8, cy - 18, cx + 8, cy - 18);
      container.add(icon);

      // Name
      const nameText = this.add
        .text(cx, cy, trinket.name, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 2,
          wordWrap: { width: cardW - 12 },
          align: 'center',
        })
        .setOrigin(0.5);
      container.add(nameText);

      // Description
      const descText = this.add
        .text(cx, cy + 18, trinket.description, {
          fontFamily: 'monospace',
          fontSize: '7px',
          color: '#44ff88',
          stroke: '#000000',
          strokeThickness: 1,
          wordWrap: { width: cardW - 12 },
          align: 'center',
        })
        .setOrigin(0.5, 0);
      container.add(descText);

      // Flavor text
      const flavorText = this.add
        .text(cx, cy + 34, trinket.flavor, {
          fontFamily: 'monospace',
          fontSize: '6px',
          color: '#666666',
          wordWrap: { width: cardW - 12 },
          align: 'center',
        })
        .setOrigin(0.5, 0);
      container.add(flavorText);

      // Hover + click hit area
      const hitArea = this.add.rectangle(cx, cy, cardW, cardH, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hitArea.on('pointerover', () => {
        cardBg.clear();
        cardBg.fillStyle(0x1a1a2e, 0.9);
        cardBg.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 6);
        cardBg.lineStyle(2, 0x66aaff, 0.9);
        cardBg.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 6);
      });
      hitArea.on('pointerout', () => {
        cardBg.clear();
        cardBg.fillStyle(0x1a1a2e, 0.9);
        cardBg.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 6);
        cardBg.lineStyle(1, 0x334466, 0.8);
        cardBg.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 6);
      });
      hitArea.on('pointerdown', () => {
        window.removeEventListener('keydown', onKey);
        if (this.riftShardUI) { this.riftShardUI.destroy(true); this.riftShardUI = null; }
        onPicked!(trinket);
      });
      container.add(hitArea);

      // Key hint
      const keyLabel = this.add
        .text(cx, cy + cardH / 2 - 10, `[${i + 1}]`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#ffdd44',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5);
      container.add(keyLabel);
    });

    // Keyboard listener
    const onKey = (e: KeyboardEvent) => {
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < choices.length) {
        window.removeEventListener('keydown', onKey);
        if (this.riftShardUI) { this.riftShardUI.destroy(true); this.riftShardUI = null; }
        onPicked!(choices[idx]);
      }
    };
    window.addEventListener('keydown', onKey);
  }

  /** Handle a trinket being selected — add to inventory and apply immediate effects. */
  private onTrinketPicked(trinket: TrinketDef): void {
    addTrinket(this.party.trinkets, trinket);

    // Apply immediate special effects
    if (trinket.special === 'timer_bonus' && trinket.specialValue) {
      this.timerSeconds += trinket.specialValue;
      this.timerText?.setText(this.formatTime(this.timerSeconds));
    }

    // Visual feedback
    this.cameras.main.flash(300, 80, 50, 120);
    this.showMessage(`Equipped: ${trinket.name}`, '#bb88ff');
  }

  /** Called from rift shard room when a trinket is picked in-dungeon. */
  private selectRiftShardTrinket(trinket: TrinketDef): void {
    this.onTrinketPicked(trinket);
    this.riftShardUsed = true;
    this.riftShardSelecting = false;

    // Shatter the shard
    if (this.riftShard) {
      this.riftShard.label.setText('Shattered');
      this.riftShard.label.setColor('#666666');
      this.tweens.add({
        targets: [this.riftShard.visual, this.riftShard.label],
        alpha: 0,
        duration: 800,
      });
    }
  }

  private stopAllMovement(): void {
    this.trainer.setVelocity(0, 0);
    for (const c of this.companions) {
      if (c.sprite.active) c.sprite.setVelocity(0, 0);
    }
  }

  private onRoomCleared(defeated: DefeatedRiftling[]): void {
    this.currentRoom.cleared = true;
    this.pendingRecruit = true;
    // CombatHUD stays visible — cooldown bars will stop updating when combat ends
    this.updateMinimap();
    this.stopAllMovement();

    // Sync all companion HP back from combat
    const hps = this.combatManager.getAllyHps();
    for (let i = 0; i < this.party.active.length; i++) {
      this.party.active[i].hp = hps[i] ?? this.party.active[i].hp;
    }

    // Distribute XP to all party members
    const xpEarned = this.combatManager.xpEarned;
    const levelUps = this.distributeXP(xpEarned);

    // Show "Room Cleared!" then level-ups, then recruit prompt
    this.roomClearedText = this.add
      .text(240, 130, 'Room Cleared!', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#44ff44',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(300);

    // Show XP earned
    if (xpEarned > 0) {
      const xpText = this.add
        .text(240, 150, `+${xpEarned} XP`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#aaccff',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(300);

      this.tweens.add({
        targets: xpText,
        y: xpText.y - 10,
        alpha: 0,
        duration: 1500,
        delay: 500,
        onComplete: () => xpText.destroy(),
      });
    }

    this.time.delayedCall(1000, () => {
      this.roomClearedText?.destroy();
      this.roomClearedText = null;

      // Recruiting is only offered in rooms that aren't part of a regular
      // branch's combat chain. Intro-zone combats (no branchId) allow
      // recruiting, and recruit-type terminal rooms are themselves the
      // recruit reward. Branch combats and elite/rift_shard terminals do
      // not — the branch's end-of-path room is the recruiting reward.
      const room = this.currentRoom;
      const recruitAllowed =
        room.branchId === undefined ||
        (room.terminal === true && room.template.type === 'recruit');

      // Show level-up notifications sequentially, then recruit prompt
      this.showLevelUps(levelUps, () => {
        if (defeated.length > 0 && recruitAllowed) {
          this.recruitPrompt.show(defeated, (recruited) => {
            if (recruited) {
              const added = addToParty(this.party, recruited);
              if (added) {
                this.showMessage(`${recruited.name} joined your team!`, '#44ff88');
              } else {
                this.showMessage('Team is full!', '#ff8844');
              }
            }
            this.syncCompanions();
            this.drawPartyHud();
            this.synergyHud?.refresh();
            this.pendingRecruit = false;
          });
        } else {
          this.pendingRecruit = false;
        }
      });
    });
  }

  /** Distribute XP to active (full) and bench (reduced) riftlings. Returns level-up results. */
  private distributeXP(totalXP: number): LevelUpResult[] {
    if (totalXP <= 0) return [];

    // Apply trinket XP multiplier
    const xpMult = getXPMultiplier(this.party.trinkets);
    totalXP = Math.floor(totalXP * xpMult);

    const levelUps: LevelUpResult[] = [];
    const benchXP = Math.floor(totalXP * BENCH_XP_RATIO);

    for (const riftling of this.party.active) {
      const result = awardXP(riftling, totalXP);
      if (result) levelUps.push(result);
    }
    for (const riftling of this.party.bench) {
      const result = awardXP(riftling, benchXP);
      if (result) levelUps.push(result);
    }

    this.drawPartyHud();
    return levelUps;
  }

  /** Show level-up banners one at a time, then call onDone. */
  private showLevelUps(levelUps: LevelUpResult[], onDone: () => void): void {
    if (levelUps.length === 0) {
      onDone();
      return;
    }

    const result = levelUps.shift()!;
    const r = result.riftling;

    // Build stat gains string
    const gains = result.gains.map((g) => `${g.stat} +${g.amount}`);

    const banner = this.add
      .text(240, 120, `${r.name} reached Lv.${r.level}!`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffdd44',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(310);

    const statsText = this.add
      .text(240, 138, gains.join('  '), {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#88ddff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(310);

    this.time.delayedCall(1200, () => {
      banner.destroy();
      statsText.destroy();
      this.showLevelUps(levelUps, onDone);
    });
  }

  private showMessage(text: string, color: string): void {
    const msg = this.add
      .text(240, 160, text, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(300);

    this.time.delayedCall(2000, () => msg.destroy());
  }

  // --- Room transitions ---

  /**
   * If `room` is a terminal of some branch, mark that branch cleared, seal
   * its hub door, set hasOrb when it's the key path, and refresh hub door
   * unlock states. No-op if the room isn't a terminal.
   */
  private sealBranchIfLeavingTerminal(room: DungeonRoom): void {
    if (!room.terminal || room.branchId === undefined) return;

    const dungeon = this.dungeon;
    const branchId = room.branchId;

    // Find the branch: check regular branches first, then special ones.
    let branch = dungeon.branches.find((b) => b.id === branchId) ?? null;
    let isKeyPath = false;
    let isBoss = false;
    if (!branch && dungeon.keyPath.id === branchId) {
      branch = dungeon.keyPath;
      isKeyPath = true;
    }
    if (!branch && dungeon.boss.id === branchId) {
      branch = dungeon.boss;
      isBoss = true;
    }
    if (!branch || branch.cleared) return;

    branch.cleared = true;
    const door = dungeon.doors.find((d) => d.branchId === branchId);
    if (door) door.sealed = true;

    if (isKeyPath) dungeon.hasOrb = true;
    // Boss clear: Stage 4 adds level-advance / victory. For now we just
    // seal the boss door like any other terminal.
    void isBoss;

    this.refreshHubDoorStates();
  }

  /**
   * Recompute locked/sealed flags on hub doors based on current dungeon
   * state. Runs after any branch-clear commit and before rendering the
   * hub's door zones.
   *
   * Unlock rules:
   *   - Regular branch doors: always unlocked (sealed flag handles cleared).
   *   - Key-path door:        locked until `level` regular branches cleared.
   *   - Boss door:            locked until hasOrb.
   */
  private refreshHubDoorStates(): void {
    const dungeon = this.dungeon;
    const clearedRegular = dungeon.branches.filter((b) => b.cleared).length;
    const keyThreshold = dungeon.level;
    for (const door of dungeon.doors) {
      if (door.slot === KEY_PATH_SLOT) {
        door.locked = clearedRegular < keyThreshold;
      } else if (door.slot === BOSS_SLOT) {
        door.locked = !dungeon.hasOrb;
      }
    }
  }

  private transitionToRoom(targetRoomId: number): void {
    // Clean up current combat (keep combatHud — it persists across rooms)
    this.combatManager.destroy();

    const prevRoom = this.currentRoom;
    const targetRoom = this.dungeon.rooms[targetRoomId];

    // If the player is leaving a terminal room, the branch is considered
    // cleared — seal its hub door, set hasOrb if it was the key path, and
    // let the hub unlock logic refresh on the next hub load. This fires
    // regardless of whether combat/UI flows have completed; walking out
    // of the terminal is the commit point.
    this.sealBranchIfLeavingTerminal(prevRoom);

    this.currentRoom = targetRoom;
    this.dungeon.currentRoomId = targetRoomId;

    this.loadRoom(targetRoom);

    // Spawn player near the door they entered from
    const tmpl = targetRoom.template;
    const { x: spawnX, y: spawnY } = this.getEntrySpawn(prevRoom, targetRoom, tmpl);

    this.trainer.setPosition(spawnX, spawnY);
    this.trainer.setVelocity(0, 0);

    this.physics.add.collider(this.trainer, this.walls);

    // Re-seed the trail behind the trainer so companions don't try to
    // follow stale breadcrumbs from the previous room (which would be in a
    // completely different world layout, possibly inside walls). Seed in
    // the direction the trainer came from (toward the entry door) so the
    // conga line trails back through that door. resetTrail clamps the
    // seed to walkable space, so it's safe against thin rooms / narrow halls.
    const entryDx = prevRoom.gridX - targetRoom.gridX;
    const entryDy = prevRoom.gridY - targetRoom.gridY;
    if (entryDx === 0 && entryDy === 0) {
      this.resetTrail(0, 1); // same-room fallback (shouldn't normally fire)
    } else {
      this.resetTrail(entryDx, entryDy);
    }

    this.syncCompanions();
    this.combatManager = new CombatManager(this, this.walls);
    this.combatHud.setCombatManager(this.combatManager);
    this.setupCamera(tmpl);
    this.updateMinimap();
    this.updateRoomLabel();

    // Brief flash effect for transition
    this.cameras.main.flash(200, 20, 10, 40);

    // Start combat if this is a combat room
    this.tryStartCombat();
    this.spawnHealingSpring();
    this.spawnRiftShard();
  }

  /** Determine pixel spawn position based on which edge the player enters from. */
  private getEntrySpawn(
    fromRoom: DungeonRoom,
    toRoom: DungeonRoom,
    tmpl: RoomTemplate,
  ): { x: number; y: number } {
    const dx = fromRoom.gridX - toRoom.gridX;
    const dy = fromRoom.gridY - toRoom.gridY;

    // Use the template's actual center so this works for any room size.
    // (Previously hardcoded 15/10 — correct for 30x20 rooms, off-scene for
    // the narrower hub.)
    const cx = Math.floor(tmpl.width / 2) * TILE + TILE / 2;
    const cy = Math.floor(tmpl.height / 2) * TILE + TILE / 2;

    // Player is arriving from the direction of fromRoom relative to toRoom
    if (dx === 0 && dy > 0) {
      // Came from south → spawn at bottom
      return { x: cx, y: (tmpl.height - 3) * TILE + TILE / 2 };
    } else if (dx === 0 && dy < 0) {
      // Came from north → spawn at top
      return { x: cx, y: 2 * TILE + TILE / 2 };
    } else if (dy === 0 && dx > 0) {
      // Came from east → spawn at right
      return { x: (tmpl.width - 3) * TILE + TILE / 2, y: cy };
    } else if (dy === 0 && dx < 0) {
      // Came from west → spawn at left
      return { x: 2 * TILE + TILE / 2, y: cy };
    }
    // Fallback: default player spawn
    return { x: tmpl.playerSpawn.x * TILE + TILE / 2, y: tmpl.playerSpawn.y * TILE + TILE / 2 };
  }

  // --- HUD ---

  private setupHUD(): void {
    this.timerText = this.add
      .text(8, 8, this.formatTime(this.timerSeconds), {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.roomLabel = this.add
      .text(240, 8, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#aaaaaa',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setOrigin(0.5, 0)
      .setDepth(100);

    this.updateRoomLabel();
  }

  private updateRoomLabel(): void {
    const tmpl = this.currentRoom.template;
    this.roomLabel.setText(`${tmpl.name} [${tmpl.type}]`);
  }

  private startTimer(): void {
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (this.recruitPrompt?.isActive || this.pendingRecruit || this.partyScreen?.isActive || this.riftShardSelecting) return;
        this.timerSeconds--;
        this.timerText.setText(this.formatTime(this.timerSeconds));

        if (this.timerSeconds <= 60) {
          this.timerText.setColor('#ff4444');
        } else if (this.timerSeconds <= 120) {
          this.timerText.setColor('#ffaa00');
        }

        if (this.timerSeconds <= 0) {
          this.timerEvent.destroy();
        }
      },
      loop: true,
    });
  }

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // --- Party HUD ---

  private setupPartyHud(): void {
    this.partyHud = this.add.container(0, 0).setDepth(100).setScrollFactor(0);
    this.drawPartyHud();
  }

  private drawPartyHud(): void {
    this.partyHud.removeAll(true);

    const gfx = this.add.graphics();
    this.partyHud.add(gfx);

    const TYPE_COLORS_NUM: Record<string, number> = {
      fire: 0xe85d30, water: 0x3092e8, nature: 0x4caf50,
      earth: 0x8d6e3f, light: 0xf0e060, dark: 0xb060e0,
    };

    const startX = 4;
    const slotW = 90;
    const slotH = 30;
    const gap = 2;
    const count = this.party.active.length;

    // Stack upward from the bottom of the screen
    const bottomY = 316;
    const topY = bottomY - count * (slotH + gap) + gap;

    const selectedIdx = this.selectedIndex;

    for (let i = 0; i < count; i++) {
      const r = this.party.active[i];
      const y = topY + i * (slotH + gap);
      const isSelected = i === selectedIdx;
      const typeColor = TYPE_COLORS_NUM[r.elementType] ?? 0x334466;

      // Slot background
      gfx.fillStyle(isSelected ? 0x1a2a3a : 0x0a0a1a, 0.82);
      gfx.fillRoundedRect(startX, y, slotW, slotH, 3);
      if (isSelected) {
        gfx.lineStyle(1, 0x66aaff);
        gfx.strokeRoundedRect(startX, y, slotW, slotH, 3);
      }

      // Type accent stripe on left edge
      gfx.fillStyle(typeColor, isSelected ? 0.9 : 0.5);
      gfx.fillRect(startX, y + 3, 2, slotH - 6);

      // Sprite icon
      const spriteKey = `${r.texturePrefix}_south`;
      if (this.textures.exists(spriteKey)) {
        const icon = this.add.image(startX + 14, y + slotH / 2, spriteKey).setScale(0.4);
        this.partyHud.add(icon);
      }

      // Name + level
      const nameText = this.add.text(startX + 28, y + 2, r.name, {
        fontFamily: 'monospace', fontSize: '7px', color: isSelected ? '#ffffff' : '#bbbbbb',
        stroke: '#000000', strokeThickness: 1,
      });
      this.partyHud.add(nameText);

      const lvlText = this.add.text(startX + slotW - 4, y + 2, `Lv${r.level}`, {
        fontFamily: 'monospace', fontSize: '6px', color: '#ffdd44',
        stroke: '#000000', strokeThickness: 1,
      }).setOrigin(1, 0);
      this.partyHud.add(lvlText);

      // Role label + HP numbers (same row, below name)
      const roleColors: Record<string, string> = {
        chaser: '#ff6644', anchor: '#6688cc', skirmisher: '#44cc88',
      };
      const hpRatio = r.hp / r.maxHp;
      const hpColor = hpRatio > 0.5 ? '#44cc44' : hpRatio > 0.25 ? '#ccaa22' : '#cc3333';

      const roleText = this.add.text(startX + 28, y + 12, r.role.toUpperCase(), {
        fontFamily: 'monospace', fontSize: '5px', color: roleColors[r.role] ?? '#777777',
        stroke: '#000000', strokeThickness: 1,
      });
      this.partyHud.add(roleText);

      // HP numbers right-aligned on the role line (above the bar, not on it)
      const hpLabel = this.add.text(startX + slotW - 4, y + 12, `${r.hp}/${r.maxHp}`, {
        fontFamily: 'monospace', fontSize: '5px', color: hpColor,
        stroke: '#000000', strokeThickness: 1,
      }).setOrigin(1, 0);
      this.partyHud.add(hpLabel);

      // HP bar (wider, at bottom of card — no text overlap)
      const barX = startX + 28;
      const barY = y + slotH - 7;
      const barW = slotW - 34;
      const barH = 4;

      gfx.fillStyle(0x000000, 0.6);
      gfx.fillRect(barX, barY, barW, barH);
      const barColor = hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xccaa22 : 0xcc3333;
      gfx.fillStyle(barColor);
      gfx.fillRect(barX, barY, Math.round(barW * hpRatio), barH);

      // Make clickable to select
      const hitZone = this.add.rectangle(startX + slotW / 2, y + slotH / 2, slotW, slotH, 0x000000, 0)
        .setScrollFactor(0).setDepth(101).setInteractive({ useHandCursor: true });
      hitZone.on('pointerdown', () => {
        this.selectedIndex = i;
        this.drawPartyHud();
      });
      this.partyHud.add(hitZone);
    }
  }

  // --- Minimap ---

  private setupMinimap(): void {
    this.minimapGfx = this.add.graphics()
      .setScrollFactor(0)
      .setDepth(100);
    this.updateMinimap();
  }

  private updateMinimap(): void {
    const gfx = this.minimapGfx;
    gfx.clear();

    const mapX = 400; // top-right area
    const mapY = 8;
    const cellSize = 14;
    const gap = 3;

    // Background
    gfx.fillStyle(0x000000, 0.5);
    gfx.fillRect(mapX - 4, mapY - 4, 80, 80);

    for (const room of this.dungeon.rooms) {
      const rx = mapX + room.gridX * (cellSize + gap);
      const ry = mapY + room.gridY * (cellSize + gap);

      if (!room.visited) {
        // Fog of war — show shape but not details
        gfx.fillStyle(0x333344, 0.6);
        gfx.fillRect(rx, ry, cellSize, cellSize);
        continue;
      }

      // Room color by type
      let color = 0x555577;
      switch (room.template.type) {
        case 'start': color = 0x3366cc; break;
        case 'hub': color = 0x4488ee; break;
        case 'combat': color = 0x884422; break;
        case 'elite': color = 0xcc6600; break;
        case 'boss': color = 0xcc2222; break;
        case 'healing': color = 0x22aa44; break;
        case 'recruit': color = 0x8844aa; break;
        case 'rift_shard': color = 0x7744cc; break;
      }

      gfx.fillStyle(color);
      gfx.fillRect(rx, ry, cellSize, cellSize);

      // Current room indicator
      if (room.id === this.currentRoom.id) {
        gfx.lineStyle(2, 0xffffff);
        gfx.strokeRect(rx - 1, ry - 1, cellSize + 2, cellSize + 2);
      }

      // Draw connections
      gfx.lineStyle(1, 0x666688);
      for (const connId of room.connections) {
        const conn = this.dungeon.rooms[connId];
        if (conn.id > room.id) {
          const cx = mapX + conn.gridX * (cellSize + gap) + cellSize / 2;
          const cy = mapY + conn.gridY * (cellSize + gap) + cellSize / 2;
          gfx.lineBetween(
            rx + cellSize / 2,
            ry + cellSize / 2,
            cx,
            cy
          );
        }
      }
    }
  }

  // --- Update loop ---

  update(time: number): void {
    // Freeze gameplay during overlays
    if (this.partyScreen?.isActive) return;
    if (this.riftShardSelecting) return;
    if (this.riftShardUI) return; // starter trinket selection
    if (this.pendingRecruit || this.recruitPrompt.isActive) {
      this.recruitPrompt.update();
      return;
    }

    // Freeze trainer movement during pre-combat setup
    if (this.combatManager.isActive && this.combatManager.isSetupPhase) {
      this.trainer.setVelocity(0, 0);
    } else {
      this.updateTrainerMovement();
      this.recordTrailSample();
    }

    if (this.combatManager.isActive) {
      this.combatManager.update(time, this.trainer);
      // Sync live HP from combat back to party data so the HUD reflects damage
      const hps = this.combatManager.getAllyHps();
      for (let i = 0; i < this.party.active.length; i++) {
        this.party.active[i].hp = hps[i] ?? this.party.active[i].hp;
      }
      this.drawPartyHud();
    } else {
      this.updateCompanionFollow();
    }

    // Y-axis depth sort for overworld sprites (trainer + companions)
    this.trainer.setDepth(10 + this.trainer.y / 10);
    for (const c of this.companions) {
      if (c.sprite.active) c.sprite.setDepth(10 + c.sprite.y / 10);
    }

    // Move HUD updates every frame (shows cooldowns in combat, static moves otherwise)
    this.combatHud.update(time);

    this.checkHealingSpring();
    this.checkRiftShard();
    this.checkDoorTransitions();
  }

  private updateTrainerMovement(): void {
    if (!this.keys) return;

    let vx = 0;
    let vy = 0;

    if (this.keys.A.isDown) vx -= 1;
    if (this.keys.D.isDown) vx += 1;
    if (this.keys.W.isDown) vy -= 1;
    if (this.keys.S.isDown) vy += 1;

    if (vx !== 0 && vy !== 0) {
      const len = Math.sqrt(vx * vx + vy * vy);
      vx /= len;
      vy /= len;
    }

    this.trainer.setVelocity(vx * TRAINER_SPEED, vy * TRAINER_SPEED);

    if (vx !== 0 || vy !== 0) {
      this.trainerDir = directionFromVelocity(vx, vy);
      playWalkOrStatic(this.trainer, 'player', this.trainerDir, this.anims);
    } else {
      stopWalkAnim(this.trainer, 'player', this.trainerDir);
    }
  }

  /**
   * Push a breadcrumb onto the trail when the trainer has moved far enough
   * since the last sample. Followers walk this trail (snake-game style) so
   * their path matches what the trainer actually walked — not a static
   * world-space offset from the trainer's current position.
   */
  private recordTrailSample(): void {
    const head = this.trainerTrail[0];
    if (!head) {
      this.trainerTrail.unshift({ x: this.trainer.x, y: this.trainer.y });
      return;
    }
    const dx = this.trainer.x - head.x;
    const dy = this.trainer.y - head.y;
    if (dx * dx + dy * dy < TRAIL_SAMPLE_DIST * TRAIL_SAMPLE_DIST) return;
    this.trainerTrail.unshift({ x: this.trainer.x, y: this.trainer.y });
    if (this.trainerTrail.length > TRAIL_MAX_LEN) this.trainerTrail.pop();
  }

  /**
   * Reset the trail with a pre-seeded straight line extending "behind" the
   * trainer in the given direction. Called on spawn and room transition so
   * companions line up behind the trainer immediately instead of all piling
   * onto the trainer's position on frame 1.
   */
  private resetTrail(behindDx: number = 0, behindDy: number = 1): void {
    this.trainerTrail = [];
    const len = Math.sqrt(behindDx * behindDx + behindDy * behindDy) || 1;
    const ux = behindDx / len;
    const uy = behindDy / len;
    // Push a sample every TRAIL_SAMPLE_DIST px along the "behind" direction,
    // enough to seat all 4 possible followers at their trail offsets.
    // Stop the moment the seed crosses a wall/OOB — otherwise companions at
    // the far end of the trail (slots 3-4) would get projected into unwalkable
    // space and slam into colliders off-screen. When the trail is truncated,
    // trailPointAtArcDistance falls back to the last valid breadcrumb, so
    // excess companions pile there and spread out naturally as the trainer
    // walks into the room.
    const needed = Math.ceil((4 * FOLLOWER_SPACING) / TRAIL_SAMPLE_DIST) + 4;
    for (let i = 0; i <= needed; i++) {
      const px = this.trainer.x + ux * (i * TRAIL_SAMPLE_DIST);
      const py = this.trainer.y + uy * (i * TRAIL_SAMPLE_DIST);
      if (i > 0 && this.nav && !this.nav.isWalkableAt(px, py)) break;
      this.trainerTrail.push({ x: px, y: py });
    }
  }

  /**
   * Walk the breadcrumb trail to find the point whose arc-length from the
   * trainer equals `arcDist`. Interpolates within the segment that contains
   * the target point so spacing is smooth, not tile-quantized.
   */
  private trailPointAtArcDistance(arcDist: number): { x: number; y: number } {
    let acc = 0;
    let prev = { x: this.trainer.x, y: this.trainer.y };
    for (const p of this.trainerTrail) {
      const sx = p.x - prev.x;
      const sy = p.y - prev.y;
      const segLen = Math.sqrt(sx * sx + sy * sy);
      if (segLen > 0 && acc + segLen >= arcDist) {
        const t = (arcDist - acc) / segLen;
        return { x: prev.x + sx * t, y: prev.y + sy * t };
      }
      acc += segLen;
      prev = p;
    }
    // Trail too short — fall back to the oldest breadcrumb (or trainer position)
    return prev;
  }

  private updateCompanionFollow(): void {
    const now = this.time.now;
    for (let i = 0; i < this.companions.length; i++) {
      const c = this.companions[i];
      if (!c.sprite.active) continue;

      // Goal = the point on the trainer's recent trail that is
      // (i+1) × FOLLOWER_SPACING pixels behind. This produces a snake-game
      // conga line that follows the path the trainer actually walked.
      const goal = this.trailPointAtArcDistance((i + 1) * FOLLOWER_SPACING);
      const goalX = goal.x;
      const goalY = goal.y;

      const dx = goalX - c.sprite.x;
      const dy = goalY - c.sprite.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Slack zone — when within a small radius, hold position. Prevents
      // jittering when the trainer is stationary or making tiny adjustments.
      if (dist <= 3) {
        c.sprite.setVelocity(0, 0);
        c.waypoints = [];
        stopWalkAnim(c.sprite, this.party.active[i].texturePrefix, c.dir);
        continue;
      }

      // Stuck detection — sample position every STUCK_WINDOW_MS
      let isStuck = false;
      if (c.lastPosTime === 0) {
        c.lastPos = { x: c.sprite.x, y: c.sprite.y };
        c.lastPosTime = now;
      } else if (now - c.lastPosTime > STUCK_WINDOW_MS) {
        const ddx = c.sprite.x - c.lastPos.x;
        const ddy = c.sprite.y - c.lastPos.y;
        isStuck = (ddx * ddx + ddy * ddy) < STUCK_THRESHOLD_PX * STUCK_THRESHOLD_PX && dist > 16;
        c.lastPos = { x: c.sprite.x, y: c.sprite.y };
        c.lastPosTime = now;
      }

      // Recalculate path when stale or stuck. The breadcrumb goal moves
      // smoothly along a walkable trail, so most of the time the smoothed
      // path collapses to a single direct waypoint.
      if (isStuck || SimpleNav.isPathStale(c.waypoints, c.lastNavGoal, goalX, goalY)) {
        c.waypoints = this.nav.findPath(c.sprite.x, c.sprite.y, goalX, goalY);
        c.lastNavGoal = { x: goalX, y: goalY };
      }

      // Advance past arrived waypoints
      while (c.waypoints.length > 0) {
        const wp = c.waypoints[0];
        const wdx = wp.x - c.sprite.x;
        const wdy = wp.y - c.sprite.y;
        if (wdx * wdx + wdy * wdy <= NAV_ARRIVAL_RADIUS * NAV_ARRIVAL_RADIUS) {
          c.waypoints.shift();
        } else {
          break;
        }
      }

      // Steer toward next waypoint (or direct if no waypoints)
      const nextX = c.waypoints.length > 0 ? c.waypoints[0].x : goalX;
      const nextY = c.waypoints.length > 0 ? c.waypoints[0].y : goalY;
      const ndx = nextX - c.sprite.x;
      const ndy = nextY - c.sprite.y;
      const ndist = Math.sqrt(ndx * ndx + ndy * ndy) || 1;

      // Speed: match the trainer at the resting spacing, accelerate up to
      // 1.5× when falling behind so followers can actually catch up (prior
      // code capped at 1×, which meant a follower that drifted backwards
      // could never recover the gap), and ease off when very close so they
      // don't overshoot the goal and jitter.
      let speedScale: number;
      if (dist <= FOLLOWER_SPACING) {
        speedScale = Math.max(0.4, dist / FOLLOWER_SPACING);
      } else {
        const overshoot = (dist - FOLLOWER_SPACING) / FOLLOWER_SPACING;
        speedScale = Math.min(1 + overshoot * 0.5, 1.5);
      }
      const followSpeed = TRAINER_SPEED * speedScale;
      c.sprite.setVelocity((ndx / ndist) * followSpeed, (ndy / ndist) * followSpeed);

      c.dir = directionFromVelocity(ndx, ndy);
      playWalkOrStatic(c.sprite, this.party.active[i].texturePrefix, c.dir, this.anims);
    }
  }

  private checkDoorTransitions(): void {
    // Can't leave during combat or recruit
    if (this.combatManager.isActive) return;
    if (this.pendingRecruit || this.recruitPrompt.isActive) return;

    for (const { zone, targetRoomId } of this.doorZones) {
      const trainerBounds = this.trainer.getBounds();
      const zoneBounds = zone.getBounds();

      if (Phaser.Geom.Rectangle.Overlaps(trainerBounds, zoneBounds)) {
        this.transitionToRoom(targetRoomId);
        return;
      }
    }
  }
}
