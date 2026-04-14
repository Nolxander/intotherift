import type { Role } from '../data/party';

// Tunables — keep small so passives nudge the playstyle without overshadowing
// trinkets, temperaments, or move power. Adjust here, not at call sites.

export const VANGUARD_DR = 0.15;
export const VANGUARD_TAUNT_RADIUS = 50;

export const SKIRMISHER_LIFESTEAL = 0.10;
export const SKIRMISHER_WOUND_HP_RATIO = 0.5;
export const SKIRMISHER_WOUND_SPEED_MULT = 1.10;

export const STRIKER_HIGH_HP_RATIO = 0.75;
export const STRIKER_HIGH_HP_BONUS = 0.15;

export const CASTER_RADIUS_MULT = 1.25;

export const KITE_RADIUS = 40;
export const KITE_BACKSTEP_MULT = 0.75;

export const HUNTER_RANGE_THRESHOLD = 80;
export const HUNTER_RANGE_BONUS = 0.25;
export const HUNTER_SCAN_RADIUS = 120;

export const SUPPORT_HEAL_MULT = 1.5;
export const SUPPORT_REGEN_RADIUS = 60;
export const SUPPORT_REGEN_PER_TICK = 1;

export const HEXER_DEBUFF_DURATION_MULT = 1.5;

export function getRoleDamageReduction(role: Role | undefined): number {
  return role === 'vanguard' ? VANGUARD_DR : 0;
}

export function getAttackerDamageMultiplier(
  attackerRole: Role | undefined,
  defenderHpRatio: number,
  defenderAttackRange: number,
): number {
  let mult = 1;
  if (attackerRole === 'striker' && defenderHpRatio > STRIKER_HIGH_HP_RATIO) {
    mult *= 1 + STRIKER_HIGH_HP_BONUS;
  }
  if (attackerRole === 'hunter' && defenderAttackRange >= HUNTER_RANGE_THRESHOLD) {
    mult *= 1 + HUNTER_RANGE_BONUS;
  }
  return mult;
}

export function getRoleLifestealRatio(role: Role | undefined): number {
  return role === 'skirmisher' ? SKIRMISHER_LIFESTEAL : 0;
}

export function getRoleHealMultiplier(role: Role | undefined): number {
  return role === 'support' ? SUPPORT_HEAL_MULT : 1;
}

export function getRoleAoERadiusMultiplier(role: Role | undefined): number {
  return role === 'caster' ? CASTER_RADIUS_MULT : 1;
}

export function getRoleDebuffDurationMultiplier(role: Role | undefined): number {
  return role === 'hexer' ? HEXER_DEBUFF_DURATION_MULT : 1;
}

export function getRoleSpeedMultiplier(role: Role | undefined, hpRatio: number): number {
  if (role === 'skirmisher' && hpRatio < SKIRMISHER_WOUND_HP_RATIO) {
    return SKIRMISHER_WOUND_SPEED_MULT;
  }
  return 1;
}

export function isKitingRole(role: Role | undefined): boolean {
  return role === 'striker' || role === 'caster';
}
