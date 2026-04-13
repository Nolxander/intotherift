import { test, expect, Page } from '@playwright/test';

/** Wait until Phaser has booted and DungeonScene is ready. */
async function waitForGameReady(page: Page) {
  await page.waitForFunction(() => !!(window as any).__gameState, null, {
    timeout: 20_000,
  });
}

/** Dismiss the starter trinket selection overlay if it's open. */
async function dismissTrinketSelect(page: Page) {
  const isOpen = await page.evaluate(() => (window as any).__gameState.isTrinketSelectOpen());
  if (isOpen) {
    await page.evaluate(() => (window as any).__gameState.dismissTrinketSelect());
    // Wait for the overlay to close
    await page.waitForFunction(() => !(window as any).__gameState.isTrinketSelectOpen(), null, {
      timeout: 5_000,
    });
    await page.waitForTimeout(200);
  }
}

test.describe('Smoke', () => {
  test('game boots and canvas renders', async ({ page }) => {
    await page.goto('/');

    // Canvas must exist
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 10_000 });

    // __gameState must be available (DungeonScene fully created)
    await waitForGameReady(page);

    // Dismiss trinket select to get to normal game state
    await dismissTrinketSelect(page);

    // Screenshot: baseline of the initial game state.
    // On first run Playwright writes the golden; subsequent runs compare against it.
    await expect(page).toHaveScreenshot('boot-dungeon.png');
  });

  test('initial party is Emberhound in start room', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);

    const party = await page.evaluate(() => (window as any).__gameState.getParty());
    expect(party.active).toHaveLength(1);
    expect(party.active[0].name).toBe('Emberhound');
    expect(party.bench).toHaveLength(0);

    const room = await page.evaluate(() => (window as any).__gameState.getRoom());
    expect(room.template.type).toBe('start');
    expect(room.cleared).toBe(true);
  });

  test('no combat active at start', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);

    const inCombat = await page.evaluate(() => (window as any).__gameState.isCombatActive());
    expect(inCombat).toBe(false);

    const recruiting = await page.evaluate(() => (window as any).__gameState.isRecruitActive());
    expect(recruiting).toBe(false);
  });

  test('player movement changes the canvas', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const before = await page.screenshot();

    // Hold W for half a second — trainer should move north
    await page.keyboard.down('w');
    await page.waitForTimeout(500);
    await page.keyboard.up('w');

    // Give Phaser one frame to settle
    await page.waitForTimeout(100);

    const after = await page.screenshot();

    // The canvas must have changed (trainer moved)
    expect(before.equals(after)).toBe(false);
  });

  test('dungeon has 9 rooms', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);

    const dungeon = await page.evaluate(() => (window as any).__gameState.getDungeon());
    expect(dungeon.rooms).toHaveLength(9);
    // Exactly one boss room
    const bossRooms = dungeon.rooms.filter((r: any) => r.template.type === 'boss');
    expect(bossRooms).toHaveLength(1);
  });
});
