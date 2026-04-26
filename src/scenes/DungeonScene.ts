import Phaser from 'phaser';
import {
  generateDungeon,
  generateTestDungeon,
  resolveBranchOnEntry,
  Dungeon,
  DungeonRoom,
  BOSS_SLOT,
  BOSS_UNLOCK_THRESHOLD,
  speciesForBiome,
  pickDiverseSpecies,
} from '../data/dungeon';
import { RoomTemplate, Biome, TEST_ROOMS, BOSS_ROOM } from '../data/room_templates';
import { DECORATION_CATALOG } from '../data/decorations';
import { CombatManager, CompanionEntry, DefeatedRiftling } from '../combat/CombatManager';
import { computeEliteFormation } from '../combat/eliteFormation';
import { Party, PartyRiftling, createStartingParty, createRiftling, createRiftlingAtLevel, addToParty, awardXP, getActiveSynergies, BENCH_XP_RATIO, LevelUpResult, RIFTLING_TEMPLATES, AVAILABLE_RIFTLINGS, TYPE_COLORS, speciesScale, generateStatCards, applyStatCard, getUpgradeMoveForLevel, applyMoveUpgrade } from '../data/party';
import { getXPMultiplier, getEliteXPMultiplier, getLowestLevelXPBonus, TRINKET_CATALOG, TrinketDef, addTrinket, ALL_TRINKET_IDS } from '../data/trinkets';
import { SimpleNav, NavPoint, NAV_ARRIVAL_RADIUS, STUCK_WINDOW_MS, STUCK_THRESHOLD_PX } from '../data/nav';
import { playWalkOrStatic, stopWalkAnim, directionFromVelocity } from '../data/anims';
import { RecruitPrompt } from '../ui/RecruitPrompt';
import { LevelUpCardPrompt } from '../ui/LevelUpCardPrompt';
import { PartyScreen } from '../ui/PartyScreen';
import { CombatHUD } from '../ui/CombatHUD';
import { SynergyHUD } from '../ui/SynergyHUD';
import { RoleHUD } from '../ui/RoleHUD';
import { applyStoredVolume, createVolumeWidget } from '../ui/VolumeWidget';


const TILE = 16;
const TRAINER_SPEED = 90;

type StarterMode = 'gathering' | 'library';
const STARTER_MODE_KEY = 'intotherift:starterMode';
function getStarterMode(): StarterMode {
  try {
    return localStorage.getItem(STARTER_MODE_KEY) === 'library' ? 'library' : 'gathering';
  } catch {
    return 'gathering';
  }
}
function setStarterMode(mode: StarterMode): void {
  try { localStorage.setItem(STARTER_MODE_KEY, mode); } catch { /* ignore */ }
}

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
 * the connected room.
 */
/** Tracked tile render entry — kept so the in-browser builder can incrementally
 * update tiles without rebuilding the whole room. One entry per (x,y). The
 * `overlay` is the rift portal sprite on active door tiles (rendered once per
 * 2-tile door pair on the primary tile, left-blank on the secondary). */
interface TileEntry {
  image: Phaser.GameObjects.Image | null;
  overlay: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image | null;
  wallBody: Phaser.Physics.Arcade.Sprite | null;
  pathOverlay: Phaser.GameObjects.Image | null;
}

/** Tracked decoration sprite — kept so the builder can remove individual props
 * by tile position without rebuilding the full decoration layer. */
interface DecorationEntry {
  sprite: string;
  x: number;
  y: number;
  img: Phaser.GameObjects.Image;
  body: Phaser.Physics.Arcade.Sprite | null;
  baseDepth: number;
  immersive: boolean;
}

/** Tracked static-actor body (e.g. the boss-room Rift Elite). Used so the
 * nav grid can route around them like it does for decoration colliders. */
interface StaticActorEntry {
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
  private debugBodiesEnabled = false;
  private colliderDirty = new Map<string, boolean>();
  private doorZones: { zone: Phaser.GameObjects.Zone; targetRoomId: number }[] = [];

  /** Tile render tracking — [y][x]. Populated in loadRoom, used by the
   * in-browser builder's live-edit hooks. */
  private tileEntries: TileEntry[][] = [];

  /** Decoration render tracking — flat list. Builder removes by tile coord
   * via removeDecorationAt(); added via addDecoration(). */
  private decorationEntries: DecorationEntry[] = [];

  /** Static actor render tracking — set dressing creature sprites with
   * idle animations (e.g. the boss-room Rift Elite). Repopulated per load. */
  private staticActorEntries: StaticActorEntry[] = [];

  /** Per-tile biome override used by hub rooms so the two floor tiles
   * leading into each branch door render with that branch's biome tileset,
   * creating a visible transition from hub grass to branch terrain. Keyed
   * as "x,y". Rebuilt per loadRoom. */
  private tileBiomeOverride: Map<string, Biome> = new Map();

  private dungeon!: Dungeon;
  private currentRoom!: DungeonRoom;

  /** Set when the boss door transitions locked→unlocked. Consumed by the
   *  next hub load to show a toast + door pulse effect. */
  private pendingBossUnlockAnnouncement = false;

  private keys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  // HUD elements
  private timerText!: Phaser.GameObjects.Text;
  private roomLabel!: Phaser.GameObjects.Text;
  private timerSeconds = 0;
  private timerEvent!: Phaser.Time.TimerEvent;
  private transitionFreeze = false;

  // Combat
  private combatManager!: CombatManager;
  private combatHud!: CombatHUD;
  private roomClearedText!: Phaser.GameObjects.Text | null;
  /** Non-combatant rift entity that commands an elite squad — vanishes on victory. */
  private eliteNpcSprite: Phaser.GameObjects.Sprite | null = null;
  private eliteNpcBody: Phaser.Physics.Arcade.Sprite | null = null;
  private seenFirstElite = false;
  private seenSetupTutorial = false;

  // Rift Core — final reward in boss arena; player walks to it after defeating the final boss.
  private riftCoreSprite: Phaser.GameObjects.Sprite | null = null;
  private riftCoreZone: Phaser.GameObjects.Zone | null = null;
  private riftCoreLabel: Phaser.GameObjects.Text | null = null;
  private riftCoreActive = false;

  // Boss door sealed label — shown when the player approaches the locked boss door
  private bossDoorLabel: Phaser.GameObjects.Text | null = null;
  private bossDoorCenter: { x: number; y: number } | null = null;
  private bossDoorLabelVisible = false;

  // Healing spring
  private healingSpring: { zone: Phaser.GameObjects.Zone; visual: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text } | null = null;
  private healingUsed = false;

  // Rift Shard (in-dungeon trinket pickup)
  private riftShard: { zone: Phaser.GameObjects.Zone; visual: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text } | null = null;
  private riftShardUsed = false;
  private riftShardSelecting = false;
  private riftShardUI: Phaser.GameObjects.Container | null = null;

  // Recruit gathering — 1-3 stationary riftling NPCs in a recruit terminal.
  // Walking near them opens the RecruitPrompt with those species as options.
  private recruitGathering: {
    zone: Phaser.GameObjects.Zone;
    sprites: Phaser.GameObjects.Image[];
    label: Phaser.GameObjects.Text;
    offerings: string[];
  } | null = null;
  private recruitGatheringUsed = false;
  /** True while the starter riftling selection overlay is open. */
  private starterSelectActive = false;
  /** Starter gathering — 3 NPC riftlings in the start room. Walking up
   *  opens the same RecruitPrompt card flow used for regular recruits. */
  private starterGathering: {
    zone: Phaser.GameObjects.Zone;
    sprites: Phaser.GameObjects.Image[];
    label: Phaser.GameObjects.Text;
    offerings: string[];
  } | null = null;
  private starterGatheringUsed = false;
  /** Top-left button to swap starter mode. Destroyed once a starter is picked. */
  private starterModeButton: Phaser.GameObjects.Container | null = null;
  /** Library overlay teardown — set by showStarterLibrary, used by the toggle. */
  private starterLibraryTeardown: (() => void) | null = null;
  /** True once the player has chosen a starter — suppresses mode switching. */
  private starterChosen = false;
  private gameEnding = false;

  // Collider references — removed before re-adding on room transitions (BUG-004 fix)
  private trainerWallCollider: Phaser.Physics.Arcade.Collider | null = null;
  private companionWallColliders: Phaser.Physics.Arcade.Collider[] = [];

  // Starter trinket selection overlay
  private trinketSelectUI: Phaser.GameObjects.Container | null = null;

  /** Deferred starter trinket grant — set true when the run starts; the
   *  trinket selection is then opened the first time the player reaches the
   *  hub (after the two intro combats). */
  private starterTrinketPending = false;

  // Starter rift shard — spawned in the hub when starterTrinketPending fires
  private starterShard: { zone: Phaser.GameObjects.Zone; visual: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text } | null = null;
  private starterShardUsed = false;

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
  private levelUpPrompt!: LevelUpCardPrompt;
  private pendingRecruit = false;
  private partyHud!: Phaser.GameObjects.Container;
  private partyScreen!: PartyScreen;
  private synergyHud!: SynergyHUD;
  private roleHud!: RoleHUD;
  private controlHintsContainer!: Phaser.GameObjects.Container;
  private volumeWidgetContainer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'Dungeon' });
  }

  create(): void {
    applyStoredVolume(this);
    this.sound.stopAll();
    if (this.cache.audio.exists('music_dungeon')) {
      this.sound.play('music_dungeon', { loop: true, volume: 0.4 });
    }

    // Reset stale references from a previous scene lifecycle so we always
    // take the fresh-creation path for physics sprites.
    this.trainer = undefined as any;
    this.companions = [];
    this.gameEnding = false;
    this.trainerWallCollider = null;
    this.companionWallColliders = [];
    this.starterChosen = false;
    this.starterGatheringUsed = false;
    this.starterSelectActive = false;
    this.starterGathering = null;
    this.starterModeButton = null;
    this.starterLibraryTeardown = null;

    // Direct-load debug paths:
    //   ?testRoom=<key>  loads a single named room from TEST_ROOMS for world
    //                    builders to iterate on a biome.
    //   ?bossTest=1      loads BOSS_ROOM with a pre-filled party for tuning
    //                    boss attacks, animations, and combat concepts.
    //                    Optional: &riftlings=key1,key2 (default emberhound,solarglare)
    //                              &level=N (default 5)
    const params = new URLSearchParams(window.location.search);
    const testKey = params.get('testRoom');
    const bossTest = params.get('bossTest');
    const testTemplate = testKey ? TEST_ROOMS[testKey] : (bossTest ? BOSS_ROOM : undefined);
    this.dungeon = testTemplate ? generateTestDungeon(testTemplate) : generateDungeon();
    this.refreshHubDoorStates();
    this.currentRoom = this.dungeon.rooms[this.dungeon.currentRoomId];

    // Boss-test rooms must be uncleared so tryStartCombat actually triggers.
    if (bossTest) {
      this.currentRoom.cleared = false;
    }

    this.walls = this.physics.add.staticGroup();
    this.roomClearedText = null;
    // Start with an empty active party — the starter picker fills it. The
    // testRoom and bossTest debug paths skip the picker.
    this.party = createStartingParty();
    if (bossTest) {
      const keysParam = params.get('riftlings');
      const requested = (keysParam ? keysParam.split(',') : ['emberhound', 'solarglare'])
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const level = Math.max(1, parseInt(params.get('level') ?? '5', 10) || 5);
      this.party.active = requested.map((key) => createRiftlingAtLevel(key, level));
    } else if (!testTemplate) {
      this.party.active = [];
    }
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
    this.levelUpPrompt = new LevelUpCardPrompt(this);
    this.partyScreen = new PartyScreen(this, this.party, () => {
      this.syncCompanions();
      this.drawPartyHud();
      this.synergyHud?.refresh();
      this.roleHud?.refresh();
    });
    this.setupCamera(this.currentRoom.template);
    this.setupHUD();
    this.setupPartyHud();
    this.synergyHud = new SynergyHUD(this, () => this.party.active);
    this.synergyHud.refresh();
    this.roleHud = new RoleHUD(this, () => this.party.active);
    this.roleHud.refresh();
    this.createControlHints();
    this.startTimer();

    this.spawnHealingSpring();
    this.spawnRiftShard();
    this.spawnRecruitGathering();

    // Starter riftling selection. Two modes — the player's last choice is
    // persisted in localStorage and a top-left toggle lets them flip.
    // Skipped in testRoom direct-load so world builders can view scenes
    // without the picker blocking the camera.
    if (!testTemplate) {
      this.createStarterModeButton();
      if (getStarterMode() === 'library') {
        this.showStarterLibrary();
      } else {
        this.spawnStarterGathering();
      }
    } else if (bossTest) {
      // Boss-test direct-load: party is already populated and synced, so
      // kick off the boss encounter immediately.
      this.tryStartCombat();
    }

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
      isLevelUpActive: () => this.levelUpPrompt?.isActive ?? false,
      isCombatActive: () => this.combatManager?.isActive ?? false,
      getDungeon: () => this.dungeon,
      isPartyScreenActive: () => this.partyScreen?.isActive ?? false,
      getTimerSeconds: () => this.timerSeconds,
      /** Teleport to a room by ID — for QA testing only.
       * Refuses during combat: loadRoom() clears the physics walls group
       * out from under CombatManager, triggering a TypeError in its update
       * loop. */
      warpToRoom: (roomId: number) => {
        if (this.combatManager?.isActive) return;
        this.transitionToRoom(roomId);
      },
      /** Inject a riftling into the party by species key — for QA testing only. */
      injectRiftling: (key: string) => {
        const r = createRiftling(key);
        addToParty(this.party, r);
        this.syncCompanions();
        this.drawPartyHud();
        this.synergyHud?.refresh();
        this.roleHud?.refresh();
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
      /**
       * Force the post-combat level-up card flow for an active riftling —
       * for QA testing only. Pushes the riftling to the given level and
       * opens the same card prompt the combat-clear path uses.
       */
      triggerLevelUp: (index: number, targetLevel: number) => {
        const r = this.party.active[index];
        if (!r) return;
        const results: LevelUpResult[] = [];
        while (r.level < targetLevel) {
          r.level++;
          results.push({ riftling: r, newLevel: r.level });
        }
        this.showLevelUps(results, () => {
          this.drawPartyHud();
        });
      },
      /** Teleport the trainer to an absolute world pixel — for QA only. */
      setTrainerPos: (x: number, y: number) => {
        if (!this.trainer) return;
        this.trainer.setVelocity(0, 0);
        this.trainer.setPosition(x, y);
        this.trainer.setDepth(10 + y / 10);
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
      this.timerText, this.roomLabel,
      this.partyHud, this.recruitPrompt?.getContainer(),
      this.levelUpPrompt?.getContainer(),
      this.partyScreen?.getContainer(),
      this.combatHud?.getContainer(),
      this.synergyHud?.getContainer(),
      this.roleHud?.getContainer(),
      this.riftShardUI ?? undefined,
      ...((this.riftShardUI as any)?.__hitAreas ?? []),
      this.trinketSelectUI ?? undefined,
      this.synergyHud?.getTooltipContainer(),
      this.roleHud?.getTooltipContainer(),
      this.controlHintsContainer,
      this.volumeWidgetContainer,
    ];
    const persistent = new Set(persistentArr.filter(Boolean) as Phaser.GameObjects.GameObject[]);
    this.children.getAll().forEach((child) => {
      if (!persistent.has(child)) child.destroy();
    });
    this.companions = [];
    this.healingSpring = null;
    this.riftShard = null;
    this.starterShard = null;
    this.riftCoreSprite = null;
    this.riftCoreZone = null;
    this.riftCoreLabel = null;
    this.riftCoreActive = false;
    this.bossDoorLabel = null;
    this.bossDoorCenter = null;
    this.bossDoorLabelVisible = false;
    this.recruitGathering = null;
    this.walls.clear(true, true);
    this.doorZones = [];
    this.tileEntries = [];
    this.decorationEntries = [];
    this.staticActorEntries = [];

    const tmpl = room.template;
    const roomPixelW = tmpl.width * TILE;
    const roomPixelH = tmpl.height * TILE;
    const isHub = tmpl.type === 'hub';

    // Reconcile hub door locks against current progression every time the
    // hub is loaded. Seal/unlock flags usually stay in sync via
    // sealBranchIfLeavingTerminal, but this guards against any path that
    // lands the player back in the hub without going through that commit.
    if (isHub) this.refreshHubDoorStates();

    // If the boss door just unlocked (flag set by refreshHubDoorStates when
    // the player sealed the branch that pushed them over the threshold),
    // play the "door opens in the distance" feedback shortly after the hub
    // finishes rendering so the pulse is visible in context.
    if (isHub && this.pendingBossUnlockAnnouncement) {
      this.pendingBossUnlockAnnouncement = false;
      this.time.delayedCall(500, () => this.announceBossUnlocked());
    }

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

    // Build per-tile biome override for hub doors — the two floor tiles
    // immediately inside each active branch door render with the branch's
    // biome tileset so stepping toward a door previews its destination.
    this.tileBiomeOverride.clear();
    if (isHub && tmpl.hubDoorSlots) {
      for (const door of this.dungeon.doors) {
        if (door.sealed || door.locked) continue;
        const slot = tmpl.hubDoorSlots.find((s) => s.slot === door.slot);
        if (!slot) continue;
        let branch = this.dungeon.branches.find((b) => b.id === door.branchId);
        if (!branch && this.dungeon.boss.id === door.branchId) branch = this.dungeon.boss;
        if (!branch) continue;
        const branchBiome = branch.archetype.biome;
        const onHorizontalWall = slot.ty === 0 || slot.ty === tmpl.height - 1;
        const span = slot.span ?? 2;
        // Override the door opening tiles (span along the wall).
        for (let i = 0; i < span; i++) {
          const tx = onHorizontalWall ? slot.tx + i : slot.tx;
          const ty = onHorizontalWall ? slot.ty : slot.ty + i;
          if (tx >= 0 && ty >= 0 && tx < tmpl.width && ty < tmpl.height) {
            this.tileBiomeOverride.set(`${tx},${ty}`, branchBiome);
          }
        }
      }
    }

    // Initialize tracking grid
    for (let y = 0; y < tmpl.height; y++) {
      const row: TileEntry[] = [];
      for (let x = 0; x < tmpl.width; x++) {
        row.push({ image: null, overlay: null, wallBody: null, pathOverlay: null });
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
        this.spawnDecorationSprite(dec.sprite, dec.x, dec.y, dec.noCollide);
      }
    }

    // Static actors (e.g. the boss-room Rift Elite) — non-combat creature
    // sprites with idle animations placed as set dressing.
    if (tmpl.staticActors) {
      for (const actor of tmpl.staticActors) {
        this.spawnStaticActor(actor);
      }
    }

    // If re-entering the cleared final boss room, re-activate the rift core.
    if (room.cleared && tmpl.type === 'boss' && this.riftCoreSprite) {
      this.activateRiftCore();
    }

    // Create door trigger zones using grid-position-based mapping
    this.createDoorZones(room, resolved);

    // Set physics bounds
    this.physics.world.setBounds(0, 0, roomPixelW, roomPixelH);

    // Compute the set of tiles blocked by decoration collision bodies so the
    // pathfinder routes around trees, logs, etc. instead of cutting straight
    // through them and leaving followers grinding against the collider.
    const decBlocked = new Set<number>();
    const blockBody = (b: Phaser.Physics.Arcade.Sprite) => {
      const body = b.body as Phaser.Physics.Arcade.StaticBody;
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
    };
    for (const entry of this.decorationEntries) {
      if (entry.body) blockBody(entry.body);
    }
    for (const entry of this.staticActorEntries) {
      if (entry.body) blockBody(entry.body);
    }

    // Build nav grid from the resolved tile map for this room (plus the
    // decoration-blocked tiles computed above).
    // Unit bodies are ~20–24 px; a 12 px clearance dilates obstacles by one
    // 16 px tile so paths don't graze walls or tree trunks.
    this.nav = new SimpleNav(resolved, TILE, decBlocked, 12);

    room.visited = true;

    // Re-apply debug body draw if F9 was toggled on — loadRoom destroys
    // all non-persistent children, including the physics debug graphic.
    if (this.debugBodiesEnabled) this.applyPhysicsDebug();
  }

  /**
   * Sync Phaser's arcade physics debug draw to `debugBodiesEnabled`.
   * The debug graphic is a scene child and gets wiped by loadRoom, so
   * this also recreates it when needed. F9 calls this; loadRoom calls
   * it too if the flag is on.
   */
  private applyPhysicsDebug(): void {
    const world = this.physics.world;
    world.drawDebug = this.debugBodiesEnabled;
    if (this.debugBodiesEnabled) {
      if (!world.debugGraphic || !world.debugGraphic.scene) {
        world.createDebugGraphic();
      }
      world.debugGraphic?.setVisible(true);
    } else if (world.debugGraphic) {
      world.debugGraphic.clear();
      world.debugGraphic.setVisible(false);
    }
  }

  /**
   * F9 debug tool: click a decoration to add or remove its collision body.
   * Returns true if a decoration was found near the click (consuming the event).
   */
  private toggleDecorationCollider(worldX: number, worldY: number): boolean {
    let bestEntry: DecorationEntry | null = null;
    let bestDist = Infinity;
    for (const entry of this.decorationEntries) {
      // img uses origin(0.5, 1.0) so getBounds() gives the actual screen rect.
      const bounds = entry.img.getBounds();
      // Expand bounds slightly (4px) for easier clicking on small props.
      const pad = 4;
      if (
        worldX >= bounds.x - pad && worldX <= bounds.right + pad &&
        worldY >= bounds.y - pad && worldY <= bounds.bottom + pad
      ) {
        // Prefer the entry whose visual center is closest to the click.
        const cx = bounds.centerX;
        const cy = bounds.centerY;
        const dist = Math.abs(cx - worldX) + Math.abs(cy - worldY);
        if (dist < bestDist) {
          bestDist = dist;
          bestEntry = entry;
        }
      }
    }
    if (!bestEntry) return false;

    if (bestEntry.body) {
      // Remove existing collider
      this.walls.remove(bestEntry.body, true, true);
      bestEntry.body = null;
      this.colliderDirty.set(bestEntry.sprite, false);
      console.log(`[F9] Removed collider: ${bestEntry.sprite} @ (${bestEntry.x}, ${bestEntry.y})`);
    } else {
      // Add a collider using catalog defaults
      const def = DECORATION_CATALOG[bestEntry.sprite];
      const bodyW = def?.collisionWidth ?? Math.round((def?.displaySize ?? 32) * 0.4);
      const bodyH = def?.collisionHeight ?? Math.round((def?.displaySize ?? 32) * 0.3);
      const anchor = def?.collisionAnchor ?? 'base';
      const bodyY = anchor === 'center'
        ? bestEntry.img.y - bestEntry.img.displayHeight / 2
        : bestEntry.img.y - bodyH / 2;
      const bx = bestEntry.x * TILE + TILE / 2;
      const body = this.walls.create(bx, bodyY, 'wall') as Phaser.Physics.Arcade.Sprite;
      body.setVisible(false);
      body.setSize(bodyW, bodyH);
      body.refreshBody();
      bestEntry.body = body;
      this.colliderDirty.set(bestEntry.sprite, true);
      console.log(`[F9] Added collider: ${bestEntry.sprite} @ (${bestEntry.x}, ${bestEntry.y}) — ${bodyW}×${bodyH}px`);
    }
    return true;
  }

  private saveDecorationOverrides(): void {
    if (this.colliderDirty.size === 0) {
      console.log('[F9] No collider changes to save.');
      return;
    }
    const changed: Record<string, Record<string, unknown>> = {};
    for (const [sprite, collides] of this.colliderDirty) {
      const catalogDef = DECORATION_CATALOG[sprite];
      if (!catalogDef) continue;
      const override: Record<string, unknown> = {
        displaySize: catalogDef.displaySize,
        collides,
      };
      if (collides) {
        override.collisionWidth = catalogDef.collisionWidth ?? Math.round(catalogDef.displaySize * 0.4);
        override.collisionHeight = catalogDef.collisionHeight ?? Math.round(catalogDef.displaySize * 0.3);
        if (catalogDef.collisionAnchor) override.collisionAnchor = catalogDef.collisionAnchor;
      }
      if (catalogDef.yOffset) override.yOffset = catalogDef.yOffset;
      changed[sprite] = override;
    }
    fetch('/api/save-decoration-overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changed),
    })
      .then(r => r.json())
      .then(res => {
        if (res.ok) console.log(`[F9] Saved ${Object.keys(changed).length} override(s). Total: ${res.count}`);
        else console.error('[F9] Save failed:', res.error);
      })
      .catch(err => console.error('[F9] Save failed:', err));
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

    // Door portal — rendered once per 2-tile door pair on the primary tile
    // (the one with no door neighbor to the west or north). Tracked on the
    // tile entry so the builder can clean it up on re-render.
    if (tileType === 3) {
      this.placeRiftPortal(grid, x, y, w, h, px, py, biome);
    }
    return img;
  }

  private portalKeyForBiome(_biome: Biome | 'dungeon'): string | null {
    return null;
  }

  /** Place a single rift portal sprite per door pair, centered between the
   * two door tiles. Skips the secondary tile so we don't render twice. */
  private placeRiftPortal(
    grid: number[][],
    x: number,
    y: number,
    w: number,
    h: number,
    px: number,
    py: number,
    biome: Biome | 'dungeon',
  ): void {
    const isDoor = (tx: number, ty: number): boolean =>
      tx >= 0 && ty >= 0 && tx < w && ty < h && grid[ty]?.[tx] === 3;
    // Skip secondary tile of the pair
    if (isDoor(x - 1, y) || isDoor(x, y - 1)) return;
    let portalX = px;
    let portalY = py;
    if (isDoor(x + 1, y)) portalX += TILE / 2;
    else if (isDoor(x, y + 1)) portalY += TILE / 2;
    // Per-room overlay override (e.g. intro zone stairs) wins over the
    // biome portal. Spans the full door run so the sprite fills the entire
    // entrance gap instead of only the first 2-tile pair.
    const overlayKey = this.currentRoom?.doorOverlay;
    if (overlayKey) {
      // Walk east/south from the primary tile to measure the full door run.
      let runTiles = 1;
      const horizontal = y === 0 || y === h - 1;
      if (horizontal) {
        while (isDoor(x + runTiles, y)) runTiles++;
      } else {
        while (isDoor(x, y + runTiles)) runTiles++;
      }
      const runPx = runTiles * TILE;
      // Shift the sprite off the wall edge and into the room so the archway
      // reads as standing inside the chamber rather than straddling the wall.
      // Stairs overlays invert the north-wall offset so the steps hang at the
      // top edge and read as descending into the room from above.
      const inset = (runPx - TILE) / 2;
      const northWall = y === 0;
      const westWall = x === 0;
      const isStairs = overlayKey === 'rift_stairs_down';
      const northOffset = isStairs ? 0 : inset;
      const overlayX = horizontal ? px + inset : px + (westWall ? inset : -inset);
      const overlayY = horizontal ? py + (northWall ? northOffset : -inset) : py + inset;
      const overlay = this.add.image(overlayX, overlayY, overlayKey).setDepth(0);
      const longer = Math.max(overlay.width, overlay.height);
      const stairsScale = isStairs ? 1.25 : 1;
      overlay.setScale((runPx / longer) * stairsScale);
      if (this.tileEntries[y]?.[x]) {
        this.tileEntries[y][x].overlay = overlay;
      }
      return;
    }
    const key = this.portalKeyForBiome(biome);
    if (!key) return;
    const portal = this.add.image(portalX, portalY, key).setDepth(0);
    if (this.tileEntries[y]?.[x]) {
      this.tileEntries[y][x].overlay = portal;
    }
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
    if (entry.pathOverlay) { entry.pathOverlay.destroy(); entry.pathOverlay = null; }
    if (entry.wallBody) {
      this.walls.remove(entry.wallBody, true, true);
      entry.wallBody = null;
    }

    const tileType = resolved[y][x];
    const px = x * TILE + TILE / 2;
    const py = y * TILE + TILE / 2;

    const overrideBiome = this.tileBiomeOverride.get(`${x},${y}`);
    const effectiveBiome: Biome | 'dungeon' = overrideBiome ?? biome;

    if (effectiveBiome !== 'dungeon') {
      entry.image = this.renderBiomeTile(effectiveBiome, resolved, x, y, w, h, px, py, tileType);
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
          this.placeRiftPortal(resolved, x, y, w, h, px, py, biome);
          break;
      }
    }

    // Hub path overlay — when the template defines a path mask, layer a
    // wang-tiled dirt trail on top of the base floor for any path tile.
    // Computed from path-neighbor bits, so edges fade into grass naturally.
    const pathMask = this.currentRoom?.template.paths;
    if (pathMask && (tileType === 1 || tileType === 3) && pathMask[y]?.[x] === 1) {
      const isPath = (tx: number, ty: number): boolean => {
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) return false;
        return pathMask[ty]?.[tx] === 1;
      };
      const nw = (isPath(x - 1, y) || isPath(x, y - 1) || isPath(x - 1, y - 1)) ? 1 : 0;
      const ne = (isPath(x + 1, y) || isPath(x, y - 1) || isPath(x + 1, y - 1)) ? 1 : 0;
      const sw = (isPath(x - 1, y) || isPath(x, y + 1) || isPath(x - 1, y + 1)) ? 1 : 0;
      const se = (isPath(x + 1, y) || isPath(x, y + 1) || isPath(x + 1, y + 1)) ? 1 : 0;
      const wangIndex = (se << 0) | (sw << 1) | (ne << 2) | (nw << 3);
      entry.pathOverlay = this.add.image(px, py, `hub_dirt_path_${wangIndex}`).setDepth(-0.5);
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
  private spawnDecorationSprite(
    sprite: string,
    tileX: number,
    tileY: number,
    noCollide?: boolean,
  ): boolean {
    const def = DECORATION_CATALOG[sprite];
    if (!def) {
      console.warn(`Unknown decoration sprite: ${sprite}`);
      return false;
    }
    const collides = def.collides && !noCollide;
    const worldX = tileX * TILE + TILE / 2;
    const worldY = tileY * TILE + TILE / 2;
    const img = this.add.image(worldX, worldY, def.key);
    const longer = Math.max(img.width, img.height);
    const scale = def.displaySize / longer;
    img.setScale(scale);
    img.setOrigin(0.5, 1.0);
    const baseY = worldY + (img.height * scale) / 2;
    img.y = baseY + (def.yOffset ?? 0);
    const baseDepth = 10 + baseY / 10;
    const immersive = (def.yOffset ?? 0) > 0;

    // Pokémon-style split for immersive props (tall grass): the top half of
    // the blade is rendered behind every unit at a fixed low depth so heads
    // and torsos draw cleanly over it; the bottom half is rendered in front
    // of every unit at a fixed high depth so the blade base always covers
    // the unit's feet. Both depths are static, so walking through a patch
    // never crosses a Y-sort threshold and there is no popping.
    if (immersive) {
      // Render immersive props (tall grass) at a fixed depth BEHIND every
      // unit so adjacent grass blades are visible around the unit but never
      // occlude it. No "front" layer: any front layer creates a hidden
      // stripe across the unit when it straddles two tile rows vertically,
      // and the player visual is small enough that an "in-grass" effect
      // comes naturally from the back blades poking out around the unit.
      img.setDepth(0);
    } else {
      img.setDepth(baseDepth);
    }

    let body: Phaser.Physics.Arcade.Sprite | null = null;
    if (collides) {
      const bodyW = def.collisionWidth ?? Math.round(def.displaySize * 0.4);
      const bodyH = def.collisionHeight ?? Math.round(def.displaySize * 0.3);
      // img.y is the bottom edge of the sprite (origin 1.0).
      // 'base' anchor: body sits at the trunk (good for trees).
      // 'center' anchor: body sits at the visual center (good for rocks,
      // crystals, logs — their hit area fills the whole sprite).
      const anchor = def.collisionAnchor ?? 'base';
      const bodyY = anchor === 'center'
        ? img.y - img.displayHeight / 2
        : img.y - bodyH / 2;
      body = this.walls.create(worldX, bodyY, 'wall') as Phaser.Physics.Arcade.Sprite;
      body.setVisible(false);
      body.setSize(bodyW, bodyH);
      body.refreshBody();
    }

    this.decorationEntries.push({ sprite, x: tileX, y: tileY, img, body, baseDepth, immersive });
    return true;
  }

  /**
   * Spawn a non-interactive creature sprite as set dressing — e.g. the Rift
   * Elite presiding over the boss arena. Uses the creature's idle animation
   * for the chosen direction; falls back to the static rotation texture if
   * the animation isn't registered. Adds a static collider to `walls` by
   * default so combat units can't walk through them.
   */
  private spawnStaticActor(actor: import('../data/room_templates').StaticActor): void {
    const dir = actor.direction ?? 'south';
    const textureKey = `${actor.sprite}_${dir}`;
    if (!this.textures.exists(textureKey)) {
      console.warn(`[staticActor] missing texture: ${textureKey}`);
      return;
    }
    const worldX = actor.x * TILE + TILE / 2;
    const worldY = actor.y * TILE + TILE / 2;
    const sprite = this.add.sprite(worldX, worldY, textureKey);
    const scale = actor.scale ?? 0.85;
    sprite.setScale(scale);
    sprite.setOrigin(0.5, 1.0);
    // Anchor the foot near the tile center so depth sorting matches other
    // characters' baselines.
    const baseY = worldY + (sprite.height * scale) / 2;
    sprite.y = baseY;
    sprite.setDepth(10 + baseY / 10);

    const animKey = `${actor.sprite}_idle_${dir}`;
    if (this.anims.exists(animKey)) sprite.play(animKey);

    if (actor.sprite === 'rift_core') {
      this.riftCoreSprite = sprite;
      if (this.anims.exists('rift_core_spin')) sprite.play('rift_core_spin');
    }
    if (actor.sprite === 'rift_elite' && !this.eliteNpcSprite) {
      this.eliteNpcSprite = sprite;
    }

    let body: Phaser.Physics.Arcade.Sprite | null = null;
    if (actor.collides ?? true) {
      const bodyW = 14;
      const bodyH = 8;
      const bodyY = sprite.y - bodyH / 2;
      body = this.walls.create(worldX, bodyY, 'wall') as Phaser.Physics.Arcade.Sprite;
      body.setVisible(false);
      body.setSize(bodyW, bodyH);
      body.refreshBody();
    }

    if (actor.sprite === 'rift_elite') {
      this.eliteNpcBody = body;
    }

    this.staticActorEntries.push({ body });
  }

  /**
   * Legacy hook — immersive decorations now use a static split-sprite
   * layering set up at spawn time, so per-frame depth juggling is no
   * longer needed. Kept as a no-op so callers don't need to be touched.
   */
  private updateImmersiveDecorationDepths(): void { return; }

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
   * Re-render every tile in the current room. Used by the builder's biome
   * selector after changing `template.biome`.
   */
  public rebuildAllTiles(): void {
    const tmpl = this.currentRoom.template;
    const isHub = tmpl.type === 'hub';
    const activeEdges = isHub ? new Set<string>() : this.getActiveEdges(this.currentRoom);
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
    const biome = tmpl.biome || 'dungeon';
    for (let y = 0; y < tmpl.height; y++) {
      for (let x = 0; x < tmpl.width; x++) {
        this.renderTileAt(x, y, resolved, tmpl.width, tmpl.height, biome);
      }
    }
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
      const slotLookup = new Map<number, { tx: number; ty: number; span: number }>();
      for (const s of tmpl.hubDoorSlots) {
        slotLookup.set(s.slot, { tx: s.tx, ty: s.ty, span: s.span ?? 2 });
      }

      const overlay = this.add.graphics().setDepth(5);
      const INWARD_DEPTH = 2; // tiles of approach zone carved into the room

      for (const door of this.dungeon.doors) {
        const pos = slotLookup.get(door.slot);
        if (!pos) continue;

        // Resolve the target branch — regular or boss.
        let branch = this.dungeon.branches.find((b) => b.id === door.branchId) ?? null;
        if (!branch && this.dungeon.boss.id === door.branchId) branch = this.dungeon.boss;
        if (!branch) continue;

        const onHorizontalWall = pos.ty === 0 || pos.ty === tmpl.height - 1;

        if (door.sealed || door.locked) {
          // Overlay covers exactly the door tiles (span along the wall,
          // 1 tile deep into the wall).
          const w = onHorizontalWall ? TILE * pos.span : TILE;
          const h = onHorizontalWall ? TILE : TILE * pos.span;
          const color = door.sealed ? 0x222222 : 0x552222;
          overlay.fillStyle(color, 0.75);
          overlay.fillRect(pos.tx * TILE, pos.ty * TILE, w, h);

          if (door.locked && door.slot === BOSS_SLOT) {
            const cx = pos.tx * TILE + w / 2;
            const labelY = pos.ty * TILE + h + 12;
            this.bossDoorCenter = { x: cx, y: labelY + TILE * 3 };
            this.bossDoorLabel = this.add
              .text(cx, labelY, '~ Sealed ~', {
                fontFamily: 'monospace',
                fontSize: '10px',
                color: '#ff6666',
                stroke: '#000000',
                strokeThickness: 3,
              })
              .setOrigin(0.5)
              .setDepth(300)
              .setAlpha(0);
          }

          continue;
        }

        // Build a trigger zone covering the door span + INWARD_DEPTH tiles
        // of approach inside the room, so the player trips it reliably.
        const onNorth = pos.ty === 0;
        const onSouth = pos.ty === tmpl.height - 1;
        const onWest = pos.tx === 0;
        const wTiles = onHorizontalWall ? pos.span : INWARD_DEPTH;
        const hTiles = onHorizontalWall ? INWARD_DEPTH : pos.span;
        let x0 = pos.tx;
        let y0 = pos.ty;
        if (onNorth) y0 = 0;
        else if (onSouth) y0 = pos.ty - (INWARD_DEPTH - 1);
        else if (onWest) x0 = 0;
        else x0 = pos.tx - (INWARD_DEPTH - 1);
        const zone = this.add.zone(
          x0 * TILE + (wTiles * TILE) / 2,
          y0 * TILE + (hTiles * TILE) / 2,
          wTiles * TILE,
          hTiles * TILE,
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
      this.trainer = this.physics.add.sprite(spawnX, spawnY, 'player_north');
      this.trainerDir = 'north';
      this.trainer.setDepth(10 + spawnY / 10);
      this.trainer.setScale(0.85);
      this.trainer.body!.setSize(14, 14);
    }

    this.trainer.setCollideWorldBounds(true);
    if (this.trainerWallCollider) this.physics.world.removeCollider(this.trainerWallCollider);
    this.trainerWallCollider = this.physics.add.collider(this.trainer, this.walls);

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
      const spriteScale = 0.7 * speciesScale(riftling.texturePrefix);

      if (i < this.companions.length && this.companions[i].sprite.active) {
        // Reuse existing companion — reposition and update texture; reset nav state
        this.companions[i].sprite.anims.stop();
        this.companions[i].sprite
          .setPosition(tx, ty)
          .setVelocity(0, 0)
          .setTexture(texture)
          .setScale(spriteScale);
        this.companions[i].waypoints = [];
        this.companions[i].lastNavGoal = null;
        this.companions[i].lastPos = { x: tx, y: ty };
        this.companions[i].lastPosTime = 0;
        this.companions[i].dir = 'south';
      } else {
        // Create new companion sprite
        const sprite = this.physics.add.sprite(tx, ty, texture);
        sprite.setDepth(10 + ty / 10);
        sprite.setScale(spriteScale);
        sprite.body!.setSize(12, 12);

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

      if (this.companionWallColliders[i]) this.physics.world.removeCollider(this.companionWallColliders[i]);
      this.companionWallColliders[i] = this.physics.add.collider(this.companions[i].sprite, this.walls);
    }

    // Remove excess companions if party shrunk
    while (this.companions.length > active.length) {
      const c = this.companions.pop()!;
      if (c.sprite.active) c.sprite.destroy();
      const col = this.companionWallColliders.pop();
      if (col) this.physics.world.removeCollider(col);
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

    // Ctrl+S in F9 mode — save decoration collider changes to disk.
    // Registered in the capture phase so it fires before Phaser's S-key
    // handler can swallow the event.
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 's' && e.ctrlKey && this.debugBodiesEnabled) {
        e.preventDefault();
        e.stopPropagation();
        this.saveDecorationOverrides();
      }
    }, true);

    // Tab opens party screen (use DOM event — Phaser swallows Tab)
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (this.partyScreen?.isActive) return; // PartyScreen handles its own close
        if (this.recruitPrompt?.isActive || this.combatManager?.isActive) return;
        this.partyScreen?.show();
      }

      // F9 — toggle physics body debug draw (visualize colliders).
      if (e.key === 'F9') {
        e.preventDefault();
        this.debugBodiesEnabled = !this.debugBodiesEnabled;
        this.applyPhysicsDebug();
      }

      // Q/E to cycle selected riftling (works in and out of combat)
      if (e.key === 'q' || e.key === 'Q') {
        this.cycleSelectedIndex(-1);
      } else if (e.key === 'e' || e.key === 'E') {
        this.cycleSelectedIndex(1);
      }

    });

    // Disable right-click context menu on canvas
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;
      const inCombat = this.combatManager?.isActive ?? false;

      // F9 debug mode: left-click toggles collision body on nearest decoration.
      if (this.debugBodiesEnabled && !pointer.rightButtonDown()) {
        if (this.toggleDecorationCollider(worldX, worldY)) return;
      }

      // Setup phase: left-click on an ally starts a drag-to-reposition.
      if (inCombat && !pointer.rightButtonDown() && this.combatManager.isSetupPhase) {
        if (this.combatManager.tryStartDrag(worldX, worldY)) return;
      }

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

    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.combatManager?.isDraggingSetup) {
        this.combatManager.updateDrag(pointer.worldX, pointer.worldY);
      }
    });

    this.input.on('pointerup', () => {
      if (this.combatManager?.isDraggingSetup) {
        this.combatManager.endDrag();
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
    if (this.builderActiveHook?.()) return;

    const tmpl = this.currentRoom.template;
    const isCombatRoom = ['combat', 'elite', 'recruit', 'boss'].includes(tmpl.type);

    // Elite terminals carry a procedurally themed team on the room itself
    // (dungeon gen attaches `eliteTeamOverride`), overriding the shared
    // template's eliteTeam. Wild combat rooms have no override.
    const eliteTeam = this.currentRoom.eliteTeamOverride ?? tmpl.eliteTeam;
    const hasEnemies = tmpl.enemySpawns.length > 0 || (eliteTeam?.length ?? 0) > 0;
    if (isCombatRoom && !this.currentRoom.cleared && hasEnemies && this.companions.length > 0) {
      const entries: CompanionEntry[] = this.party.active.map((data, i) => ({
        data,
        sprite: this.companions[i].sprite,
      }));

      // Scale difficulty by room depth and type
      // Rooms cleared so far (not counting start room) drives the ramp
      const roomsCleared = this.dungeon.rooms.filter((r) => r.cleared && r.template.type !== 'start').length;
      const depthScale = 1 + roomsCleared * 0.4;
      const typeBonus: Record<string, number> = { combat: 1, recruit: 1.2, elite: 1.6, boss: 3.0 };
      const difficulty = depthScale * (typeBonus[tmpl.type] ?? 1);

      // Scale enemy count for swarm feel — later rooms spawn many more enemies
      // Elite/boss keep their template counts (they're meant to be fewer, tougher foes)
      const spawns = [...tmpl.enemySpawns];
      const introTarget = this.currentRoom.introSpawnCount;
      if (introTarget !== undefined) {
        if (spawns.length > introTarget) spawns.length = introTarget;
        if (spawns.length < introTarget) {
          const floorTiles: { x: number; y: number }[] = [];
          for (let ry = 2; ry < tmpl.height - 2; ry++) {
            for (let rx = 2; rx < tmpl.width - 2; rx++) {
              if (tmpl.tiles[ry][rx] === 1) floorTiles.push({ x: rx, y: ry });
            }
          }
          while (spawns.length < introTarget && floorTiles.length > 0) {
            const idx = Math.floor(Math.random() * floorTiles.length);
            spawns.push(floorTiles.splice(idx, 1)[0]);
          }
        }
      } else if (tmpl.type === 'combat' || tmpl.type === 'recruit') {
        const extraCount = Math.floor(roomsCleared * 0.8 + roomsCleared * roomsCleared * 0.1);
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

      // Elite encounter: compute smart role-based formation (ranged back,
      // melee front) from team roster + entry side, spawn the rift-entity
      // trainer at the computed anchor, and pass the pixel positions through
      // to CombatManager.
      let eliteTrainerPos: { x: number; y: number } | undefined;
      let eliteFormationPixels: { x: number; y: number }[] | undefined;
      if ((tmpl.type === 'elite' || tmpl.type === 'boss') && eliteTeam && eliteTeam.length > 0) {
        const formation = computeEliteFormation(eliteTeam, entrySide, roomPxW, roomPxH);
        eliteFormationPixels = formation.spawns;
        eliteTrainerPos = formation.trainerPos;

        if (tmpl.type === 'boss') {
          for (const s of eliteFormationPixels) s.x += TILE;
        }

        // Boss rooms skip the rift-entity trainer NPC
        if (tmpl.type !== 'boss') {
          this.eliteNpcSprite?.destroy();
          this.eliteNpcSprite = this.add
            .sprite(eliteTrainerPos.x, eliteTrainerPos.y, 'rift_elite_south')
            .setDepth(10 + eliteTrainerPos.y / 10);
          this.eliteNpcSprite.anims.play('rift_elite_idle_south', true);
        }

        if (!this.seenFirstElite) {
          this.seenFirstElite = true;
          this.showMessage('What is that creature? I\'ve never seen anything like it...', '#cc88ff');
        }
      }

      // Build wild-species pool from the room's biome. Biomes are places,
      // not type filters — any element can inhabit any biome.
      const wildSpeciesPool = speciesForBiome(this.currentRoom.template.biome);

      if (tmpl.type === 'boss' && this.cache.audio.exists('music_boss')) {
        this.sound.stopAll();
        this.sound.play('music_boss', { loop: true, volume: 0.5 });
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
        eliteTeam,
        eliteTrainerPos,
        eliteFormationPixels,
        wildSpeciesPool,
        this.party.savedFormation,
        (offsets) => { this.party.savedFormation = offsets; },
        () => this.onPartyWiped(),
        !this.seenSetupTutorial,
      );
      this.seenSetupTutorial = true;
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

    const gfx = this.add.graphics().setDepth(0);
    const isHub = type === 'hub';
    if (isHub) {
      // Rift-crystal spring: cracked obsidian basin rimmed with dark stone,
      // filled with a cyan-violet glow and a bright inner core.
      gfx.fillStyle(0x0a0818, 0.85);
      gfx.fillCircle(cx, cy, radius + 2);
      gfx.lineStyle(1, 0x5a3a8a, 0.9);
      gfx.strokeCircle(cx, cy, radius + 2);
      gfx.fillStyle(0x2a1850, 0.7);
      gfx.fillCircle(cx, cy, radius);
      gfx.fillStyle(0x5a3aaa, 0.55);
      gfx.fillCircle(cx, cy, radius * 0.75);
      gfx.fillStyle(0x88ccff, 0.65);
      gfx.fillCircle(cx, cy, radius * 0.45);
      gfx.fillStyle(0xccf0ff, 0.8);
      gfx.fillCircle(cx, cy, radius * 0.2);
    } else {
      gfx.fillStyle(0x22aa66, 0.3);
      gfx.fillCircle(cx, cy, radius);
      gfx.fillStyle(0x44ffaa, 0.2);
      gfx.fillCircle(cx, cy, radius * 0.6);
    }

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
        color: isHub ? '#aaccff' : '#44ffaa',
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

  private activateRiftCore(): void {
    const core = this.riftCoreSprite;
    if (!core) return;
    this.riftCoreActive = true;

    // Pulse glow to draw the player's eye
    this.tweens.add({
      targets: core,
      scaleX: { from: core.scaleX, to: core.scaleX * 1.15 },
      scaleY: { from: core.scaleY, to: core.scaleY * 1.15 },
      alpha: { from: 0.85, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Prompt label
    this.riftCoreLabel = this.add
      .text(core.x, core.y - 28, 'Claim the Rift Core', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#cc88ff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(100);

    // Interaction zone
    const zone = this.add.zone(core.x, core.y, 6, 6);
    this.physics.add.existing(zone, true);
    this.riftCoreZone = zone;
  }

  private checkRiftCore(): void {
    if (!this.riftCoreActive || !this.riftCoreZone) return;

    const trainerBounds = this.trainer.getBounds();
    const zoneBounds = this.riftCoreZone.getBounds();

    if (Phaser.Geom.Rectangle.Overlaps(trainerBounds, zoneBounds)) {
      this.riftCoreActive = false;
      this.showMessage('The Rift Core is yours. The rift falls silent.', '#cc88ff');
      this.launchVictory();
    }
  }

  // --- Trinket selection ---

  /** Library mode: paginated grid of every riftling. */
  private showStarterLibrary(): void {
    this.starterSelectActive = true;

    const keys = AVAILABLE_RIFTLINGS;
    const perPage = 12;
    const totalPages = Math.ceil(keys.length / perPage);
    let currentPage = 0;

    const container = this.add.container(0, 0).setDepth(700).setScrollFactor(0);

    // Dim overlay
    const overlay = this.add.rectangle(240, 160, 480, 320, 0x000000, 0.7);
    container.add(overlay);

    // Title
    container.add(this.add.text(240, 26, 'Choose Your Starter', {
      fontFamily: 'monospace', fontSize: '16px', color: '#ffdd44',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5));

    container.add(this.add.text(240, 44, 'Select a riftling to begin your run', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ccbbee',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5));

    // Container for the card grid — destroyed and rebuilt on page change
    let gridContainer = this.add.container(0, 0);
    container.add(gridContainer);

    // Page controls — top-right corner, above the card grid
    const arrowStyle = { fontFamily: 'monospace', fontSize: '12px', color: '#ffdd44', stroke: '#000000', strokeThickness: 4 };
    const leftArrow = this.add.text(424, 44, '\u25C0', arrowStyle).setOrigin(0.5)
      .setInteractive({ useHandCursor: true }).on('pointerdown', () => changePage(-1));
    const pageText = this.add.text(444, 44, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ccbbee',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    const rightArrow = this.add.text(464, 44, '\u25B6', arrowStyle).setOrigin(0.5)
      .setInteractive({ useHandCursor: true }).on('pointerdown', () => changePage(1));
    container.add(leftArrow);
    container.add(rightArrow);

    // Grid layout — 4 columns, 3 rows per page
    const cols = 4;
    const cardW = 108;
    const cardH = 80;
    const gapX = 8;
    const gapY = 8;
    const rowsPerPage = Math.ceil(perPage / cols);
    const totalW = cols * cardW + (cols - 1) * gapX;
    const totalH = rowsPerPage * cardH + (rowsPerPage - 1) * gapY;
    const gridStartX = 240 - totalW / 2 + cardW / 2;
    const gridStartY = 160 - totalH / 2 + cardH / 2 + 18;

    const keyMap = ['1','2','3','4','5','6','7','8','9','0','a','b'];

    const buildPage = () => {
      gridContainer.destroy(true);
      gridContainer = this.add.container(0, 0);
      container.add(gridContainer);

      // Update page indicator and arrow visibility
      pageText.setText(`${currentPage + 1} / ${totalPages}`);
      leftArrow.setVisible(currentPage > 0);
      rightArrow.setVisible(currentPage < totalPages - 1);

      const pageKeys = keys.slice(currentPage * perPage, (currentPage + 1) * perPage);

      pageKeys.forEach((key, i) => {
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
        gridContainer.add(cardBg);

        // Sprite preview
        const sprite = this.add.image(cx, cy - 14, `${tmpl.texturePrefix}_south`).setScale(0.9 * speciesScale(tmpl.texturePrefix));
        gridContainer.add(sprite);

        // Name
        gridContainer.add(this.add.text(cx, cy + 14, tmpl.name, {
          fontFamily: 'monospace', fontSize: '11px', color: '#ffffff',
          stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5));

        // Type + Role
        const typeHex = '#' + typeColor.toString(16).padStart(6, '0');
        const label = `${tmpl.elementType.toUpperCase()} · ${tmpl.role.toUpperCase()}`;
        gridContainer.add(this.add.text(cx, cy + 29, label, {
          fontFamily: 'monospace', fontSize: '9px', color: typeHex,
          stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5));

        // Key hint
        gridContainer.add(this.add.text(cx + cardW / 2 - 8, cy - cardH / 2 + 6, keyMap[i], {
          fontFamily: 'monospace', fontSize: '10px', color: '#ffdd44',
          stroke: '#000000', strokeThickness: 3,
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
          this.teardownStarterLibrary();
          this.applyStarter(createRiftlingAtLevel(key, 2));
        });
        gridContainer.add(hitArea);
      });
    };

    const changePage = (delta: number) => {
      const next = currentPage + delta;
      if (next >= 0 && next < totalPages) {
        currentPage = next;
        buildPage();
      }
    };

    // Keyboard: 1-9, 0, a, b for cards on current page; arrow keys for pagination
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { changePage(-1); return; }
      if (e.key === 'ArrowRight') { changePage(1); return; }
      const idx = keyMap.indexOf(e.key.toLowerCase());
      const pageKeys = keys.slice(currentPage * perPage, (currentPage + 1) * perPage);
      if (idx >= 0 && idx < pageKeys.length) {
        const picked = pageKeys[idx];
        this.teardownStarterLibrary();
        this.applyStarter(createRiftlingAtLevel(picked, 2));
      }
    };
    window.addEventListener('keydown', onKey);
    this.starterLibraryTeardown = () => {
      window.removeEventListener('keydown', onKey);
      container.destroy(true);
      this.starterSelectActive = false;
      this.starterLibraryTeardown = null;
    };

    buildPage();
  }

  private teardownStarterLibrary(): void {
    this.starterLibraryTeardown?.();
  }

  /** Commit the chosen starter. Used by both the gathering and library modes. */
  private applyStarter(rolled: PartyRiftling): void {
    this.starterChosen = true;
    this.starterSelectActive = false;
    this.party.active = [rolled];
    this.party.bench = [];
    this.syncCompanions();
    // Face the newly drafted starter toward the trainer (who faces north into
    // the room), so the intro scene reads as the two of them setting off.
    const starter = this.companions[0];
    if (starter) {
      starter.sprite.setTexture(`${rolled.texturePrefix}_north`);
      starter.dir = 'north';
    }
    this.drawPartyHud();
    this.synergyHud?.refresh();
    this.roleHud?.refresh();

    this.destroyStarterModeButton();
    this.teardownStarterGathering(true);
    this.showMovementHint();

    // Defer trinket grant until the player reaches the hub after the intro
    // combats. tryStartCombat is a no-op in the start room (no combat there),
    // but is called for parity with the prior flow.
    this.starterTrinketPending = true;
    this.tryStartCombat();
  }

  /** Gathering mode: place 3 NPC riftlings in the start room. */
  private spawnStarterGathering(): void {
    const room = this.currentRoom;
    const tmpl = room.template;

    // Pick 3 unique keys from the full library, biased toward different types.
    const offerings = pickDiverseSpecies(AVAILABLE_RIFTLINGS, 3);
    if (offerings.length === 0) return;

    const cx = Math.floor(tmpl.width / 2) * TILE + TILE / 2;
    const cy = Math.floor(tmpl.height / 2) * TILE + TILE / 2;
    const spacing = 56;
    const totalW = (offerings.length - 1) * spacing;
    const startX = cx - totalW / 2;

    const sprites: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < offerings.length; i++) {
      const tmplDef = RIFTLING_TEMPLATES[offerings[i]];
      if (!tmplDef) continue;
      const px = startX + i * spacing;
      const dir = directionFromVelocity(this.trainer.x - px, this.trainer.y - cy);
      const sprite = this.add
        .image(px, cy, `${tmplDef.texturePrefix}_${dir}`)
        .setScale(speciesScale(tmplDef.texturePrefix))
        .setDepth(10 + cy / 10);
      this.tweens.add({
        targets: sprite, y: cy - 2, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      });
      sprites.push(sprite);
    }

    const label = this.add
      .text(cx, cy - 24, 'Walk here to choose your starter', {
        fontFamily: 'monospace', fontSize: '8px', color: '#44ff88',
        stroke: '#000000', strokeThickness: 2,
      })
      .setOrigin(0.5).setDepth(100);

    const zoneW = Math.max(48, totalW + 48);
    const zone = this.add.zone(cx, cy, zoneW, 40);
    this.physics.add.existing(zone, true);

    this.starterGathering = { zone, sprites, label, offerings };
    this.starterGatheringUsed = false;
  }

  private checkStarterGathering(): void {
    if (!this.starterGathering || this.starterGatheringUsed) return;
    if (this.recruitPrompt.isActive) return;

    const trainerBounds = this.trainer.getBounds();
    const zoneBounds = this.starterGathering.zone.getBounds();
    if (!Phaser.Geom.Rectangle.Overlaps(trainerBounds, zoneBounds)) return;

    this.starterGatheringUsed = true;
    this.stopAllMovement();

    const stubs: DefeatedRiftling[] = this.starterGathering.offerings
      .map((key) => {
        const t = RIFTLING_TEMPLATES[key];
        if (!t) return null;
        return { riftlingKey: key, texturePrefix: t.texturePrefix, name: t.name };
      })
      .filter((x): x is DefeatedRiftling => x !== null);

    this.recruitPrompt.show(stubs, (picked) => {
      if (!picked) {
        // Shouldn't fire — allowSkip is false — but guard anyway.
        this.starterGatheringUsed = false;
        return;
      }
      this.applyStarter(picked);
    }, 2, false);
  }

  /** Remove gathering NPCs. `chosen=true` plays the dispersal fade. */
  private teardownStarterGathering(chosen: boolean): void {
    if (!this.starterGathering) return;
    const g = this.starterGathering;
    this.starterGathering = null;
    if (chosen) {
      g.label.setText('');
      this.tweens.add({
        targets: [...g.sprites, g.label],
        alpha: 0,
        duration: 600,
        onComplete: () => {
          g.sprites.forEach((s) => s.destroy());
          g.label.destroy();
          g.zone.destroy();
        },
      });
    } else {
      g.sprites.forEach((s) => s.destroy());
      g.label.destroy();
      g.zone.destroy();
    }
  }

  /** Top-left button to flip between gathering and library starter modes. */
  private createStarterModeButton(): void {
    const render = () => {
      this.starterModeButton?.destroy();
      const mode = getStarterMode();
      const label = mode === 'gathering' ? 'Show All' : '3 Random';

      const w = 54, h = 14;
      const container = this.add.container(4, 320 - h - 4).setDepth(700).setScrollFactor(0);
      const bg = this.add.graphics();
      bg.fillStyle(0x0e1220, 0.9);
      bg.fillRoundedRect(0, 0, w, h, 3);
      bg.lineStyle(1, 0x334466, 0.9);
      bg.strokeRoundedRect(0, 0, w, h, 3);
      container.add(bg);
      container.add(this.add.text(w / 2, h / 2, label, {
        fontFamily: 'monospace', fontSize: '7px', color: '#ffdd44',
      }).setOrigin(0.5));
      const hit = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.toggleStarterMode());
      container.add(hit);
      this.starterModeButton = container;
    };
    render();
  }

  private toggleStarterMode(): void {
    if (this.starterChosen) return;
    const next: StarterMode = getStarterMode() === 'gathering' ? 'library' : 'gathering';
    setStarterMode(next);
    if (next === 'library') {
      this.teardownStarterGathering(false);
      this.showStarterLibrary();
    } else {
      this.teardownStarterLibrary();
      this.spawnStarterGathering();
    }
    this.createStarterModeButton();
  }

  private destroyStarterModeButton(): void {
    this.starterModeButton?.destroy();
    this.starterModeButton = null;
  }

  private showStarterTrinketSelect(): void {
    const choices = pickRandomTrinkets(3);
    this.showTrinketSelection(choices, (trinket) => {
      this.onTrinketPicked(trinket);
    }, 'Choose a Crystal', 'Select one to bring on your run');
  }

  private spawnStarterShard(): void {
    this.starterShardUsed = false;
    const tmpl = this.currentRoom.template;
    const cx = Math.floor(tmpl.width / 2) * TILE + TILE / 2;
    const fountainY = Math.floor(tmpl.height / 2) * TILE + TILE / 2;
    const cy = fountainY + 4 * TILE;
    const radius = 18;

    const gfx = this.add.graphics().setDepth(0);
    gfx.fillStyle(0x7744cc, 0.2);
    gfx.fillCircle(cx, cy, radius + 6);
    gfx.fillStyle(0xaa66ff, 0.6);
    gfx.fillTriangle(cx, cy - radius, cx - 10, cy, cx + 10, cy);
    gfx.fillStyle(0x8844dd, 0.7);
    gfx.fillTriangle(cx, cy + radius, cx - 10, cy, cx + 10, cy);
    gfx.fillStyle(0xddaaff, 0.5);
    gfx.fillCircle(cx, cy, 4);

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

    const zone = this.add.zone(cx, cy, radius * 2.5, radius * 2.5);
    this.physics.add.existing(zone, true);

    this.starterShard = { zone, visual: gfx, label };
  }

  private checkStarterShard(): void {
    if (!this.starterShard || this.starterShardUsed) return;

    const trainerBounds = this.trainer.getBounds();
    const zoneBounds = this.starterShard.zone.getBounds();

    if (Phaser.Geom.Rectangle.Overlaps(trainerBounds, zoneBounds)) {
      this.starterShardUsed = true;
      this.stopAllMovement();

      this.tweens.add({
        targets: [this.starterShard.visual, this.starterShard.label],
        alpha: 0,
        duration: 400,
        onComplete: () => {
          this.starterShard?.visual.destroy();
          this.starterShard?.label.destroy();
          this.starterShard?.zone.destroy();
          this.starterShard = null;
        },
      });

      this.showStarterTrinketSelect();
    }
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

    // Click-to-activate hit area
    const hit = this.add
      .rectangle(cx, cy, radius * 2.5, radius * 2.5, 0x000000, 0)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      if (this.riftShardUsed || this.riftShardSelecting) return;
      this.riftShardSelecting = true;
      this.stopAllMovement();
      this.showTrinketSelection();
    });

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

  private showTrinketSelection(choices?: TrinketDef[], onPicked?: (trinket: TrinketDef) => void, title = 'Rift Shard', subtitle = 'Choose a crystal'): void {
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
    const cardH = 120;
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
      const iconY = cy - cardH / 2 + 18;
      const icon = this.add.graphics();
      icon.fillStyle(color, 0.8);
      icon.fillTriangle(cx, iconY - 6, cx - 8, iconY + 6, cx + 8, iconY + 6);
      icon.fillStyle(color, 0.6);
      icon.fillTriangle(cx, iconY + 14, cx - 8, iconY + 6, cx + 8, iconY + 6);
      container.add(icon);

      // Name
      const nameText = this.add
        .text(cx, cy - cardH / 2 + 46, trinket.name, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 2,
          wordWrap: { width: cardW - 12 },
          align: 'center',
        })
        .setOrigin(0.5, 0);
      container.add(nameText);

      // Description
      const descText = this.add
        .text(cx, cy - cardH / 2 + 62, trinket.description, {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: '#7fffa8',
          stroke: '#000000',
          strokeThickness: 1,
          wordWrap: { width: cardW - 12 },
          align: 'center',
        })
        .setOrigin(0.5, 0);
      container.add(descText);

      // Flavor text
      const flavorText = this.add
        .text(cx, cy - cardH / 2 + 84, trinket.flavor, {
          fontFamily: 'monospace',
          fontSize: '7px',
          color: '#bfc4d4',
          stroke: '#000000',
          strokeThickness: 1,
          wordWrap: { width: cardW - 12 },
          align: 'center',
        })
        .setOrigin(0.5, 0);
      container.add(flavorText);

      // Key hint — top-right corner so it doesn't overlap body text
      const keyLabel = this.add
        .text(cx + cardW / 2 - 8, cy - cardH / 2 + 8, `${i + 1}`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#ffdd44',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(1, 0);
      container.add(keyLabel);

      // Hover + click hit area — scene-level (NOT in the container) so that
      // Phaser's input system uses screen coordinates.  Objects inside a
      // scrollFactor-0 container still hit-test in world space, which drifts
      // when the camera scrolls and makes only part of the card clickable.
      const hitArea = this.add.rectangle(cx, cy, cardW, cardH, 0x000000, 0)
        .setScrollFactor(0)
        .setDepth(701)
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
        this.destroyRiftShardUI();
        onPicked!(trinket);
      });
      (container as any).__hitAreas = (container as any).__hitAreas || [];
      (container as any).__hitAreas.push(hitArea);
    });

    // Keyboard listener
    const onKey = (e: KeyboardEvent) => {
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < choices.length) {
        window.removeEventListener('keydown', onKey);
        this.destroyRiftShardUI();
        onPicked!(choices[idx]);
      }
    };
    window.addEventListener('keydown', onKey);
  }

  /** Handle a trinket being selected — add to inventory and apply immediate effects. */
  private onTrinketPicked(trinket: TrinketDef): void {
    addTrinket(this.party.trinkets, trinket);

    // Visual feedback
    this.cameras.main.flash(300, 80, 50, 120);
    this.showMessage(`Equipped: ${trinket.name}`, '#bb88ff');
  }

  private destroyRiftShardUI(): void {
    if (this.riftShardUI) {
      const hitAreas: Phaser.GameObjects.Rectangle[] = (this.riftShardUI as any).__hitAreas || [];
      for (const h of hitAreas) h.destroy();
      this.riftShardUI.destroy(true);
      this.riftShardUI = null;
    }
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

  // --- Recruit Gathering (themed recruit terminal reward) ---

  /**
   * Spawn 1-3 stationary riftling NPCs in a recruit terminal room, based on
   * the branch's pre-rolled biome offerings. Walking up to the gathering
   * opens the RecruitPrompt; picking one adds it to the party and clears
   * the others. Mirrors the rift-shard spawn/check pattern.
   */
  /**
   * BFS outward from a tile coordinate to find the nearest walkable tile.
   * Returns world-pixel center of the found tile, or the original position
   * if nothing walkable is found within the search radius.
   */
  private findNearbyWalkable(wx: number, wy: number, maxRadius = 8): { x: number; y: number } {
    if (this.nav?.isWalkableAt(wx, wy)) return { x: wx, y: wy };
    const startTx = Math.floor(wx / TILE);
    const startTy = Math.floor(wy / TILE);
    const visited = new Set<string>();
    const queue: { tx: number; ty: number }[] = [{ tx: startTx, ty: startTy }];
    visited.add(`${startTx},${startTy}`);
    while (queue.length > 0) {
      const { tx, ty } = queue.shift()!;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = tx + dx;
          const ny = ty + dy;
          const key = `${nx},${ny}`;
          if (visited.has(key)) continue;
          if (Math.abs(nx - startTx) > maxRadius || Math.abs(ny - startTy) > maxRadius) continue;
          visited.add(key);
          const worldX = nx * TILE + TILE / 2;
          const worldY = ny * TILE + TILE / 2;
          if (this.nav?.isWalkableAt(worldX, worldY)) return { x: worldX, y: worldY };
          queue.push({ tx: nx, ty: ny });
        }
      }
    }
    return { x: wx, y: wy };
  }

  private findOpenRecruitTiles(tmpl: RoomTemplate, count: number): { tx: number; ty: number }[] {
    const MARGIN = 2;
    const DECOR_RADIUS = 3;

    const decSet = new Set<string>();
    if (tmpl.decorations) {
      for (const d of tmpl.decorations) {
        for (let dy = -DECOR_RADIUS; dy <= DECOR_RADIUS; dy++) {
          for (let dx = -DECOR_RADIUS; dx <= DECOR_RADIUS; dx++) {
            decSet.add(`${d.x + dx},${d.y + dy}`);
          }
        }
      }
    }

    const isFloor = (tx: number, ty: number): boolean =>
      tx >= 0 && ty >= 0 && tx < tmpl.width && ty < tmpl.height
      && (tmpl.tiles[ty][tx] === 1 || tmpl.tiles[ty][tx] === 3);

    const candidates: { tx: number; ty: number; dist: number }[] = [];
    const centerTx = tmpl.width / 2;
    const centerTy = tmpl.height / 2;

    for (let ty = MARGIN; ty < tmpl.height - MARGIN; ty++) {
      for (let tx = MARGIN; tx < tmpl.width - MARGIN; tx++) {
        if (!isFloor(tx, ty)) continue;
        if (decSet.has(`${tx},${ty}`)) continue;
        let open = true;
        for (let dy = -MARGIN; dy <= MARGIN && open; dy++) {
          for (let dx = -MARGIN; dx <= MARGIN && open; dx++) {
            if (!isFloor(tx + dx, ty + dy)) open = false;
          }
        }
        if (!open) continue;
        const dist = Math.hypot(tx - centerTx, ty - centerTy);
        candidates.push({ tx, ty, dist });
      }
    }

    candidates.sort((a, b) => a.dist - b.dist);

    if (candidates.length === 0) {
      const fallback: { tx: number; ty: number }[] = [];
      const cTx = Math.floor(centerTx);
      const cTy = Math.floor(centerTy);
      for (let i = 0; i < count; i++) {
        fallback.push({ tx: cTx - (count - 1) * 2 + i * 4, ty: cTy });
      }
      return fallback;
    }

    const MIN_TILE_DIST = 7;
    const picks: { tx: number; ty: number }[] = [candidates[0]];
    for (const c of candidates) {
      if (picks.length >= count) break;
      const tooClose = picks.some(
        p => Math.hypot(p.tx - c.tx, p.ty - c.ty) < MIN_TILE_DIST,
      );
      if (!tooClose) picks.push(c);
    }

    if (picks.length < count) {
      for (const c of candidates) {
        if (picks.length >= count) break;
        if (!picks.some(p => p.tx === c.tx && p.ty === c.ty)) picks.push(c);
      }
    }

    return picks;
  }

  private spawnRecruitGathering(): void {
    const room = this.currentRoom;
    const tmpl = room.template;
    if (tmpl.type !== 'recruit') return;
    const offerings = room.recruitOfferings;
    if (!offerings || offerings.length === 0) return;

    this.recruitGatheringUsed = false;

    const cx = Math.floor(tmpl.width / 2) * TILE + TILE / 2;
    const cy = Math.floor(tmpl.height / 2) * TILE + TILE / 2;

    const dxFromCenter = this.trainer.x - cx;
    const dyFromCenter = this.trainer.y - cy;
    const horizontalEntry = Math.abs(dxFromCenter) > Math.abs(dyFromCenter);
    const facingDir = horizontalEntry
      ? (dxFromCenter > 0 ? 'east' : 'west')
      : (dyFromCenter > 0 ? 'south' : 'north');

    const openTiles = this.findOpenRecruitTiles(tmpl, offerings.length);

    const sprites: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < offerings.length; i++) {
      const key = offerings[i];
      const tmplDef = RIFTLING_TEMPLATES[key];
      if (!tmplDef) continue;
      const tile = openTiles[i % openTiles.length];
      const px = tile.tx * TILE + TILE / 2;
      const py = tile.ty * TILE + TILE / 2;
      const sprite = this.add
        .image(px, py, `${tmplDef.texturePrefix}_${facingDir}`)
        .setScale(speciesScale(tmplDef.texturePrefix))
        .setDepth(10 + py / 10);
      this.tweens.add({
        targets: sprite,
        y: py - 2,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
      sprites.push(sprite);
    }

    const avgX = sprites.length > 0 ? sprites.reduce((s, sp) => s + sp.x, 0) / sprites.length : cx;
    const avgY = sprites.length > 0 ? sprites.reduce((s, sp) => s + sp.y, 0) / sprites.length : cy;

    const label = this.add
      .text(avgX, avgY - 24, 'Walk here to recruit', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#44ff88',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(100);

    const minX = Math.min(...sprites.map(s => s.x));
    const maxX = Math.max(...sprites.map(s => s.x));
    const minY = Math.min(...sprites.map(s => s.y));
    const maxY = Math.max(...sprites.map(s => s.y));
    const zoneW = Math.max(48, maxX - minX + 48);
    const zoneH = Math.max(48, maxY - minY + 48);
    const zone = this.add.zone(avgX, avgY, zoneW, zoneH);
    this.physics.add.existing(zone, true);

    this.recruitGathering = { zone, sprites, label, offerings, };
  }

  private checkRecruitGathering(): void {
    if (!this.recruitGathering || this.recruitGatheringUsed) return;
    if (this.recruitPrompt.isActive || this.pendingRecruit) return;

    const trainerBounds = this.trainer.getBounds();
    const zoneBounds = this.recruitGathering.zone.getBounds();
    if (!Phaser.Geom.Rectangle.Overlaps(trainerBounds, zoneBounds)) return;

    this.recruitGatheringUsed = true;
    this.pendingRecruit = true;
    this.stopAllMovement();

    // Build stub DefeatedRiftling entries so RecruitPrompt.show can reuse
    // its existing pre-roll + UI path.
    const stubs: DefeatedRiftling[] = this.recruitGathering.offerings
      .map((key) => {
        const t = RIFTLING_TEMPLATES[key];
        if (!t) return null;
        return { riftlingKey: key, texturePrefix: t.texturePrefix, name: t.name };
      })
      .filter((x): x is DefeatedRiftling => x !== null);

    const biomePool = speciesForBiome(this.currentRoom.template.biome);
    this.recruitPrompt.show(stubs, (recruited) => {
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
      this.roleHud?.refresh();
      this.pendingRecruit = false;

      // Fade out the remaining NPCs — the chosen one (or none) has been
      // resolved. Label becomes a passive tag.
      if (this.recruitGathering) {
        this.recruitGathering.label.setText('Gathering dispersed');
        this.recruitGathering.label.setColor('#666666');
        this.tweens.add({
          targets: [...this.recruitGathering.sprites, this.recruitGathering.label],
          alpha: 0,
          duration: 800,
        });
      }
    }, this.getRecruitTargetLevel());
  }

  private stopAllMovement(): void {
    this.trainer.setVelocity(0, 0);
    for (const c of this.companions) {
      if (c.sprite.active) c.sprite.setVelocity(0, 0);
    }
  }

  private snapToIdle(): void {
    stopWalkAnim(this.trainer, 'player', this.trainerDir);
    for (let i = 0; i < this.companions.length; i++) {
      const c = this.companions[i];
      if (c.sprite.active) {
        stopWalkAnim(c.sprite, this.party.active[i].texturePrefix, c.dir);
      }
    }
  }

  private getRecruitTargetLevel(): number {
    const active = this.party.active;
    if (active.length === 0) return 1;
    const avg = active.reduce((s, r) => s + r.level, 0) / active.length;
    return Math.max(1, Math.floor(avg));
  }

  private onPartyWiped(): void {
    if (this.gameEnding) return;
    this.gameEnding = true;
    this.stopAllMovement();
    if (this.timerEvent) this.timerEvent.paused = true;

    // Brief fade then hand off to the GameOver scene
    const overlay = this.add
      .rectangle(240, 160, 480, 320, 0x000000, 0)
      .setScrollFactor(0)
      .setDepth(700);
    this.tweens.add({
      targets: overlay,
      alpha: 1,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => {
        // Starting the already-registered scene re-runs its init/create,
        // which refreshes the text glyph cache. The earlier remove/re-add
        // approach threw a duplicate-key error because Phaser's SceneManager
        // checks keys synchronously in add() before the queued remove runs.
        this.scene.start('GameOver', { reason: 'wipe' });
      },
    });
  }

  private onTimerExpired(): void {
  }

  private launchVictory(): void {
    if (this.gameEnding) return;
    this.gameEnding = true;
    this.stopAllMovement();
    this.combatManager.destroy();
    if (this.timerEvent) this.timerEvent.paused = true;

    const roster = [...this.party.active, ...this.party.bench].map((r) => ({
      name: r.name,
      texturePrefix: r.texturePrefix,
      level: r.level,
      role: r.role,
      hp: r.maxHp,
      attack: r.attack,
      defense: r.defense,
      speed: r.speed,
    }));
    const elapsedTime = this.timerSeconds;

    const overlay = this.add
      .rectangle(240, 160, 480, 320, 0x000000, 0)
      .setScrollFactor(0)
      .setDepth(700);
    this.tweens.add({
      targets: overlay,
      alpha: 1,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => {
        this.scene.start('Victory', { elapsedTime, roster });
      },
    });
  }

  private onRoomCleared(defeated: DefeatedRiftling[]): void {
    this.currentRoom.cleared = true;
    this.pendingRecruit = true;

    // Elite trainer vanishes when their squad is defeated — fade + scale out.
    if (this.eliteNpcSprite) {
      const npc = this.eliteNpcSprite;
      this.eliteNpcSprite = null;
      if (this.eliteNpcBody) {
        this.eliteNpcBody.destroy();
        this.eliteNpcBody = null;
      }
      this.tweens.add({
        targets: npc,
        alpha: 0,
        scaleX: 0,
        scaleY: 0,
        delay: 2000,
        duration: 500,
        onComplete: () => npc.destroy(),
      });
    }
    // CombatHUD stays visible — cooldown bars will stop updating when combat ends
    this.stopAllMovement();

    // Sync all companion HP back from combat, then heal survivors 20%
    const hps = this.combatManager.getAllyHps();
    for (let i = 0; i < this.party.active.length; i++) {
      const member = this.party.active[i];
      member.hp = Math.min(hps[i] ?? member.hp, member.maxHp);
      if (member.hp > 0) {
        member.hp = Math.min(member.hp + Math.floor(member.maxHp * 0.2), member.maxHp);
      }
    }

    if (this.currentRoom.template.type === 'boss') {

      // Boss defeated: activate the rift core so the player walks to it for victory.
      if (this.riftCoreSprite) {
        this.activateRiftCore();
      }
    }

    // Distribute XP to all party members (skip stat-card picks for boss — game is over)
    const isBoss = this.currentRoom.template.type === 'boss';
    const xpEarned = this.combatManager.xpEarned;
    const levelUps = isBoss ? [] : this.distributeXP(xpEarned, this.currentRoom.template.type);

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
        room.template.type !== 'boss' &&
        (room.branchId === undefined ||
        (room.terminal === true && room.template.type === 'recruit'));

      // Show level-up notifications sequentially, then recruit prompt
      this.showLevelUps(levelUps, () => {
        if (defeated.length > 0 && recruitAllowed) {
          const biomePool = speciesForBiome(this.currentRoom.template.biome);
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
            this.roleHud?.refresh();
            this.pendingRecruit = false;
          }, this.getRecruitTargetLevel(), true, biomePool);
        } else {
          this.pendingRecruit = false;
        }
      });
    });
  }

  /** Distribute XP to active (full) and bench (reduced) riftlings. Returns level-up results. */
  private distributeXP(totalXP: number, roomType?: string): LevelUpResult[] {
    if (totalXP <= 0) return [];

    // Apply crystal XP multiplier (plus elite-room bonus if applicable)
    let xpMult = getXPMultiplier(this.party.trinkets);
    if (roomType === 'elite') xpMult *= getEliteXPMultiplier(this.party.trinkets);
    totalXP = Math.floor(totalXP * xpMult);

    const levelUps: LevelUpResult[] = [];
    const benchXP = Math.floor(totalXP * BENCH_XP_RATIO);

    // Scholar's Lens: identify the lowest-level active riftling (ties → first).
    const lowLevelMult = getLowestLevelXPBonus(this.party.trinkets);
    let lowestIdx = -1;
    if (lowLevelMult > 1 && this.party.active.length > 0) {
      lowestIdx = 0;
      for (let i = 1; i < this.party.active.length; i++) {
        if (this.party.active[i].level < this.party.active[lowestIdx].level) lowestIdx = i;
      }
    }

    for (let i = 0; i < this.party.active.length; i++) {
      const riftling = this.party.active[i];
      const share = i === lowestIdx ? Math.floor(totalXP * lowLevelMult) : totalXP;
      const result = awardXP(riftling, share);
      if (result) levelUps.push(result);
    }
    for (const riftling of this.party.bench) {
      const result = awardXP(riftling, benchXP);
      if (result) levelUps.push(result);
    }

    this.drawPartyHud();
    return levelUps;
  }

  /**
   * Walk the queued level-ups one at a time. For each:
   *   1. Show the stat-card picker (3 cards from the weighted pool).
   *   2. If the new level is 3/6/9, show the move-upgrade picker for that riftling.
   *   3. Continue to the next queued level-up, then call onDone.
   */
  private showLevelUps(levelUps: LevelUpResult[], onDone: () => void): void {
    if (levelUps.length === 0) {
      onDone();
      return;
    }

    const result = levelUps.shift()!;
    const r = result.riftling;

    const afterChoices = () => {
      this.drawPartyHud();
      this.showLevelUps(levelUps, onDone);
    };

    const offerMoveUpgradeIfApplicable = () => {
      const newMove = getUpgradeMoveForLevel(r, result.newLevel);
      if (!newMove) {
        afterChoices();
        return;
      }
      this.levelUpPrompt.showMoveUpgrade(r, newMove, (replaceIdx) => {
        applyMoveUpgrade(r, newMove, replaceIdx);
        afterChoices();
      });
    };

    const cards = generateStatCards(r);
    this.levelUpPrompt.showStatCards(r, cards, (card) => {
      if (card) applyStatCard(r, card);
      offerMoveUpgradeIfApplicable();
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

  private showMovementHint(): void {
    // no-op — replaced by persistent control hints
  }

  private createControlHints(): void {
    const x = 480 - 4;
    const y = 4;
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#9988bb',
      stroke: '#000000',
      strokeThickness: 2,
    };

    const line1 = this.add.text(0, 0, 'MOVE:   WASD', style);
    const line2 = this.add.text(0, 11, 'BAG:    TAB', style);
    const line3 = this.add.text(0, 22, 'ROTATE: Q / E', style);
    const tw = Math.max(line1.width, line2.width, line3.width);
    const th = line3.y + line3.height;
    const pad = 3;

    const bg = this.add.rectangle(
      -pad, -pad, tw + pad * 2, th + pad * 2, 0x000000, 0.45,
    ).setOrigin(0, 0);

    const cx = x - tw - pad;
    this.controlHintsContainer = this.add.container(cx, y, [bg, line1, line2, line3]);
    this.controlHintsContainer.setScrollFactor(0).setDepth(100);

    const volY = y + (th / 2);
    this.volumeWidgetContainer = createVolumeWidget(this, cx - 66, volY);
  }

  // --- Room transitions ---

  /**
   * If `room` is a terminal of some branch, mark that branch cleared, seal
   * its hub door, and refresh hub door unlock states. No-op if the room
   * isn't a terminal.
   *
   * Returns `null` normally, or `'victory'` when the boss is cleared
   * (rift core interaction handles the actual victory trigger).
   */
  private sealBranchIfLeavingTerminal(room: DungeonRoom): 'victory' | null {
    if (!room.terminal || room.branchId === undefined) return null;

    const dungeon = this.dungeon;
    const branchId = room.branchId;

    let branch = dungeon.branches.find((b) => b.id === branchId) ?? null;
    let isBoss = false;
    if (!branch && dungeon.boss.id === branchId) {
      branch = dungeon.boss;
      isBoss = true;
    }
    if (!branch || branch.cleared) return null;

    branch.cleared = true;
    const door = dungeon.doors.find((d) => d.branchId === branchId);
    if (door) door.sealed = true;

    this.refreshHubDoorStates();

    if (isBoss) {
      return null; // victory via rift core interaction
    }
    return null;
  }

  /**
   * Recompute locked/sealed flags on hub doors based on current dungeon
   * state. Runs after any branch-clear commit and before rendering the
   * hub's door zones.
   *
   * Unlock rules:
   *   - Regular branch doors: always unlocked (sealed flag handles cleared).
   *   - Boss door:            locked until BOSS_UNLOCK_THRESHOLD regular
   *                           branches are cleared.
   */
  private refreshHubDoorStates(): void {
    const dungeon = this.dungeon;
    const clearedRegular = dungeon.branches.filter((b) => b.cleared).length;
    for (const door of dungeon.doors) {
      if (door.slot === BOSS_SLOT) {
        const wasLocked = door.locked;
        door.locked = clearedRegular < BOSS_UNLOCK_THRESHOLD;
        if (wasLocked && !door.locked) {
          this.pendingBossUnlockAnnouncement = true;
        }
      }
    }
  }

  /**
   * Play the "boss door unlocked" feedback: a toast + a gold pulse over the
   * boss door tiles. Called from loadRoom after the hub renders, so the
   * player sees the door flash in the distance.
   */
  private announceBossUnlocked(): void {
    const msg = this.add
      .text(240, 40, 'A door opens in the distance...', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffdd44',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(300);
    this.time.delayedCall(2000, () => msg.destroy());

    const tmpl = this.currentRoom?.template;
    if (!tmpl || tmpl.type !== 'hub' || !tmpl.hubDoorSlots) return;
    const slot = tmpl.hubDoorSlots.find((s) => s.slot === BOSS_SLOT);
    if (!slot) return;
    const span = slot.span ?? 2;
    const onHorizontalWall = slot.ty === 0 || slot.ty === tmpl.height - 1;
    const w = onHorizontalWall ? TILE * span : TILE;
    const h = onHorizontalWall ? TILE : TILE * span;

    const pulse = this.add.graphics().setDepth(6);
    pulse.fillStyle(0xffdd44, 0.8);
    pulse.fillRect(slot.tx * TILE, slot.ty * TILE, w, h);
    this.tweens.add({
      targets: pulse,
      alpha: 0,
      duration: 1400,
      repeat: 2,
      yoyo: true,
      onComplete: () => pulse.destroy(),
    });
  }

  private checkBossDoorLabel(): void {
    if (!this.bossDoorLabel || !this.bossDoorCenter) return;
    const dx = this.trainer.x - this.bossDoorCenter.x;
    const dy = this.trainer.y - this.bossDoorCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const shouldShow = dist < TILE * 6;
    if (shouldShow === this.bossDoorLabelVisible) return;
    this.bossDoorLabelVisible = shouldShow;
    this.tweens.killTweensOf(this.bossDoorLabel);
    this.tweens.add({
      targets: this.bossDoorLabel,
      alpha: shouldShow ? 1 : 0,
      duration: 300,
    });
  }

  private transitionToRoom(targetRoomId: number): void {
    // Clean up current combat (keep combatHud — it persists across rooms)
    this.combatManager.destroy();

    // Drop any lingering elite NPC sprite/body so it doesn't leak across rooms.
    if (this.eliteNpcSprite) {
      this.eliteNpcSprite.destroy();
      this.eliteNpcSprite = null;
    }
    if (this.eliteNpcBody) {
      this.eliteNpcBody.destroy();
      this.eliteNpcBody = null;
    }

    const prevRoom = this.currentRoom;

    // If the player is leaving a terminal room, the branch is considered
    // cleared — seal its hub door and
    // let the hub unlock logic refresh on the next hub load. This fires
    // regardless of whether combat/UI flows have completed; walking out
    // of the terminal is the commit point.
    const sealResult = this.sealBranchIfLeavingTerminal(prevRoom);
    if (sealResult === 'victory') {
      this.launchVictory();
      return;
    }

    const targetRoom = this.dungeon.rooms[targetRoomId];

    // Resolve deferred branch rewards the first time the player enters a
    // branch. Must happen before loadRoom so the terminal/elite templates
    // are in place before any room in the chain is rendered.
    if (targetRoom.branchId !== undefined) {
      resolveBranchOnEntry(this.dungeon, targetRoom.branchId);
    }

    this.currentRoom = targetRoom;
    this.dungeon.currentRoomId = targetRoomId;

    this.loadRoom(targetRoom);

    // Spawn player near the door they entered from
    const tmpl = targetRoom.template;
    const { x: spawnX, y: spawnY } = this.getEntrySpawn(prevRoom, targetRoom, tmpl);

    this.trainer.setPosition(spawnX, spawnY);
    this.trainer.setVelocity(0, 0);
    stopWalkAnim(this.trainer, 'player', this.trainerDir);

    if (this.trainerWallCollider) this.physics.world.removeCollider(this.trainerWallCollider);
    this.trainerWallCollider = this.physics.add.collider(this.trainer, this.walls);

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
    this.updateRoomLabel();

    // Brief flash effect for transition
    this.cameras.main.flash(200, 20, 10, 40);

    if (prevRoom.terminal && tmpl.type === 'hub') {
      this.transitionFreeze = true;
      this.trainerDir = 'south';
      stopWalkAnim(this.trainer, 'player', 'south');
      this.trainer.setVelocity(0, 0);
      this.time.delayedCall(400, () => {
        this.transitionFreeze = false;
      });
    }

    // Start combat if this is a combat room
    this.tryStartCombat();
    this.spawnHealingSpring();
    this.spawnRiftShard();
    this.spawnRecruitGathering();

    // Spawn the starter rift shard the first time the player reaches the hub
    // (after clearing both intro combats). The player walks into it to pick
    // their first crystal — much less jarring than an immediate overlay.
    if (this.starterTrinketPending && targetRoom.template.type === 'hub') {
      this.starterTrinketPending = false;
      this.spawnStarterShard();
    }

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

    if (fromRoom.terminal && tmpl.type === 'hub') {
      return { x: cx, y: cy + 4 * TILE };
    }

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
      .setDepth(100)
      .setVisible(false);
  }

  private updateRoomLabel(): void {
  }

  private startTimer(): void {
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (this.recruitPrompt?.isActive || this.pendingRecruit || this.partyScreen?.isActive || this.riftShardSelecting) return;
        this.timerSeconds++;
        this.timerText.setText(this.formatTime(this.timerSeconds));
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
    const slotW = 108;
    const slotH = 34;
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
        const icon = this.add.image(startX + 14, y + slotH / 2, spriteKey).setScale(0.4 * speciesScale(r.texturePrefix));
        this.partyHud.add(icon);
      }

      // Name + level
      const nameText = this.add.text(startX + 28, y + 1, r.name, {
        fontFamily: 'monospace', fontSize: '9px', color: isSelected ? '#ffffff' : '#dddddd',
        stroke: '#000000', strokeThickness: 2,
      });
      this.partyHud.add(nameText);

      const lvlText = this.add.text(startX + slotW - 4, y + 1, `Lv${r.level}`, {
        fontFamily: 'monospace', fontSize: '8px', color: '#ffdd44',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(1, 0);
      this.partyHud.add(lvlText);

      // Stance glyph (left of level number on the top row)
      const stanceGlyph: Record<string, { glyph: string; color: string }> = {
        push:     { glyph: '\u25B2', color: '#ff7755' }, // ▲
        hold:     { glyph: '\u25A0', color: '#bbbbbb' }, // ■
        withdraw: { glyph: '\u25BC', color: '#66aaff' }, // ▼
        group:    { glyph: '\u25CF', color: '#aaff88' }, // ●
      };
      const sg = stanceGlyph[r.stance] ?? stanceGlyph.push;
      const stanceText = this.add.text(startX + slotW - 24, y + 1, sg.glyph, {
        fontFamily: 'monospace', fontSize: '9px', color: sg.color,
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(1, 0);
      this.partyHud.add(stanceText);

      // Role label + HP numbers (same row, below name)
      const roleColors: Record<string, string> = {
        vanguard: '#6688cc', skirmisher: '#44cc88', striker: '#ff6644',
        caster: '#cc66ff', hunter: '#ffaa33', support: '#88ddaa', hexer: '#aa44cc',
      };
      const hpRatio = r.hp / r.maxHp;
      const hpColor = hpRatio > 0.5 ? '#44cc44' : hpRatio > 0.25 ? '#ccaa22' : '#cc3333';

      const roleText = this.add.text(startX + 28, y + 12, r.role.toUpperCase(), {
        fontFamily: 'monospace', fontSize: '7px', color: roleColors[r.role] ?? '#aaaaaa',
        stroke: '#000000', strokeThickness: 2,
      });
      this.partyHud.add(roleText);

      // HP numbers right-aligned on the role line (above the bar, not on it)
      const hpLabel = this.add.text(startX + slotW - 4, y + 12, `${r.hp}/${r.maxHp}`, {
        fontFamily: 'monospace', fontSize: '7px', color: hpColor,
        stroke: '#000000', strokeThickness: 2,
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
      const clickedIndex = i;
      const hitZone = this.add.rectangle(startX + slotW / 2, y + slotH / 2, slotW, slotH, 0x000000, 0)
        .setScrollFactor(0).setDepth(101).setInteractive({ useHandCursor: true });
      hitZone.on('pointerdown', () => {
        if (this.selectedIndex === clickedIndex) return;
        this.selectedIndex = clickedIndex;
        if (this.combatManager?.isActive) {
          const sprite = this.companions[clickedIndex]?.sprite;
          if (sprite) this.combatManager.selectAllyBySprite(sprite);
        }
        this.drawPartyHud();
      });
      this.partyHud.add(hitZone);
    }
  }

  // --- Update loop ---

  update(time: number): void {
    // Freeze everything during game-over fade
    if (this.gameEnding) return;

    // Freeze gameplay during overlays
    const frozen = this.partyScreen?.isActive
      || this.transitionFreeze
      || this.riftShardSelecting
      || !!this.riftShardUI
      || this.pendingRecruit || this.recruitPrompt.isActive
      || this.levelUpPrompt?.isActive;

    if (frozen) {
      this.snapToIdle();
      if (this.pendingRecruit || this.recruitPrompt.isActive) {
        this.recruitPrompt.update();
      }
      return;
    }

    // Freeze trainer movement during pre-combat setup
    if (this.combatManager.isActive && this.combatManager.isSetupPhase) {
      this.trainer.setVelocity(0, 0);
    } else {
      this.updateTrainerMovement();
      this.recordTrailSample();
    }

    if (this.combatManager.isActive && !this.builderActiveHook?.()) {
      this.combatManager.update(time, this.trainer);
      // Sync live HP from combat back to party data so the HUD reflects damage.
      // Re-check isActive: if combat ended inside update(), onRoomCleared already
      // synced + healed party HP — re-syncing here would overwrite the heal and
      // allow combat-buffed HP (synergy/trinket maxHp bonuses) to leak into party.
      if (this.combatManager.isActive) {
        const hps = this.combatManager.getAllyHps();
        for (let i = 0; i < this.party.active.length; i++) {
          const member = this.party.active[i];
          const raw = hps[i] ?? member.hp;
          member.hp = Math.min(raw, member.maxHp);
        }
        this.drawPartyHud();
      }
    } else {
      this.updateCompanionFollow();
    }

    // Y-axis depth sort for overworld sprites (trainer + companions)
    this.trainer.setDepth(10 + this.trainer.y / 10);
    for (const c of this.companions) {
      if (c.sprite.active) c.sprite.setDepth(10 + c.sprite.y / 10);
    }
    this.updateImmersiveDecorationDepths();
    this.updateEliteNpcFacing();

    // Move HUD updates every frame (shows cooldowns in combat, static moves otherwise)
    this.combatHud.update(time);

    this.checkHealingSpring();
    this.checkRiftShard();
    this.checkStarterShard();
    this.checkRiftCore();
    this.checkRecruitGathering();
    this.checkStarterGathering();
    this.checkDoorTransitions();
    this.checkBossDoorLabel();
  }

  /**
   * Point the elite NPC at the player each frame. Uses a cardinal direction
   * from the elite sprite toward the trainer — picks the axis with larger
   * magnitude. Idle animation exists for south/east/west; north falls back to
   * the static north rotation.
   */
  private updateEliteNpcFacing(): void {
    const npc = this.eliteNpcSprite;
    if (!npc || !npc.active || !this.trainer) return;
    const dx = this.trainer.x - npc.x;
    const dy = this.trainer.y - npc.y;
    let dir: 'south' | 'north' | 'east' | 'west';
    if (Math.abs(dx) > Math.abs(dy)) dir = dx >= 0 ? 'east' : 'west';
    else dir = dy >= 0 ? 'south' : 'north';

    if (dir === 'north') {
      if (npc.anims.isPlaying) npc.anims.stop();
      npc.setTexture('rift_elite_north');
      return;
    }
    const animKey = `rift_elite_idle_${dir}`;
    const current = npc.anims.currentAnim?.key;
    if (current !== animKey || !npc.anims.isPlaying) {
      npc.anims.play(animKey, true);
    }
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
    // Can't leave the start room until a starter is chosen.
    if (!this.starterChosen && (this.starterGathering || this.starterSelectActive)) return;

    // Use the physics body (14×14) rather than the display bounds (48×48 sprite).
    // Display bounds fire the zone 2–3 tiles before the player visually reaches
    // the door, which on side-wall slots with a long vertical approach causes
    // the transition to trigger mid-spine instead of at the door.
    const body = this.trainer.body as Phaser.Physics.Arcade.Body;
    const trainerBounds = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
    for (const { zone, targetRoomId } of this.doorZones) {
      const zoneBounds = zone.getBounds();

      if (Phaser.Geom.Rectangle.Overlaps(trainerBounds, zoneBounds)) {
        this.transitionToRoom(targetRoomId);
        return;
      }
    }
  }
}
