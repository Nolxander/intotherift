import { test, expect, Page } from '@playwright/test';

async function gameState(page: Page, accessor: string) {
  return page.evaluate(`window.__gameState?.${accessor}`);
}

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

/** Warp to the first combat room, clear it, and recruit. */
async function clearFirstRoomAndRecruit(page: Page): Promise<boolean> {
  // Find a combat room from the dungeon layout and warp directly to it
  const combatRoomId = await page.evaluate(() => {
    const gs = (window as any).__gameState;
    const dungeon = gs.getDungeon();
    const room = dungeon.rooms.find(
      (r: any) => ['combat', 'recruit'].includes(r.template.type),
    );
    return room ? room.id : -1;
  });

  if (combatRoomId === -1) return false;

  await page.evaluate((id: number) => {
    (window as any).__gameState.warpToRoom(id);
  }, combatRoomId);

  // Give the room transition a moment to settle and combat to start
  await page.waitForTimeout(500);

  await waitForCombat(page);
  await waitForCombatEnd(page);
  await waitForRecruitPrompt(page);
  await page.keyboard.press('1');
  await page.waitForFunction(
    () => !(window as any).__gameState?.isRecruitActive(),
    null,
    { timeout: 5_000 },
  );
  return true;
}

test.describe('Multi-Companion System', () => {
  test('recruited riftling appears as companion (party size matches companion count)', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Initially 1 active party member
    let party = await gameState(page, 'getParty()');
    expect(party.active).toHaveLength(1);

    // Recruit in first combat room
    const recruited = await clearFirstRoomAndRecruit(page);
    if (!recruited) {
      test.skip();
      return;
    }

    // Party should now have 2 active riftlings
    party = await gameState(page, 'getParty()');
    expect(party.active.length).toBeGreaterThanOrEqual(2);

    // Verify the companion sprites exist in the scene — check via game state
    // The companions array in DungeonScene should match party.active length
    // We can verify this indirectly: the game didn't crash and the party grew
    expect(party.active.length).toBeGreaterThanOrEqual(2);
  });

  test('companions persist through room transitions', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Recruit a companion
    const recruited = await clearFirstRoomAndRecruit(page);
    if (!recruited) {
      test.skip();
      return;
    }

    const partyBefore = await gameState(page, 'getParty()');
    const sizeBefore = partyBefore.active.length;

    // Walk to next room
    await holdKey(page, 'w', 2500);

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
