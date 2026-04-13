/**
 * Party system — tracks the player's riftling team and bench.
 *
 * All balance numbers are centralized here so they're easy to tune.
 * The party persists within a run but resets between runs.
 */

export type Role = 'chaser' | 'anchor' | 'skirmisher' | 'hunter';

// --- Base stat ranges ---

/** Min/max range for a single stat at level 1. */
export interface StatRange { min: number; max: number; }

/**
 * Per-species stat ranges rolled at riftling creation.
 * attackSpeed: lower = faster attacks, so min is the fastest possible.
 */
export interface BaseStatRanges {
  hp:          StatRange;
  attack:      StatRange;
  defense:     StatRange;
  speed:       StatRange;
  attackSpeed: StatRange;
  critRate:    StatRange;
  evasion:     StatRange;
}

// --- Temperament system ---

/** Stat key used for temperament boost/reduce mapping. */
export type StatKey = 'hp' | 'attack' | 'defense' | 'speed' | 'attackSpeed' | 'critRate' | 'evasion';

export interface Temperament {
  name: string;
  /** Stat that gets a guaranteed bonus every level-up (null = neutral). */
  boosted: StatKey | null;
  /** Stat that never gains on level-up (null = neutral). */
  reduced: StatKey | null;
  description: string;
}

export const TEMPERAMENTS: Temperament[] = [
  { name: 'Fierce',     boosted: 'attack',      reduced: 'defense',    description: 'All-in aggression' },
  { name: 'Stalwart',   boosted: 'defense',      reduced: 'speed',      description: 'Immovable wall' },
  { name: 'Swift',       boosted: 'speed',        reduced: 'attack',     description: 'Fast but hits lighter' },
  { name: 'Keen',         boosted: 'critRate',     reduced: 'hp',         description: 'Precision hunter' },
  { name: 'Elusive',     boosted: 'evasion',      reduced: 'attack',     description: 'Hard to pin down' },
  { name: 'Relentless', boosted: 'attackSpeed', reduced: 'defense',    description: 'Rapid-fire attacks' },
  { name: 'Hardy',       boosted: 'hp',           reduced: 'critRate',   description: 'Built to endure' },
  { name: 'Balanced',   boosted: null,           reduced: null,         description: 'No particular leaning' },
];

/** Pick a random temperament. */
export function randomTemperament(): Temperament {
  return TEMPERAMENTS[Math.floor(Math.random() * TEMPERAMENTS.length)];
}

export type MoveKind =
  | 'strike' | 'blast' | 'pierce' | 'barrage' | 'beam' | 'spin' | 'leap'
  | 'heal' | 'shield' | 'rally_buff'
  | 'drain' | 'slow' | 'taunt';

export interface Move {
  name: string;
  power: number;
  cooldown: number;
  description: string;
  isSignature: boolean;
  kind: MoveKind;
  /** AoE radius in pixels (blast). */
  radius?: number;
  /** Buff/debuff duration in ms (shield, rally_buff, slow, taunt). */
  duration?: number;
  /** Number of targets (barrage). */
  hits?: number;
  /** Heal fraction of damage dealt (drain). */
  drainRatio?: number;
  /** Ignite stacks applied to the target on hit. */
  appliesIgnite?: number;
  /** Bonus damage per ignite stack currently on the target. */
  bonusPerIgnite?: number;
  /** Attacker dashes to behind the target after dealing damage (pierce moves). */
  repositions?: boolean;
  /** Shield/buff targets the caster itself rather than the lowest-HP ally. */
  selfTarget?: boolean;
  /** Damage reflected to the attacker each time the buffed unit is hit (thorns). */
  thornsAmount?: number;
  /** Miss chance (0–100) added to the target as a blind debuff on hit. */
  appliesBlind?: number;
  /** Duration of blind in ms. */
  blindDuration?: number;
  /** Barrage bolts attempt to refract to a second nearby target after the primary hit. */
  refracts?: boolean;
  /** Stat buff applied to the caster after this move fires. */
  selfBuffStat?: 'defense' | 'attack' | 'speed' | 'evasion';
  selfBuffAmount?: number;
  selfBuffDuration?: number;
  /** Stat debuff applied to the target on hit. */
  appliesStatDebuff?: 'defense' | 'attack' | 'speed' | 'evasion';
  debuffAmount?: number;
  debuffDuration?: number;
  /** Pierce dash that travels through a line, hitting every enemy in the path. */
  dashThrough?: boolean;
  /** Pull the target toward the attacker after the hit lands. */
  pullsTarget?: boolean;
  /** Heal kind: if no ally needs healing, heal the caster instead. */
  selfHealFallback?: boolean;
  /** Briar debuff applied to each target hit — they take this much damage when they attack. */
  appliesBriar?: number;
  /** Duration of the briar debuff in ms. */
  briarDuration?: number;
  /** Slow kind: instead of a partial slow, fully root the target (speed → 0, attacks locked). */
  rootTarget?: boolean;
  /** Blast kind: stun all enemies caught in the AoE radius. */
  stunsRadius?: boolean;
  /** Duration of the stun in ms. */
  stunDuration?: number;
  /** Taunt kind: caster becomes immune to knockback for the taunt duration. */
  grantsKnockbackImmunity?: boolean;
  /** Strike kind: adds (attacker.defense × this fraction) to base damage. */
  defenseScaledBonus?: number;
  /** Taunt kind: reduces all incoming damage to caster by this fraction (0–1). */
  grantsDamageReduction?: number;
  /** Duration of the damage reduction in ms. */
  damageReductionDuration?: number;
  /** Drain kind: applies Hunter's Mark to the target — all damage they take is amplified. */
  appliesHuntersMark?: boolean;
  /** Damage amplification while marked (0–1, e.g. 0.25 = 25% bonus). */
  markBonus?: number;
  /** Duration of Hunter's Mark in ms. */
  markDuration?: number;
  /** Pierce/strike kind: bonus damage = floor(missingHP% × this value). */
  executeBonusPct?: number;
  /** Leap kind: blink teleport visual instead of an arc. */
  shadowStep?: boolean;
  /** Leap kind: apply a slow to the target on landing. */
  appliesSlowOnLand?: boolean;
  /** Pierce kind: attacker phases out (untargetable) before striking. */
  phasesBeforeStrike?: boolean;
  /** Spin kind: applies slow to every enemy hit in the radius. */
  appliesSlowToAllHit?: boolean;
}

export interface PartyRiftling {
  name: string;
  texturePrefix: string;
  elementType: string;
  role: Role;
  hp: number;
  maxHp: number;
  attack: number;
  /** Flat damage reduction applied to incoming hits. */
  defense: number;
  speed: number;
  /** Attack speed — lower = faster attacks. Measured in ms between attacks. */
  attackSpeed: number;
  /** Distance in pixels at which this riftling engages. Melee ~28, ranged ~80+. */
  attackRange: number;
  /** Critical hit chance (0–100). Crits deal 1.5× damage. */
  critRate: number;
  /** Evasion chance (0–100). Evaded attacks deal 0 damage. */
  evasion: number;
  moves: Move[];
  /** Indices into `moves` for the two equipped moves. */
  equipped: [number, number];
  /** Current level (starts at 1). */
  level: number;
  /** Current XP toward next level. */
  xp: number;
  /** Temperament — influences stat growth on level-up. */
  temperament: Temperament;
}

/** Riftling templates — base stats for each species */
export const RIFTLING_TEMPLATES: Record<
  string,
  Omit<PartyRiftling, 'hp' | 'equipped' | 'level' | 'xp' | 'temperament'> & { baseStats: BaseStatRanges }
> = {
  emberhound: {
    name: 'Emberhound',
    texturePrefix: 'emberhound',
    elementType: 'fire',
    role: 'chaser',
    maxHp: 80,
    attack: 6,
    defense: 1,
    speed: 75,
    attackSpeed: 700,
    attackRange: 36,
    critRate: 15,
    evasion: 5,
    baseStats: {
      hp:          { min: 70,  max: 92  },
      attack:      { min: 5,   max: 9   },
      defense:     { min: 0,   max: 2   },
      speed:       { min: 68,  max: 83  },
      attackSpeed: { min: 600, max: 820 },
      critRate:    { min: 10,  max: 20  },
      evasion:     { min: 2,   max: 8   },
    },
    moves: [
      { name: 'Ember Strike', power: 5, cooldown: 3, description: 'Quick fiery bite that stacks ignite on the target', isSignature: false, kind: 'strike', appliesIgnite: 2 },
      { name: 'Fire Dash', power: 8, cooldown: 8, description: 'Dashes through the target, repositioning behind it', isSignature: true, kind: 'pierce', repositions: true },
      { name: 'Flame Charge', power: 7, cooldown: 10, description: 'Deals bonus damage for each ignite stack on the target, then drains life', isSignature: false, kind: 'drain', drainRatio: 0.3, bonusPerIgnite: 1.5 },
    ],
  },
  pyreshell: {
    name: 'Pyreshell',
    texturePrefix: 'pyreshell',
    elementType: 'fire',
    role: 'anchor',
    maxHp: 110,
    attack: 4,
    defense: 5,
    speed: 40,
    attackSpeed: 1400,
    attackRange: 44,
    critRate: 3,
    evasion: 0,
    baseStats: {
      hp:          { min: 95,   max: 126  },
      attack:      { min: 3,    max: 6    },
      defense:     { min: 4,    max: 8    },
      speed:       { min: 32,   max: 50   },
      attackSpeed: { min: 1200, max: 1600 },
      critRate:    { min: 1,    max: 5    },
      evasion:     { min: 0,    max: 1    },
    },
    moves: [
      { name: 'Magma Slam', power: 7, cooldown: 5, description: 'Heavy shell-slam that leaves a burning mark on the target', isSignature: false, kind: 'strike', appliesIgnite: 1 },
      { name: 'Eruption', power: 9, cooldown: 20, description: 'Shell erupts in a molten blast, igniting every enemy caught in the radius', isSignature: true, kind: 'blast', radius: 45, appliesIgnite: 3 },
      { name: 'Lava Shield', power: 4, cooldown: 60, description: 'Pyreshell coats itself in molten armor, boosting defense and reflecting hits for 4 seconds', isSignature: false, kind: 'shield', duration: 4000, selfTarget: true, thornsAmount: 2 },
    ],
  },
  solarglare: {
    name: 'Solarglare',
    texturePrefix: 'solarglare',
    elementType: 'light',
    role: 'skirmisher',
    maxHp: 60,
    attack: 5,
    defense: 2,
    speed: 55,
    attackSpeed: 1000,
    attackRange: 110,
    critRate: 10,
    evasion: 12,
    baseStats: {
      hp:          { min: 50,  max: 72   },
      attack:      { min: 4,   max: 7    },
      defense:     { min: 1,   max: 3    },
      speed:       { min: 47,  max: 64   },
      attackSpeed: { min: 840, max: 1160 },
      critRate:    { min: 7,   max: 14   },
      evasion:     { min: 8,   max: 17   },
    },
    moves: [
      { name: 'Light Lance', power: 6, cooldown: 4, description: 'Focused light shot that blinds the target, reducing their accuracy', isSignature: false, kind: 'strike', appliesBlind: 10, blindDuration: 2000, attackAnim: 'attack' },
      { name: 'Solar Flare', power: 10, cooldown: 25, description: 'Fires a sustained beam of light in a straight line, scorching everything in its path for 3 seconds', isSignature: true, kind: 'beam' },
      { name: 'Prism Shot', power: 4, cooldown: 3, description: 'Scatters light bolts that refract to nearby enemies', isSignature: false, kind: 'barrage', hits: 3, refracts: true, attackAnim: 'attack' },
    ],
  },
  lumoth: {
    name: 'Lumoth',
    texturePrefix: 'lumoth',
    elementType: 'light',
    role: 'skirmisher',
    maxHp: 40,
    attack: 7,
    defense: 1,
    speed: 65,
    attackSpeed: 900,
    attackRange: 110,
    critRate: 8,
    evasion: 18,
    baseStats: {
      hp:          { min: 30,  max: 52   },
      attack:      { min: 5,   max: 10   },
      defense:     { min: 0,   max: 2    },
      speed:       { min: 57,  max: 75   },
      attackSpeed: { min: 740, max: 1060 },
      critRate:    { min: 4,   max: 13   },
      evasion:     { min: 13,  max: 24   },
    },
    moves: [
      { name: 'Dust Blast', power: 6, cooldown: 3, description: 'Dust cloud that slows and blinds the target', isSignature: false, kind: 'slow', duration: 3000, appliesBlind: 10, blindDuration: 2000 },
      { name: 'Luminova', power: 11, cooldown: 11, description: 'Intense flash that blinds all enemies in a wide area; Lumoth slips away in the chaos', isSignature: true, kind: 'blast', radius: 70, appliesBlind: 15, blindDuration: 3000, selfBuffStat: 'evasion', selfBuffAmount: 15, selfBuffDuration: 2000 },
      { name: 'Moonbolt', power: 9, cooldown: 6, description: 'A focused bolt of lunar light — reliable ranged damage', isSignature: false, kind: 'strike' },
    ],
  },
  tidecrawler: {
    name: 'Tidecrawler',
    texturePrefix: 'tidecrawler',
    elementType: 'water',
    role: 'anchor',
    maxHp: 100,
    attack: 5,
    defense: 4,
    speed: 35,
    attackSpeed: 1200,
    attackRange: 44,
    critRate: 5,
    evasion: 2,
    baseStats: {
      hp:          { min: 86,   max: 116  },
      attack:      { min: 4,    max: 7    },
      defense:     { min: 3,    max: 6    },
      speed:       { min: 27,   max: 44   },
      attackSpeed: { min: 1000, max: 1400 },
      critRate:    { min: 2,    max: 8    },
      evasion:     { min: 0,    max: 4    },
    },
    moves: [
      { name: 'Claw Crush', power: 6, cooldown: 4, description: 'Crushes the target with pincers, waterlogging and reducing their defense', isSignature: false, kind: 'strike', appliesStatDebuff: 'defense', debuffAmount: 2, debuffDuration: 3000 },
      { name: 'Tidal Spin', power: 10, cooldown: 10, description: 'Spins in a torrent of water, striking all nearby enemies at once', isSignature: true, kind: 'spin', radius: 50 },
      { name: 'Shell Guard', power: 0, cooldown: 8, description: 'Braces for impact — draws all nearby enemy attention and boosts own defense', isSignature: false, kind: 'taunt', duration: 4000, selfBuffStat: 'defense', selfBuffAmount: 3, selfBuffDuration: 4000 },
    ],
  },
  gloomfang: {
    name: 'Gloomfang',
    texturePrefix: 'gloomfang',
    elementType: 'dark',
    role: 'hunter',
    maxHp: 55,
    attack: 9,
    defense: 1,
    speed: 80,
    attackSpeed: 600,
    attackRange: 36,
    critRate: 20,
    evasion: 15,
    baseStats: {
      hp:          { min: 44,  max: 68  },
      attack:      { min: 7,   max: 12  },
      defense:     { min: 0,   max: 2   },
      speed:       { min: 72,  max: 90  },
      attackSpeed: { min: 500, max: 700 },
      critRate:    { min: 15,  max: 26  },
      evasion:     { min: 10,  max: 21  },
    },
    moves: [
      { name: 'Shadow Bite', power: 7, cooldown: 3, description: 'Drains life and marks the target — marked enemies take 25% more damage from all sources', isSignature: false, kind: 'drain', drainRatio: 0.35, appliesHuntersMark: true, markBonus: 0.25, markDuration: 4000 },
      { name: 'Void Rend', power: 12, cooldown: 10, description: 'Tears through armor — devastates wounded targets with execute bonus damage', isSignature: true, kind: 'pierce', executeBonusPct: 0.2 },
      { name: 'Dusk Dash', power: 5, cooldown: 4, description: 'Blinks to the highest-threat backline enemy and slows them on arrival', isSignature: false, kind: 'leap', shadowStep: true, appliesSlowOnLand: true, duration: 2500 },
    ],
  },
  barkbiter: {
    name: 'Barkbiter',
    texturePrefix: 'barkbiter',
    elementType: 'nature',
    role: 'chaser',
    maxHp: 70,
    attack: 7,
    defense: 2,
    speed: 65,
    attackSpeed: 800,
    attackRange: 36,
    critRate: 12,
    evasion: 8,
    baseStats: {
      hp:          { min: 60,  max: 82   },
      attack:      { min: 5,   max: 9    },
      defense:     { min: 1,   max: 4    },
      speed:       { min: 57,  max: 74   },
      attackSpeed: { min: 680, max: 920  },
      critRate:    { min: 8,   max: 17   },
      evasion:     { min: 4,   max: 13   },
    },
    moves: [
      { name: 'Sap Leech', power: 6, cooldown: 5, description: 'Heals the most injured ally; heals self if no ally needs it', isSignature: false, kind: 'heal', selfHealFallback: true },
      { name: 'Thornburst', power: 6, cooldown: 9, description: 'Erupts thorns at multiple enemies — each target takes damage whenever they attack while briar is active', isSignature: true, kind: 'barrage', hits: 3, appliesBriar: 2, briarDuration: 4000 },
      { name: 'Root Snap', power: 6, cooldown: 5, description: 'Snaps a root tendril at the target, dealing damage and pinning them in place', isSignature: false, kind: 'slow', rootTarget: true, duration: 1500 },
    ],
  },
  tremorhorn: {
    name: 'Tremorhorn',
    texturePrefix: 'tremorhorn',
    elementType: 'earth',
    role: 'anchor',
    maxHp: 120,
    attack: 6,
    defense: 6,
    speed: 30,
    attackSpeed: 1500,
    attackRange: 44,
    critRate: 5,
    evasion: 0,
    baseStats: {
      hp:          { min: 104,  max: 138  },
      attack:      { min: 4,    max: 8    },
      defense:     { min: 5,    max: 9    },
      speed:       { min: 23,   max: 38   },
      attackSpeed: { min: 1280, max: 1720 },
      critRate:    { min: 2,    max: 8    },
      evasion:     { min: 0,    max: 1    },
    },
    moves: [
      { name: 'Vine Leech', power: 3, cooldown: 4, description: 'Earthen vines latch onto a nearby target, dealing minimal damage but draining their vitality', isSignature: false, kind: 'drain', drainRatio: 0.7 },
      { name: 'Earthquake', power: 11, cooldown: 12, description: 'Stomps the ground with seismic force, stunning all enemies caught in the blast', isSignature: true, kind: 'blast', radius: 55, stunsRadius: true, stunDuration: 800 },
      { name: 'Stone Bash', power: 5, cooldown: 7, description: 'Bellows a challenge drawing nearby enemies — braces against knockback and reinforces own defense', isSignature: false, kind: 'taunt', duration: 5000, selfBuffStat: 'defense', selfBuffAmount: 5, selfBuffDuration: 5000, grantsKnockbackImmunity: true },
    ],
  },
  hollowcrow: {
    name: 'Hollowcrow',
    texturePrefix: 'hollowcrow',
    elementType: 'dark',
    role: 'skirmisher',
    maxHp: 45,
    attack: 6,
    defense: 1,
    speed: 70,
    attackSpeed: 850,
    attackRange: 100,
    critRate: 14,
    evasion: 20,
    baseStats: {
      hp:          { min: 35,  max: 57   },
      attack:      { min: 4,   max: 8    },
      defense:     { min: 0,   max: 2    },
      speed:       { min: 62,  max: 80   },
      attackSpeed: { min: 720, max: 980  },
      critRate:    { min: 10,  max: 19   },
      evasion:     { min: 15,  max: 26   },
    },
    moves: [
      { name: 'Peck Barrage', power: 4, cooldown: 3, description: 'Rapid aerial strikes that hex each target, reducing their attack power', isSignature: false, kind: 'barrage', hits: 3, appliesStatDebuff: 'attack', debuffAmount: 2, debuffDuration: 3000 },
      { name: 'Phantom Dive', power: 10, cooldown: 10, description: 'Phases into the shadows — untouchable for 0.8s — then strikes with a piercing dive', isSignature: true, kind: 'pierce', phasesBeforeStrike: true },
      { name: 'Hex Screech', power: 5, cooldown: 6, description: 'Unsettling cry that slows and hexes all nearby enemies', isSignature: false, kind: 'spin', radius: 60, appliesSlowToAllHit: true, duration: 3000, appliesStatDebuff: 'attack', debuffAmount: 2, debuffDuration: 3000 },
    ],
  },
  rivelet: {
    name: 'Rivelet',
    texturePrefix: 'rivelet',
    elementType: 'water',
    role: 'chaser',
    maxHp: 65,
    attack: 7,
    defense: 2,
    speed: 78,
    attackSpeed: 650,
    attackRange: 36,
    critRate: 12,
    evasion: 14,
    baseStats: {
      hp:          { min: 54,  max: 78  },
      attack:      { min: 5,   max: 10  },
      defense:     { min: 1,   max: 4   },
      speed:       { min: 69,  max: 88  },
      attackSpeed: { min: 560, max: 760 },
      critRate:    { min: 8,   max: 17  },
      evasion:     { min: 9,   max: 20  },
    },
    moves: [
      { name: 'Crystal Claw', power: 6, cooldown: 3, description: 'Slashes with icy claws, waterlogging and reducing target defense', isSignature: false, kind: 'strike', appliesStatDebuff: 'defense', debuffAmount: 2, debuffDuration: 3000 },
      { name: 'Torrent Rush', power: 10, cooldown: 9, description: 'Surges through enemies in a straight line, waterlogging every target hit', isSignature: true, kind: 'pierce', dashThrough: true, appliesStatDebuff: 'defense', debuffAmount: 2, debuffDuration: 3000 },
      { name: 'Undertow', power: 5, cooldown: 5, description: 'Drains life from the target and yanks them closer', isSignature: false, kind: 'drain', drainRatio: 0.3, pullsTarget: true },
    ],
  },
  grindscale: {
    name: 'Grindscale',
    texturePrefix: 'grindscale',
    elementType: 'earth',
    role: 'anchor',
    maxHp: 115,
    attack: 5,
    defense: 7,
    speed: 28,
    attackSpeed: 1500,
    attackRange: 40,
    critRate: 3,
    evasion: 0,
    baseStats: {
      hp:          { min: 100,  max: 132  },
      attack:      { min: 3,    max: 7    },
      defense:     { min: 5,    max: 10   },
      speed:       { min: 21,   max: 36   },
      attackSpeed: { min: 1280, max: 1720 },
      critRate:    { min: 1,    max: 5    },
      evasion:     { min: 0,    max: 1    },
    },
    moves: [
      { name: 'Scale Slam', power: 5, cooldown: 5, description: 'Whips armored tail — bonus damage scales with own defense stat', isSignature: false, kind: 'strike', defenseScaledBonus: 0.5 },
      { name: 'Stonegrind', power: 11, cooldown: 11, description: 'Curls into a boulder and rolls through enemies in a line, shredding their armor', isSignature: true, kind: 'pierce', dashThrough: true, appliesStatDebuff: 'defense', debuffAmount: 3, debuffDuration: 3000 },
      { name: 'Iron Curl', power: 0, cooldown: 8, description: 'Coils into an armored ball, taunting nearby enemies and reducing all incoming damage by 40% for 3 seconds', isSignature: false, kind: 'taunt', duration: 4000, grantsDamageReduction: 0.4, damageReductionDuration: 3000 },
    ],
  },
  thistlebound: {
    name: 'Thistlebound',
    texturePrefix: 'thistlebound',
    elementType: 'nature',
    role: 'hunter',
    maxHp: 58,
    attack: 6,
    defense: 1,
    speed: 72,
    attackSpeed: 900,
    attackRange: 90,
    critRate: 10,
    evasion: 16,
    baseStats: {
      hp:          { min: 47,  max: 70   },
      attack:      { min: 4,   max: 8    },
      defense:     { min: 0,   max: 2    },
      speed:       { min: 63,  max: 82   },
      attackSpeed: { min: 760, max: 1040 },
      critRate:    { min: 6,   max: 15   },
      evasion:     { min: 11,  max: 22   },
    },
    moves: [
      { name: 'Seed Barrage', power: 5, cooldown: 3, description: 'Volley of sharp seeds that spreads briar across targets', isSignature: false, kind: 'barrage', hits: 3, appliesBriar: 1, briarDuration: 3000, refracts: true },
      { name: 'Predator\'s Leap', power: 8, cooldown: 12, description: 'Leaps to the farthest ranged enemy, landing with a piercing strike that exposes their defenses', isSignature: true, kind: 'leap', appliesStatDebuff: 'evasion', debuffAmount: 5, debuffDuration: 3000 },
      { name: 'Briar Bolt', power: 8, cooldown: 8, description: 'Thorn-wrapped bolt that slows and briar-snares the target', isSignature: false, kind: 'slow', duration: 3000, appliesBriar: 2, briarDuration: 4000 },
    ],
  },
};

/** All riftling keys that have loaded sprites */
export const AVAILABLE_RIFTLINGS = Object.keys(RIFTLING_TEMPLATES);

/** XP required to reach the next level. Scales gently so early levels come fast. */
export function xpForLevel(level: number): number {
  // Level 1→2: 20 XP, Level 2→3: 30, Level 3→4: 42, etc.
  return Math.floor(20 + (level - 1) * 12);
}

/** Max level a riftling can reach in a single run. */
export const MAX_LEVEL = 10;

/** Fraction of XP that benched riftlings receive. */
export const BENCH_XP_RATIO = 0.5;

/** Base XP awarded per enemy kill. Scales with difficulty. */
export const BASE_KILL_XP = 10;

export interface LevelUpResult {
  riftling: PartyRiftling;
  gains: { stat: string; amount: number }[];
}

/**
 * Apply one level's worth of stat gains to a riftling and increment its level.
 * Shared by awardXP (player leveling) and createRiftlingAtLevel (enemy spawning).
 * Returns the stat gains that were applied.
 */
function applyLevelUpGains(riftling: PartyRiftling): { stat: string; amount: number }[] {
  riftling.level++;

  const gains: { stat: string; amount: number }[] = [];
  const boosted = riftling.temperament.boosted;
  const reduced = riftling.temperament.reduced;
  const canGain = (key: StatKey) => reduced !== key;

  // HP always grows (base + temperament bonus)
  const hpBase = 5 + Math.floor(Math.random() * 6);  // +5–10
  const hpBonus = boosted === 'hp' ? 3 : 0;
  const hpGain = canGain('hp') ? hpBase + hpBonus : hpBonus;
  if (hpGain > 0) {
    riftling.maxHp += hpGain;
    riftling.hp = Math.min(riftling.hp + hpGain, riftling.maxHp);
    gains.push({ stat: 'HP', amount: hpGain });
  }

  // ATK — 60% chance of +1
  if (canGain('attack') && Math.random() < 0.6) { riftling.attack += 1; gains.push({ stat: 'ATK', amount: 1 }); }
  if (boosted === 'attack')                       { riftling.attack += 1; gains.push({ stat: 'ATK', amount: 1 }); }

  // DEF — 40% chance of +1
  if (canGain('defense') && Math.random() < 0.4) { riftling.defense += 1; gains.push({ stat: 'DEF', amount: 1 }); }
  if (boosted === 'defense')                      { riftling.defense += 1; gains.push({ stat: 'DEF', amount: 1 }); }

  // SPD — 30% chance of +2
  if (canGain('speed') && Math.random() < 0.3) { riftling.speed += 2; gains.push({ stat: 'SPD', amount: 2 }); }
  if (boosted === 'speed')                      { riftling.speed += 2; gains.push({ stat: 'SPD', amount: 2 }); }

  // ATK SPD — 25% chance to reduce attackSpeed by 20ms (faster attacks)
  if (canGain('attackSpeed') && Math.random() < 0.25 && riftling.attackSpeed > 400) { riftling.attackSpeed -= 20; gains.push({ stat: 'A.SPD', amount: 20 }); }
  if (boosted === 'attackSpeed' && riftling.attackSpeed > 400)                       { riftling.attackSpeed -= 15; gains.push({ stat: 'A.SPD', amount: 15 }); }

  // CRIT — 20% chance of +2, capped at 50
  if (canGain('critRate') && Math.random() < 0.2 && riftling.critRate < 50) { const g = Math.min(2, 50 - riftling.critRate); riftling.critRate += g; gains.push({ stat: 'CRIT', amount: g }); }
  if (boosted === 'critRate' && riftling.critRate < 50)                      { const g = Math.min(2, 50 - riftling.critRate); riftling.critRate += g; gains.push({ stat: 'CRIT', amount: g }); }

  // EVA — 15% chance of +2, capped at 40
  if (canGain('evasion') && Math.random() < 0.15 && riftling.evasion < 40) { const g = Math.min(2, 40 - riftling.evasion); riftling.evasion += g; gains.push({ stat: 'EVA', amount: g }); }
  if (boosted === 'evasion' && riftling.evasion < 40)                       { const g = Math.min(2, 40 - riftling.evasion); riftling.evasion += g; gains.push({ stat: 'EVA', amount: g }); }

  // Boost move power slightly every 3 levels
  if (riftling.level % 3 === 0) {
    for (const move of riftling.moves) move.power += 1;
  }

  return gains;
}

/**
 * Award XP to a riftling and process any level-ups.
 * Returns level-up info if the riftling leveled, null otherwise.
 */
export function awardXP(riftling: PartyRiftling, amount: number): LevelUpResult | null {
  if (riftling.level >= MAX_LEVEL) return null;

  riftling.xp += amount;
  const needed = xpForLevel(riftling.level);

  if (riftling.xp >= needed) {
    riftling.xp -= needed;
    const gains = applyLevelUpGains(riftling);
    return { riftling, gains };
  }

  return null;
}

/**
 * Create a riftling at a specific level by generating a level-1 instance and
 * running the level-up logic the required number of times.
 * Ensures enemy stats are derived from the same base-stat rolls and growth
 * rules as player riftlings — no separate scaling formulas.
 */
export function createRiftlingAtLevel(key: string, targetLevel: number): PartyRiftling {
  const riftling = createRiftling(key);  // level 1, randomized base stats + temperament
  const clampedTarget = Math.max(1, Math.min(MAX_LEVEL, targetLevel));
  for (let l = riftling.level; l < clampedTarget; l++) {
    applyLevelUpGains(riftling);
  }
  riftling.hp = riftling.maxHp;  // enemies always spawn at full HP
  return riftling;
}

// --- Type Synergy system ---

export interface TypeSynergy {
  type: string;
  name: string;
  description: string;
  /** Stat buffs applied to matching CombatUnits at combat start. */
  buffs: Partial<Record<StatKey, number>>;
  /** Special effect key (e.g. 'regen') for effects that aren't simple stat buffs. */
  special?: string;
}

/**
 * Type synergy definitions — activate when 2+ active riftlings share an element type.
 * Bonuses are flat values applied to CombatUnit stats at encounter start.
 */
export const TYPE_SYNERGIES: Record<string, TypeSynergy> = {
  fire:   { type: 'fire',   name: 'Blaze',     description: '+3 Attack',           buffs: { attack: 3 } },
  water:  { type: 'water',  name: 'Tidewall',  description: '+2 Defense',          buffs: { defense: 2 } },
  earth:  { type: 'earth',  name: 'Bedrock',   description: '+15 Max HP',          buffs: { hp: 15 } },
  nature: { type: 'nature', name: 'Overgrowth', description: 'Regen 2 HP/s',       buffs: {}, special: 'regen' },
  light:  { type: 'light',  name: 'Radiance',  description: '+8 Crit Rate',        buffs: { critRate: 8 } },
  dark:   { type: 'dark',   name: 'Eclipse',   description: '+6 Evasion',          buffs: { evasion: 6 } },
};

/** Element type display colors for UI. */
export const TYPE_COLORS: Record<string, number> = {
  fire:   0xff6633,
  water:  0x3399ff,
  earth:  0xbb8844,
  nature: 0x44cc44,
  light:  0xffdd44,
  dark:   0x9966cc,
};

export interface ActiveSynergy {
  synergy: TypeSynergy;
  count: number;
}

/**
 * Compute which type synergies are active from the current active party.
 * A synergy activates at 2+ riftlings of the same element type.
 */
export function getActiveSynergies(active: PartyRiftling[]): ActiveSynergy[] {
  const counts = new Map<string, number>();
  for (const r of active) {
    counts.set(r.elementType, (counts.get(r.elementType) ?? 0) + 1);
  }

  const result: ActiveSynergy[] = [];
  for (const [type, count] of counts) {
    if (count >= 2 && TYPE_SYNERGIES[type]) {
      result.push({ synergy: TYPE_SYNERGIES[type], count });
    }
  }
  return result;
}

/**
 * Compute type counts for the HUD (shows all types present, not just active synergies).
 */
export function getTypeCounts(active: PartyRiftling[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of active) {
    counts.set(r.elementType, (counts.get(r.elementType) ?? 0) + 1);
  }
  return counts;
}

function rollStat(range: StatRange): number {
  return range.min + Math.floor(Math.random() * (range.max - range.min + 1));
}

export function createRiftling(key: string): PartyRiftling {
  const tmpl = RIFTLING_TEMPLATES[key];
  if (!tmpl) throw new Error(`Unknown riftling: ${key}`);
  const r = tmpl.baseStats;
  const maxHp      = rollStat(r.hp);
  const attack     = rollStat(r.attack);
  const defense    = rollStat(r.defense);
  const speed      = rollStat(r.speed);
  const attackSpeed = rollStat(r.attackSpeed);
  const critRate   = rollStat(r.critRate);
  const evasion    = rollStat(r.evasion);
  return {
    ...tmpl,
    maxHp, hp: maxHp,
    attack, defense, speed, attackSpeed, critRate, evasion,
    equipped: [0, 1], level: 1, xp: 0, temperament: randomTemperament(),
  };
}

/** Max active party size */
export const MAX_ACTIVE = 4;

/** Max bench size */
export const MAX_BENCH = 4;

export interface Party {
  active: PartyRiftling[];
  bench: PartyRiftling[];
  trinkets: import('./trinkets').TrinketInventory;
}

export function createStartingParty(starterKey: string = 'emberhound'): Party {
  return {
    active: [createRiftling(starterKey)],
    bench: [],
    trinkets: { equipped: [], bag: [] },
  };
}

export function addToParty(party: Party, riftling: PartyRiftling): boolean {
  if (party.active.length < MAX_ACTIVE) {
    party.active.push(riftling);
    return true;
  }
  if (party.bench.length < MAX_BENCH) {
    party.bench.push(riftling);
    return true;
  }
  return false; // party full
}
