/**
 * Trinket system — collectible items that provide party-wide passive bonuses.
 *
 * Trinkets are trainer-level (not per-riftling). The player equips up to
 * MAX_EQUIPPED trinkets; extras sit in a bag (MAX_BAG). Stat-buff trinkets
 * are applied to all allies at combat start alongside synergy buffs.
 */

import { StatKey } from './party';

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
}

// --- Catalog ---

export const TRINKET_CATALOG: Record<string, TrinketDef> = {
  ember_charm: {
    id: 'ember_charm',
    name: 'Ember Charm',
    description: 'All allies gain +2 Attack',
    flavor: 'Warm to the touch, never cools',
    buffs: { attack: 2 },
  },
  iron_shell: {
    id: 'iron_shell',
    name: 'Iron Shell',
    description: 'All allies gain +2 Defense',
    flavor: 'Fragment of an ancient anchor\'s armor',
    buffs: { defense: 2 },
  },
  swift_boots: {
    id: 'swift_boots',
    name: 'Swift Boots',
    description: 'All allies gain +10 Speed',
    flavor: 'The rift hums through the soles',
    buffs: { speed: 10 },
  },
  vitality_ring: {
    id: 'vitality_ring',
    name: 'Vitality Ring',
    description: 'All allies gain +15 Max HP',
    flavor: 'Pulses faintly with each heartbeat',
    buffs: { hp: 15 },
  },
  scavengers_pouch: {
    id: 'scavengers_pouch',
    name: 'Scavenger\'s Pouch',
    description: '+50% XP from kills',
    flavor: 'Always has room for one more thing',
    special: 'xp_bonus',
    specialValue: 0.5,
  },
  timer_shard: {
    id: 'timer_shard',
    name: 'Timer Shard',
    description: '+30s added to timer on pickup',
    flavor: 'Frozen moment from a collapsed rift',
    special: 'timer_bonus',
    specialValue: 30,
  },
  lucky_coin: {
    id: 'lucky_coin',
    name: 'Lucky Coin',
    description: 'All allies gain +5 Crit Rate',
    flavor: 'Heads you win, tails they lose',
    buffs: { critRate: 5 },
  },
  phantom_cloak: {
    id: 'phantom_cloak',
    name: 'Phantom Cloak',
    description: 'All allies gain +5 Evasion',
    flavor: 'Hard to hit what you can\'t quite see',
    buffs: { evasion: 5 },
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

/** Move a trinket from equipped to bag. Returns false if bag is full. */
export function unequipTrinket(inv: TrinketInventory, index: number): boolean {
  if (index < 0 || index >= inv.equipped.length) return false;
  if (inv.bag.length >= MAX_BAG) return false;
  const [trinket] = inv.equipped.splice(index, 1);
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
  if (inv.bag.length < MAX_BAG) {
    inv.bag.push(trinket);
    return true;
  }
  return false;
}

/** Check whether the inventory is completely full. */
export function isTrinketInventoryFull(inv: TrinketInventory): boolean {
  return inv.equipped.length >= MAX_EQUIPPED && inv.bag.length >= MAX_BAG;
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
