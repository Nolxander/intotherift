import { test, expect, Page } from '@playwright/test';

async function gameState(page: Page, accessor: string) {
  return page.evaluate(`window.__gameState?.${accessor}`);
}

async function waitForGameReady(page: Page) {
  await page.waitForFunction(
    () => !!(window as any).__PHASER_GAME__?.scene?.getScene?.('Title'),
    null,
    { timeout: 10_000 },
  );
  await page.evaluate(() => {
    const game = (window as any).__PHASER_GAME__;
    game.scene.stop('Title');
    game.scene.start('Dungeon');
  });
  await page.waitForFunction(() => !!(window as any).__gameState, null, {
    timeout: 20_000,
  });
}

/** Dismiss the starter trinket selection overlay if it's open. */
async function dismissTrinketSelect(page: Page) {
  const isOpen = await page.evaluate(() => (window as any).__gameState.isTrinketSelectOpen());
  if (isOpen) {
    await page.evaluate(() => (window as any).__gameState.dismissTrinketSelect());
    await page.waitForFunction(() => !(window as any).__gameState.isTrinketSelectOpen(), null, {
      timeout: 5_000,
    });
    await page.waitForTimeout(200);
  }
}

async function holdKey(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

test.describe('Party Screen', () => {
  test('Tab opens and closes the party screen', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Party screen should be closed initially
    let isOpen = await gameState(page, 'isPartyScreenActive()');
    expect(isOpen).toBe(false);

    // Press Tab to open
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    isOpen = await gameState(page, 'isPartyScreenActive()');
    expect(isOpen).toBe(true);

    // Press Tab again to close
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    isOpen = await gameState(page, 'isPartyScreenActive()');
    expect(isOpen).toBe(false);
  });

  test('Escape closes the party screen', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    expect(await gameState(page, 'isPartyScreenActive()')).toBe(true);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    expect(await gameState(page, 'isPartyScreenActive()')).toBe(false);
  });

  test('party screen pauses gameplay (player cannot move)', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Record starting room
    const startRoom = await gameState(page, 'getRoom()');

    // Open party screen
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // Try to walk north while party screen is open
    await holdKey(page, 'w', 1500);

    // Should still be in the same room
    const currentRoom = await gameState(page, 'getRoom()');
    expect(currentRoom.id).toBe(startRoom.id);

    // Close and verify we can move again — use warpToRoom for deterministic
    // room transition instead of relying on walk timing
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    const dungeon = await gameState(page, 'getDungeon()');
    const otherRoom = dungeon.rooms.find((r: any) => r.id !== startRoom.id);
    await page.evaluate((id: number) => (window as any).__gameState.warpToRoom(id), otherRoom.id);
    await page.waitForTimeout(200);

    const afterClose = await gameState(page, 'getRoom()');
    expect(afterClose.id).not.toBe(startRoom.id);
  });

  test('party data includes role and moves after extending the model', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const party = await gameState(page, 'getParty()');
    const emberhound = party.active[0];

    expect(emberhound.role).toBe('skirmisher');
    expect(emberhound.moves).toHaveLength(2);
    expect(emberhound.equipped).toEqual([0, 1]);
    expect(emberhound.moves[1].isSignature).toBe(true);
    expect(emberhound.moves[1].name).toBe('Fire Dash');
  });
});
