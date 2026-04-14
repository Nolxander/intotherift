import { RIFTLING_TEMPLATES } from '../data/party';
import { EliteTeamMember } from '../data/room_templates';

export type EntrySide = 'north' | 'south' | 'east' | 'west';

export interface EliteFormation {
  /** Per-team-member spawn position, parallel to the input team array. */
  spawns: { x: number; y: number }[];
  /** Anchor position for the non-combatant elite trainer NPC sprite. */
  trainerPos: { x: number; y: number };
}

/** attackRange threshold separating melee from ranged. Matches BACKLINE_RANGE_THRESHOLD in CombatManager. */
const RANGED_THRESHOLD = 60;

/** Minimum pixel spacing between adjacent units on the same row. */
const ROW_SPACING = 40;

/** Margin from room edges so the formation doesn't clip into walls. */
const EDGE_MARGIN = 40;

/**
 * Compute elite squad positioning given the team roster and which side the
 * player entered from. Ranged members (attackRange >= threshold) go to the
 * backline — deepest into the elite half, away from the player. Melee members
 * form a frontline one step closer to the player. The trainer NPC sits
 * centered behind the backline.
 *
 * Coordinates are in pixels, not tiles.
 */
export function computeEliteFormation(
  team: EliteTeamMember[],
  entrySide: EntrySide,
  roomPixelW: number,
  roomPixelH: number,
): EliteFormation {
  // Classify each team member and remember its original index so we can put
  // results back in roster order.
  type Classified = { index: number; ranged: boolean };
  const classified: Classified[] = team.map((m, i) => {
    const tmpl = RIFTLING_TEMPLATES[m.riftlingKey];
    const range = tmpl?.attackRange ?? 36;
    return { index: i, ranged: range >= RANGED_THRESHOLD };
  });

  const rangedUnits = classified.filter((c) => c.ranged);
  const meleeUnits = classified.filter((c) => !c.ranged);

  // Depths along the "entry axis", from the elite side toward the player side.
  // Expressed as fractions of the room dimension on that axis.
  // backline is deepest (furthest from the player), frontline one step forward,
  // trainer sits behind the backline.
  const TRAINER_DEPTH = 0.12;
  const BACKLINE_DEPTH = 0.25;
  const FRONTLINE_DEPTH = 0.42;

  // Resolve a depth fraction into a pixel coordinate along the entry axis.
  // For south entry the axis is Y and elite is at small Y values, etc.
  const depthToPixel = (depth: number): number => {
    switch (entrySide) {
      case 'south': return roomPixelH * depth;
      case 'north': return roomPixelH * (1 - depth);
      case 'west':  return roomPixelW * (1 - depth);
      case 'east':  return roomPixelW * depth;
    }
  };

  const isVerticalEntry = entrySide === 'south' || entrySide === 'north';

  // Spread `count` units along the cross-axis (perpendicular to entry direction).
  const crossAxisPositions = (count: number): number[] => {
    if (count === 0) return [];
    const rangeLength = (isVerticalEntry ? roomPixelW : roomPixelH) - EDGE_MARGIN * 2;
    const center = (isVerticalEntry ? roomPixelW : roomPixelH) / 2;
    if (count === 1) return [center];
    const totalSpan = Math.min(rangeLength, (count - 1) * ROW_SPACING);
    const start = center - totalSpan / 2;
    const step = count > 1 ? totalSpan / (count - 1) : 0;
    return Array.from({ length: count }, (_, i) => start + i * step);
  };

  const rangedCross = crossAxisPositions(rangedUnits.length);
  const meleeCross = crossAxisPositions(meleeUnits.length);
  const backlineDepthPx = depthToPixel(BACKLINE_DEPTH);
  const frontlineDepthPx = depthToPixel(FRONTLINE_DEPTH);
  const trainerDepthPx = depthToPixel(TRAINER_DEPTH);

  const spawns: { x: number; y: number }[] = new Array(team.length);

  const place = (rowUnits: Classified[], crossPositions: number[], depthPx: number) => {
    rowUnits.forEach((unit, rowIndex) => {
      const cross = crossPositions[rowIndex];
      if (isVerticalEntry) {
        spawns[unit.index] = { x: cross, y: depthPx };
      } else {
        spawns[unit.index] = { x: depthPx, y: cross };
      }
    });
  };

  place(rangedUnits, rangedCross, backlineDepthPx);
  place(meleeUnits, meleeCross, frontlineDepthPx);

  // Trainer sits centered on the cross-axis, behind the backline.
  const trainerCross = isVerticalEntry ? roomPixelW / 2 : roomPixelH / 2;
  const trainerPos = isVerticalEntry
    ? { x: trainerCross, y: trainerDepthPx }
    : { x: trainerDepthPx, y: trainerCross };

  return { spawns, trainerPos };
}
