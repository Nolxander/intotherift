/**
 * Trinket system — collectible items that provide party-wide passive bonuses.
 *
 * Trinkets are trainer-level (not per-riftling). The player equips up to
 * MAX_EQUIPPED trinkets; extras sit in a bag (MAX_BAG). Stat-buff trinkets
 * are applied to all allies at combat start alongside synergy buffs.
 */

import { StatKey, Role } from './party';

// --- Capacity ---

/** Max trinkets the player can have equipped at once. */
export const MAX_EQUIPPED = 2;

/** Max trinkets held in the bag (overflow / reserves). */
export const MAX_BAG = 4;

// --- Definition ---

export type TrinketSpecial = 'xp_bonus' | 'timer_bonus';

export interface TrinketDef {
  id: string;
  name: string;
  description: string;
  flavor: string;
  /** Flat stat buffs applied to ALL allies at combat start. */
  buffs?: Partial<Record<StatKey, number>>;
  /** Non-stat special effect key. */
  special?: TrinketSpecial;
  /** Value for the special effect (multiplier, seconds, etc.). */
  specialValue?: number;
  /** Extra bag slots granted while equipped. */
  bagSlotBonus?: number;
  /** Seconds added to the dungeon timer when a boss room is cleared. */
  bossTimerBonus?: number;
  /** Additional XP multiplier applied to elite room clears (e.g. 0.5 = +50%). */
  eliteXPBonus?: number;
  /** Flat stat buffs applied only to allies whose role matches. */
  roleBuffs?: Partial<Record<Role, Partial<Record<StatKey, number>>>>;
  /** Extra XP multiplier applied only to the lowest-level active riftling. */
  lowestLevelXPBonus?: number;
}

// --- Catalog ---

export const TRINKET_CATALOG: Record<string, TrinketDef> = {
  ember_charm: {
    id: 'ember_charm',
    name: 'Ember Charm',
    description: '+3 Attack, -1 Defense',
    flavor: 'Warm to the touch, never cools',
    buffs: { attack: 3, defense: -1 },
  },
  iron_shell: {
    id: 'iron_shell',
    name: 'Iron Shell',
    description: '+2 Defense, +5 Max HP',
    flavor: 'Fragment of an ancient anchor\'s armor',
    buffs: { defense: 2, hp: 5 },
  },
  swift_boots: {
    id: 'swift_boots',
    name: 'Swift Boots',
    description: '+10 Speed, +3 Evasion',
    flavor: 'The rift hums through the soles',
    buffs: { speed: 10, evasion: 3 },
  },
  vitality_ring: {
    id: 'vitality_ring',
    name: 'Vitality Ring',
    description: '+20 Max HP',
    flavor: 'Pulses faintly with each heartbeat',
    buffs: { hp: 20 },
  },
  scavengers_pouch: {
    id: 'scavengers_pouch',
    name: 'Scavenger\'s Pouch',
    description: '+50% XP from kills, +1 bag slot',
    flavor: 'Always has room for one more thing',
    special: 'xp_bonus',
    specialValue: 0.5,
    bagSlotBonus: 1,
  },
  timer_shard: {
    id: 'timer_shard',
    name: 'Timer Shard',
    description: '+30s on pickup, +15s on boss kill',
    flavor: 'Frozen moment from a collapsed rift',
    special: 'timer_bonus',
    specialValue: 30,
    bossTimerBonus: 15,
  },
  elder_lens: {
    id: 'elder_lens',
    name: 'Elder Lens',
    description: '+50% XP from elite rooms',
    flavor: 'Focuses the past into the present',
    eliteXPBonus: 0.5,
  },
  lucky_coin: {
    id: 'lucky_coin',
    name: 'Lucky Coin',
    description: '+8 Crit Rate',
    flavor: 'Heads you win, tails they lose',
    buffs: { critRate: 8 },
  },
  phantom_cloak: {
    id: 'phantom_cloak',
    name: 'Phantom Cloak',
    description: '+8 Evasion, -5 Max HP',
    flavor: 'Hard to hit what you can\'t quite see',
    buffs: { evasion: 8, hp: -5 },
  },
  gamblers_die: {
    id: 'gamblers_die',
    name: 'Gambler\'s Die',
    description: '+15 Crit Rate, -5 Evasion',
    flavor: 'Every throw is a dare to the rift',
    buffs: { critRate: 15, evasion: -5 },
  },
  chasers_fang: {
    id: 'chasers_fang',
    name: 'Chaser\'s Fang',
    description: '+3 Attack to Skirmishers',
    flavor: 'The tooth remembers the chase',
    roleBuffs: { skirmisher: { attack: 3 } },
  },
  anchors_bulwark: {
    id: 'anchors_bulwark',
    name: 'Anchor\'s Bulwark',
    description: '+3 Defense to Vanguards',
    flavor: 'Weight drawn from the deep',
    roleBuffs: { vanguard: { defense: 3 } },
  },
  scholars_lens: {
    id: 'scholars_lens',
    name: 'Scholar\'s Lens',
    description: '+100% XP for your lowest-level riftling',
    flavor: 'The rift teaches those who listen',
    lowestLevelXPBonus: 1.0,
  },
};

export const ALL_TRINKET_IDS = Object.keys(TRINKET_CATALOG);

// --- Inventory ---

export interface TrinketInventory {
  equipped: TrinketDef[];
  bag: TrinketDef[];
}

export function createTrinketInventory(): TrinketInventory {
  return { equipped: [], bag: [] };
}

/** Try to equip a trinket. Returns false if equipped slots are full. */
export function equipTrinket(inv: TrinketInventory, trinket: TrinketDef): boolean {
  if (inv.equipped.length >= MAX_EQUIPPED) return false;
  inv.equipped.push(trinket);
  return true;
}

/** Max bag capacity including bonuses from equipped trinkets. */
export function getMaxBag(inv: TrinketInventory): number {
  let bonus = 0;
  for (const t of inv.equipped) {
    if (t.bagSlotBonus) bonus += t.bagSlotBonus;
  }
  return MAX_BAG + bonus;
}

/** Move a trinket from equipped to bag. Returns false if bag is full. */
export function unequipTrinket(inv: TrinketInventory, index: number): boolean {
  if (index < 0 || index >= inv.equipped.length) return false;
  const [trinket] = inv.equipped.splice(index, 1);
  // Capacity check must run AFTER splicing out so the unequipped trinket's own
  // bag bonus doesn't count, but BEFORE committing to the bag.
  if (inv.bag.length >= getMaxBag(inv)) {
    inv.equipped.splice(index, 0, trinket);
    return false;
  }
  inv.bag.push(trinket);
  return true;
}

/** Move a trinket from bag to equipped. Returns false if equipped is full. */
export function equipFromBag(inv: TrinketInventory, bagIndex: number): boolean {
  if (bagIndex < 0 || bagIndex >= inv.bag.length) return false;
  if (inv.equipped.length >= MAX_EQUIPPED) return false;
  const [trinket] = inv.bag.splice(bagIndex, 1);
  inv.equipped.push(trinket);
  return true;
}

/** Swap an equipped trinket with a bag trinket. */
export function swapTrinket(inv: TrinketInventory, equippedIndex: number, bagIndex: number): boolean {
  if (equippedIndex < 0 || equippedIndex >= inv.equipped.length) return false;
  if (bagIndex < 0 || bagIndex >= inv.bag.length) return false;
  const temp = inv.equipped[equippedIndex];
  inv.equipped[equippedIndex] = inv.bag[bagIndex];
  inv.bag[bagIndex] = temp;
  return true;
}

/** Add a trinket to the inventory — equip first, then bag. Returns false if completely full. */
export function addTrinket(inv: TrinketInventory, trinket: TrinketDef): boolean {
  if (inv.equipped.length < MAX_EQUIPPED) {
    inv.equipped.push(trinket);
    return true;
  }
  if (inv.bag.length < getMaxBag(inv)) {
    inv.bag.push(trinket);
    return true;
  }
  return false;
}

/** Check whether the inventory is completely full. */
export function isTrinketInventoryFull(inv: TrinketInventory): boolean {
  return inv.equipped.length >= MAX_EQUIPPED && inv.bag.length >= getMaxBag(inv);
}

/** Total seconds a boss clear should add to the dungeon timer from equipped trinkets. */
export function getBossTimerBonus(inv: TrinketInventory): number {
  let sum = 0;
  for (const t of inv.equipped) {
    if (t.bossTimerBonus) sum += t.bossTimerBonus;
  }
  return sum;
}

/** XP multiplier applied ONLY to elite room clears, stacked with the base XP mult. */
export function getEliteXPMultiplier(inv: TrinketInventory): number {
  let mult = 1.0;
  for (const t of inv.equipped) {
    if (t.eliteXPBonus) mult += t.eliteXPBonus;
  }
  return mult;
}

/** Merged role-specific buffs from equipped crystals. */
export function getRoleBuffs(inv: TrinketInventory, role: Role): Partial<Record<StatKey, number>> {
  const merged: Partial<Record<StatKey, number>> = {};
  for (const t of inv.equipped) {
    const b = t.roleBuffs?.[role];
    if (!b) continue;
    for (const [key, val] of Object.entries(b)) {
      merged[key as StatKey] = (merged[key as StatKey] ?? 0) + val;
    }
  }
  return merged;
}

/** Extra XP multiplier applied to the lowest-level active riftling only. */
export function getLowestLevelXPBonus(inv: TrinketInventory): number {
  let mult = 1.0;
  for (const t of inv.equipped) {
    if (t.lowestLevelXPBonus) mult += t.lowestLevelXPBonus;
  }
  return mult;
}

/**
 * Compute the total XP multiplier from equipped trinkets.
 * Returns 1.0 if no XP-boosting trinkets are equipped.
 */
export function getXPMultiplier(inv: TrinketInventory): number {
  let mult = 1.0;
  for (const t of inv.equipped) {
    if (t.special === 'xp_bonus' && t.specialValue) {
      mult += t.specialValue;
    }
  }
  return mult;
}

/**
 * Collect all stat buffs from equipped trinkets, merged into a single record.
 */
export function getEquippedBuffs(inv: TrinketInventory): Partial<Record<StatKey, number>> {
  const merged: Partial<Record<StatKey, number>> = {};
  for (const t of inv.equipped) {
    if (!t.buffs) continue;
    for (const [key, val] of Object.entries(t.buffs)) {
      merged[key as StatKey] = (merged[key as StatKey] ?? 0) + val;
    }
  }
  return merged;
}
