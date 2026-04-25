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

test.describe('Combat via Warp', () => {
  test('warping to a combat room starts combat', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const dungeon = await gs<any>(page, 'getDungeon()');
    const combatRoom = dungeon.rooms.find((r: any) => r.template.type === 'combat');
    expect(combatRoom).toBeDefined();

    await page.evaluate((id: number) => (window as any).__gameState.warpToRoom(id), combatRoom.id);
    await page.waitForTimeout(500);

    const inCombat = await gs<boolean>(page, 'isCombatActive()');
    expect(inCombat).toBe(true);
  });

  test('combat ends and room is marked cleared', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Massively boost the starter so combat resolves in seconds
    await page.evaluate(() => {
      const p = (window as any).__gameState.getParty();
      p.active[0].attack = 200;
      p.active[0].maxHp = 9999;
      p.active[0].hp = 9999;
      p.active[0].speed = 200;
      p.active[0].attackSpeed = 200;
      p.active[0].attackRange = 80;
    });

    // Find the combat room with fewest enemy spawns
    const roomId = await page.evaluate(() => {
      const d = (window as any).__gameState.getDungeon();
      const combatRooms = d.rooms.filter(
        (r: any) => r.template.type === 'combat' && !r.cleared,
      );
      combatRooms.sort(
        (a: any, b: any) => a.template.enemySpawns.length - b.template.enemySpawns.length,
      );
      return combatRooms[0]?.id ?? -1;
    });
    expect(roomId).not.toBe(-1);

    await page.evaluate((id: number) => (window as any).__gameState.warpToRoom(id), roomId);
    await page.waitForTimeout(500);

    // Wait for combat to end (auto-battle)
    await page.waitForFunction(
      () => !(window as any).__gameState?.isCombatActive(),
      null,
      { timeout: 60_000 },
    );

    const room = await gs<any>(page, 'getRoom()');
    expect(room.cleared).toBe(true);
  });

  test('warping to a cleared room does not restart combat', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Start room is already cleared
    const startRoom = await gs<any>(page, 'getRoom()');
    expect(startRoom.cleared).toBe(true);

    // Warp away and back
    const dungeon = await gs<any>(page, 'getDungeon()');
    const hub = dungeon.rooms.find((r: any) => r.template.type === 'hub');
    await page.evaluate((id: number) => (window as any).__gameState.warpToRoom(id), hub.id);
    await page.waitForTimeout(300);

    await page.evaluate((id: number) => (window as any).__gameState.warpToRoom(id), startRoom.id);
    await page.waitForTimeout(300);

    const inCombat = await gs<boolean>(page, 'isCombatActive()');
    expect(inCombat).toBe(false);
  });

  test('party screen is blocked during combat', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const dungeon = await gs<any>(page, 'getDungeon()');
    const combatRoom = dungeon.rooms.find((r: any) => r.template.type === 'combat');

    await page.evaluate((id: number) => (window as any).__gameState.warpToRoom(id), combatRoom.id);
    await page.waitForTimeout(500);

    expect(await gs<boolean>(page, 'isCombatActive()')).toBe(true);

    // Try to open party screen during combat
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    expect(await gs<boolean>(page, 'isPartyScreenActive()')).toBe(false);
  });

  test('riftlings gain XP after combat victory', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Massively boost stats so combat resolves in seconds
    await page.evaluate(() => {
      const p = (window as any).__gameState.getParty();
      p.active[0].attack = 200;
      p.active[0].maxHp = 9999;
      p.active[0].hp = 9999;
      p.active[0].speed = 200;
      p.active[0].attackSpeed = 200;
      p.active[0].attackRange = 80;
    });

    const partyBefore = await gs<any>(page, 'getParty()');
    const xpBefore = partyBefore.active[0].xp;
    const levelBefore = partyBefore.active[0].level;

    // Find the combat room with fewest enemy spawns
    const roomId = await page.evaluate(() => {
      const d = (window as any).__gameState.getDungeon();
      const combatRooms = d.rooms.filter(
        (r: any) => r.template.type === 'combat' && !r.cleared,
      );
      combatRooms.sort(
        (a: any, b: any) => a.template.enemySpawns.length - b.template.enemySpawns.length,
      );
      return combatRooms[0]?.id ?? -1;
    });

    await page.evaluate((id: number) => (window as any).__gameState.warpToRoom(id), roomId);
    await page.waitForTimeout(500);

    // Wait for combat to end
    await page.waitForFunction(
      () => !(window as any).__gameState?.isCombatActive(),
      null,
      { timeout: 60_000 },
    );

    // Dismiss any recruit/level-up prompts
    await page.waitForTimeout(2000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    const partyAfter = await gs<any>(page, 'getParty()');
    const xpAfter = partyAfter.active[0].xp;
    const levelAfter = partyAfter.active[0].level;
    // XP should have increased or a level-up occurred
    expect(xpAfter > xpBefore || levelAfter > levelBefore).toBe(true);
  });
});
