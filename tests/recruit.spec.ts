import { test, expect, Page } from '@playwright/test';

/**
 * Helper: evaluate a __gameState accessor on the page.
 * Returns the JSON-serializable result.
 */
async function gameState(page: Page, accessor: string) {
  return page.evaluate(`window.__gameState?.${accessor}`);
}

/** Wait until __gameState is available (Phaser booted + DungeonScene created). */
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

/** Hold a key down for a given duration. */
async function holdKey(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/** Wait for combat to start in the current room. */
async function waitForCombat(page: Page) {
  await page.waitForFunction(
    () => (window as any).__gameState?.isCombatActive(),
    null,
    { timeout: 5_000 },
  );
}

/** Wait for combat to finish. */
async function waitForCombatEnd(page: Page) {
  await page.waitForFunction(
    () => !(window as any).__gameState?.isCombatActive(),
    null,
    { timeout: 30_000 },
  );
}

/** Wait for recruit prompt to appear. */
async function waitForRecruitPrompt(page: Page) {
  await page.waitForFunction(
    () => (window as any).__gameState?.isRecruitActive(),
    null,
    { timeout: 30_000 },
  );
}

test.describe('Recruit System', () => {
  test('game loads and initial party has 1 riftling', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const party = await gameState(page, 'getParty()');
    expect(party.active).toHaveLength(1);
    expect(party.active[0].name).toBe('Emberhound');
    expect(party.bench).toHaveLength(0);
  });

  test('player starts in start room (cleared, not combat)', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const room = await gameState(page, 'getRoom()');
    expect(room.template.type).toBe('start');
    expect(room.cleared).toBe(true);
  });

  test('walking north enters combat room and triggers combat', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Walk north (W key) toward the door — start room has north door
    await holdKey(page, 'w', 2500);

    // Should have transitioned to combat room and combat should be active
    const room = await gameState(page, 'getRoom()');
    expect(['combat', 'elite', 'recruit']).toContain(room.template.type);

    const inCombat = await gameState(page, 'isCombatActive()');
    expect(inCombat).toBe(true);
  });

  test('full recruit flow: combat -> recruit prompt -> recruit riftling', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Verify starting state
    const startParty = await gameState(page, 'getParty()');
    expect(startParty.active).toHaveLength(1);

    // Walk north into combat room
    await holdKey(page, 'w', 2500);

    // Wait for combat to start
    const room = await gameState(page, 'getRoom()');
    if (!['combat', 'elite', 'recruit'].includes(room.template.type)) {
      // Not a combat room — skip this test run (dungeon layout varies)
      test.skip();
      return;
    }

    await waitForCombat(page);

    // Wait for combat to finish (companion auto-battles)
    await waitForCombatEnd(page);

    // Wait for recruit prompt (1s delay after "Room Cleared!")
    await waitForRecruitPrompt(page);

    // Verify recruit prompt is active
    const recruiting = await gameState(page, 'isRecruitActive()');
    expect(recruiting).toBe(true);

    // Press 1 to recruit the first option
    await page.keyboard.press('1');

    // Wait for recruit prompt to close
    await page.waitForFunction(
      () => !(window as any).__gameState?.isRecruitActive(),
      null,
      { timeout: 5_000 },
    );

    // Party should now have 2 active riftlings
    const updatedParty = await gameState(page, 'getParty()');
    expect(updatedParty.active.length).toBeGreaterThanOrEqual(2);
  });

  test('recruit prompt can be skipped with Escape', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Walk north into combat room
    await holdKey(page, 'w', 2500);

    const room = await gameState(page, 'getRoom()');
    if (!['combat', 'elite', 'recruit'].includes(room.template.type)) {
      test.skip();
      return;
    }

    await waitForCombat(page);
    await waitForCombatEnd(page);
    await waitForRecruitPrompt(page);

    // Press Escape to skip
    await page.keyboard.press('Escape');

    // Prompt should close
    await page.waitForFunction(
      () => !(window as any).__gameState?.isRecruitActive(),
      null,
      { timeout: 5_000 },
    );

    // Party should still be 1 (no recruit)
    const party = await gameState(page, 'getParty()');
    expect(party.active).toHaveLength(1);
  });

  test('recruit works in second combat room (survives room transition)', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // --- Room 1: enter first combat, recruit ---
    await holdKey(page, 'w', 2500);

    let room = await gameState(page, 'getRoom()');
    if (!['combat', 'elite', 'recruit'].includes(room.template.type)) {
      test.skip();
      return;
    }

    await waitForCombat(page);
    await waitForCombatEnd(page);
    await waitForRecruitPrompt(page);

    // Recruit in first room
    await page.keyboard.press('1');
    await page.waitForFunction(
      () => !(window as any).__gameState?.isRecruitActive(),
      null,
      { timeout: 5_000 },
    );

    const partyAfterFirst = await gameState(page, 'getParty()');
    const sizeAfterFirst = partyAfterFirst.active.length + partyAfterFirst.bench.length;
    expect(sizeAfterFirst).toBeGreaterThanOrEqual(2);

    // --- Room 2: walk north again into another room ---
    await holdKey(page, 'w', 2500);

    room = await gameState(page, 'getRoom()');

    // If this room has combat, verify the recruit system still works
    if (['combat', 'elite', 'recruit'].includes(room.template.type) && !room.cleared) {
      await waitForCombat(page);
      await waitForCombatEnd(page);
      await waitForRecruitPrompt(page);

      // Recruit prompt works in room 2 — this was the core bug
      const recruiting = await gameState(page, 'isRecruitActive()');
      expect(recruiting).toBe(true);

      // Recruit again
      await page.keyboard.press('1');
      await page.waitForFunction(
        () => !(window as any).__gameState?.isRecruitActive(),
        null,
        { timeout: 5_000 },
      );

      const partyAfterSecond = await gameState(page, 'getParty()');
      const sizeAfterSecond = partyAfterSecond.active.length + partyAfterSecond.bench.length;
      expect(sizeAfterSecond).toBeGreaterThan(sizeAfterFirst);
    }
  });

  test('door transitions are blocked during recruit prompt', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    await holdKey(page, 'w', 2500);

    const room = await gameState(page, 'getRoom()');
    if (!['combat', 'elite', 'recruit'].includes(room.template.type)) {
      test.skip();
      return;
    }

    await waitForCombat(page);
    await waitForCombatEnd(page);
    await waitForRecruitPrompt(page);

    // Record which room we're in
    const roomDuring = await gameState(page, 'getRoom()');

    // Try to walk toward a door while recruit prompt is open
    await holdKey(page, 'w', 1000);

    // Should still be in the same room (transitions blocked)
    const roomAfterWalk = await gameState(page, 'getRoom()');
    expect(roomAfterWalk.id).toBe(roomDuring.id);

    // Dismiss the prompt
    await page.keyboard.press('Escape');
  });
});
