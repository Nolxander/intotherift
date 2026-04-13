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

async function gs(page: Page, call: string) {
  return page.evaluate(`window.__gameState.${call}`);
}

test.describe('Party Screen', () => {
  test('Tab opens party screen in overworld', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    expect(await gs(page, 'isPartyScreenActive()')).toBe(false);

    await page.keyboard.press('Tab');

    expect(await gs(page, 'isPartyScreenActive()')).toBe(true);
    await expect(page).toHaveScreenshot('party-screen-open.png');

    // Clean up
    await page.keyboard.press('Escape');
    expect(await gs(page, 'isPartyScreenActive()')).toBe(false);
  });

  test('Tab is blocked during combat', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Walk north into combat room
    await page.keyboard.down('w');
    await page.waitForTimeout(2500);
    await page.keyboard.up('w');

    const inCombat = await gs(page, 'isCombatActive()');
    if (!inCombat) {
      test.skip(); // didn't enter a combat room, skip
      return;
    }

    await page.keyboard.press('Tab');
    // Party screen should NOT open during combat
    expect(await gs(page, 'isPartyScreenActive()')).toBe(false);
  });

  test('Tab is blocked during recruit prompt', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Walk into combat, wait for it to end and recruit prompt to appear
    await page.keyboard.down('w');
    await page.waitForTimeout(2500);
    await page.keyboard.up('w');

    const inCombat = await gs(page, 'isCombatActive()');
    if (!inCombat) { test.skip(); return; }

    await page.waitForFunction(
      () => !(window as any).__gameState.isCombatActive(),
      null, { timeout: 30_000 },
    );
    await page.waitForFunction(
      () => (window as any).__gameState.isRecruitActive(),
      null, { timeout: 10_000 },
    );

    await page.keyboard.press('Tab');
    expect(await gs(page, 'isPartyScreenActive()')).toBe(false);

    // Clean up
    await page.keyboard.press('Escape');
  });

  test('initial party shows Emberhound with moves', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const party = await page.evaluate(() => (window as any).__gameState.getParty());
    const ember = party.active[0];

    // Moves system
    expect(ember.moves).toHaveLength(3);
    expect(ember.moves[0].name).toBe('Ember Strike');
    expect(ember.moves[1].isSignature).toBe(true); // Fire Dash
    expect(ember.equipped).toEqual([0, 1]);

    // Role
    expect(ember.role).toBe('chaser');
  });

  test('all riftlings have a role and moves', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const party = await page.evaluate(() => (window as any).__gameState.getParty());
    for (const r of party.active) {
      expect(['chaser', 'anchor', 'skirmisher']).toContain(r.role);
      expect(r.moves.length).toBeGreaterThan(0);
      expect(r.equipped).toHaveLength(2);
    }
  });
});
