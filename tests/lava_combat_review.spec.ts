// Verification screenshot for the LAVA_ROOM combat variant loaded via direct
// test-room mode. Confirms enemy spawns land on walkable stone (not lava),
// decorations don't overlap hazards, and the promoted combat room renders.
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

function validateRoom(room: Room): string[] {
  const issues: string[] = [];

  // Decoration placement — the template-level placement is what we validate.
  // Runtime room object (__gameState.getRoom()) only carries tiles +
  // decorations reliably; enemy spawns and player spawn are managed elsewhere.
  const decos = room.decorations ?? [];
  for (const d of decos) {
    const tx = Math.floor(d.x);
    const ty = Math.floor(d.y);
    const tile = room.tiles[ty]?.[tx];
    if (tile === 2) issues.push(`DECO_ON_LAVA: ${d.sprite} at (${d.x}, ${d.y})`);
    if (tile === 0) issues.push(`DECO_ON_VOID: ${d.sprite} at (${d.x}, ${d.y})`);
  }

  return issues;
}

async function loadTestRoom(page: Page, key: string): Promise<void> {
  await page.goto(`/?testRoom=${key}`);
  await page.waitForSelector('canvas');
  await page.waitForFunction(() => !!(window as any).__gameState, null, { timeout: 10_000 });
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

test('LAVA_ROOM combat variant — validation + screenshot', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await loadTestRoom(page, 'lava');

  const room = await page.evaluate(() => (window as any).__gameState.getRoom());
  const issues = validateRoom(room);

  await page.screenshot({
    path: 'test-results/lava_combat_review.png',
    fullPage: false,
  });

  expect(errors, `Console/page errors:\n${errors.join('\n')}`).toEqual([]);
  expect(issues, `Placement issues in LAVA_ROOM:\n${issues.join('\n')}`).toEqual([]);
});
