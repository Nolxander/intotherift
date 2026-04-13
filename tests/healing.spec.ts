import { test, expect, Page } from '@playwright/test';

async function waitForGameReady(page: Page) {
  await page.waitForFunction(() => !!(window as any).__gameState, null, { timeout: 20_000 });
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

/** Warp directly to a room by type, returns the room ID used. */
async function warpToRoomType(page: Page, type: string): Promise<number> {
  return page.evaluate((t) => {
    const gs = (window as any).__gameState;
    const room = gs.getDungeon().rooms.find((r: any) => r.template.type === t);
    if (!room) throw new Error(`No room of type: ${t}`);
    gs.warpToRoom(room.id);
    return room.id;
  }, type);
}

test.describe('Healing Spring', () => {
  test('healing room exists in dungeon', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const dungeon = await page.evaluate(() => (window as any).__gameState.getDungeon());
    const healingRooms = dungeon.rooms.filter((r: any) => r.template.type === 'healing');
    expect(healingRooms).toHaveLength(1);
  });

  test('warping to healing room lands in healing room', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    await warpToRoomType(page, 'healing');

    // Give Phaser a frame to settle
    await page.waitForTimeout(200);

    const room = await page.evaluate(() => (window as any).__gameState.getRoom());
    expect(room.template.type).toBe('healing');
    expect(await page.evaluate(() => (window as any).__gameState.isCombatActive())).toBe(false);

    await expect(page).toHaveScreenshot('healing-room.png');
  });

  test('walking to spring heals party', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Drain some HP by warping through a combat room first
    await warpToRoomType(page, 'healing');
    await page.waitForTimeout(200);

    // Manually reduce HP via party reference so we can observe the heal
    await page.evaluate(() => {
      const party = (window as any).__gameState.getParty();
      for (const r of party.active) r.hp = Math.floor(r.maxHp * 0.4);
    });

    const hpBefore = await page.evaluate(() => {
      const p = (window as any).__gameState.getParty();
      return p.active.map((r: any) => r.hp);
    });

    // Walk toward the spring (center of the room at tile 15,10)
    // Player spawns at the entry edge — walk toward center
    await page.keyboard.down('w');
    await page.waitForTimeout(1500);
    await page.keyboard.up('w');
    await page.waitForTimeout(200);

    const hpAfter = await page.evaluate(() => {
      const p = (window as any).__gameState.getParty();
      return p.active.map((r: any) => r.hp);
    });

    // HP should have increased for at least one party member
    const healed = hpAfter.some((hp: number, i: number) => hp > hpBefore[i]);
    expect(healed).toBe(true);

    await expect(page).toHaveScreenshot('healing-spring-used.png');
  });

  test('timer pauses while party screen is open', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const t1 = await page.evaluate(() => (window as any).__gameState.getTimerSeconds());

    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => (window as any).__gameState.isPartyScreenActive())).toBe(true);

    // Wait 3 real seconds with party screen open
    await page.waitForTimeout(3000);

    const t2 = await page.evaluate(() => (window as any).__gameState.getTimerSeconds());
    // Timer should NOT have decremented while party screen was open
    expect(t2).toBe(t1);

    await page.keyboard.press('Escape');
  });
});
