import { test, expect, Page } from '@playwright/test';

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
  await page.waitForFunction(() => !!(window as any).__gameState, null, { timeout: 20_000 });
}

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

async function gs<T>(page: Page, call: string): Promise<T> {
  return page.evaluate(`window.__gameState.${call}`) as Promise<T>;
}

// Warp into the boss room, then back to the hub. The seal path triggers
// on the exit, so this simulates "boss cleared and walked out" without
// needing to run real combat.
async function clearBossAndReturnToHub(page: Page) {
  const bossId = await page.evaluate(() => {
    const d = (window as any).__gameState.getDungeon();
    return d.rooms.find((r: any) => r.template.type === 'boss').id;
  });
  await page.evaluate((id: number) => (window as any).__gameState.warpToRoom(id), bossId);
  await page.waitForTimeout(250);

  const hubId = await page.evaluate(() => (window as any).__gameState.getDungeon().hubRoomId);
  await page.evaluate((id: number) => (window as any).__gameState.warpToRoom(id), hubId);
  await page.waitForTimeout(250);
}

test.describe('Level progression: L1 -> L2 -> L3 -> Victory', () => {
  test('boss clear advances dungeon level through L2 and L3, then victory', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Start: L1
    let lvl = await page.evaluate(() => (window as any).__gameState.getDungeon().level);
    expect(lvl).toBe(1);

    // L1 boss clear -> L2
    await clearBossAndReturnToHub(page);
    lvl = await page.evaluate(() => (window as any).__gameState.getDungeon().level);
    expect(lvl).toBe(2);

    // After advance, we should be in the hub of the new dungeon (fresh boss
    // branch, not yet cleared).
    const l2State = await page.evaluate(() => {
      const d = (window as any).__gameState.getDungeon();
      return {
        bossCleared: d.boss.cleared,
        currentType: d.rooms[d.currentRoomId].template.type,
      };
    });
    expect(l2State.bossCleared).toBe(false);
    expect(l2State.currentType).toBe('hub');

    // L2 boss clear -> L3
    await clearBossAndReturnToHub(page);
    lvl = await page.evaluate(() => (window as any).__gameState.getDungeon().level);
    expect(lvl).toBe(3);

    // L3 boss clear -> Victory scene
    await clearBossAndReturnToHub(page);
    await page.waitForFunction(
      () => {
        const game = (window as any).__PHASER_GAME__;
        return !!game?.scene?.getScene?.('Victory')?.sys?.settings?.active;
      },
      null,
      { timeout: 5_000 },
    );
  });
});
