// Review + validation harness for the dark_plains_bluff biome.
// Loads ?testRoom=plains, validates decoration placement against the room
// layout (walls, spawns, spacing), and captures a screenshot for manual review.
import { test, expect, type Page } from '@playwright/test';

interface Decoration { sprite: string; x: number; y: number; }
interface Room {
  name: string;
  width: number;
  height: number;
  tiles: number[][];
  playerSpawn: { x: number; y: number };
  enemySpawns: { x: number; y: number }[];
  decorations?: Decoration[];
}

/**
 * Validate decoration placement for a room template. Returns list of issues.
 * Checks:
 *   - Decoration tile coords in bounds
 *   - Not placed on a wall (tile=2) or void (tile=0)
 *   - Not exactly on the player spawn
 *   - No two decorations closer than MIN_SEPARATION tiles (visual overlap)
 */
function validateRoom(room: Room): string[] {
  const MIN_SEPARATION = 0.8;
  const issues: string[] = [];
  const decos = room.decorations ?? [];

  for (const d of decos) {
    const tx = Math.floor(d.x);
    const ty = Math.floor(d.y);
    if (tx < 0 || tx >= room.width || ty < 0 || ty >= room.height) {
      issues.push(`OUT_OF_BOUNDS: ${d.sprite} at (${d.x}, ${d.y})`);
      continue;
    }
    const tile = room.tiles[ty][tx];
    if (tile === 2) {
      issues.push(`ON_WALL: ${d.sprite} at (${d.x}, ${d.y}) — tile[${ty}][${tx}] = wall`);
    } else if (tile === 0) {
      issues.push(`ON_VOID: ${d.sprite} at (${d.x}, ${d.y})`);
    }
    if (Math.floor(room.playerSpawn.x) === tx && Math.floor(room.playerSpawn.y) === ty) {
      issues.push(`ON_PLAYER_SPAWN: ${d.sprite} at (${d.x}, ${d.y})`);
    }
  }

  // Pairwise distance — flag decorations too close together
  for (let i = 0; i < decos.length; i++) {
    for (let j = i + 1; j < decos.length; j++) {
      const a = decos[i];
      const b = decos[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MIN_SEPARATION) {
        issues.push(
          `TOO_CLOSE (${dist.toFixed(2)}): ${a.sprite}@(${a.x},${a.y}) vs ${b.sprite}@(${b.x},${b.y})`,
        );
      }
    }
  }

  return issues;
}

async function loadTestRoom(page: Page, key: string): Promise<void> {
  await page.goto(`/?testRoom=${key}`);
  await page.waitForSelector('canvas');
  await page.waitForFunction(() => !!(window as any).__gameState, null, { timeout: 10_000 });
  // Give the starter/trinket overlay a moment to open, then dismiss if present.
  await page.waitForTimeout(600);
  const wasOpen = await page.evaluate(() =>
    (window as any).__gameState.isTrinketSelectOpen(),
  );
  if (wasOpen) {
    await page.evaluate(() => (window as any).__gameState.dismissTrinketSelect());
    await page.waitForFunction(
      () => !(window as any).__gameState.isTrinketSelectOpen(),
      null,
      { timeout: 5_000 },
    );
  }
  await page.waitForTimeout(800);
}

test('plains test room — validation + screenshot', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await loadTestRoom(page, 'plains');

  const room = await page.evaluate(() => (window as any).__gameState.getRoom());
  const issues = validateRoom(room);

  await page.screenshot({
    path: 'test-results/plains_review.png',
    fullPage: false,
  });

  expect(errors, `Console/page errors:\n${errors.join('\n')}`).toEqual([]);
  expect(issues, `Decoration placement issues in PLAINS_TEST_ROOM:\n${issues.join('\n')}`).toEqual([]);
});
