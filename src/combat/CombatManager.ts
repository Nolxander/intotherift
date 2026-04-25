import Phaser from 'phaser';
import { PartyRiftling, Move, MoveKind, Role, Stance, AVAILABLE_RIFTLINGS, MAX_LEVEL, createRiftlingAtLevel, BASE_KILL_XP, getActiveSynergies, getActiveRoleSynergies, TYPE_COLORS, speciesScale, FormationOffset } from '../data/party';
import { EliteTeamMember } from '../data/room_templates';
import { TrinketInventory, getEquippedBuffs, getRoleBuffs } from '../data/trinkets';
import {
  getRoleDamageReduction, getAttackerDamageMultiplier, getRoleLifestealRatio,
  getRoleHealMultiplier, getRoleAoERadiusMultiplier, getRoleDebuffDurationMultiplier,
  getRoleSpeedMultiplier, isKitingRole,
  VANGUARD_TAUNT_RADIUS, KITE_RADIUS, KITE_BACKSTEP_MULT,
  HUNTER_RANGE_THRESHOLD, HUNTER_SCAN_RADIUS,
  SUPPORT_REGEN_RADIUS, SUPPORT_REGEN_PER_TICK,
} from './roles';
import { SimpleNav, NavPoint, NAV_ARRIVAL_RADIUS, STUCK_WINDOW_MS, STUCK_THRESHOLD_PX } from '../data/nav';
import { playWalkOrStatic, stopWalkAnim, directionFromVelocity, playAttackAnim, isPlayingAttackAnim } from '../data/anims';

const HP_BAR_WIDTH = 20;
const HP_BAR_HEIGHT = 3;
const HP_BAR_OFFSET_Y = -16;

/** Minimum distance between same-team units before separation force kicks in. */
const SEPARATION_RADIUS = 24;
/** Strength of the separation push (pixels/sec). */
const SEPARATION_FORCE = 60;

/**
 * Difficulty scaling — tune these to adjust combat feel.
 * Wild riftlings use their template stats multiplied by these factors.
 */
const WILD_HP_MULT = 0.95;
const WILD_ATK_MULT = 0.3;
const WILD_SPEED_MULT = 0.7;
const ELITE_HP_MULT = 0.70;
const ELITE_ATK_MULT = 0.75;

const BOSS_HP_MULT = 1.1;
const BOSS_ATK_MULT = 0.55;

/** Multiplier to convert move.cooldown value to milliseconds. */
const MOVE_CD_SCALE = 200;

/** Speed allies walk to formation positions during setup phase. */
const SETUP_WALK_SPEED = 100;
/** Distance threshold (px) to consider an ally "in position". */
const SETUP_ARRIVE_DIST = 6;
/** Max time (ms) for the setup phase before forcing combat start. */
const SETUP_TIMEOUT_MS = 5000;
/** Click radius (px) for grabbing an ally during setup drag-and-drop. */
const DRAG_GRAB_RADIUS = 20;
/** Drop distance under which a drop counts as swapping with another ally slot. */
const DRAG_SWAP_RADIUS = 18;

/** Build a MoveSlot from a Move definition. Shared between allies and elite enemies. */
function buildMoveSlot(m: Move): MoveSlot {
  return {
    name: m.name,
    power: m.power,
    cooldownMs: m.cooldown * MOVE_CD_SCALE,
    lastUsedTime: -Infinity,
    isSignature: m.isSignature,
    kind: m.kind,
    radius: m.radius,
    duration: m.duration,
    hits: m.hits,
    drainRatio: m.drainRatio,
    appliesIgnite: m.appliesIgnite,
    bonusPerIgnite: m.bonusPerIgnite,
    repositions: m.repositions,
    selfTarget: m.selfTarget,
    thornsAmount: m.thornsAmount,
    appliesBlind: m.appliesBlind,
    blindDuration: m.blindDuration,
    refracts: m.refracts,
    selfBuffStat: m.selfBuffStat,
    selfBuffAmount: m.selfBuffAmount,
    selfBuffDuration: m.selfBuffDuration,
    appliesStatDebuff: m.appliesStatDebuff,
    debuffAmount: m.debuffAmount,
    debuffDuration: m.debuffDuration,
    dashThrough: m.dashThrough,
    pullsTarget: m.pullsTarget,
    selfHealFallback: m.selfHealFallback,
    appliesBriar: m.appliesBriar,
    briarDuration: m.briarDuration,
    rootTarget: m.rootTarget,
    stunsRadius: m.stunsRadius,
    stunDuration: m.stunDuration,
    grantsKnockbackImmunity: m.grantsKnockbackImmunity,
    defenseScaledBonus: m.defenseScaledBonus,
    grantsDamageReduction: m.grantsDamageReduction,
    damageReductionDuration: m.damageReductionDuration,
    appliesHuntersMark: m.appliesHuntersMark,
    markBonus: m.markBonus,
    markDuration: m.markDuration,
    executeBonusPct: m.executeBonusPct,
    shadowStep: m.shadowStep,
    appliesSlowOnLand: m.appliesSlowOnLand,
    phasesBeforeStrike: m.phasesBeforeStrike,
    appliesSlowToAllHit: m.appliesSlowToAllHit,
    attackAnim: m.attackAnim,
    attackAnimDelay: m.attackAnimDelay,
    attackOriginOffsetY: m.attackOriginOffsetY,
  };
}

export interface StatusEffect {
  id: string;
  stat: 'defense' | 'attack' | 'speed' | 'evasion';
  amount: number;
  expiresAt: number;
  /** Damage reflected to the attacker each time this unit is struck (Lava Shield thorns). */
  thornsAmount?: number;
}

export interface MoveSlot {
  name: string;
  power: number;
  cooldownMs: number;
  lastUsedTime: number;
  isSignature: boolean;
  kind: MoveKind;
  radius?: number;
  duration?: number;
  hits?: number;
  drainRatio?: number;
  appliesIgnite?: number;
  bonusPerIgnite?: number;
  repositions?: boolean;
  selfTarget?: boolean;
  thornsAmount?: number;
  appliesBlind?: number;
  blindDuration?: number;
  refracts?: boolean;
  selfBuffStat?: 'defense' | 'attack' | 'speed' | 'evasion';
  selfBuffAmount?: number;
  selfBuffDuration?: number;
  appliesStatDebuff?: 'defense' | 'attack' | 'speed' | 'evasion';
  debuffAmount?: number;
  debuffDuration?: number;
  dashThrough?: boolean;
  pullsTarget?: boolean;
  selfHealFallback?: boolean;
  appliesBriar?: number;
  briarDuration?: number;
  rootTarget?: boolean;
  stunsRadius?: boolean;
  stunDuration?: number;
  grantsKnockbackImmunity?: boolean;
  defenseScaledBonus?: number;
  grantsDamageReduction?: number;
  damageReductionDuration?: number;
  appliesHuntersMark?: boolean;
  markBonus?: number;
  markDuration?: number;
  executeBonusPct?: number;
  shadowStep?: boolean;
  appliesSlowOnLand?: boolean;
  phasesBeforeStrike?: boolean;
  appliesSlowToAllHit?: boolean;
  /** Animation key slug to play on the attacker when this move fires (e.g. 'strike', 'leap'). */
  attackAnim?: string;
  /** Ms to wait after the attack animation starts before spawning the projectile/effect. */
  attackAnimDelay?: number;
  /** Pixel offset applied to the projectile/beam spawn Y position (negative = up). */
  attackOriginOffsetY?: number;
}

export interface CombatUnit {
  sprite: Phaser.Physics.Arcade.Sprite;
  hpBar: Phaser.GameObjects.Graphics;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  attackCooldown: number;
  lastAttackTime: number;
  texturePrefix: string;
  riftlingKey: string;
  scale: number;
  alive: boolean;
  /** Equipped move slots with per-move cooldown tracking (allies only). */
  moveSlots?: MoveSlot[];
  /** Index into moveSlots for the move last used (-1 = none yet). */
  lastMoveIndex: number;
  /** Name of the riftling (for HUD display). */
  displayName: string;
  /** Element type (for HUD display). */
  elementType: string;
  /** Engagement distance in pixels. */
  attackRange: number;
  /** Critical hit chance (0–100). */
  critRate: number;
  /** Evasion chance (0–100). */
  evasion: number;
  /** Active status effects (buffs/debuffs). */
  statusEffects: StatusEffect[];
  /** Ignite stacks — ticks for stacks damage every 500 ms, decays 1 stack per tick. */
  igniteStacks: number;
  /** Timestamp when the next ignite damage tick fires. */
  nextIgniteTick: number;
  /** Blind miss chance (0–100) — attacker rolls this before hitting; non-zero = blinded. */
  blindMissChance: number;
  /** Timestamp when the blind expires. */
  blindExpiresAt: number;
  /** Briar debuff — damage taken each time this unit attacks. */
  briarDamage: number;
  /** Timestamp when the briar debuff expires. */
  briarExpiresAt: number;
  /** Timestamp until which this unit cannot be knocked back (Stone Bash). */
  knockbackImmuneUntil: number;
  /** Timestamp until which this unit is phased — immune to damage and invisible to new attacks. */
  phaseUntil: number;
  /** Fraction of incoming damage blocked while active (Iron Curl). */
  damageReductionAmount: number;
  /** Timestamp when the damage reduction expires. */
  damageReductionUntil: number;
  /** Damage amplification applied to all hits on this unit while marked. */
  markedDamageBonus: number;
  /** Timestamp when Hunter's Mark expires. */
  markedUntil: number;
  /** Forced target from taunt — overrides normal targeting. */
  forcedTarget?: CombatUnit;
  /** Timestamp when forced target expires. */
  forcedTargetExpiry?: number;
  /** Class/role — drives passive damage, healing, and AI bias hooks. */
  role?: Role;
  /** Current combat stance — drives player-commanded AI behavior. Allies only. */
  stance?: Stance;
  /** Back-ref to the party data so stance changes persist across rooms. Allies only. */
  sourceData?: PartyRiftling;
  /** Anchor position for Hold stance — set when Hold is assigned. Allies only. */
  holdAnchorX?: number;
  holdAnchorY?: number;
}

export interface DefeatedRiftling {
  riftlingKey: string;
  texturePrefix: string;
  name: string;
}

export interface CompanionEntry {
  data: PartyRiftling;
  sprite: Phaser.Physics.Arcade.Sprite;
}

export class CombatManager {
  private scene: Phaser.Scene;
  private enemies: CombatUnit[] = [];
  private allies: CombatUnit[] = [];
  private walls: Phaser.Physics.Arcade.StaticGroup;
  private active = false;
  private onRoomCleared?: (defeated: DefeatedRiftling[]) => void;
  private onPartyWiped?: () => void;
  private defeated: DefeatedRiftling[] = [];
  private _selectedAllyIndex = 0;
  private _xpEarned = 0;
  private regenTimer?: Phaser.Time.TimerEvent;
  private roleRegenTimer?: Phaser.Time.TimerEvent;
  private supportAuraTimer?: Phaser.Time.TimerEvent;

  /** Pre-combat positioning phase state. */
  private setupPhase = false;
  private setupStartTime = 0;
  private formationTargets: { x: number; y: number }[] = [];
  private enemyFormationTargets: { x: number; y: number }[] = [];

  private entrySide: 'north' | 'south' | 'east' | 'west' = 'south';
  /** Entry-local basis for converting between world pixels and formation offsets. */
  private entryBasis: {
    anchorX: number;
    anchorY: number;
    rightX: number; rightY: number;
    forwardX: number; forwardY: number;
  } | null = null;
  /** Current room pixel size — cached so drag code can clamp to bounds. */
  private roomPixelW = 0;
  private roomPixelH = 0;
  /** Callback fired when setup phase ends, reporting the final ally offsets. */
  private onFormationSaved?: (offsets: FormationOffset[]) => void;

  /** Drag-and-drop state (setup phase only). */
  private draggingIndex: number | null = null;
  private dragGhost?: Phaser.GameObjects.Graphics;

  /** Prep-phase banner — destroyed in beginCombat. */
  private setupBanner?: Phaser.GameObjects.Text;

  /** When true, the setup phase pauses with a tutorial overlay until clicked. */
  private setupTutorialPending = false;
  private setupTutorialOverlay?: Phaser.GameObjects.Container;

  // --- Player command state ---

  /** Focus target — all allies prioritize this enemy. */
  private _focusTarget: CombatUnit | null = null;
  private focusRing?: Phaser.GameObjects.Graphics;

  /** Distance allies try to stay within their Hold anchor before re-anchoring. */
  private static readonly HOLD_LEASH = 64;
  /** Distance allies try to stay within the trainer while Withdrawn. */
  private static readonly WITHDRAW_LEASH = 28;
  /** Soft distance — beyond this, Grouped allies return toward the centroid. */
  private static readonly GROUP_RETURN = 36;
  /** Hard distance — Grouped allies will not chase targets past this from the centroid. */
  private static readonly GROUP_MAX_DRIFT = 56;

  // --- Navigation ---
  private nav: SimpleNav | null = null;
  /** Last facing direction per unit — needed to set correct idle texture on stop. */
  private unitLastDir = new Map<CombatUnit, string>();
  /** Per-unit waypoint lists for pathfinding. */
  private unitWaypoints = new Map<CombatUnit, NavPoint[]>();
  /** The goal pos when the path was last calculated (for stale-check). */
  private unitNavGoal = new Map<CombatUnit, NavPoint>();
  /** Last sampled position for stuck-detection. */
  private unitLastPos = new Map<CombatUnit, NavPoint>();
  private unitLastPosTime = new Map<CombatUnit, number>();

  // --- Boss encounter state ---
  private bossUnit: CombatUnit | null = null;
  private bossPhase = 1;
  private cachedEnemyLevel = 1;

  constructor(scene: Phaser.Scene, walls: Phaser.Physics.Arcade.StaticGroup) {
    this.scene = scene;
    this.walls = walls;
  }

  /**
   * Start a combat encounter with all active party members.
   */
  startEncounter(
    spawns: { x: number; y: number }[],
    companions: CompanionEntry[],
    onCleared: (defeated: DefeatedRiftling[]) => void,
    difficulty = 1,
    roomPixelW = 480,
    roomPixelH = 320,
    entrySide: 'north' | 'south' | 'east' | 'west' = 'south',
    trinkets?: TrinketInventory,
    nav?: SimpleNav,
    eliteTeam?: EliteTeamMember[],
    eliteTrainerPos?: { x: number; y: number },
    /**
     * Per-team-member formation positions in pixel coordinates, parallel to
     * `eliteTeam`. When provided, these drive both the setup-phase destination
     * and (implicitly) the initial spawn positions clustered around the
     * trainer anchor. Required whenever `eliteTeam` is set.
     */
    eliteFormationPixels?: { x: number; y: number }[],
    /**
     * Species keys eligible for wild enemy rolls in this encounter. When
     * provided, wild spawns draw only from this pool (used to enforce branch
     * themes like "water branch only spawns water riftlings"). Falls back to
     * AVAILABLE_RIFTLINGS when undefined or empty.
     */
    wildSpeciesPool?: string[],
    /**
     * Saved per-ally formation offsets from a previous fight. Parallel to
     * `companions`. Slots may be undefined (no saved position yet). Invalid
     * slots — wall, void, out-of-bounds, or overlapping an enemy spawn — fall
     * back to the auto-computed formation for that ally only.
     */
    savedFormation?: (FormationOffset | undefined)[],
    /**
     * Fired when the setup phase ends with the final ally offsets in
     * entry-local space, so the caller can persist them for the next fight.
     */
    onFormationSaved?: (offsets: FormationOffset[]) => void,
    /**
     * Fired when every ally in this encounter is KO'd. The scene is expected
     * to handle the run-ending game-over flow (restart, recap, etc.).
     */
    onPartyWiped?: () => void,
    showSetupTutorial = false,
  ): void {
    const pool = (wildSpeciesPool && wildSpeciesPool.length > 0) ? wildSpeciesPool : AVAILABLE_RIFTLINGS;
    this.roomPixelW = roomPixelW;
    this.roomPixelH = roomPixelH;
    this.entrySide = entrySide;
    this.entryBasis = this.computeEntryBasis(entrySide, roomPixelW, roomPixelH);
    this.onFormationSaved = onFormationSaved;
    this.draggingIndex = null;
    this.dragGhost?.destroy();
    this.dragGhost = undefined;
    this.active = true;
    this.onRoomCleared = onCleared;
    this.onPartyWiped = onPartyWiped;
    this.enemies = [];
    this.allies = [];
    this.defeated = [];
    this._selectedAllyIndex = 0;
    this._xpEarned = 0;
    this.nav = nav ?? null;
    this.unitWaypoints.clear();
    this.unitNavGoal.clear();
    this.unitLastPos.clear();
    this.unitLastPosTime.clear();
    this.unitLastDir.clear();

    // Enter setup phase — allies walk to formation, enemies idle
    this.setupPhase = true;
    this.setupStartTime = this.scene.time.now;

    // Register all companions as combat allies
    for (const c of companions) {
      const moveSlots: MoveSlot[] = c.data.equipped
        .map((idx) => c.data.moves[idx])
        .filter(Boolean)
        .map(buildMoveSlot);

      this.allies.push({
        sprite: c.sprite,
        hpBar: this.scene.add.graphics().setDepth(200),
        hp: c.data.hp,
        maxHp: c.data.maxHp,
        attack: c.data.attack,
        defense: c.data.defense,
        speed: c.data.speed,
        attackCooldown: c.data.attackSpeed,
        lastAttackTime: 0,
        texturePrefix: c.data.texturePrefix,
        riftlingKey: c.data.texturePrefix,
        scale: c.sprite.scale,
        alive: true,
        moveSlots,
        lastMoveIndex: -1,
        displayName: c.data.name,
        elementType: c.data.elementType,
        attackRange: c.data.attackRange,
        critRate: c.data.critRate,
        evasion: c.data.evasion,
        statusEffects: [],
        igniteStacks: 0,
        nextIgniteTick: 0,
        blindMissChance: 0,
        blindExpiresAt: 0,
        briarDamage: 0,
        briarExpiresAt: 0,
        knockbackImmuneUntil: 0,
        phaseUntil: 0,
        damageReductionAmount: 0,
        damageReductionUntil: 0,
        markedDamageBonus: 0,
        markedUntil: 0,
        role: c.data.role,
        stance: c.data.stance ?? 'push',
        sourceData: c.data,
      });
    }

    // Apply type synergy buffs to matching allies
    const synergies = getActiveSynergies(companions.map((c) => c.data));
    for (const { synergy } of synergies) {
      for (const ally of this.allies) {
        if (ally.elementType !== synergy.type) continue;
        if (synergy.buffs.attack) ally.attack += synergy.buffs.attack;
        if (synergy.buffs.defense) ally.defense += synergy.buffs.defense;
        if (synergy.buffs.critRate) ally.critRate += synergy.buffs.critRate;
        if (synergy.buffs.evasion) ally.evasion += synergy.buffs.evasion;
        if (synergy.buffs.hp) {
          ally.maxHp += synergy.buffs.hp;
          ally.hp += synergy.buffs.hp;
        }
      }

      // Nature regen: heal matching allies 2 HP/s during combat
      if (synergy.special === 'regen') {
        this.regenTimer = this.scene.time.addEvent({
          delay: 1000,
          loop: true,
          callback: () => {
            if (!this.active) return;
            for (const ally of this.allies) {
              if (ally.alive && ally.elementType === 'nature') {
                ally.hp = Math.min(ally.maxHp, ally.hp + 2);
              }
            }
          },
        });
      }
    }

    // Apply role (class) synergy buffs to matching allies
    const roleSynergies = getActiveRoleSynergies(companions.map((c) => c.data));
    for (const { synergy } of roleSynergies) {
      for (const ally of this.allies) {
        if (ally.role !== synergy.role) continue;
        if (synergy.buffs.attack) ally.attack += synergy.buffs.attack;
        if (synergy.buffs.defense) ally.defense += synergy.buffs.defense;
        if (synergy.buffs.critRate) ally.critRate += synergy.buffs.critRate;
        if (synergy.buffs.evasion) ally.evasion += synergy.buffs.evasion;
        if (synergy.buffs.speed) ally.speed += synergy.buffs.speed;
        if (synergy.buffs.hp) {
          ally.maxHp += synergy.buffs.hp;
          ally.hp += synergy.buffs.hp;
        }
        if (synergy.attackSpeedMult) {
          ally.attackCooldown = Math.max(400, Math.round(ally.attackCooldown * synergy.attackSpeedMult));
        }
      }

      // Support regen: heal matching allies 1 HP/s during combat
      if (synergy.special === 'regen') {
        this.roleRegenTimer = this.scene.time.addEvent({
          delay: 1000,
          loop: true,
          callback: () => {
            if (!this.active) return;
            for (const ally of this.allies) {
              if (ally.alive && ally.role === synergy.role) {
                ally.hp = Math.min(ally.maxHp, ally.hp + 1);
              }
            }
          },
        });
      }
    }

    // Apply equipped trinket stat buffs to all allies.
    // this.allies was built 1:1 from `companions` above, so index i maps to companions[i].
    if (trinkets) {
      const tBuffs = getEquippedBuffs(trinkets);
      for (let i = 0; i < this.allies.length; i++) {
        const ally = this.allies[i];
        const roleBuffs = getRoleBuffs(trinkets, companions[i].data.role);
        const merged = {
          attack: (tBuffs.attack ?? 0) + (roleBuffs.attack ?? 0),
          defense: (tBuffs.defense ?? 0) + (roleBuffs.defense ?? 0),
          speed: (tBuffs.speed ?? 0) + (roleBuffs.speed ?? 0),
          critRate: (tBuffs.critRate ?? 0) + (roleBuffs.critRate ?? 0),
          evasion: (tBuffs.evasion ?? 0) + (roleBuffs.evasion ?? 0),
          hp: (tBuffs.hp ?? 0) + (roleBuffs.hp ?? 0),
        };
        if (merged.attack) ally.attack += merged.attack;
        if (merged.defense) ally.defense += merged.defense;
        if (merged.speed) ally.speed += merged.speed;
        if (merged.critRate) ally.critRate += merged.critRate;
        if (merged.evasion) ally.evasion += merged.evasion;
        if (merged.hp) {
          ally.maxHp = Math.max(1, ally.maxHp + merged.hp);
          ally.hp = Math.max(1, Math.min(ally.maxHp, ally.hp + merged.hp));
        }
        if (ally.defense < 0) ally.defense = 0;
        if (ally.evasion < 0) ally.evasion = 0;
      }
    }

    // Role passive: Support regen aura — once a second, allies within
    // SUPPORT_REGEN_RADIUS of any alive Support tick HP. Same pattern as nature regen.
    if (this.allies.some((a) => a.role === 'support')) {
      this.supportAuraTimer = this.scene.time.addEvent({
        delay: 1000,
        loop: true,
        callback: () => {
          if (!this.active) return;
          for (const supporter of this.allies) {
            if (!supporter.alive || supporter.role !== 'support') continue;
            for (const ally of this.allies) {
              if (!ally.alive) continue;
              const dx = ally.sprite.x - supporter.sprite.x;
              const dy = ally.sprite.y - supporter.sprite.y;
              if (Math.sqrt(dx * dx + dy * dy) <= SUPPORT_REGEN_RADIUS) {
                ally.hp = Math.min(ally.maxHp, ally.hp + SUPPORT_REGEN_PER_TICK);
              }
            }
          }
        },
      });
    }

    // Compute ally auto-formation here; saved-formation restoration runs
    // after enemy positions are finalized so validation can check overlap.
    const autoFormation = this.computeAllyFormation(companions, roomPixelW, roomPixelH, entrySide);
    this.formationTargets = autoFormation;

    // Derive enemy level from difficulty so deeper rooms spawn higher-level riftlings,
    // floored at the party's average level (never fall behind) and capped at
    // partyLevel+2 so early terminals like the first elite don't overshoot the
    // player by 4+ levels.
    const avgPartyLevel =
      companions.length > 0
        ? companions.reduce((s, c) => s + c.data.level, 0) / companions.length
        : 1;
    const partyFloor = Math.floor(avgPartyLevel);
    const enemyLevel = Math.max(
      1,
      Math.min(MAX_LEVEL, partyFloor + 2, Math.max(Math.round(difficulty), partyFloor)),
    );

    // Elite encounters march from the trainer out to role-based formation
    // positions supplied by the caller. Wild encounters scatter directly.
    const isElite = !!(eliteTeam && eliteTeam.length > 0 && eliteFormationPixels);
    let formationPositions: { x: number; y: number }[];
    let initialPositions: { x: number; y: number }[];
    if (isElite) {
      formationPositions = eliteFormationPixels!;
      const anchor = eliteTrainerPos ?? formationPositions[0];
      initialPositions = formationPositions.map((_, i) => {
        const angle = (i / Math.max(1, formationPositions.length)) * Math.PI * 2;
        return {
          x: anchor.x + Math.cos(angle) * 18,
          y: anchor.y + Math.sin(angle) * 18,
        };
      });
    } else {
      const scatterPositions = this.computeEnemyScatter(spawns.length, roomPixelW, roomPixelH, entrySide);
      formationPositions = scatterPositions;
      initialPositions = scatterPositions;
    }

    const unitCount = isElite ? eliteTeam!.length : spawns.length;
    for (let si = 0; si < unitCount; si++) {
      const pos = initialPositions[si];
      const teamMember = isElite ? eliteTeam![si] : undefined;
      const riftlingKey = teamMember
        ? teamMember.riftlingKey
        : Phaser.Utils.Array.GetRandom(pool);

      // Build stats from level-1 base (randomized per species ranges) grown to enemyLevel
      // via the same level-up logic player riftlings use — no separate scaling formula.
      const memberLevel = Math.max(1, Math.min(MAX_LEVEL, enemyLevel + (teamMember?.levelBonus ?? 0)));
      const riftling = createRiftlingAtLevel(riftlingKey, memberLevel);

      const sprite = this.scene.physics.add.sprite(pos.x, pos.y, `${riftling.texturePrefix}_south`);

      const enemyScale = 0.7 * speciesScale(riftling.texturePrefix);
      sprite.setScale(enemyScale);
      sprite.setDepth(10 + pos.y / 10);
      sprite.setCollideWorldBounds(true);
      sprite.body!.setSize(20, 20);
      this.scene.physics.add.collider(sprite, this.walls);

      // Boss gets its own scaling — beefy HP, toned-down damage so the fight lasts.
      // Elite members get a lighter nerf than wild enemies; wild enemies use the swarm nerfs.
      const isBoss = riftlingKey === 'rift_tyrant';
      const maxHp = isBoss ? Math.floor(riftling.maxHp * BOSS_HP_MULT) : isElite ? Math.floor(riftling.maxHp * ELITE_HP_MULT) : Math.floor(riftling.maxHp * WILD_HP_MULT);
      const atk = isBoss ? Math.floor(riftling.attack * BOSS_ATK_MULT) : isElite ? Math.floor(riftling.attack * ELITE_ATK_MULT) : Math.floor(riftling.attack * WILD_ATK_MULT);
      const def = isBoss ? Math.floor(riftling.defense * BOSS_ATK_MULT) : isElite ? Math.floor(riftling.defense * ELITE_ATK_MULT) : Math.floor(riftling.defense * WILD_ATK_MULT);
      const spd = isElite ? riftling.speed : Math.floor(riftling.speed * WILD_SPEED_MULT);
      const crit = isElite ? riftling.critRate : Math.floor(riftling.critRate * 0.5);
      const eva = isElite ? riftling.evasion : Math.floor(riftling.evasion * 0.3);

      // Elite members equip moves from the species' move pool (same pool the player uses).
      const eliteMoveSlots: MoveSlot[] | undefined = teamMember
        ? (() => {
            const picks = teamMember.equipped ?? [0, 1];
            return picks
              .map((idx) => riftling.moves[idx])
              .filter(Boolean)
              .map(buildMoveSlot);
          })()
        : undefined;

      const enemy: CombatUnit = {
        sprite,
        hpBar: this.scene.add.graphics().setDepth(200),
        hp: maxHp,
        maxHp,
        attack: atk,
        defense: def,
        speed: spd,
        attackCooldown: Math.max(400, riftling.attackSpeed),
        lastAttackTime: 0,
        texturePrefix: riftling.texturePrefix,
        riftlingKey,
        scale: enemyScale,
        alive: true,
        moveSlots: eliteMoveSlots,
        lastMoveIndex: -1,
        displayName: riftling.name,
        elementType: riftling.elementType,
        attackRange: riftling.attackRange,
        critRate: crit,
        evasion: eva,
        statusEffects: [],
        igniteStacks: 0,
        nextIgniteTick: 0,
        blindMissChance: 0,
        blindExpiresAt: 0,
        briarDamage: 0,
        briarExpiresAt: 0,
        knockbackImmuneUntil: 0,
        phaseUntil: 0,
        damageReductionAmount: 0,
        damageReductionUntil: 0,
        markedDamageBonus: 0,
        markedUntil: 0,
        role: riftling.role,
      };
      this.enemies.push(enemy);
    }

    // Tag boss unit if this is a boss encounter
    this.bossUnit = this.enemies.find(e => e.riftlingKey === 'rift_tyrant') ?? null;
    this.bossPhase = 1;
    this.cachedEnemyLevel = enemyLevel;

    this.enemyFormationTargets = formationPositions;

    // Apply saved ally formation now that enemy slots are known — per-slot
    // fallback to auto when the saved offset resolves to an invalid tile.
    if (savedFormation && this.entryBasis) {
      this.formationTargets = autoFormation.map((auto, i) => {
        const saved = savedFormation[i];
        if (!saved) return auto;
        const world = this.offsetToWorld(saved);
        return this.isFormationSlotValid(world.x, world.y) ? world : auto;
      });
    }

    // Teleport both sides to their final formation so the player sees the
    // layout from frame 0 of the setup phase and can drag allies into place.
    for (let i = 0; i < this.allies.length; i++) {
      const t = this.formationTargets[i];
      if (t) this.allies[i].sprite.setPosition(t.x, t.y);
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const t = this.enemyFormationTargets[i];
      if (t) this.enemies[i].sprite.setPosition(t.x, t.y);
    }

    this.faceUnitsForSetup();
    this.createSetupBanner();

    if (showSetupTutorial) {
      this.setupTutorialPending = true;
      this.showSetupTutorial();
    }
  }

  /** Point each unit at the nearest opponent so the prep phase reads correctly. */
  private faceUnitsForSetup(): void {
    const oppositeOfEntry: Record<'north' | 'south' | 'east' | 'west', string> = {
      south: 'north',
      north: 'south',
      east: 'west',
      west: 'east',
    };
    const allyDir = oppositeOfEntry[this.entrySide];
    for (const ally of this.allies) {
      if (!ally.alive) continue;
      this.unitLastDir.set(ally, allyDir);
      stopWalkAnim(ally.sprite, ally.texturePrefix, allyDir);
    }
    const face = (unit: CombatUnit, pool: CombatUnit[]) => {
      const target = this.nearestLiving(unit, pool);
      if (!target) return;
      const dir = this.getDirection(
        target.sprite.x - unit.sprite.x,
        target.sprite.y - unit.sprite.y,
      );
      this.unitLastDir.set(unit, dir);
      stopWalkAnim(unit.sprite, unit.texturePrefix, dir);
    };
    for (const enemy of this.enemies) if (enemy.alive) face(enemy, this.allies);
  }

  private nearestLiving(from: CombatUnit, pool: CombatUnit[]): CombatUnit | null {
    let best: CombatUnit | null = null;
    let bestD = Infinity;
    for (const u of pool) {
      if (!u.alive) continue;
      const dx = u.sprite.x - from.sprite.x;
      const dy = u.sprite.y - from.sprite.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  /** Prep-phase HUD: pulsing banner. */
  private createSetupBanner(): void {
    this.destroySetupVisuals();

    const cam = this.scene.cameras.main;
    this.setupBanner = this.scene.add
      .text(cam.width / 2, 18, 'PREP PHASE — drag to position', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffe680',
        backgroundColor: '#000000aa',
        padding: { x: 8, y: 4 },
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0)
      .setDepth(600)
      .setScrollFactor(0);

    this.scene.tweens.add({
      targets: this.setupBanner,
      alpha: { from: 1, to: 0.65 },
      duration: 700,
      yoyo: true,
      repeat: -1,
    });
  }

  private destroySetupVisuals(): void {
    if (this.setupBanner) {
      this.scene.tweens.killTweensOf(this.setupBanner);
      this.setupBanner.destroy();
      this.setupBanner = undefined;
    }
    this.destroySetupTutorial();
  }

  private showSetupTutorial(): void {
    const cam = this.scene.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    const container = this.scene.add.container(0, 0).setDepth(650).setScrollFactor(0);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x000000, 0.6);
    bg.fillRoundedRect(cx - 110, cy - 30, 220, 60, 6);
    container.add(bg);

    const text = this.scene.add
      .text(cx, cy - 8, 'Drag riftlings to reposition!', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffe680',
        stroke: '#000000',
        strokeThickness: 2,
        align: 'center',
      })
      .setOrigin(0.5, 0.5);
    container.add(text);

    const hint = this.scene.add
      .text(cx, cy + 12, 'click to continue', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5, 0.5);
    container.add(hint);

    this.scene.tweens.add({
      targets: hint,
      alpha: { from: 1, to: 0.4 },
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    this.setupTutorialOverlay = container;

    const dismiss = () => {
      this.scene.input.off('pointerdown', dismiss);
      this.destroySetupTutorial();
      this.setupStartTime = this.scene.time.now;
    };
    this.scene.input.on('pointerdown', dismiss);
  }

  private destroySetupTutorial(): void {
    this.setupTutorialPending = false;
    if (this.setupTutorialOverlay) {
      this.scene.tweens.killTweensOf(this.setupTutorialOverlay);
      this.setupTutorialOverlay.destroy(true);
      this.setupTutorialOverlay = undefined;
    }
  }

  // --- Entry-local space helpers ---

  /**
   * Build an entry-local basis: `anchor` on the midpoint of the entry wall,
   * `forward` pointing into the room, `right` along the entry wall. Storing
   * formation offsets in this space means a fight entered from a different
   * side rotates naturally instead of dumping allies into a wall.
   */
  private computeEntryBasis(
    entrySide: 'north' | 'south' | 'east' | 'west',
    roomW: number,
    roomH: number,
  ) {
    switch (entrySide) {
      case 'south': return { anchorX: roomW / 2, anchorY: roomH,    rightX:  1, rightY:  0, forwardX:  0, forwardY: -1 };
      case 'north': return { anchorX: roomW / 2, anchorY: 0,        rightX: -1, rightY:  0, forwardX:  0, forwardY:  1 };
      case 'west':  return { anchorX: 0,         anchorY: roomH / 2, rightX:  0, rightY:  1, forwardX:  1, forwardY:  0 };
      case 'east':  return { anchorX: roomW,     anchorY: roomH / 2, rightX:  0, rightY: -1, forwardX: -1, forwardY:  0 };
    }
  }

  private offsetToWorld(offset: FormationOffset): { x: number; y: number } {
    const b = this.entryBasis!;
    return {
      x: b.anchorX + offset.right * b.rightX + offset.forward * b.forwardX,
      y: b.anchorY + offset.right * b.rightY + offset.forward * b.forwardY,
    };
  }

  private worldToOffset(x: number, y: number): FormationOffset {
    const b = this.entryBasis!;
    const dx = x - b.anchorX;
    const dy = y - b.anchorY;
    return {
      right: dx * b.rightX + dy * b.rightY,
      forward: dx * b.forwardX + dy * b.forwardY,
    };
  }

  /**
   * A formation slot is valid when it is inside the room bounds, sits on a
   * walkable nav tile, lies on the player's half of the field (relative to
   * the entry side), and doesn't overlap any enemy's spawn position.
   */
  private isFormationSlotValid(x: number, y: number): boolean {
    const margin = 16;
    if (x < margin || y < margin || x > this.roomPixelW - margin || y > this.roomPixelH - margin) {
      return false;
    }
    if (!this.isOnPlayerSide(x, y)) return false;
    if (this.nav && !this.nav.isWalkableAt(x, y)) return false;
    for (const t of this.enemyFormationTargets) {
      const dx = t.x - x;
      const dy = t.y - y;
      if (dx * dx + dy * dy < 20 * 20) return false;
    }
    return true;
  }

  /**
   * True when (x,y) is on the player's half of the room — i.e. the forward
   * projection from the entry anchor is at most half the room's extent along
   * the forward axis. `forward` grows from 0 at the entry wall toward the
   * opposite wall, so the midline is at extent/2.
   */
  private isOnPlayerSide(x: number, y: number): boolean {
    if (!this.entryBasis) return true;
    const b = this.entryBasis;
    const forward = (x - b.anchorX) * b.forwardX + (y - b.anchorY) * b.forwardY;
    const extent = Math.abs(b.forwardX) * this.roomPixelW + Math.abs(b.forwardY) * this.roomPixelH;
    return forward <= extent / 2;
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Return HP values for all allies so the scene can sync back to party data. */
  getAllyHps(): number[] {
    return this.allies.map((a) => a.hp);
  }

  /** Total XP earned from enemy kills in this encounter. */
  get xpEarned(): number {
    return this._xpEarned;
  }

  /** True while allies are walking to formation before combat starts. */
  get isSetupPhase(): boolean {
    return this.setupPhase;
  }

  update(time: number, trainerSprite: Phaser.Physics.Arcade.Sprite): void {
    if (!this.active || this.allies.length === 0) return;

    // Y-axis depth sort — lower on screen renders in front
    for (const ally of this.allies) {
      if (ally.alive) ally.sprite.setDepth(10 + ally.sprite.y / 10);
    }
    for (const enemy of this.enemies) {
      if (enemy.alive) enemy.sprite.setDepth(10 + enemy.sprite.y / 10);
    }

    // --- Setup phase: allies walk to formation, enemies idle ---
    if (this.setupPhase) {
      this.updateSetupPhase(time);
      // Draw HP bars for both sides during setup (enemies visible but idle)
      for (const enemy of this.enemies) if (enemy.alive) this.drawHpBar(enemy, false);
      for (const ally of this.allies) if (ally.alive) this.drawHpBar(ally, true);
      return;
    }

    // Tick status effects (expire buffs/debuffs) and DoT effects
    this.tickStatusEffects(time);
    this.tickIgnite(time);
    this.tickBlind(time);
    this.tickBriarExpiry(time);
    this.tickHuntersMark(time);

    // Boss phase tracking
    if (this.bossUnit?.alive) {
      const hpPct = this.bossUnit.hp / this.bossUnit.maxHp;
      if (this.bossPhase === 1 && hpPct <= 0.7) {
        this.enterBossPhase(2);
      } else if (this.bossPhase === 2 && hpPct <= 0.35) {
        this.enterBossPhase(3);
      }
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      this.updateEnemyAI(enemy, time);
      this.drawHpBar(enemy, false);
    }

    for (const ally of this.allies) {
      if (ally.alive) {
        this.updateCompanionAI(ally, time, trainerSprite);
        this.drawHpBar(ally, true);
      }
    }

    // Draw command visuals
    this.drawFocusRing();

    this.checkCombatEnd();
  }

  /**
   * Steer `unit` toward (goalX, goalY) at `speed`, using nav pathfinding when
   * available. Returns the normalised direction vector that was applied so the
   * caller can update the sprite texture.
   */
  private moveUnitToward(
    unit: CombatUnit,
    goalX: number,
    goalY: number,
    speed: number,
    time: number,
  ): { nx: number; ny: number } {
    const dx = goalX - unit.sprite.x;
    const dy = goalY - unit.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return { nx: 0, ny: 0 };

    if (!this.nav) {
      // No nav — direct movement
      unit.sprite.setVelocity((dx / dist) * speed, (dy / dist) * speed);
      return { nx: dx / dist, ny: dy / dist };
    }

    // --- Stuck detection ---
    const lastPosTime = this.unitLastPosTime.get(unit) ?? 0;
    let isStuck = false;
    if (lastPosTime === 0) {
      this.unitLastPos.set(unit, { x: unit.sprite.x, y: unit.sprite.y });
      this.unitLastPosTime.set(unit, time);
    } else if (time - lastPosTime > STUCK_WINDOW_MS) {
      const lp = this.unitLastPos.get(unit)!;
      const ddx = unit.sprite.x - lp.x;
      const ddy = unit.sprite.y - lp.y;
      isStuck = (ddx * ddx + ddy * ddy) < STUCK_THRESHOLD_PX * STUCK_THRESHOLD_PX && dist > 16;
      this.unitLastPos.set(unit, { x: unit.sprite.x, y: unit.sprite.y });
      this.unitLastPosTime.set(unit, time);
    }

    // --- Path recalculation ---
    const waypoints = this.unitWaypoints.get(unit) ?? [];
    if (isStuck || SimpleNav.isPathStale(waypoints, this.unitNavGoal.get(unit) ?? null, goalX, goalY)) {
      const newPath = this.nav.findPath(unit.sprite.x, unit.sprite.y, goalX, goalY);
      this.unitWaypoints.set(unit, newPath);
      this.unitNavGoal.set(unit, { x: goalX, y: goalY });
    }

    // --- Advance past arrived waypoints ---
    const wps = this.unitWaypoints.get(unit)!;
    while (wps.length > 0) {
      const wp = wps[0];
      const wdx = wp.x - unit.sprite.x;
      const wdy = wp.y - unit.sprite.y;
      if (wdx * wdx + wdy * wdy <= NAV_ARRIVAL_RADIUS * NAV_ARRIVAL_RADIUS) {
        wps.shift();
      } else {
        break;
      }
    }

    // --- Steer toward next waypoint or direct goal ---
    const nextX = wps.length > 0 ? wps[0].x : goalX;
    const nextY = wps.length > 0 ? wps[0].y : goalY;
    const ndx = nextX - unit.sprite.x;
    const ndy = nextY - unit.sprite.y;
    const ndist = Math.sqrt(ndx * ndx + ndy * ndy);
    const nx = ndx / ndist;
    const ny = ndy / ndist;
    unit.sprite.setVelocity(nx * speed, ny * speed);
    return { nx, ny };
  }

  private updateEnemyAI(enemy: CombatUnit, time: number): void {
    // Respect taunt forced target
    let target: CombatUnit | null = null;
    if (enemy.forcedTarget && enemy.forcedTarget.alive &&
        enemy.forcedTargetExpiry !== undefined && time < enemy.forcedTargetExpiry) {
      target = enemy.forcedTarget;
    } else {
      enemy.forcedTarget = undefined;
      enemy.forcedTargetExpiry = undefined;
      // Vanguard soft taunt: if any vanguard ally is within VANGUARD_TAUNT_RADIUS,
      // pick the nearest vanguard. Otherwise fall back to nearest ally overall.
      let bestVanguardDist = VANGUARD_TAUNT_RADIUS;
      let bestVanguard: CombatUnit | null = null;
      let bestDist = Infinity;
      let bestAlly: CombatUnit | null = null;
      for (const ally of this.allies) {
        if (!ally.alive) continue;
        const adx = ally.sprite.x - enemy.sprite.x;
        const ady = ally.sprite.y - enemy.sprite.y;
        const d = Math.sqrt(adx * adx + ady * ady);
        if (d < bestDist) { bestDist = d; bestAlly = ally; }
        if (ally.role === 'vanguard' && d < bestVanguardDist) {
          bestVanguardDist = d;
          bestVanguard = ally;
        }
      }
      target = bestVanguard ?? bestAlly;
    }
    if (!target) return;

    const dx = target.sprite.x - enemy.sprite.x;
    const dy = target.sprite.y - enemy.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const sep = this.getSeparation(enemy, this.enemies);

    if (dist > enemy.attackRange) {
      const { nx, ny } = this.moveUnitToward(enemy, target.sprite.x, target.sprite.y, enemy.speed, time);
      // Blend separation into the nav velocity
      const body = enemy.sprite.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(body.velocity.x + sep.vx, body.velocity.y + sep.vy);
      const vx = nx + sep.vx;
      const vy = ny + sep.vy;
      const dir = this.getDirection(vx !== 0 ? vx : nx, vy !== 0 ? vy : ny);
      this.unitLastDir.set(enemy, dir);
      playWalkOrStatic(enemy.sprite, enemy.texturePrefix, dir, this.scene.anims);
    } else {
      // In attack range — face the target, stop walk anim, apply only separation drift
      const faceDir = this.getDirection(dx, dy);
      this.unitLastDir.set(enemy, faceDir);
      if (!isPlayingAttackAnim(enemy.sprite, enemy.texturePrefix)) {
        stopWalkAnim(enemy.sprite, enemy.texturePrefix, faceDir);
      }
      enemy.sprite.setVelocity(sep.vx, sep.vy);
      // Boss uses phased move cycling; other elites use the standard move pipeline;
      // wild enemies fall through to the basic auto-attack.
      if (enemy === this.bossUnit && enemy.moveSlots && enemy.moveSlots.length > 0) {
        this.tryBossMove(enemy, target, time);
      } else if (enemy.moveSlots && enemy.moveSlots.length > 0) {
        this.tryUseMove(enemy, target, time);
      } else if (time - enemy.lastAttackTime > enemy.attackCooldown) {
        enemy.lastAttackTime = time;
        this.dealDamage(enemy, target);
      }
    }
  }

  private updateCompanionAI(comp: CombatUnit, time: number, trainerSprite?: Phaser.Physics.Arcade.Sprite): void {
    const stance: Stance = comp.stance ?? 'push';

    // --- Withdraw stance: retreat to trainer, kite if enemies are close ---
    if (stance === 'withdraw' && trainerSprite) {
      const tdx = trainerSprite.x - comp.sprite.x;
      const tdy = trainerSprite.y - comp.sprite.y;
      const tDist = Math.sqrt(tdx * tdx + tdy * tdy);

      // Find nearest enemy for kite + opportunistic attacks
      let nearest: CombatUnit | null = null;
      let nearestDist = Infinity;
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const ex = enemy.sprite.x - comp.sprite.x;
        const ey = enemy.sprite.y - comp.sprite.y;
        const ed = Math.sqrt(ex * ex + ey * ey);
        if (ed < nearestDist) { nearestDist = ed; nearest = enemy; }
      }

      if (tDist > CombatManager.WITHDRAW_LEASH) {
        // Still retreating — walk toward trainer
        const { nx, ny } = this.moveUnitToward(comp, trainerSprite.x, trainerSprite.y, comp.speed, time);
        const dir = this.getDirection(nx, ny);
        this.unitLastDir.set(comp, dir);
        playWalkOrStatic(comp.sprite, comp.texturePrefix, dir, this.scene.anims);
        // Fire back at pursuers while retreating
        if (nearest && nearestDist <= comp.attackRange) {
          if (comp.moveSlots && comp.moveSlots.length > 0) this.tryUseMove(comp, nearest, time);
          else if (time - comp.lastAttackTime > comp.attackCooldown) {
            comp.lastAttackTime = time; this.dealDamage(comp, nearest);
          }
        }
        return;
      }
      // Regrouped near trainer — hold position, attack in range
      stopWalkAnim(comp.sprite, comp.texturePrefix, this.unitLastDir.get(comp) ?? 'south');
      comp.sprite.setVelocity(0, 0);
      if (nearest && nearestDist <= comp.attackRange * 1.2) {
        const faceDir = this.getDirection(nearest.sprite.x - comp.sprite.x, nearest.sprite.y - comp.sprite.y);
        this.unitLastDir.set(comp, faceDir);
        if (comp.moveSlots && comp.moveSlots.length > 0) this.tryUseMove(comp, nearest, time);
        else if (time - comp.lastAttackTime > comp.attackCooldown) {
          comp.lastAttackTime = time; this.dealDamage(comp, nearest);
        }
      }
      return;
    }

    // --- Group stance: engage like Push, but rubber-band back to the ally
    //     centroid so backline attackers stay in support range of the group. ---
    if (stance === 'group') {
      let cx = 0, cy = 0, n = 0;
      for (const a of this.allies) {
        if (!a.alive) continue;
        cx += a.sprite.x; cy += a.sprite.y; n++;
      }
      if (n === 0) {
        comp.sprite.setVelocity(0, 0);
        return;
      }
      cx /= n; cy /= n;
      const dCx = comp.sprite.x - cx;
      const dCy = comp.sprite.y - cy;
      const dCent = Math.sqrt(dCx * dCx + dCy * dCy);

      // Pick a target — focus first, otherwise the nearest enemy whose
      // position is within striking range of the group.
      let target: CombatUnit | null = null;
      let targetDist = Infinity;
      if (this._focusTarget?.alive) {
        const fx = this._focusTarget.sprite.x - comp.sprite.x;
        const fy = this._focusTarget.sprite.y - comp.sprite.y;
        target = this._focusTarget;
        targetDist = Math.sqrt(fx * fx + fy * fy);
      } else {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          // Only consider enemies close enough to the group that engaging
          // them wouldn't drag the unit past the hard drift limit.
          const ecx = e.sprite.x - cx;
          const ecy = e.sprite.y - cy;
          if (Math.sqrt(ecx * ecx + ecy * ecy) > CombatManager.GROUP_MAX_DRIFT + comp.attackRange) continue;
          const dx = e.sprite.x - comp.sprite.x;
          const dy = e.sprite.y - comp.sprite.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < targetDist) { targetDist = d; target = e; }
        }
      }

      // No target → return toward centroid, then idle there.
      if (!target) {
        if (dCent > CombatManager.GROUP_RETURN) {
          const { nx, ny } = this.moveUnitToward(comp, cx, cy, comp.speed, time);
          const dir = this.getDirection(nx, ny);
          this.unitLastDir.set(comp, dir);
          playWalkOrStatic(comp.sprite, comp.texturePrefix, dir, this.scene.anims);
        } else {
          stopWalkAnim(comp.sprite, comp.texturePrefix, this.unitLastDir.get(comp) ?? 'south');
          comp.sprite.setVelocity(0, 0);
        }
        return;
      }

      const sep = this.getSeparation(comp, this.allies);

      if (targetDist <= comp.attackRange) {
        // In range — face and attack, only drift via separation
        const faceDir = this.getDirection(target.sprite.x - comp.sprite.x, target.sprite.y - comp.sprite.y);
        this.unitLastDir.set(comp, faceDir);
        if (!isPlayingAttackAnim(comp.sprite, comp.texturePrefix)) {
          stopWalkAnim(comp.sprite, comp.texturePrefix, faceDir);
        }
        comp.sprite.setVelocity(sep.vx, sep.vy);
        if (comp.moveSlots && comp.moveSlots.length > 0) this.tryUseMove(comp, target, time);
        else if (time - comp.lastAttackTime > comp.attackCooldown) {
          comp.lastAttackTime = time; this.dealDamage(comp, target);
        }
        return;
      }

      // Out of range — chase toward target unless we're already at the drift
      // limit; in that case, fall back toward the group instead.
      if (dCent >= CombatManager.GROUP_MAX_DRIFT) {
        const { nx, ny } = this.moveUnitToward(comp, cx, cy, comp.speed, time);
        const dir = this.getDirection(nx + sep.vx, ny + sep.vy);
        this.unitLastDir.set(comp, dir);
        playWalkOrStatic(comp.sprite, comp.texturePrefix, dir, this.scene.anims);
      } else {
        const { nx, ny } = this.moveUnitToward(comp, target.sprite.x, target.sprite.y, comp.speed, time);
        const dir = this.getDirection(nx + sep.vx, ny + sep.vy);
        this.unitLastDir.set(comp, dir);
        playWalkOrStatic(comp.sprite, comp.texturePrefix, dir, this.scene.anims);
      }
      return;
    }

    // --- Hold stance: anchor + only engage enemies within leash of the anchor ---
    if (stance === 'hold') {
      if (comp.holdAnchorX === undefined) {
        comp.holdAnchorX = comp.sprite.x;
        comp.holdAnchorY = comp.sprite.y;
      }
      const ax = comp.holdAnchorX!;
      const ay = comp.holdAnchorY!;

      // Find nearest enemy whose position is within leash of the anchor
      let target: CombatUnit | null = null;
      let targetDist = Infinity;
      if (this._focusTarget?.alive) {
        const edx = this._focusTarget.sprite.x - ax;
        const edy = this._focusTarget.sprite.y - ay;
        if (Math.sqrt(edx * edx + edy * edy) <= CombatManager.HOLD_LEASH) {
          target = this._focusTarget;
          const tdx = this._focusTarget.sprite.x - comp.sprite.x;
          const tdy = this._focusTarget.sprite.y - comp.sprite.y;
          targetDist = Math.sqrt(tdx * tdx + tdy * tdy);
        }
      }
      if (!target) {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const adx = e.sprite.x - ax;
          const ady = e.sprite.y - ay;
          if (Math.sqrt(adx * adx + ady * ady) > CombatManager.HOLD_LEASH) continue;
          const dx = e.sprite.x - comp.sprite.x;
          const dy = e.sprite.y - comp.sprite.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < targetDist) { targetDist = d; target = e; }
        }
      }

      if (!target) {
        // No valid target — drift back toward anchor if wandered off, otherwise idle
        const adx = ax - comp.sprite.x;
        const ady = ay - comp.sprite.y;
        const adist = Math.sqrt(adx * adx + ady * ady);
        if (adist > 6) {
          const { nx, ny } = this.moveUnitToward(comp, ax, ay, comp.speed * 0.8, time);
          const dir = this.getDirection(nx, ny);
          this.unitLastDir.set(comp, dir);
          playWalkOrStatic(comp.sprite, comp.texturePrefix, dir, this.scene.anims);
        } else {
          stopWalkAnim(comp.sprite, comp.texturePrefix, this.unitLastDir.get(comp) ?? 'south');
          comp.sprite.setVelocity(0, 0);
        }
        return;
      }

      // Engage target — move into range but never past the anchor leash
      if (targetDist > comp.attackRange) {
        const { nx, ny } = this.moveUnitToward(comp, target.sprite.x, target.sprite.y, comp.speed, time);
        const dir = this.getDirection(nx, ny);
        this.unitLastDir.set(comp, dir);
        playWalkOrStatic(comp.sprite, comp.texturePrefix, dir, this.scene.anims);
      } else {
        const faceDir = this.getDirection(target.sprite.x - comp.sprite.x, target.sprite.y - comp.sprite.y);
        this.unitLastDir.set(comp, faceDir);
        if (!isPlayingAttackAnim(comp.sprite, comp.texturePrefix)) {
          stopWalkAnim(comp.sprite, comp.texturePrefix, faceDir);
        }
        comp.sprite.setVelocity(0, 0);
      }
      if (comp.moveSlots && comp.moveSlots.length > 0) this.tryUseMove(comp, target, time);
      else if (time - comp.lastAttackTime > comp.attackCooldown) {
        comp.lastAttackTime = time; this.dealDamage(comp, target);
      }
      return;
    }

    // --- Push stance (default): normal aggressive AI with focus target priority ---
    let target: CombatUnit | null = null;
    let targetDist = Infinity;

    // Prioritize focus target if alive
    if (this._focusTarget?.alive) {
      const fx = this._focusTarget.sprite.x - comp.sprite.x;
      const fy = this._focusTarget.sprite.y - comp.sprite.y;
      targetDist = Math.sqrt(fx * fx + fy * fy);
      target = this._focusTarget;
    } else if (comp.role === 'hunter') {
      // Hunter bias: within HUNTER_SCAN_RADIUS, prefer the highest-attackRange enemy.
      // If no high-range enemy is in scan radius, fall back to nearest.
      let bestRangeScore = HUNTER_RANGE_THRESHOLD - 1;
      let bestRanged: CombatUnit | null = null;
      let bestRangedDist = Infinity;
      let nearest: CombatUnit | null = null;
      let nearestDist = Infinity;
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const dx = enemy.sprite.x - comp.sprite.x;
        const dy = enemy.sprite.y - comp.sprite.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestDist) { nearestDist = dist; nearest = enemy; }
        if (dist <= HUNTER_SCAN_RADIUS && enemy.attackRange > bestRangeScore) {
          bestRangeScore = enemy.attackRange;
          bestRanged = enemy;
          bestRangedDist = dist;
        }
      }
      if (bestRanged) {
        target = bestRanged;
        targetDist = bestRangedDist;
      } else {
        target = nearest;
        targetDist = nearestDist;
      }
    } else {
      // Find nearest enemy
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const dx = enemy.sprite.x - comp.sprite.x;
        const dy = enemy.sprite.y - comp.sprite.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < targetDist) {
          targetDist = dist;
          target = enemy;
        }
      }
    }

    if (!target) {
      comp.sprite.setVelocity(0, 0);
      return;
    }

    const sep = this.getSeparation(comp, this.allies);

    // Role passive: Skirmisher "wounded animal" speed boost when below half HP
    const moveSpeed = comp.speed * getRoleSpeedMultiplier(comp.role, comp.hp / Math.max(1, comp.maxHp));

    // Role passive: Striker/Caster kite — ranged kiters back off a crowding
    // enemy, but only while their target is comfortably inside attack range.
    // Melee kiters (attackRange <= KITE_RADIUS) never retreat from their prey.
    let kiteFromX = 0, kiteFromY = 0, shouldKite = false;
    if (isKitingRole(comp.role) && comp.attackRange > KITE_RADIUS
        && targetDist < comp.attackRange * 0.9) {
      let crowdDist = KITE_RADIUS;
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const ex = enemy.sprite.x - comp.sprite.x;
        const ey = enemy.sprite.y - comp.sprite.y;
        const ed = Math.sqrt(ex * ex + ey * ey);
        if (ed < crowdDist) { crowdDist = ed; kiteFromX = ex; kiteFromY = ey; shouldKite = true; }
      }
    }

    if (targetDist > comp.attackRange) {
      const { nx, ny } = this.moveUnitToward(comp, target.sprite.x, target.sprite.y, moveSpeed, time);
      // Blend separation into the nav velocity
      const body = comp.sprite.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(body.velocity.x + sep.vx, body.velocity.y + sep.vy);
      const vx = nx + sep.vx;
      const vy = ny + sep.vy;
      const dir = this.getDirection(vx !== 0 ? vx : nx, vy !== 0 ? vy : ny);
      this.unitLastDir.set(comp, dir);
      playWalkOrStatic(comp.sprite, comp.texturePrefix, dir, this.scene.anims);
    } else if (shouldKite) {
      // Kiting backstep — walk directly away from the crowding enemy at reduced
      // speed. Abort if the backstep would push us into a wall/void so backliners
      // don't grind themselves into geometry.
      const len = Math.max(1, Math.sqrt(kiteFromX * kiteFromX + kiteFromY * kiteFromY));
      const nxBack = -(kiteFromX / len);
      const nyBack = -(kiteFromY / len);
      const KITE_LOOKAHEAD = 20;
      const probeX = comp.sprite.x + nxBack * KITE_LOOKAHEAD;
      const probeY = comp.sprite.y + nyBack * KITE_LOOKAHEAD;
      const canBackstep = !this.nav || this.nav.isWalkableAt(probeX, probeY);
      if (canBackstep) {
        const backX = nxBack * moveSpeed * KITE_BACKSTEP_MULT;
        const backY = nyBack * moveSpeed * KITE_BACKSTEP_MULT;
        comp.sprite.setVelocity(backX + sep.vx, backY + sep.vy);
        const dir = this.getDirection(backX, backY);
        this.unitLastDir.set(comp, dir);
        playWalkOrStatic(comp.sprite, comp.texturePrefix, dir, this.scene.anims);
      } else {
        // Cornered — hold position, face target, keep firing.
        const tdx = target.sprite.x - comp.sprite.x;
        const tdy = target.sprite.y - comp.sprite.y;
        const faceDir = this.getDirection(tdx, tdy);
        this.unitLastDir.set(comp, faceDir);
        if (!isPlayingAttackAnim(comp.sprite, comp.texturePrefix)) {
          stopWalkAnim(comp.sprite, comp.texturePrefix, faceDir);
        }
        comp.sprite.setVelocity(sep.vx, sep.vy);
      }
      // Still attack while kiting (or cornered)
      if (comp.moveSlots && comp.moveSlots.length > 0) {
        this.tryUseMove(comp, target, time);
      } else if (time - comp.lastAttackTime > comp.attackCooldown) {
        comp.lastAttackTime = time;
        this.dealDamage(comp, target);
      }
    } else {
      // In attack range — face the target, stop walk anim, apply only separation drift
      const tdx = target.sprite.x - comp.sprite.x;
      const tdy = target.sprite.y - comp.sprite.y;
      const faceDir = this.getDirection(tdx, tdy);
      this.unitLastDir.set(comp, faceDir);
      if (!isPlayingAttackAnim(comp.sprite, comp.texturePrefix)) {
        stopWalkAnim(comp.sprite, comp.texturePrefix, faceDir);
      }
      comp.sprite.setVelocity(sep.vx, sep.vy);
      // Use equipped moves if available, otherwise fall back to base attack
      if (comp.moveSlots && comp.moveSlots.length > 0) {
        this.tryUseMove(comp, target, time);
      } else if (time - comp.lastAttackTime > comp.attackCooldown) {
        comp.lastAttackTime = time;
        this.dealDamage(comp, target);
      }
    }
  }

  /** Pick the first equipped move off cooldown with a valid target and use it. */
  private tryUseMove(unit: CombatUnit, nearestEnemy: CombatUnit, time: number): void {
    const slots = unit.moveSlots!;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (time - slot.lastUsedTime < slot.cooldownMs) continue;

      // Resolve target based on move kind
      const target = this.pickMoveTarget(unit, slot, nearestEnemy, time);
      if (!target) continue; // No valid target for this move — try next slot

      slot.lastUsedTime = time;
      unit.lastMoveIndex = i;
      this.dealMoveDamage(unit, target, slot);
      return;
    }
    // All moves on cooldown or no valid targets — do nothing
  }

  /**
   * Pick the appropriate target for a move based on its kind.
   * Returns null if the move shouldn't be used right now (e.g., heal when nobody is hurt).
   */
  private pickMoveTarget(unit: CombatUnit, slot: MoveSlot, nearestEnemy: CombatUnit, _time: number): CombatUnit | null {
    if (slot.selfTarget) return unit;

    // Resolve "own team" and "opposing team" relative to the casting unit so
    // support moves work for either side (player allies OR elite enemies).
    const isUnitAlly = this.allies.includes(unit);
    const teammates = isUnitAlly ? this.allies : this.enemies;
    const opposingTeam = isUnitAlly ? this.enemies : this.allies;

    switch (slot.kind) {
      case 'heal': {
        // Find lowest-HP teammate below 60%
        let lowestAlly: CombatUnit | null = null;
        let lowestRatio = 0.6;
        for (const ally of teammates) {
          if (!ally.alive) continue;
          const ratio = ally.hp / ally.maxHp;
          if (ratio < lowestRatio) {
            lowestRatio = ratio;
            lowestAlly = ally;
          }
        }
        // Fallback: heal self if nobody else needs it (Sap Leech)
        if (!lowestAlly && slot.selfHealFallback) return unit;
        return lowestAlly;
      }
      case 'shield': {
        // Target self or lowest-HP teammate, skip if target already has shield
        let target: CombatUnit = unit;
        let lowestHp = unit.hp;
        for (const ally of teammates) {
          if (!ally.alive) continue;
          if (ally.hp < lowestHp && !ally.statusEffects.some((e) => e.id === 'shield')) {
            lowestHp = ally.hp;
            target = ally;
          }
        }
        // Skip if target already has a shield
        if (target.statusEffects.some((e) => e.id === 'shield')) return null;
        return target;
      }
      case 'rally_buff': {
        // Check if any nearby teammate lacks the buff
        let hasUnbuffedAlly = false;
        for (const ally of teammates) {
          if (!ally.alive) continue;
          const dx = ally.sprite.x - unit.sprite.x;
          const dy = ally.sprite.y - unit.sprite.y;
          if (Math.sqrt(dx * dx + dy * dy) > 60) continue;
          if (!ally.statusEffects.some((e) => e.id === 'rally_atk')) {
            hasUnbuffedAlly = true;
            break;
          }
        }
        return hasUnbuffedAlly ? unit : null; // target is self (rally buffs from caster)
      }
      case 'leap': {
        // Hunter targeting: pick the opposing unit with the highest attackRange
        // above the backline threshold. Stable proxy for "ranged/backline unit".
        const BACKLINE_RANGE_THRESHOLD = 60;
        let leapTarget: CombatUnit | null = null;
        let bestRange = BACKLINE_RANGE_THRESHOLD;
        for (const e of opposingTeam) {
          if (!e.alive) continue;
          if (e.attackRange > bestRange) { bestRange = e.attackRange; leapTarget = e; }
        }
        return leapTarget;
      }
      case 'spin': {
        // Fire when at least one opposing unit is within the spin radius
        const spinRadius = slot.radius ?? 50;
        for (const e of opposingTeam) {
          if (!e.alive) continue;
          if (Phaser.Math.Distance.Between(unit.sprite.x, unit.sprite.y, e.sprite.x, e.sprite.y) <= spinRadius) {
            return unit; // target self — executeSpin handles its own geometry
          }
        }
        return null;
      }
      case 'taunt': {
        // Check if 2+ opposing units are nearby without forced target on this unit
        let nearbyCount = 0;
        for (const enemy of opposingTeam) {
          if (!enemy.alive) continue;
          const dx = enemy.sprite.x - unit.sprite.x;
          const dy = enemy.sprite.y - unit.sprite.y;
          if (Math.sqrt(dx * dx + dy * dy) <= 50 && enemy.forcedTarget !== unit) {
            nearbyCount++;
          }
        }
        return nearbyCount >= 2 ? unit : null; // target is self (taunt radiates from caster)
      }
      default:
        // All damage kinds target nearest enemy
        return nearestEnemy;
    }
  }

  private dealDamage(attacker: CombatUnit, defender: CombatUnit): void {
    const variance = Math.floor(Math.random() * 4) - 2;
    const damage = Math.max(1, Math.floor(attacker.attack * 1.5) + variance);
    const isAllyAttacker = this.allies.includes(attacker);
    const label = `-${damage}`;

    const adx = defender.sprite.x - attacker.sprite.x;
    const ady = defender.sprite.y - attacker.sprite.y;
    const aDist = Math.sqrt(adx * adx + ady * ady);

    // Ranged attacks: fire a projectile, apply damage on arrival
    if (aDist > 40) {
      const projColor = isAllyAttacker ? (TYPE_COLORS[attacker.elementType] ?? 0xffcc44) : 0xff4444;
      const proj = this.scene.add.circle(attacker.sprite.x, attacker.sprite.y, 3, projColor).setDepth(250);
      this.scene.tweens.add({
        targets: proj,
        x: defender.sprite.x,
        y: defender.sprite.y,
        duration: Math.min(200, aDist * 2),
        onComplete: () => {
          proj.destroy();
          this.applyHit(attacker, defender, damage, isAllyAttacker, label);
        },
      });
      return;
    }

    // Melee range — apply immediately
    this.applyHit(attacker, defender, damage, isAllyAttacker, label);
  }

  private killUnit(unit: CombatUnit): void {
    unit.alive = false;
    unit.sprite.setVelocity(0, 0);

    // Revert all active status effects before removing unit
    this.clearStatusEffects(unit);

    // Clear forced targets pointing at this unit
    for (const enemy of this.enemies) {
      if (enemy.forcedTarget === unit) {
        enemy.forcedTarget = undefined;
        enemy.forcedTargetExpiry = undefined;
      }
    }

    // Track defeated enemy for recruiting + XP
    const isEnemy = this.enemies.includes(unit);
    if (isEnemy) {
      this.defeated.push({
        riftlingKey: unit.riftlingKey,
        texturePrefix: unit.texturePrefix,
        name: unit.displayName,
      });
      // XP scales with enemy max HP (tougher enemies = more XP)
      this._xpEarned += BASE_KILL_XP + Math.floor(unit.maxHp / 10);
    }

    this.scene.tweens.add({
      targets: unit.sprite,
      alpha: 0,
      scale: 0,
      duration: 400,
      onComplete: () => {
        unit.sprite.destroy();
        unit.hpBar.destroy();
      },
    });
  }

  private checkCombatEnd(): void {
    // Boss kill: wipe remaining minions and end immediately
    if (this.bossUnit && !this.bossUnit.alive) {
      for (const e of this.enemies) {
        if (e.alive && e !== this.bossUnit) {
          this.killUnit(e);
        }
      }
      this.active = false;
      this.cleanupCommandState();
      this.bossUnit = null;
      for (const ally of this.allies) ally.hpBar.clear();
      this.onRoomCleared?.(this.defeated);
      return;
    }

    // Resolve wipe before room-clear so a simultaneous last-ally / last-enemy
    // death ends the run rather than marking the room cleared. `hp <= 0` is
    // a defensive fallback in case any damage path forgot to flip `alive`.
    const aliveAllies = this.allies.filter((a) => a.alive && a.hp > 0);
    if (aliveAllies.length === 0) {
      this.active = false;
      this.cleanupCommandState();
      for (const ally of this.allies) ally.hpBar.clear();
      this.onPartyWiped?.();
      return;
    }

    const aliveEnemies = this.enemies.filter((e) => e.alive);
    if (aliveEnemies.length === 0) {
      this.active = false;
      this.cleanupCommandState();
      for (const ally of this.allies) ally.hpBar.clear();
      this.onRoomCleared?.(this.defeated);
    }
  }

  private cleanupCommandState(): void {
    this._focusTarget = null;
    this.focusRing?.destroy();
    this.focusRing = undefined;
  }

  // --- Boss Phase System ---

  private enterBossPhase(phase: number): void {
    this.bossPhase = phase;
    const boss = this.bossUnit!;
    if (phase === 2) {
      boss.speed = Math.floor(boss.speed * 1.15);
      boss.attackCooldown = Math.floor(boss.attackCooldown * 0.85);
      boss.sprite.setTint(0xff6644);
      this.showFloatingText(boss.sprite.x, boss.sprite.y - 20, 'ENRAGED!', '#ff6644', 14);
    } else if (phase === 3) {
      boss.speed = Math.floor(boss.speed * 1.15);
      boss.attackCooldown = Math.floor(boss.attackCooldown * 0.85);
      boss.sprite.setTint(0xff2222);
      this.showFloatingText(boss.sprite.x, boss.sprite.y - 20, 'DESPERATE!', '#ff2222', 14);
    }
  }

  /**
   * Boss move selection — cycles through available moves with phase gating.
   * Phase 1: only move 0 (Rift Slam). Phase 2: moves 0+1 (+ Rift Charge).
   * Phase 3: all 3 moves (+ Void Drain for self-sustain).
   * Picks the next move in rotation that's off cooldown; slight intelligence:
   * Void Drain is preferred when boss HP is below 50%.
   */
  private tryBossMove(boss: CombatUnit, nearestEnemy: CombatUnit, time: number): void {
    const slots = boss.moveSlots!;
    const maxSlot = this.bossPhase === 1 ? 1 : this.bossPhase === 2 ? 2 : slots.length;

    // Prefer Void Drain (slot 2) when below 50% HP and it's unlocked + off CD
    if (maxSlot >= 3 && boss.hp < boss.maxHp * 0.5) {
      const drainSlot = slots[2];
      if (drainSlot && time - drainSlot.lastUsedTime >= drainSlot.cooldownMs) {
        const target = this.pickMoveTarget(boss, drainSlot, nearestEnemy, time);
        if (target) {
          drainSlot.lastUsedTime = time;
          boss.lastMoveIndex = 2;
          this.dealMoveDamage(boss, target, drainSlot);
          return;
        }
      }
    }

    // Cycle through available moves starting after the last one used
    const start = (boss.lastMoveIndex + 1) % maxSlot;
    for (let n = 0; n < maxSlot; n++) {
      const i = (start + n) % maxSlot;
      const slot = slots[i];
      if (time - slot.lastUsedTime < slot.cooldownMs) continue;
      const target = this.pickMoveTarget(boss, slot, nearestEnemy, time);
      if (!target) continue;
      slot.lastUsedTime = time;
      boss.lastMoveIndex = i;
      this.dealMoveDamage(boss, target, slot);
      return;
    }
  }


  // --- Status Effect System ---

  private applyStatusEffect(unit: CombatUnit, effect: StatusEffect): void {
    unit.statusEffects.push(effect);
    switch (effect.stat) {
      case 'defense': unit.defense += effect.amount; break;
      case 'attack':  unit.attack  += effect.amount; break;
      case 'speed':   unit.speed   += effect.amount; break;
      case 'evasion': unit.evasion += effect.amount; break;
    }
  }

  private tickStatusEffects(time: number): void {
    const allUnits = [...this.allies, ...this.enemies];
    for (const unit of allUnits) {
      if (!unit.alive) continue;
      for (let i = unit.statusEffects.length - 1; i >= 0; i--) {
        const effect = unit.statusEffects[i];
        if (time >= effect.expiresAt) {
          switch (effect.stat) {
            case 'defense': unit.defense -= effect.amount; break;
            case 'attack':  unit.attack  -= effect.amount; break;
            case 'speed':   unit.speed   -= effect.amount; break;
            case 'evasion': unit.evasion -= effect.amount; break;
          }
          unit.statusEffects.splice(i, 1);
        }
      }
      // Clear expired forced targets
      if (unit.forcedTarget && unit.forcedTargetExpiry !== undefined && time >= unit.forcedTargetExpiry) {
        unit.forcedTarget = undefined;
        unit.forcedTargetExpiry = undefined;
      }
    }
  }

  private clearStatusEffects(unit: CombatUnit): void {
    for (const effect of unit.statusEffects) {
      switch (effect.stat) {
        case 'defense': unit.defense -= effect.amount; break;
        case 'attack':  unit.attack  -= effect.amount; break;
        case 'speed':   unit.speed   -= effect.amount; break;
        case 'evasion': unit.evasion -= effect.amount; break;
      }
    }
    unit.statusEffects = [];
    unit.igniteStacks = 0;
    unit.nextIgniteTick = 0;
    unit.blindMissChance = 0;
    unit.blindExpiresAt = 0;
    unit.briarDamage = 0;
    unit.briarExpiresAt = 0;
    unit.knockbackImmuneUntil = 0;
    unit.phaseUntil = 0;
    unit.damageReductionAmount = 0;
    unit.damageReductionUntil = 0;
    unit.markedDamageBonus = 0;
    unit.markedUntil = 0;
    unit.forcedTarget = undefined;
    unit.forcedTargetExpiry = undefined;
  }

  // --- Ignite DoT system ---

  private static readonly IGNITE_TICK_MS = 500;
  private static readonly MAX_IGNITE_STACKS = 12;

  /** Add ignite stacks to a unit, refreshing the tick timer. */
  private addIgniteStacks(unit: CombatUnit, stacks: number): void {
    unit.igniteStacks = Math.min(CombatManager.MAX_IGNITE_STACKS, unit.igniteStacks + stacks);
    // Reset tick so the next tick fires from now (prevents burst tick on first stack)
    if (unit.nextIgniteTick === 0) {
      unit.nextIgniteTick = this.scene.time.now + CombatManager.IGNITE_TICK_MS;
    }
  }

  /**
   * Tick ignite DoT on all units. Each tick deals damage equal to current stacks,
   * then decays by 1 stack. Orange tint flash + floating damage text.
   */
  private tickIgnite(time: number): void {
    const allUnits = [...this.allies, ...this.enemies];
    for (const unit of allUnits) {
      if (!unit.alive || unit.igniteStacks <= 0) continue;
      if (time < unit.nextIgniteTick) continue;

      const dmg = unit.igniteStacks;
      unit.hp = Math.max(0, unit.hp - dmg);

      // Orange tint flash
      unit.sprite.setTint(0xff6600);
      this.scene.time.delayedCall(80, () => { if (unit.alive) unit.sprite.clearTint(); });

      // Small floating damage number offset upward to avoid clashing with normal hits
      this.showFloatingText(unit.sprite.x, unit.sprite.y - 12, `-${dmg}`, '#ff8800', 9);

      // Decay one stack per tick
      unit.igniteStacks -= 1;
      unit.nextIgniteTick = unit.igniteStacks > 0 ? time + CombatManager.IGNITE_TICK_MS : 0;

      if (unit.hp <= 0) this.killUnit(unit);
    }
  }

  // --- Blind system ---

  /** Apply or refresh a blind debuff on a unit. Stacks take the max of current and new. */
  private applyBlind(unit: CombatUnit, missChance: number, duration: number, caster?: CombatUnit): void {
    duration = Math.floor(duration * getRoleDebuffDurationMultiplier(caster?.role));
    unit.blindMissChance = Math.max(unit.blindMissChance, missChance);
    unit.blindExpiresAt = Math.max(unit.blindExpiresAt, this.scene.time.now + duration);

    unit.sprite.setTint(0xffffaa);
    this.scene.time.delayedCall(150, () => { if (unit.alive) unit.sprite.clearTint(); });
    this.showFloatingText(unit.sprite.x, unit.sprite.y, 'BLINDED', '#ffffaa', 9);
  }

  /** Expire blind debuffs once their duration has elapsed. */
  private tickBlind(time: number): void {
    const allUnits = [...this.allies, ...this.enemies];
    for (const unit of allUnits) {
      if (unit.blindMissChance > 0 && time >= unit.blindExpiresAt) {
        unit.blindMissChance = 0;
      }
    }
  }

  /** Expire Hunter's Mark once its duration elapses. */
  private tickHuntersMark(time: number): void {
    const allUnits = [...this.allies, ...this.enemies];
    for (const unit of allUnits) {
      if (unit.markedDamageBonus > 0 && time >= unit.markedUntil) {
        unit.markedDamageBonus = 0;
      }
    }
  }

  /** Expire briar debuffs once their duration has elapsed. */
  private tickBriarExpiry(time: number): void {
    const allUnits = [...this.allies, ...this.enemies];
    for (const unit of allUnits) {
      if (unit.briarDamage > 0 && time >= unit.briarExpiresAt) {
        unit.briarDamage = 0;
      }
    }
  }

  // --- Beam move ---

  private static readonly BEAM_LENGTH = 300;
  private static readonly BEAM_TICK_MS = 1000;
  private static readonly BEAM_TICKS = 3;
  private static readonly BEAM_HIT_RADIUS = 16;

  /**
   * Solar Flare beam — fires a straight line from attacker toward target.
   * Persists for BEAM_TICKS seconds, dealing slot.power damage/tick to every enemy
   * whose centre falls within BEAM_HIT_RADIUS pixels of the beam line.
   */
  private executeBeam(attacker: CombatUnit, target: CombatUnit, slot: MoveSlot, isAlly: boolean): void {
    const sx = attacker.sprite.x;
    const sy = attacker.sprite.y + (slot.attackOriginOffsetY ?? 0);
    const dx = target.sprite.x - sx;
    const dy = target.sprite.y - sy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const ex = sx + nx * CombatManager.BEAM_LENGTH;
    const ey = sy + ny * CombatManager.BEAM_LENGTH;

    const enemies = isAlly ? this.enemies : this.allies;

    // Beam visual — elemental-colored line that fades over the duration
    const beamGfx = this.scene.add.graphics().setDepth(245);
    const totalDuration = CombatManager.BEAM_TICKS * CombatManager.BEAM_TICK_MS;
    const glowColor = TYPE_COLORS[attacker.elementType] ?? 0xffffcc;
    const coreColor = attacker.elementType === 'light' ? 0xffffff : 0xffeecc;

    const drawBeam = (alpha: number) => {
      beamGfx.clear();
      beamGfx.lineStyle(8, glowColor, alpha * 0.4);
      beamGfx.beginPath(); beamGfx.moveTo(sx, sy); beamGfx.lineTo(ex, ey); beamGfx.strokePath();
      beamGfx.lineStyle(3, coreColor, alpha);
      beamGfx.beginPath(); beamGfx.moveTo(sx, sy); beamGfx.lineTo(ex, ey); beamGfx.strokePath();
    };
    drawBeam(1);

    this.scene.tweens.add({
      targets: { alpha: 1 },
      alpha: 0,
      duration: totalDuration,
      onUpdate: (tween) => drawBeam(1 - tween.progress),
      onComplete: () => beamGfx.destroy(),
    });

    // Tick damage — fires BEAM_TICKS times, once per second
    const hitEnemiesInBeam = () => {
      for (const enemy of enemies) {
        if (!enemy.alive) continue;
        if (this.distToSegment(enemy.sprite.x, enemy.sprite.y, sx, sy, ex, ey) <= CombatManager.BEAM_HIT_RADIUS) {
          this.applyHit(attacker, enemy, slot.power, isAlly, `${slot.name} -${slot.power}`);
        }
      }
    };

    for (let tick = 0; tick < CombatManager.BEAM_TICKS; tick++) {
      this.scene.time.delayedCall(tick * CombatManager.BEAM_TICK_MS, () => {
        if (!attacker.alive) return;
        hitEnemiesInBeam();
      });
    }
  }

  /** Distance from point (px, py) to line segment (x1,y1)→(x2,y2). */
  private distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.sqrt((px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2);
  }

  // --- Briar debuff ---

  /** Apply briar to a unit — they take damage each time they attack. */
  private applyBriar(unit: CombatUnit, damage: number, duration: number, caster?: CombatUnit): void {
    duration = Math.floor(duration * getRoleDebuffDurationMultiplier(caster?.role));
    unit.briarDamage = Math.max(unit.briarDamage, damage);
    unit.briarExpiresAt = Math.max(unit.briarExpiresAt, this.scene.time.now + duration);
    unit.sprite.setTint(0x44cc44);
    this.scene.time.delayedCall(150, () => { if (unit.alive) unit.sprite.clearTint(); });
    this.showFloatingText(unit.sprite.x, unit.sprite.y, 'BRIAR', '#44cc44', 9);
  }

  // --- Root ---

  /**
   * Fully root a unit: zero their speed via status effect and push their lastAttackTime
   * forward so they can't attack until the root expires.
   */
  private applyRoot(unit: CombatUnit, duration: number, caster?: CombatUnit): void {
    duration = Math.floor(duration * getRoleDebuffDurationMultiplier(caster?.role));
    const now = this.scene.time.now;
    // Zero speed via status effect so the AI won't move
    this.applyStatusEffect(unit, {
      id: 'root',
      stat: 'speed',
      amount: -unit.speed,
      expiresAt: now + duration,
    });
    // Prevent attacks by pushing the last-attack timestamp forward
    unit.lastAttackTime = now + duration;
    unit.sprite.setVelocity(0, 0);

    // Vine visual — small green dots pinned around the unit
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const vx = Math.cos(angle) * 14;
      const vy = Math.sin(angle) * 14;
      const vine = this.scene.add.circle(unit.sprite.x + vx, unit.sprite.y + vy, 2, 0x228822, 0.85).setDepth(251);
      this.scene.tweens.add({
        targets: vine,
        alpha: 0,
        duration: duration * 0.9,
        onComplete: () => vine.destroy(),
      });
    }
    this.showFloatingText(unit.sprite.x, unit.sprite.y, 'ROOTED', '#22aa22', 9);
  }

  // --- Hunter's Mark ---

  /** Mark a target — all damage they receive is amplified for the duration. */
  private applyHuntersMark(unit: CombatUnit, bonus: number, duration: number): void {
    unit.markedDamageBonus = Math.max(unit.markedDamageBonus, bonus);
    unit.markedUntil = Math.max(unit.markedUntil, this.scene.time.now + duration);
    unit.sprite.setTint(0x9933cc);
    this.scene.time.delayedCall(150, () => { if (unit.alive) unit.sprite.clearTint(); });
    this.showFloatingText(unit.sprite.x, unit.sprite.y, 'MARKED', '#9933cc', 9);
  }

  // --- Stun (earth seismic shock) ---

  /**
   * Stun a unit: same mechanism as root (zero speed, lock attacks) but shorter
   * duration and with a yellow flash + orbiting spark visual instead of vines.
   */
  private applyStun(unit: CombatUnit, duration: number): void {
    const now = this.scene.time.now;
    this.applyStatusEffect(unit, {
      id: 'stun',
      stat: 'speed',
      amount: -unit.speed,
      expiresAt: now + duration,
    });
    unit.lastAttackTime = now + duration;
    unit.sprite.setVelocity(0, 0);

    unit.sprite.setTint(0xffff44);
    this.scene.time.delayedCall(150, () => { if (unit.alive) unit.sprite.clearTint(); });
    this.showFloatingText(unit.sprite.x, unit.sprite.y, 'STUNNED', '#ffff44', 9);

    // Three small sparks orbit the unit and fade over the stun duration
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const spark = this.scene.add
        .circle(unit.sprite.x + Math.cos(angle) * 10, unit.sprite.y + Math.sin(angle) * 10 - 10, 2, 0xffff44, 0.9)
        .setDepth(251);
      this.scene.tweens.add({
        targets: spark,
        alpha: 0,
        duration: duration * 0.85,
        onComplete: () => spark.destroy(),
      });
    }
  }

  // --- Shared helpers ---

  /** Apply a stat buff to the caster if the slot defines one. Used by blast, taunt, etc. */
  private applySelfBuffFromSlot(caster: CombatUnit, slot: MoveSlot): void {
    if (!slot.selfBuffStat || !slot.selfBuffAmount || !caster.alive) return;
    this.applyStatusEffect(caster, {
      id: `self_${slot.selfBuffStat}`,
      stat: slot.selfBuffStat,
      amount: slot.selfBuffAmount,
      expiresAt: this.scene.time.now + (slot.selfBuffDuration ?? 2000),
    });
    this.showFloatingText(caster.sprite.x, caster.sprite.y,
      `+${slot.selfBuffAmount} ${slot.selfBuffStat.toUpperCase()}`, '#aaffaa', 9);
  }

  /** Apply a stat debuff to a target unit. Used by Claw Crush (waterlogged), etc.
   *  If the same debuff id is already active, refreshes its duration instead of stacking. */
  private applyStatDebuff(attacker: CombatUnit, target: CombatUnit, slot: MoveSlot): void {
    if (!slot.appliesStatDebuff || !slot.debuffAmount || !target.alive) return;
    const debuffId = `debuff_${slot.appliesStatDebuff}`;
    const baseDuration = slot.debuffDuration ?? 3000;
    const duration = Math.floor(baseDuration * getRoleDebuffDurationMultiplier(attacker.role));
    const existing = target.statusEffects.find((e) => e.id === debuffId);
    if (existing) {
      // Refresh duration only — no additional stat penalty
      existing.expiresAt = this.scene.time.now + duration;
      return;
    }
    this.applyStatusEffect(target, {
      id: debuffId,
      stat: slot.appliesStatDebuff,
      amount: -slot.debuffAmount,
      expiresAt: this.scene.time.now + duration,
    });
    const labels: Record<string, string> = { defense: 'DEF↓', attack: 'ATK↓', speed: 'SPD↓', evasion: 'EVA↓' };
    this.showFloatingText(target.sprite.x, target.sprite.y, labels[slot.appliesStatDebuff] ?? 'DEBUFF', '#88ccff', 9);
    // Blue-tint flash on target (waterlogged look)
    target.sprite.setTint(0x88aaff);
    this.scene.time.delayedCall(150, () => { if (target.alive) target.sprite.clearTint(); });
  }

  // --- Leap move (hunter backline jump) ---

  /**
   * Hunter leap — arcs to the highest-range backline enemy via a bezier curve.
   * A ground shadow shrinks as the sprite rises, selling the "in the air" read.
   * Deals pierce damage and applies debuff on landing.
   */
  private executeLeap(attacker: CombatUnit, target: CombatUnit, slot: MoveSlot, isAlly: boolean): void {
    const sx = attacker.sprite.x;
    const sy = attacker.sprite.y;

    // Land just behind the target
    const dx = target.sprite.x - sx;
    const dy = target.sprite.y - sy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    let landX = Phaser.Math.Clamp(target.sprite.x + nx * 32, 24, 456);
    let landY = Phaser.Math.Clamp(target.sprite.y + ny * 32, 24, 296);
    // Ensure the landing spot is walkable — without this a leap can deposit
    // the attacker inside a wall or behind a tree collider.
    if (this.nav) {
      const snapped = this.nav.snapToWalkable(landX, landY);
      landX = snapped.x;
      landY = snapped.y;
    }

    // Bezier arc — control points arc upward over the path
    const arcH = Math.min(70, dist * 0.45);
    const path = new Phaser.Curves.Path(sx, sy);
    path.cubicBezierTo(
      landX, landY,
      sx + dx * 0.25, sy - arcH,
      sx + dx * 0.75, landY - arcH * 0.4,
    );

    // Ground shadow — follows X, stays near ground, shrinks at apex
    const shadow = this.scene.add.ellipse(sx, sy + 6, 16, 7, 0x000000, 0.3).setDepth(0);

    // Shadow step (Dusk Dash) — blink instead of arc
    if (slot.shadowStep) {
      this.scene.tweens.add({
        targets: attacker.sprite,
        alpha: 0,
        duration: 100,
        onComplete: () => {
          // Smoke puff at departure
          const smoke = this.scene.add.circle(sx, sy, 8, 0x442255, 0.5).setDepth(250);
          this.scene.tweens.add({ targets: smoke, scale: 2.5, alpha: 0, duration: 250, onComplete: () => smoke.destroy() });
          attacker.sprite.setPosition(landX, landY);
          if (attacker.alive) (attacker.sprite.body as Phaser.Physics.Arcade.Body).reset(landX, landY);
          this.scene.tweens.add({
            targets: attacker.sprite,
            alpha: 1,
            duration: 100,
            onComplete: () => {
              this.spawnImpactFlash(landX, landY, TYPE_COLORS[attacker.elementType] ?? 0x9966cc, slot.isSignature);
              if (target.alive) {
                const variance = Math.floor(Math.random() * 4) - 2;
                const damage = Math.max(1, slot.power + variance);
                this.applyHit(attacker, target, damage, isAlly,
                  isAlly ? `${slot.name} -${damage}` : `-${damage}`);
                if (slot.appliesSlowOnLand) {
                  const slowAmt = -Math.floor(target.speed * 0.4);
                  this.applyStatusEffect(target, {
                    id: 'slow', stat: 'speed', amount: slowAmt,
                    expiresAt: this.scene.time.now + (slot.duration ?? 2500),
                  });
                  target.sprite.setTint(0x44cccc);
                  this.scene.time.delayedCall(200, () => { if (target.alive) target.sprite.clearTint(); });
                  this.showFloatingText(target.sprite.x, target.sprite.y, 'SLOWED', '#44cccc', 9);
                }
              }
            },
          });
        },
      });
      return;
    }

    const follower = { t: 0, vec: new Phaser.Math.Vector2() };
    this.scene.tweens.add({
      targets: follower,
      t: 1,
      duration: 320,
      ease: 'Sine.InOut',
      onUpdate: () => {
        path.getPoint(follower.t, follower.vec);
        attacker.sprite.setPosition(follower.vec.x, follower.vec.y);
        // Shadow tracks x, interpolates y toward landing, shrinks at apex
        const apex = 4 * follower.t * (1 - follower.t); // 0→1→0
        shadow.setPosition(follower.vec.x, sy + 6 + (landY - sy) * follower.t);
        shadow.setScale(1 - apex * 0.65);
        shadow.setAlpha(0.3 * (1 - apex * 0.75));
      },
      onComplete: () => {
        shadow.destroy();
        attacker.sprite.setPosition(landX, landY);
        if (attacker.alive) (attacker.sprite.body as Phaser.Physics.Arcade.Body).reset(landX, landY);

        // Landing impact
        const typeColor = TYPE_COLORS[attacker.elementType] ?? 0x44cc44;
        this.spawnImpactFlash(landX, landY, typeColor, slot.isSignature);
        this.scene.cameras.main.shake(90, 0.003);

        // Dust ring on landing
        const ring = this.scene.add.circle(landX, landY, 2, typeColor, 0).setDepth(250);
        ring.setStrokeStyle(2, typeColor, 0.6);
        this.scene.tweens.add({
          targets: ring,
          scale: { from: 1, to: 10 },
          alpha: 0,
          duration: 250,
          onComplete: () => ring.destroy(),
        });

        // Deal pierce damage + stat debuff to target
        if (target.alive) {
          const variance = Math.floor(Math.random() * 4) - 2;
          const damage = Math.max(1, slot.power + variance);
          this.applyHit(attacker, target, damage, isAlly,
            isAlly ? `${slot.name} -${damage}` : `-${damage}`, true);
          if (slot.appliesStatDebuff) this.applyStatDebuff(attacker, target, slot);
        }
      },
    });
  }

  // --- Phantom Dive (Hollowcrow phase + strike) ---

  private static readonly PHASE_DURATION = 800;

  /**
   * Phase out for PHASE_DURATION ms — all incoming damage is blocked during phase.
   * Shadow afterimages trail the attacker. Then dive in for a pierce strike.
   */
  private executePhantomDive(attacker: CombatUnit, target: CombatUnit, slot: MoveSlot, isAlly: boolean): void {
    attacker.phaseUntil = this.scene.time.now + CombatManager.PHASE_DURATION;

    // Fade to semi-transparent
    this.scene.tweens.add({ targets: attacker.sprite, alpha: 0.25, duration: 120 });

    // Shadow afterimage trail during phase
    const shadowTimer = this.scene.time.addEvent({
      delay: 80,
      repeat: Math.floor(CombatManager.PHASE_DURATION / 80),
      callback: () => {
        if (!attacker.alive) return;
        const shadow = this.scene.add
          .image(attacker.sprite.x, attacker.sprite.y, attacker.sprite.texture.key)
          .setAlpha(0.18).setScale(attacker.sprite.scale).setDepth(attacker.sprite.depth - 1).setTint(0x440066);
        this.scene.tweens.add({ targets: shadow, alpha: 0, duration: 220, onComplete: () => shadow.destroy() });
      },
    });

    // After phase: restore and strike
    this.scene.time.delayedCall(CombatManager.PHASE_DURATION, () => {
      shadowTimer.destroy();
      attacker.phaseUntil = 0;
      this.scene.tweens.add({ targets: attacker.sprite, alpha: 1, duration: 100 });

      if (!attacker.alive) return;
      if (target.alive) {
        const variance = Math.floor(Math.random() * 4) - 2;
        const damage = Math.max(1, slot.power + variance);
        this.spawnImpactFlash(target.sprite.x, target.sprite.y, 0x9900cc, slot.isSignature);
        this.scene.cameras.main.shake(100, 0.003);
        this.applyHit(attacker, target, damage, isAlly,
          isAlly ? `${slot.name} -${damage}` : `-${damage}`, true);
      }
    });
  }

  // --- Dash-through move (Torrent Rush) ---

  private static readonly DASH_LINE_RADIUS = 20;

  /**
   * Dash through a line from attacker toward target, hitting every enemy whose
   * centre falls within DASH_LINE_RADIUS of the path. Hits are staggered as
   * Rivelet passes through. Attacker repositions to just past the primary target.
   */
  private executeDashThrough(attacker: CombatUnit, target: CombatUnit, slot: MoveSlot, isAlly: boolean): void {
    const sx = attacker.sprite.x;
    const sy = attacker.sprite.y;
    const tdx = target.sprite.x - sx;
    const tdy = target.sprite.y - sy;
    const tLen = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
    const nx = tdx / tLen;
    const ny = tdy / tLen;

    const endX = Phaser.Math.Clamp(target.sprite.x + nx * 50, 24, 480 - 24);
    const endY = Phaser.Math.Clamp(target.sprite.y + ny * 50, 24, 320 - 24);

    const enemies = isAlly ? this.enemies : this.allies;
    const variance = Math.floor(Math.random() * 4) - 2;
    const damage = Math.max(1, slot.power + variance);

    // Gather all enemies near the dash line, sorted nearest-first
    const hits: { unit: CombatUnit; d: number }[] = [];
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      if (this.distToSegment(enemy.sprite.x, enemy.sprite.y, sx, sy, endX, endY) <= CombatManager.DASH_LINE_RADIUS) {
        hits.push({ unit: enemy, d: Phaser.Math.Distance.Between(sx, sy, enemy.sprite.x, enemy.sprite.y) });
      }
    }
    hits.sort((a, b) => a.d - b.d);

    // Stagger hits as Rivelet passes through each enemy
    hits.forEach(({ unit }, i) => {
      this.scene.time.delayedCall(i * 55, () => {
        if (!unit.alive || !attacker.alive) return;
        this.spawnImpactFlash(unit.sprite.x, unit.sprite.y, 0x44aaff, slot.isSignature && i === 0);
        this.applyHit(attacker, unit, damage, isAlly, isAlly ? `${slot.name} -${damage}` : `-${damage}`, true);
        if (slot.appliesStatDebuff) this.applyStatDebuff(attacker, unit, slot);
      });
    });

    // Elemental trail during the dash (color matches attacker's type)
    const trailColor = TYPE_COLORS[attacker.elementType] ?? 0x44aaff;
    const trailTimer = this.scene.time.addEvent({
      delay: 22,
      repeat: 8,
      callback: () => {
        const dot = this.scene.add.circle(attacker.sprite.x, attacker.sprite.y, 3, trailColor, 0.55).setDepth(249);
        this.scene.tweens.add({ targets: dot, alpha: 0, duration: 200, onComplete: () => dot.destroy() });
      },
    });

    this.scene.tweens.add({
      targets: attacker.sprite,
      x: endX,
      y: endY,
      duration: 170,
      ease: 'Cubic.Out',
      onComplete: () => {
        trailTimer.destroy();
        if (attacker.alive) (attacker.sprite.body as Phaser.Physics.Arcade.Body).reset(endX, endY);
      },
    });
  }

  // --- Spin move ---

  /**
   * Spin: Tidecrawler-style caster-centred sweep. Hits all enemies within slot.radius
   * simultaneously with melee damage + knockback radiating outward from the caster.
   */
  private executeSpin(attacker: CombatUnit, slot: MoveSlot, isAlly: boolean): void {
    const radius = (slot.radius ?? 50) * getRoleAoERadiusMultiplier(attacker.role);
    const enemies = isAlly ? this.enemies : this.allies;
    const cx = attacker.sprite.x;
    const cy = attacker.sprite.y;
    const typeColor = TYPE_COLORS[attacker.elementType] ?? 0x44aaff;

    // Radial sweep visual — two expanding rings, offset slightly in timing
    for (let r = 0; r < 2; r++) {
      this.scene.time.delayedCall(r * 80, () => {
        const ring = this.scene.add.circle(cx, cy, 4, typeColor, 0).setDepth(250);
        ring.setStrokeStyle(3 - r, typeColor, 0.7 - r * 0.2);
        this.scene.tweens.add({
          targets: ring,
          scale: { from: 1, to: radius / 4 },
          alpha: 0,
          duration: 280 + r * 60,
          onComplete: () => ring.destroy(),
        });
      });
    }

    // Camera shake — heavy anchor move
    this.scene.cameras.main.shake(120, 0.004);

    // Damage all enemies in radius
    const variance = Math.floor(Math.random() * 4) - 2;
    const damage = Math.max(1, slot.power + variance);

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.sprite.x - cx;
      const dy = enemy.sprite.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;

      this.spawnImpactFlash(enemy.sprite.x, enemy.sprite.y, typeColor, slot.isSignature);
      this.applyHit(attacker, enemy, damage, isAlly, isAlly ? `${slot.name} -${damage}` : `-${damage}`);

      // Per-hit effects: stat debuff (Hex Screech curse) and optional slow
      if (enemy.alive) {
        if (slot.appliesStatDebuff) this.applyStatDebuff(attacker, enemy, slot);
        if (slot.appliesSlowToAllHit) {
          const slowAmt = -Math.floor(enemy.speed * 0.4);
          const slowDur = Math.floor((slot.duration ?? 3000) * getRoleDebuffDurationMultiplier(attacker.role));
          this.applyStatusEffect(enemy, {
            id: 'slow', stat: 'speed', amount: slowAmt,
            expiresAt: this.scene.time.now + slowDur,
          });
          enemy.sprite.setTint(0x44cccc);
          this.scene.time.delayedCall(200, () => { if (enemy.alive) enemy.sprite.clearTint(); });
          this.showFloatingText(enemy.sprite.x, enemy.sprite.y, 'SLOWED', '#44cccc', 9);
        }
      }

      // Knockback radiates outward from spin centre
      if (enemy.alive && dist > 0) {
        const force = 60;
        enemy.sprite.setVelocity((dx / dist) * force, (dy / dist) * force);
        this.scene.time.delayedCall(120, () => { if (enemy.alive) enemy.sprite.setVelocity(0, 0); });
      }
    }
  }

  /**
   * Move kind dispatcher — routes each move to its specific implementation.
   * `target` is the primary target (enemy for damage moves, ally for support moves).
   */
  private dealMoveDamage(attacker: CombatUnit, target: CombatUnit, slot: MoveSlot): void {
    const isAlly = this.allies.includes(attacker);

    // Play attack animation immediately — effect fires after attackAnimDelay (or instantly)
    if (slot.attackAnim) {
      // Rift Tyrant only has south-facing attack anims for now
      const dir = attacker.texturePrefix === 'rift_tyrant' ? 'south' : (this.unitLastDir.get(attacker) ?? 'south');
      if (attacker.texturePrefix === 'rift_tyrant') {
        this.unitLastDir.set(attacker, 'south');
        attacker.sprite.setTexture('rift_tyrant_south');
      }
      playAttackAnim(attacker.sprite, attacker.texturePrefix, slot.attackAnim, dir, this.scene.anims, () => {
        if (attacker.alive) stopWalkAnim(attacker.sprite, attacker.texturePrefix, this.unitLastDir.get(attacker) ?? 'south');
      });
    }

    const fireEffect = () => {
      if (!attacker.alive) return;

      // Signature move polish: screen shake + white flash on attacker
      if (slot.isSignature) {
        this.scene.cameras.main.shake(150, 0.003);
        attacker.sprite.setTint(0xffffff);
        this.scene.time.delayedCall(100, () => {
          if (attacker.alive) attacker.sprite.clearTint();
        });
      }

      switch (slot.kind) {
      case 'strike':
        this.executeDamageMove(attacker, target, slot, isAlly, false);
        break;
      case 'pierce':
        if (slot.repositions) {
          this.executeFireDash(attacker, target, slot, isAlly);
        } else if (slot.dashThrough) {
          this.executeDashThrough(attacker, target, slot, isAlly);
        } else if (slot.phasesBeforeStrike) {
          this.executePhantomDive(attacker, target, slot, isAlly);
        } else {
          this.executeDamageMove(attacker, target, slot, isAlly, true);
        }
        break;
      case 'blast':
        this.executeBlast(attacker, target, slot, isAlly);
        break;
      case 'barrage':
        this.executeBarrage(attacker, slot, isAlly);
        break;
      case 'beam':
        this.executeBeam(attacker, target, slot, isAlly);
        break;
      case 'spin':
        this.executeSpin(attacker, slot, isAlly);
        break;
      case 'leap':
        this.executeLeap(attacker, target, slot, isAlly);
        break;
      case 'drain':
        this.executeDrain(attacker, target, slot, isAlly);
        break;
      case 'heal':
        this.executeHeal(attacker, target, slot);
        break;
      case 'shield':
        this.executeShield(target, slot);
        break;
      case 'rally_buff':
        this.executeRallyBuff(attacker, slot);
        break;
      case 'slow':
        this.executeSlow(attacker, target, slot, isAlly);
        break;
      case 'taunt':
        this.executeTaunt(attacker, slot);
        break;
      default:
        this.executeDamageMove(attacker, target, slot, isAlly, false);
    }
    }; // end fireEffect

    if (slot.attackAnimDelay) {
      this.scene.time.delayedCall(slot.attackAnimDelay, fireEffect);
    } else {
      fireEffect();
    }
  }

  /** Fire a single-target damage hit (used by strike and pierce). */
  private executeDamageMove(attacker: CombatUnit, defender: CombatUnit, slot: MoveSlot, isAlly: boolean, pierce: boolean): void {
    const variance = Math.floor(Math.random() * 4) - 2;
    const defBonus = slot.defenseScaledBonus ? Math.floor(attacker.defense * slot.defenseScaledBonus) : 0;
    const missingHpFraction = 1 - (defender.hp / defender.maxHp);
    const execBonus = slot.executeBonusPct ? Math.floor(missingHpFraction * 100 * slot.executeBonusPct) : 0;
    const damage = Math.max(1, slot.power + variance + defBonus + execBonus);
    const label = isAlly ? `${slot.name} -${damage}` : `-${damage}`;
    // Pierce: white projectile, faster travel, white impact
    const colorOverride = pierce ? 0xeeeeff : undefined;
    const speed = pierce ? 0.6 : 1;

    const onHit = (slot.appliesIgnite || slot.appliesBlind || slot.appliesStatDebuff)
      ? () => {
          if (!defender.alive) return;
          if (slot.appliesIgnite)    this.addIgniteStacks(defender, slot.appliesIgnite!);
          if (slot.appliesBlind)     this.applyBlind(defender, slot.appliesBlind!, slot.blindDuration ?? 2000, attacker);
          if (slot.appliesStatDebuff) this.applyStatDebuff(attacker, defender, slot);
        }
      : undefined;

    this.fireProjectileOrMelee(attacker, defender, damage, isAlly, label, slot.isSignature, pierce,
      onHit, undefined, colorOverride, speed, colorOverride, slot.attackOriginOffsetY ?? 0);
  }

  /**
   * Fire Dash — pierce damage + Emberhound repositions behind the target.
   * Direction: normalize(target - attacker), then place attacker 36px past target.
   */
  private executeFireDash(attacker: CombatUnit, target: CombatUnit, slot: MoveSlot, isAlly: boolean): void {
    const variance = Math.floor(Math.random() * 4) - 2;
    const damage = Math.max(1, slot.power + variance);
    const label = isAlly ? `${slot.name} -${damage}` : `-${damage}`;

    // Compute behind position before the tween starts
    const dx = target.sprite.x - attacker.sprite.x;
    const dy = target.sprite.y - attacker.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    let behindX = Phaser.Math.Clamp(target.sprite.x + nx * 36, 24, (this.walls.scene.sys.game.config.width as number) - 24);
    let behindY = Phaser.Math.Clamp(target.sprite.y + ny * 36, 24, (this.walls.scene.sys.game.config.height as number) - 24);
    if (this.nav) {
      const snapped = this.nav.snapToWalkable(behindX, behindY);
      behindX = snapped.x;
      behindY = snapped.y;
    }

    // Deliver the hit immediately (melee-range pierce)
    this.spawnImpactFlash(target.sprite.x, target.sprite.y, 0xeeeeff, slot.isSignature);
    this.applyHit(attacker, target, damage, isAlly, label, true);

    // Then dash attacker to behind position
    this.scene.tweens.add({
      targets: attacker.sprite,
      x: behindX,
      y: behindY,
      duration: 150,
      ease: 'Cubic.Out',
      onComplete: () => {
        if (attacker.alive) (attacker.sprite.body as Phaser.Physics.Arcade.Body).reset(behindX, behindY);
      },
    });

    // Orange-white motion trail during the dash
    const trailTimer = this.scene.time.addEvent({
      delay: 25,
      repeat: 5,
      callback: () => {
        const dot = this.scene.add.circle(attacker.sprite.x, attacker.sprite.y, 3, 0xff6622, 0.5).setDepth(249);
        this.scene.tweens.add({ targets: dot, alpha: 0, duration: 180, onComplete: () => dot.destroy() });
      },
    });
    this.scene.time.delayedCall(200, () => trailTimer.destroy());
  }

  /** Blast: hit primary target + AoE splash to nearby enemies. */
  private executeBlast(attacker: CombatUnit, defender: CombatUnit, slot: MoveSlot, isAlly: boolean): void {
    const variance = Math.floor(Math.random() * 4) - 2;
    const damage = Math.max(1, slot.power + variance);
    const label = isAlly ? `${slot.name} -${damage}` : `-${damage}`;
    const radius = (slot.radius ?? 45) * getRoleAoERadiusMultiplier(attacker.role);
    const typeColor = TYPE_COLORS[attacker.elementType] ?? 0xffcc44;
    const enemies = isAlly ? this.enemies : this.allies;

    const onHit = () => {
      // AoE visual — expanding circle at impact point
      const aoe = this.scene.add.circle(defender.sprite.x, defender.sprite.y, 1, typeColor, 0.35).setDepth(250);
      this.scene.tweens.add({
        targets: aoe,
        scale: { from: 1, to: radius },
        alpha: 0,
        duration: 300,
        onComplete: () => aoe.destroy(),
      });

      // Apply ignite / blind to primary target
      if (slot.appliesIgnite && defender.alive) this.addIgniteStacks(defender, slot.appliesIgnite);
      if (slot.appliesBlind  && defender.alive) this.applyBlind(defender, slot.appliesBlind, slot.blindDuration ?? 2000, attacker);

      // Hit secondary targets in radius
      const splashDamage = Math.floor(damage * 0.6);
      for (const enemy of enemies) {
        if (!enemy.alive || enemy === defender) continue;
        const dx = enemy.sprite.x - defender.sprite.x;
        const dy = enemy.sprite.y - defender.sprite.y;
        if (Math.sqrt(dx * dx + dy * dy) <= radius) {
          this.applyHit(attacker, enemy, splashDamage, isAlly, `-${splashDamage}`);
          if (slot.appliesIgnite) this.addIgniteStacks(enemy, slot.appliesIgnite);
          if (slot.appliesBlind)  this.applyBlind(enemy, slot.appliesBlind, slot.blindDuration ?? 2000, attacker);
          if (slot.stunsRadius)   this.applyStun(enemy, slot.stunDuration ?? 800);
        }
      }

      // Stun primary target too if stunsRadius
      if (slot.stunsRadius && defender.alive) this.applyStun(defender, slot.stunDuration ?? 800);

      // Self-buff: apply to caster after the blast lands (Luminova evasion boost etc.)
      this.applySelfBuffFromSlot(attacker, slot);
    };

    this.fireProjectileOrMelee(attacker, defender, damage, isAlly, label, slot.isSignature, false, onHit);
  }

  /** Barrage: hit multiple random enemies; optionally refracts each bolt to a nearby secondary target. */
  private executeBarrage(attacker: CombatUnit, slot: MoveSlot, isAlly: boolean): void {
    const enemies = isAlly ? this.enemies : this.allies;
    const aliveTargets = enemies.filter((e) => e.alive);
    if (aliveTargets.length === 0) return;

    const hitCount = slot.hits ?? (2 + Math.floor(Math.random() * 2));
    const reducedPower = Math.floor(slot.power * 0.6);

    for (let i = 0; i < hitCount; i++) {
      const primary = aliveTargets[Math.floor(Math.random() * aliveTargets.length)];
      this.scene.time.delayedCall(i * 100, () => {
        if (!primary.alive || !attacker.alive) return;
        const variance = Math.floor(Math.random() * 4) - 2;
        const damage = Math.max(1, reducedPower + variance);
        const label = isAlly ? `${slot.name} -${damage}` : `-${damage}`;

        // Combined on-hit: stat debuff + briar + optional refraction
        const onHit = (slot.refracts || slot.appliesBriar || slot.appliesStatDebuff) ? () => {
          if (slot.appliesStatDebuff && primary.alive) this.applyStatDebuff(attacker, primary, slot);
          if (slot.appliesBriar && primary.alive) {
            this.applyBriar(primary, slot.appliesBriar, slot.briarDuration ?? 4000, attacker);
          }
          if (slot.refracts && primary.alive) {
            let secondary: CombatUnit | null = null;
            let closestDist = 60;
            for (const e of enemies) {
              if (!e.alive || e === primary) continue;
              const d = Phaser.Math.Distance.Between(primary.sprite.x, primary.sprite.y, e.sprite.x, e.sprite.y);
              if (d < closestDist) { closestDist = d; secondary = e; }
            }
            if (secondary) {
              const refractDamage = Math.max(1, Math.floor(reducedPower * 0.8));
              this.scene.time.delayedCall(80, () => {
                if (!secondary!.alive || !attacker.alive) return;
                this.fireProjectileOrMelee(attacker, secondary!, refractDamage, isAlly,
                  isAlly ? `${slot.name} -${refractDamage}` : `-${refractDamage}`, false, false, undefined, 1.5, 0xffeeaa);
              });
            }
          }
        } : undefined;

        this.fireProjectileOrMelee(attacker, primary, damage, isAlly, label, false, false, onHit, 2, undefined, 1, undefined, slot.attackOriginOffsetY ?? 0);
      });
    }
  }

  /** Drain: strike damage + heal attacker for a portion. */
  private executeDrain(attacker: CombatUnit, defender: CombatUnit, slot: MoveSlot, isAlly: boolean): void {
    const variance = Math.floor(Math.random() * 4) - 2;
    // Bonus damage per ignite stack on target (Flame Charge)
    const igniteBonusDmg = slot.bonusPerIgnite ? Math.floor(defender.igniteStacks * slot.bonusPerIgnite) : 0;
    const damage = Math.max(1, slot.power + variance + igniteBonusDmg);
    const label = isAlly ? `${slot.name} -${damage}` : `-${damage}`;
    const drainRatio = slot.drainRatio ?? 0.3;

    const onHit = () => {
      // Hunter's Mark (Shadow Bite)
      if (slot.appliesHuntersMark && defender.alive) {
        this.applyHuntersMark(defender, slot.markBonus ?? 0.25, slot.markDuration ?? 4000);
      }

      const healAmount = Math.max(1, Math.floor(damage * drainRatio));
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmount);

      // Green drain orb tweens from defender to attacker
      const drainOrb = this.scene.add.circle(defender.sprite.x, defender.sprite.y, 3, 0x44ff66).setDepth(250);
      this.scene.tweens.add({
        targets: drainOrb,
        x: attacker.sprite.x,
        y: attacker.sprite.y,
        duration: 200,
        onComplete: () => {
          drainOrb.destroy();
          this.showFloatingText(attacker.sprite.x, attacker.sprite.y, `+${healAmount}`, '#44ff66', 10);
        },
      });

      // Pull target toward attacker (Undertow)
      if (slot.pullsTarget && defender.alive) {
        const pdx = attacker.sprite.x - defender.sprite.x;
        const pdy = attacker.sprite.y - defender.sprite.y;
        const pLen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
        const pullForce = 80;
        defender.sprite.setVelocity((pdx / pLen) * pullForce, (pdy / pLen) * pullForce);
        this.scene.time.delayedCall(180, () => { if (defender.alive) defender.sprite.setVelocity(0, 0); });
        this.showFloatingText(defender.sprite.x, defender.sprite.y, 'PULLED', '#44aaff', 9);
      }
    };

    // Greenish projectile for drain
    this.fireProjectileOrMelee(attacker, defender, damage, isAlly, label, slot.isSignature, false,
      onHit, undefined, 0x66cc66, 1, 0x44ff66);
  }

  /** Heal: restore HP to an ally. */
  private executeHeal(_attacker: CombatUnit, target: CombatUnit, slot: MoveSlot): void {
    const variance = Math.floor(Math.random() * 4) - 2;
    const base = Math.max(1, slot.power + variance);
    const healAmount = Math.max(1, Math.floor(base * getRoleHealMultiplier(_attacker.role)));
    target.hp = Math.min(target.maxHp, target.hp + healAmount);

    target.sprite.setTint(0x44ff66);
    this.scene.time.delayedCall(120, () => {
      if (target.alive) target.sprite.clearTint();
    });

    this.showFloatingText(target.sprite.x, target.sprite.y, `${slot.name} +${healAmount}`, '#44ff66', 10);
  }

  /** Shield: grant temporary defense buff, optionally with thorns. */
  private executeShield(target: CombatUnit, slot: MoveSlot): void {
    const buffAmount = slot.power;
    const duration = slot.duration ?? 5000;
    const time = this.scene.time.now;

    this.applyStatusEffect(target, {
      id: 'shield',
      stat: 'defense',
      amount: buffAmount,
      expiresAt: time + duration,
      thornsAmount: slot.thornsAmount,
    });

    // Lava Shield: orange-red glow; regular shield: blue
    const color = slot.thornsAmount ? 0xff6600 : 0x4488ff;
    const colorHex = slot.thornsAmount ? '#ff6600' : '#4488ff';
    target.sprite.setTint(color);
    this.scene.time.delayedCall(200, () => { if (target.alive) target.sprite.clearTint(); });

    const label = slot.thornsAmount ? `+${buffAmount} DEF  THORNS` : `+${buffAmount} DEF`;
    this.showFloatingText(target.sprite.x, target.sprite.y, label, colorHex, 10);
  }

  /** Rally buff: buff all nearby allies' attack and speed. */
  private executeRallyBuff(caster: CombatUnit, slot: MoveSlot): void {
    const duration = slot.duration ?? 4000;
    const time = this.scene.time.now;
    const atkBuff = Math.ceil(slot.power * 0.5);
    const spdBuff = slot.power * 2;

    // Gold pulse ring visual
    const typeColor = TYPE_COLORS[caster.elementType] ?? 0xffdd44;
    const ring = this.scene.add.circle(caster.sprite.x, caster.sprite.y, 1, typeColor, 0).setDepth(250);
    ring.setStrokeStyle(2, typeColor, 0.6);
    this.scene.tweens.add({
      targets: ring,
      scale: { from: 1, to: 60 },
      alpha: 0,
      duration: 400,
      onComplete: () => ring.destroy(),
    });

    for (const ally of this.allies) {
      if (!ally.alive) continue;
      const dx = ally.sprite.x - caster.sprite.x;
      const dy = ally.sprite.y - caster.sprite.y;
      if (Math.sqrt(dx * dx + dy * dy) > 60) continue;

      this.applyStatusEffect(ally, { id: 'rally_atk', stat: 'attack', amount: atkBuff, expiresAt: time + duration });
      this.applyStatusEffect(ally, { id: 'rally_spd', stat: 'speed', amount: spdBuff, expiresAt: time + duration });

      this.showFloatingText(ally.sprite.x, ally.sprite.y, '+ATK +SPD', '#ffdd44', 9);
    }
  }

  /** Slow: strike damage + speed debuff on target. */
  private executeSlow(attacker: CombatUnit, defender: CombatUnit, slot: MoveSlot, isAlly: boolean): void {
    const variance = Math.floor(Math.random() * 4) - 2;
    const damage = Math.max(1, slot.power + variance);
    const label = isAlly ? `${slot.name} -${damage}` : `-${damage}`;
    const duration = slot.duration ?? 3000;

    const onHit = () => {
      if (!defender.alive) return;

      const hexedDuration = Math.floor(duration * getRoleDebuffDurationMultiplier(attacker.role));
      if (slot.rootTarget) {
        // Full root: speed → 0, attacks locked (Root Snap)
        this.applyRoot(defender, duration, attacker);
      } else {
        // Partial slow
        const slowAmount = -Math.floor(defender.speed * 0.4);
        this.applyStatusEffect(defender, {
          id: 'slow',
          stat: 'speed',
          amount: slowAmount,
          expiresAt: this.scene.time.now + hexedDuration,
        });
        defender.sprite.setTint(0x44cccc);
        this.scene.time.delayedCall(200, () => { if (defender.alive) defender.sprite.clearTint(); });
        this.showFloatingText(defender.sprite.x, defender.sprite.y, 'SLOWED', '#44cccc', 9);
        if (slot.appliesBlind) this.applyBlind(defender, slot.appliesBlind, slot.blindDuration ?? 2000, attacker);
        if (slot.appliesBriar) this.applyBriar(defender, slot.appliesBriar, slot.briarDuration ?? 4000, attacker);
      }
    };

    // Cyan projectile for slow
    this.fireProjectileOrMelee(attacker, defender, damage, isAlly, label, slot.isSignature, false,
      onHit, undefined, 0x44cccc, 1, 0x44cccc);
  }

  /** Taunt: force nearby enemies to target this unit. */
  private executeTaunt(caster: CombatUnit, slot: MoveSlot): void {
    const duration = slot.duration ?? 4000;
    const time = this.scene.time.now;

    // Red pulse ring
    const ring = this.scene.add.circle(caster.sprite.x, caster.sprite.y, 1, 0xff4444, 0).setDepth(250);
    ring.setStrokeStyle(2, 0xff4444, 0.6);
    this.scene.tweens.add({
      targets: ring,
      scale: { from: 1, to: 50 },
      alpha: 0,
      duration: 400,
      onComplete: () => ring.destroy(),
    });

    let taunted = 0;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.sprite.x - caster.sprite.x;
      const dy = enemy.sprite.y - caster.sprite.y;
      if (Math.sqrt(dx * dx + dy * dy) > 50) continue;

      enemy.forcedTarget = caster;
      enemy.forcedTargetExpiry = time + duration;
      taunted++;

      this.showFloatingText(enemy.sprite.x, enemy.sprite.y, 'TAUNT', '#ff6644', 9);
    }

    if (taunted > 0) {
      caster.sprite.setTint(0xff6644);
      this.scene.time.delayedCall(200, () => {
        if (caster.alive) caster.sprite.clearTint();
      });
    }

    // Self-buff while taunting (Shell Guard / Stone Bash defense boost etc.)
    this.applySelfBuffFromSlot(caster, slot);

    // Knockback immunity for the taunt duration (Stone Bash)
    if (slot.grantsKnockbackImmunity) {
      caster.knockbackImmuneUntil = this.scene.time.now + (slot.duration ?? 4000);
    }

    // Damage reduction for a shorter window (Iron Curl)
    if (slot.grantsDamageReduction) {
      caster.damageReductionAmount = slot.grantsDamageReduction;
      caster.damageReductionUntil = this.scene.time.now + (slot.damageReductionDuration ?? 3000);
      const pct = Math.round(slot.grantsDamageReduction * 100);
      this.showFloatingText(caster.sprite.x, caster.sprite.y, `${pct}% DMG BLOCK`, '#aaaaaa', 9);
      caster.sprite.setTint(0xaaaaaa);
      this.scene.time.delayedCall(200, () => { if (caster.alive) caster.sprite.clearTint(); });
    }
  }

  /** Helper: fire a projectile if ranged, or apply melee hit immediately. */
  private fireProjectileOrMelee(
    attacker: CombatUnit, defender: CombatUnit, damage: number,
    isAlly: boolean, label: string, isSignature: boolean,
    pierce = false, onHitCallback?: () => void, projRadius?: number,
    projColorOverride?: number, speedMult = 1, impactColor?: number,
    originOffsetY = 0,
  ): void {
    const aDist = Phaser.Math.Distance.Between(attacker.sprite.x, attacker.sprite.y, defender.sprite.x, defender.sprite.y);

    const defaultColor = isAlly ? (TYPE_COLORS[attacker.elementType] ?? 0xffcc44) : 0xff4444;
    const projColor = projColorOverride ?? defaultColor;
    const hitColor = impactColor ?? projColor;

    if (aDist > 40) {
      const radius = projRadius ?? (isSignature ? 5 : 3);
      const proj = this.scene.add.circle(attacker.sprite.x, attacker.sprite.y + originOffsetY, radius, projColor).setDepth(250);

      // Pierce projectiles leave a fading trail
      if (pierce) {
        proj.setAlpha(0.9);
        const trail = this.scene.time.addEvent({
          delay: 30,
          repeat: 6,
          callback: () => {
            const dot = this.scene.add.circle(proj.x, proj.y, 1.5, projColor, 0.4).setDepth(249);
            this.scene.tweens.add({ targets: dot, alpha: 0, duration: 150, onComplete: () => dot.destroy() });
          },
        });
        // Store for cleanup
        proj.setData('trail', trail);
      }

      this.scene.tweens.add({
        targets: proj,
        x: defender.sprite.x,
        y: defender.sprite.y,
        duration: Math.min(200, aDist * 2) * speedMult,
        onComplete: () => {
          const trailEvent = proj.getData('trail') as Phaser.Time.TimerEvent | undefined;
          if (trailEvent) trailEvent.destroy();
          proj.destroy();
          this.spawnImpactFlash(defender.sprite.x, defender.sprite.y, hitColor, isSignature);
          this.applyHit(attacker, defender, damage, isAlly, label, pierce);
          onHitCallback?.();
        },
      });
      return;
    }

    // Melee: show impact flash at defender
    this.spawnImpactFlash(defender.sprite.x, defender.sprite.y, hitColor, isSignature);
    this.applyHit(attacker, defender, damage, isAlly, label, pierce);
    onHitCallback?.();
  }

  /** Brief expanding circle at impact point + scattered spark dots. */
  private spawnImpactFlash(x: number, y: number, color: number, large = false): void {
    const size = large ? 8 : 5;
    const flash = this.scene.add.circle(x, y, size, color, 0.5).setDepth(260);
    this.scene.tweens.add({
      targets: flash,
      scale: { from: 1, to: 2 },
      alpha: 0,
      duration: 150,
      onComplete: () => flash.destroy(),
    });

    // Hit spark scatter — 3-4 small dots fly outward and fade
    const sparkCount = large ? 5 : 3;
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 18 + Math.random() * 22;
      const spark = this.scene.add.circle(x, y, 2, color, 0.8).setDepth(259);
      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        duration: 180 + Math.random() * 80,
        ease: 'Cubic.Out',
        onComplete: () => spark.destroy(),
      });
    }
  }

  /** Helper: show floating text that drifts up and fades. */
  private showFloatingText(x: number, y: number, text: string, color: string, fontSize: number): void {
    const xJitter = (Math.random() - 0.5) * 24;
    const t = this.scene.add
      .text(x + xJitter, y - 20, text, {
        fontFamily: 'monospace',
        fontSize: `${fontSize}px`,
        color,
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(300);
    this.scene.tweens.add({
      targets: t,
      y: t.y - 16,
      alpha: 0,
      duration: 600,
      onComplete: () => t.destroy(),
    });
  }

  /** Shared hit application: evasion check, defense reduction, crit, flash, knockback, damage number, kill check. */
  private applyHit(attacker: CombatUnit, defender: CombatUnit, baseDamage: number, isAllyAttacker: boolean, label: string, pierce = false): void {
    // Skip if either unit is dead — sprite body may already be destroyed
    if (!defender.alive || !attacker.alive) return;

    // Phase immunity — defender cannot be hit while phasing
    if (this.scene.time.now < defender.phaseUntil) return;

    // Blind check: attacker may miss regardless of target evasion
    if (attacker.blindMissChance > 0 && Math.random() * 100 < attacker.blindMissChance) {
      this.showFloatingText(attacker.sprite.x, attacker.sprite.y, 'MISS', '#ffffaa', 9);
      return;
    }

    // Evasion check
    if (defender.evasion > 0 && Math.random() * 100 < defender.evasion) {
      const xJitter = (Math.random() - 0.5) * 24;
      const missText = this.scene.add
        .text(defender.sprite.x + xJitter, defender.sprite.y - 20, 'MISS', {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#aaaaaa',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setDepth(300);
      this.scene.tweens.add({
        targets: missText,
        y: missText.y - 16,
        alpha: 0,
        duration: 600,
        onComplete: () => missText.destroy(),
      });
      return;
    }

    // Defense reduction (minimum 1 damage) — pierce ignores defense
    let damage = pierce ? Math.max(1, baseDamage) : Math.max(1, baseDamage - defender.defense);

    // Critical hit check
    let isCrit = false;
    if (attacker.critRate > 0 && Math.random() * 100 < attacker.critRate) {
      damage = Math.floor(damage * 1.5);
      isCrit = true;
    }

    // Role passive: attacker damage multipliers (Striker high-HP bonus, Hunter range bonus)
    const atkMult = getAttackerDamageMultiplier(
      attacker.role,
      defender.hp / Math.max(1, defender.maxHp),
      defender.attackRange,
    );
    if (atkMult !== 1) damage = Math.max(1, Math.floor(damage * atkMult));

    // Role passive: Vanguard incoming damage reduction
    const vgDR = getRoleDamageReduction(defender.role);
    if (vgDR > 0) damage = Math.max(1, Math.floor(damage * (1 - vgDR)));

    // Damage reduction (Iron Curl)
    if (defender.damageReductionAmount > 0 && this.scene.time.now < defender.damageReductionUntil) {
      damage = Math.max(1, Math.floor(damage * (1 - defender.damageReductionAmount)));
    }

    // Hunter's Mark amplification — all sources deal bonus damage to marked targets
    if (defender.markedDamageBonus > 0 && this.scene.time.now < defender.markedUntil) {
      damage = Math.max(1, Math.floor(damage * (1 + defender.markedDamageBonus)));
    }

    defender.hp = Math.max(0, defender.hp - damage);

    // Role passive: Skirmisher lifesteal
    const lifesteal = getRoleLifestealRatio(attacker.role);
    if (lifesteal > 0 && attacker.alive) {
      const heal = Math.max(1, Math.floor(damage * lifesteal));
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
    }

    // Flash red (crits flash orange)
    defender.sprite.setTint(isCrit ? 0xff8800 : 0xff4444);
    this.scene.time.delayedCall(120, () => {
      if (defender.alive) defender.sprite.clearTint();
    });

    // Attacker confirmation flash — brief element-color tint so the hit feels responsive
    const attackerColor = TYPE_COLORS[attacker.elementType] ?? 0xffffff;
    attacker.sprite.setTint(attackerColor);
    this.scene.time.delayedCall(80, () => { if (attacker.alive) attacker.sprite.clearTint(); });

    // Thorns: if defender has an active shield with thorns, reflect damage back
    const thornsEffect = defender.statusEffects.find((e) => e.thornsAmount && e.thornsAmount > 0);
    if (thornsEffect && attacker.alive) {
      const thornsDmg = thornsEffect.thornsAmount!;
      attacker.hp = Math.max(0, attacker.hp - thornsDmg);
      this.showFloatingText(attacker.sprite.x, attacker.sprite.y, `-${thornsDmg}`, '#ff6600', 9);
      attacker.sprite.setTint(0xff6600);
      this.scene.time.delayedCall(80, () => { if (attacker.alive) attacker.sprite.clearTint(); });
      if (attacker.hp <= 0) this.killUnit(attacker);
    }

    // Briar: attacker takes damage for attacking while briar'd
    if (attacker.briarDamage > 0 && this.scene.time.now < attacker.briarExpiresAt && attacker.alive) {
      attacker.hp = Math.max(0, attacker.hp - attacker.briarDamage);
      this.showFloatingText(attacker.sprite.x, attacker.sprite.y, `-${attacker.briarDamage}`, '#44cc44', 9);
      attacker.sprite.setTint(0x44cc44);
      this.scene.time.delayedCall(80, () => { if (attacker.alive) attacker.sprite.clearTint(); });
      if (attacker.hp <= 0) this.killUnit(attacker);
    }

    // Knockback (crits knock back harder) — skipped if defender is knockback immune
    if (this.scene.time.now >= defender.knockbackImmuneUntil) {
      const dx = defender.sprite.x - attacker.sprite.x;
      const dy = defender.sprite.y - attacker.sprite.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const knockForce = isCrit ? 50 : 30;
      defender.sprite.setVelocity((dx / dist) * knockForce, (dy / dist) * knockForce);
      this.scene.time.delayedCall(100, () => {
        if (defender.alive) defender.sprite.setVelocity(0, 0);
      });
    }

    // Damage number — offset randomly to avoid stacking
    const isAllyDefender = this.allies.includes(defender);
    const xJitter = (Math.random() - 0.5) * 24;
    const critPrefix = isCrit ? 'CRIT! ' : '';
    const displayLabel = `${critPrefix}${label.replace(/-\d+/, `-${damage}`)}`;
    const dmgColor = isCrit ? '#ff8800' : isAllyAttacker ? '#ffcc44' : '#ff4444';
    const dmgText = this.scene.add
      .text(defender.sprite.x + xJitter, defender.sprite.y - 20, displayLabel, {
        fontFamily: 'monospace',
        fontSize: isCrit ? '12px' : isAllyDefender && !isAllyAttacker ? '11px' : '10px',
        color: dmgColor,
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(300);

    this.scene.tweens.add({
      targets: dmgText,
      y: dmgText.y - 16,
      alpha: 0,
      duration: 600,
      onComplete: () => dmgText.destroy(),
    });

    if (defender.hp <= 0) {
      this.killUnit(defender);
    }
  }

  // --- Selection API (for CombatHUD) ---

  get selectedAllyIndex(): number {
    return this._selectedAllyIndex;
  }

  get allyCount(): number {
    return this.allies.length;
  }

  cycleSelection(dir: 1 | -1): void {
    if (this.allies.length === 0) return;
    // Find next alive ally in the given direction
    let idx = this._selectedAllyIndex;
    for (let i = 0; i < this.allies.length; i++) {
      idx = (idx + dir + this.allies.length) % this.allies.length;
      if (this.allies[idx].alive) {
        this._selectedAllyIndex = idx;
        return;
      }
    }
  }

  selectAllyBySprite(sprite: Phaser.Physics.Arcade.Sprite): boolean {
    for (let i = 0; i < this.allies.length; i++) {
      if (this.allies[i].sprite === sprite && this.allies[i].alive) {
        this._selectedAllyIndex = i;
        return true;
      }
    }
    return false;
  }

  getSelectedAlly(): CombatUnit | null {
    const ally = this.allies[this._selectedAllyIndex];
    return ally?.alive ? ally : null;
  }

  getAlly(index: number): CombatUnit | null {
    return this.allies[index] ?? null;
  }

  /** Get cooldown progress (0 = ready, 1 = just used) for a move slot on the selected ally. */
  getMoveCooldownRatio(allyIndex: number, slotIndex: number, time: number): number {
    const ally = this.allies[allyIndex];
    if (!ally?.moveSlots?.[slotIndex]) return 0;
    const slot = ally.moveSlots[slotIndex];
    const elapsed = time - slot.lastUsedTime;
    if (elapsed >= slot.cooldownMs) return 0;
    return 1 - elapsed / slot.cooldownMs;
  }

  // --- Player Command API ---

  /**
   * Focus Target — mark an enemy so all allies prioritize it.
   * Pass null to clear.
   */
  setFocusTarget(worldX: number, worldY: number): boolean {
    if (!this.active) return false;
    let bestDist = 30;
    let best: CombatUnit | null = null;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.sprite.x - worldX;
      const dy = enemy.sprite.y - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = enemy;
      }
    }
    this._focusTarget = best;
    this.updateFocusRing();
    return best !== null;
  }

  clearFocusTarget(): void {
    this._focusTarget = null;
    this.updateFocusRing();
  }

  get focusTarget(): CombatUnit | null {
    return this._focusTarget;
  }

  private updateFocusRing(): void {
    this.focusRing?.destroy();
    this.focusRing = undefined;
    if (!this._focusTarget?.alive) return;
    this.focusRing = this.scene.add.graphics().setDepth(199);
  }

  private drawFocusRing(): void {
    if (!this.focusRing || !this._focusTarget?.alive) {
      this.focusRing?.destroy();
      this.focusRing = undefined;
      this._focusTarget = null;
      return;
    }
    this.focusRing.clear();
    const t = this._focusTarget;
    this.focusRing.lineStyle(1.5, 0xff4444, 0.9);
    this.focusRing.strokeCircle(t.sprite.x, t.sprite.y, 14);
    // Pulsing inner ring
    const pulse = 0.5 + 0.5 * Math.sin(this.scene.time.now * 0.006);
    this.focusRing.lineStyle(1, 0xff6666, pulse * 0.6);
    this.focusRing.strokeCircle(t.sprite.x, t.sprite.y, 17);
  }

  /**
   * Set the stance on the ally at the given index (matches DungeonScene's
   * selectedIndex, not the internal `_selectedAllyIndex`). Writes through to
   * the PartyRiftling so the stance persists across rooms.
   */
  setStanceForIndex(index: number, stance: Stance): boolean {
    if (!this.active) return false;
    const ally = this.allies[index];
    if (!ally || !ally.alive) return false;
    this.assignStance(ally, stance);
    return true;
  }

  /**
   * Set the stance on every living ally. Used for the shift+key "whole squad"
   * shortcut.
   */
  setAllStances(stance: Stance): void {
    if (!this.active) return;
    for (const ally of this.allies) {
      if (!ally.alive) continue;
      this.assignStance(ally, stance);
    }
  }

  private assignStance(ally: CombatUnit, stance: Stance): void {
    ally.stance = stance;
    if (ally.sourceData) ally.sourceData.stance = stance;
    if (stance === 'hold') {
      ally.holdAnchorX = ally.sprite.x;
      ally.holdAnchorY = ally.sprite.y;
    } else {
      ally.holdAnchorX = undefined;
      ally.holdAnchorY = undefined;
    }
  }

  /** Get the stance of the ally at the given index, or 'push' as a default. */
  getStanceForIndex(index: number): Stance {
    return this.allies[index]?.stance ?? 'push';
  }

  /**
   * Compute ally formation — spread out slightly from their current positions
   * on the player's side of the room.
   */
  private computeAllyFormation(
    companions: CompanionEntry[],
    roomW: number,
    roomH: number,
    entrySide: 'north' | 'south' | 'east' | 'west',
  ): { x: number; y: number }[] {
    const count = companions.length;
    const spacing = 32;
    const margin = 32; // keep away from walls

    // Determine the center point on the player's side
    let baseX: number, baseY: number;
    switch (entrySide) {
      case 'south':
        baseX = roomW / 2;
        baseY = roomH * 0.75;
        break;
      case 'north':
        baseX = roomW / 2;
        baseY = roomH * 0.25;
        break;
      case 'west':
        baseX = roomW * 0.25;
        baseY = roomH / 2;
        break;
      case 'east':
        baseX = roomW * 0.75;
        baseY = roomH / 2;
        break;
    }

    const targets: { x: number; y: number }[] = [];
    const isHorizontalSplit = entrySide === 'north' || entrySide === 'south';

    if (isHorizontalSplit) {
      // Spread allies horizontally
      const totalWidth = (count - 1) * spacing;
      const startX = baseX - totalWidth / 2;
      for (let i = 0; i < count; i++) {
        targets.push({
          x: Math.max(margin, Math.min(roomW - margin, startX + i * spacing)),
          y: baseY,
        });
      }
    } else {
      // Spread allies vertically
      const totalHeight = (count - 1) * spacing;
      const startY = baseY - totalHeight / 2;
      for (let i = 0; i < count; i++) {
        targets.push({
          x: baseX,
          y: Math.max(margin, Math.min(roomH - margin, startY + i * spacing)),
        });
      }
    }
    return targets;
  }

  /**
   * Scatter enemies randomly across the far half of the room (opposite the entry side).
   */
  private computeEnemyScatter(
    count: number,
    roomW: number,
    roomH: number,
    entrySide: 'north' | 'south' | 'east' | 'west',
  ): { x: number; y: number }[] {
    const margin = 32;
    // Define the enemy half bounds
    let minX: number, maxX: number, minY: number, maxY: number;
    switch (entrySide) {
      case 'south': // enemies in top half
        minX = margin; maxX = roomW - margin;
        minY = margin; maxY = roomH * 0.45;
        break;
      case 'north': // enemies in bottom half
        minX = margin; maxX = roomW - margin;
        minY = roomH * 0.55; maxY = roomH - margin;
        break;
      case 'west': // enemies in right half
        minX = roomW * 0.55; maxX = roomW - margin;
        minY = margin; maxY = roomH - margin;
        break;
      case 'east': // enemies in left half
        minX = margin; maxX = roomW * 0.45;
        minY = margin; maxY = roomH - margin;
        break;
    }

    const targets: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const raw = {
        x: minX + Math.random() * (maxX - minX),
        y: minY + Math.random() * (maxY - minY),
      };
      // Snap to a walkable tile so enemies never spawn inside a wall or
      // behind a decoration collider they can't path out of.
      targets.push(this.nav ? this.nav.snapToWalkable(raw.x, raw.y) : raw);
    }
    return targets;
  }

  /**
   * Setup phase tick. Allies and enemies are teleported to formation up
   * front, so this just idles their velocity, redraws the drag ghost, and
   * commits combat when the timer expires. The timeout is held while the
   * player is actively dragging so a mid-drag auto-start can't happen.
   */
  private updateSetupPhase(time: number): void {
    for (let i = 0; i < this.allies.length; i++) {
      if (i === this.draggingIndex) continue;
      const ally = this.allies[i];
      if (ally.alive) {
        ally.sprite.setVelocity(0, 0);
        stopWalkAnim(ally.sprite, ally.texturePrefix, this.unitLastDir.get(ally) ?? 'south');
      }
    }
    for (const enemy of this.enemies) {
      if (enemy.alive) {
        enemy.sprite.setVelocity(0, 0);
        stopWalkAnim(enemy.sprite, enemy.texturePrefix, this.unitLastDir.get(enemy) ?? 'south');
      }
    }

    this.drawDragGhost();

    if (this.setupTutorialPending) {
      this.setupStartTime = time;
      this.updateSetupBanner(SETUP_TIMEOUT_MS);
      return;
    }

    if (this.draggingIndex !== null) {
      // Hold the clock while the player is mid-drag.
      this.setupStartTime = time - Math.min(time - this.setupStartTime, SETUP_TIMEOUT_MS - 1);
      this.updateSetupBanner(SETUP_TIMEOUT_MS);
      return;
    }

    const elapsed = time - this.setupStartTime;
    this.updateSetupBanner(Math.max(0, SETUP_TIMEOUT_MS - elapsed));
    if (elapsed >= SETUP_TIMEOUT_MS) {
      this.beginCombat();
    }
  }

  private updateSetupBanner(remainingMs: number): void {
    if (!this.setupBanner) return;
    const secs = Math.ceil(remainingMs / 1000);
    this.setupBanner.setText(`PREP PHASE — drag to position   ${secs}s`);
  }

  // --- Drag-and-drop setup API ---

  /** True while the player is mid-drag on an ally. */
  get isDraggingSetup(): boolean {
    return this.draggingIndex !== null;
  }

  /**
   * Attempt to grab an ally at the given world-space point. Only succeeds
   * during the setup phase, when no drag is in progress, and when a living
   * ally sprite is within `DRAG_GRAB_RADIUS`. Returns true on success.
   */
  tryStartDrag(worldX: number, worldY: number): boolean {
    if (!this.setupPhase || this.draggingIndex !== null) return false;
    let bestDist = DRAG_GRAB_RADIUS;
    let bestIndex = -1;
    for (let i = 0; i < this.allies.length; i++) {
      const ally = this.allies[i];
      if (!ally.alive) continue;
      const dx = ally.sprite.x - worldX;
      const dy = ally.sprite.y - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) return false;
    this.draggingIndex = bestIndex;
    this.dragGhost?.destroy();
    this.dragGhost = this.scene.add.graphics().setDepth(250);
    return true;
  }

  /** Move the dragged ally's sprite to follow the pointer. */
  updateDrag(worldX: number, worldY: number): void {
    if (this.draggingIndex === null) return;
    const ally = this.allies[this.draggingIndex];
    if (!ally?.alive) {
      this.cancelDrag();
      return;
    }
    ally.sprite.setPosition(worldX, worldY);
    ally.sprite.setVelocity(0, 0);
  }

  /**
   * Drop the held ally. If the drop lands on another ally's slot, swap the
   * two. If the drop lands on an invalid tile (wall, out of bounds, enemy
   * overlap), snap to the nearest valid walkable tile.
   */
  endDrag(): void {
    if (this.draggingIndex === null) return;
    const idx = this.draggingIndex;
    const ally = this.allies[idx];
    this.draggingIndex = null;
    this.dragGhost?.destroy();
    this.dragGhost = undefined;
    if (!ally?.alive) return;

    const dropX = ally.sprite.x;
    const dropY = ally.sprite.y;

    // Swap with another ally if the drop is close to their current slot.
    for (let j = 0; j < this.allies.length; j++) {
      if (j === idx) continue;
      const other = this.allies[j];
      if (!other.alive) continue;
      const ox = this.formationTargets[j]?.x ?? other.sprite.x;
      const oy = this.formationTargets[j]?.y ?? other.sprite.y;
      const dx = ox - dropX;
      const dy = oy - dropY;
      if (dx * dx + dy * dy < DRAG_SWAP_RADIUS * DRAG_SWAP_RADIUS) {
        const prevSelf = this.formationTargets[idx];
        this.formationTargets[idx] = { x: ox, y: oy };
        this.formationTargets[j] = prevSelf;
        ally.sprite.setPosition(ox, oy);
        other.sprite.setPosition(prevSelf.x, prevSelf.y);
        return;
      }
    }

    // No swap — validate and snap if needed.
    let finalX = dropX;
    let finalY = dropY;
    if (!this.isFormationSlotValid(finalX, finalY)) {
      if (this.nav) {
        const snapped = this.nav.snapToWalkable(finalX, finalY);
        finalX = snapped.x;
        finalY = snapped.y;
      }
      if (!this.isFormationSlotValid(finalX, finalY)) {
        // Still invalid — revert to the previous formation slot.
        const prev = this.formationTargets[idx];
        finalX = prev.x;
        finalY = prev.y;
      }
    }
    this.formationTargets[idx] = { x: finalX, y: finalY };
    ally.sprite.setPosition(finalX, finalY);
  }

  private cancelDrag(): void {
    this.draggingIndex = null;
    this.dragGhost?.destroy();
    this.dragGhost = undefined;
  }

  /** Ghost outline + slot markers to telegraph drag state. */
  private drawDragGhost(): void {
    if (!this.dragGhost) return;
    this.dragGhost.clear();
    if (this.draggingIndex === null) return;
    const ally = this.allies[this.draggingIndex];
    if (!ally?.alive) return;
    const valid = this.isFormationSlotValid(ally.sprite.x, ally.sprite.y);
    const color = valid ? 0x44ff88 : 0xff4444;
    this.dragGhost.lineStyle(1.5, color, 0.9);
    this.dragGhost.strokeCircle(ally.sprite.x, ally.sprite.y, 14);
    this.dragGhost.lineStyle(1, color, 0.4);
    this.dragGhost.strokeCircle(ally.sprite.x, ally.sprite.y, 18);
  }

  /** Walk a set of units toward their target positions. Returns true if all have arrived. */
  private walkUnitsToTargets(units: CombatUnit[], targets: { x: number; y: number }[]): boolean {
    let allArrived = true;
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      if (!unit.alive) continue;
      const target = targets[i];
      if (!target) continue;

      const dx = target.x - unit.sprite.x;
      const dy = target.y - unit.sprite.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > SETUP_ARRIVE_DIST) {
        allArrived = false;
        const vx = (dx / dist) * SETUP_WALK_SPEED;
        const vy = (dy / dist) * SETUP_WALK_SPEED;
        unit.sprite.setVelocity(vx, vy);
        const dir = this.getDirection(vx, vy);
        this.unitLastDir.set(unit, dir);
        playWalkOrStatic(unit.sprite, unit.texturePrefix, dir, this.scene.anims);
      } else {
        unit.sprite.setVelocity(0, 0);
        stopWalkAnim(unit.sprite, unit.texturePrefix, this.unitLastDir.get(unit) ?? 'south');
      }
    }
    return allArrived;
  }

  /**
   * Transition from setup phase to live combat with a "FIGHT!" flash.
   */
  private beginCombat(): void {
    this.setupPhase = false;
    this.cancelDrag();
    this.destroySetupVisuals();

    // Persist the final formation so the next fight restores it.
    if (this.onFormationSaved && this.entryBasis) {
      const offsets: FormationOffset[] = this.formationTargets.map((t) =>
        this.worldToOffset(t.x, t.y),
      );
      this.onFormationSaved(offsets);
    }

    for (const ally of this.allies) {
      if (ally.alive) ally.sprite.setVelocity(0, 0);
    }
    for (const enemy of this.enemies) {
      if (enemy.alive) enemy.sprite.setVelocity(0, 0);
    }

    // "FIGHT!" text
    const cam = this.scene.cameras.main;
    const fightText = this.scene.add
      .text(cam.scrollX + cam.width / 2, cam.scrollY + cam.height / 2, 'FIGHT!', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffcc44',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(500)
      .setScrollFactor(0);

    this.scene.tweens.add({
      targets: fightText,
      alpha: 0,
      scale: 2,
      duration: 800,
      onComplete: () => fightText.destroy(),
    });
  }

  /**
   * Compute a separation velocity offset so same-team units don't overlap.
   * Returns {vx, vy} to add to the unit's current velocity.
   */
  private getSeparation(unit: CombatUnit, team: CombatUnit[]): { vx: number; vy: number } {
    let pushX = 0;
    let pushY = 0;
    for (const other of team) {
      if (other === unit || !other.alive) continue;
      const dx = unit.sprite.x - other.sprite.x;
      const dy = unit.sprite.y - other.sprite.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < SEPARATION_RADIUS && dist > 0.1) {
        // Stronger push the closer they are
        const strength = (SEPARATION_RADIUS - dist) / SEPARATION_RADIUS;
        pushX += (dx / dist) * SEPARATION_FORCE * strength;
        pushY += (dy / dist) * SEPARATION_FORCE * strength;
      } else if (dist <= 0.1) {
        // Exactly overlapping — push in a random direction
        const angle = Math.random() * Math.PI * 2;
        pushX += Math.cos(angle) * SEPARATION_FORCE;
        pushY += Math.sin(angle) * SEPARATION_FORCE;
      }
    }
    return { vx: pushX, vy: pushY };
  }

  private drawHpBar(unit: CombatUnit, isAlly: boolean): void {
    const gfx = unit.hpBar;
    gfx.clear();
    if (!unit.alive) return;

    const x = unit.sprite.x - HP_BAR_WIDTH / 2;
    const y = unit.sprite.y + HP_BAR_OFFSET_Y;
    const ratio = unit.hp / unit.maxHp;

    // Border tint distinguishes friend (dark) from foe (red-tinted)
    gfx.fillStyle(isAlly ? 0x000000 : 0x661111, isAlly ? 0.6 : 0.85);
    gfx.fillRect(x - 1, y - 1, HP_BAR_WIDTH + 2, HP_BAR_HEIGHT + 2);

    // Allies: ratio-based color (green → yellow → red HP warning).
    // Enemies: always solid threat-red so they're unambiguous at a glance.
    const color = isAlly
      ? (ratio > 0.5 ? 0x44cc44 : ratio > 0.25 ? 0xccaa22 : 0xcc3333)
      : 0xcc3333;
    gfx.fillStyle(color);
    gfx.fillRect(x, y, HP_BAR_WIDTH * ratio, HP_BAR_HEIGHT);

    // Ignite indicator — pulsing orange dot above the HP bar, sized by stack count
    if (unit.igniteStacks > 0) {
      const pulse = 0.55 + 0.45 * Math.sin(this.scene.time.now * 0.008);
      const dotRadius = Math.min(1 + unit.igniteStacks * 0.25, 4);
      gfx.fillStyle(0xff6600, pulse);
      gfx.fillCircle(unit.sprite.x - 5, y - 4, dotRadius);
    }

    // Blind indicator — pulsing white-yellow dot
    if (unit.blindMissChance > 0) {
      const pulse = 0.55 + 0.45 * Math.sin(this.scene.time.now * 0.008 + 1.5);
      gfx.fillStyle(0xffffcc, pulse);
      gfx.fillCircle(unit.sprite.x + 5, y - 4, 2.5);
    }

    // Briar indicator — pulsing green dot
    if (unit.briarDamage > 0 && this.scene.time.now < unit.briarExpiresAt) {
      const pulse = 0.55 + 0.45 * Math.sin(this.scene.time.now * 0.008 + 3.0);
      gfx.fillStyle(0x44cc44, pulse);
      gfx.fillCircle(unit.sprite.x + 13, y - 4, 2.5);
    }

    // Damage reduction indicator — pulsing grey dot (Iron Curl)
    if (unit.damageReductionAmount > 0 && this.scene.time.now < unit.damageReductionUntil) {
      const pulse = 0.55 + 0.45 * Math.sin(this.scene.time.now * 0.008 + 4.5);
      gfx.fillStyle(0xaaaaaa, pulse);
      gfx.fillCircle(unit.sprite.x - 13, y - 4, 2.5);
    }

    // Hunter's Mark indicator — pulsing dark purple dot
    if (unit.markedDamageBonus > 0 && this.scene.time.now < unit.markedUntil) {
      const pulse = 0.55 + 0.45 * Math.sin(this.scene.time.now * 0.008 + 6.0);
      gfx.fillStyle(0x9933cc, pulse);
      gfx.fillCircle(unit.sprite.x, y - 9, 2.5);
    }
  }

  private getDirection(vx: number, vy: number): string {
    return directionFromVelocity(vx, vy);
  }

  destroy(): void {
    this.destroySetupVisuals();
    if (this.regenTimer) {
      this.regenTimer.destroy();
      this.regenTimer = undefined;
    }
    if (this.roleRegenTimer) {
      this.roleRegenTimer.destroy();
      this.roleRegenTimer = undefined;
    }
    if (this.supportAuraTimer) {
      this.supportAuraTimer.destroy();
      this.supportAuraTimer = undefined;
    }
    for (const enemy of this.enemies) {
      if (enemy.alive) {
        enemy.sprite.destroy();
      }
      enemy.hpBar.destroy();
    }
    this.enemies = [];
    for (const ally of this.allies) {
      ally.hpBar.destroy();
    }
    this.allies = [];
    this.active = false;
  }
}
