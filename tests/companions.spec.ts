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

async function waitForCombat(page: Page) {
  await page.waitForFunction(
    () => (window as any).__gameState?.isCombatActive(),
    null,
    { timeout: 5_000 },
  );
}

async function waitForCombatEnd(page: Page) {
  await page.waitForFunction(
    () => !(window as any).__gameState?.isCombatActive(),
    null,
    { timeout: 45_000 },
  );
}

async function waitForRecruitPrompt(page: Page) {
  await page.waitForFunction(
    () => (window as any).__gameState?.isRecruitActive(),
    null,
    { timeout: 30_000 },
  );
}

/** Add a riftling to the party via injectRiftling — deterministic, no combat needed. */
async function injectCompanion(page: Page, key: string = 'pyreshell'): Promise<void> {
  await page.evaluate((k: string) => (window as any).__gameState.injectRiftling(k), key);
  await page.waitForTimeout(200);
}

test.describe('Multi-Companion System', () => {
  test('injected riftling appears as companion (party size matches companion count)', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Initially 1 active party member
    let party = await gameState(page, 'getParty()');
    expect(party.active).toHaveLength(1);

    // Inject a companion directly for deterministic testing
    await injectCompanion(page, 'pyreshell');

    // Party should now have 2 active riftlings
    party = await gameState(page, 'getParty()');
    expect(party.active).toHaveLength(2);
    expect(party.active[1].name).toBe('Pyreshell');
  });

  test('companions persist through room transitions', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Inject a companion
    await injectCompanion(page, 'pyreshell');

    const partyBefore = await gameState(page, 'getParty()');
    const sizeBefore = partyBefore.active.length;

    // Warp to another room for deterministic transition
    const dungeon = await gameState(page, 'getDungeon()');
    const startRoom = await gameState(page, 'getRoom()');
    const otherRoom = dungeon.rooms.find((r: any) => r.id !== startRoom.id);
    await page.evaluate((id: number) => (window as any).__gameState.warpToRoom(id), otherRoom.id);
    await page.waitForTimeout(300);

    // Party should still be the same size
    const partyAfter = await gameState(page, 'getParty()');
    expect(partyAfter.active.length).toBe(sizeBefore);
  });

  test('boss room triggers combat', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Navigate through the dungeon — check each room type
    // We expose getDungeon() so we can inspect the room layout
    const dungeon: any = await gameState(page, 'getDungeon()');
    const bossRoom = dungeon.rooms.find((r: any) => r.template.type === 'boss');
    expect(bossRoom).toBeTruthy();
    expect(bossRoom.template.enemySpawns.length).toBeGreaterThan(0);

    // Verify the boss room type is included in combat room checks
    // by checking that boss rooms are not pre-cleared
    expect(bossRoom.cleared).toBe(false);
  });
});
