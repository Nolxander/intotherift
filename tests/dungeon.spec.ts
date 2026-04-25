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

test.describe('Dungeon Structure', () => {
  test('hub room exists and is type hub', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const dungeon = await gs<any>(page, 'getDungeon()');
    const hub = dungeon.rooms.find((r: any) => r.template.type === 'hub');
    expect(hub).toBeDefined();
    expect(hub.id).toBe(dungeon.hubRoomId);
  });

  test('start room exists and is cleared', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const dungeon = await gs<any>(page, 'getDungeon()');
    const startRooms = dungeon.rooms.filter((r: any) => r.template.type === 'start');
    expect(startRooms).toHaveLength(1);
    expect(startRooms[0].cleared).toBe(true);
  });

  test('exactly one boss room exists and is not cleared', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const dungeon = await gs<any>(page, 'getDungeon()');
    const bossRooms = dungeon.rooms.filter((r: any) => r.template.type === 'boss');
    expect(bossRooms).toHaveLength(1);
    expect(bossRooms[0].cleared).toBe(false);
    expect(bossRooms[0].template.enemySpawns.length).toBeGreaterThan(0);
  });

  test('L1 dungeon has 5 regular branches', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const dungeon = await gs<any>(page, 'getDungeon()');
    // branches array contains the 5 regular branches (key path and boss are separate)
    expect(dungeon.branches).toHaveLength(5);
    for (const branch of dungeon.branches) {
      expect(branch.kind).toBe('regular');
      expect(branch.roomIds.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('key path and boss doors start locked', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const dungeon = await gs<any>(page, 'getDungeon()');
    // Key path is slot 6, boss is slot 7
    const keyDoor = dungeon.doors.find((d: any) => d.slot === 6);
    const bossDoor = dungeon.doors.find((d: any) => d.slot === 7);

    expect(keyDoor).toBeDefined();
    expect(keyDoor.locked).toBe(true);
    expect(bossDoor).toBeDefined();
    expect(bossDoor.locked).toBe(true);
  });

  test('regular branch doors start unlocked and unsealed', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const dungeon = await gs<any>(page, 'getDungeon()');
    const regularDoors = dungeon.doors.filter((d: any) => d.slot <= 5);

    for (const door of regularDoors) {
      expect(door.locked).toBe(false);
      expect(door.sealed).toBe(false);
    }
  });

  test('every room has at least one connection', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const dungeon = await gs<any>(page, 'getDungeon()');
    for (const room of dungeon.rooms) {
      expect(room.connections.length, `room ${room.id} has no connections`).toBeGreaterThan(0);
    }
  });

  test('warpToRoom changes current room', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const startRoom = await gs<any>(page, 'getRoom()');
    const dungeon = await gs<any>(page, 'getDungeon()');
    const target = dungeon.rooms.find((r: any) => r.id !== startRoom.id);

    await page.evaluate((id: number) => (window as any).__gameState.warpToRoom(id), target.id);
    await page.waitForTimeout(300);

    const current = await gs<any>(page, 'getRoom()');
    expect(current.id).toBe(target.id);
  });

  test('combat rooms have enemy spawns or elite overrides', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const dungeon = await gs<any>(page, 'getDungeon()');
    const combatRooms = dungeon.rooms.filter(
      (r: any) => ['combat', 'boss'].includes(r.template.type),
    );

    expect(combatRooms.length).toBeGreaterThan(0);
    for (const room of combatRooms) {
      expect(
        room.template.enemySpawns.length,
        `${room.template.type} room ${room.id} has no enemy spawns`,
      ).toBeGreaterThan(0);
    }

    // Elite rooms use eliteTeamOverride instead of enemySpawns
    const eliteRooms = dungeon.rooms.filter((r: any) => r.template.type === 'elite');
    for (const room of eliteRooms) {
      const hasSpawns = room.template.enemySpawns?.length > 0;
      const hasOverride = room.eliteTeamOverride?.length > 0;
      expect(hasSpawns || hasOverride).toBe(true);
    }
  });

  test('terminal rooms are marked as terminal', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const dungeon = await gs<any>(page, 'getDungeon()');
    // Each branch should have exactly one terminal room
    const terminalRooms = dungeon.rooms.filter((r: any) => r.terminal === true);
    // 5 regular branches + key path = 6 terminals (boss is separate)
    expect(terminalRooms.length).toBeGreaterThanOrEqual(6);
  });
});
