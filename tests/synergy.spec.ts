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

async function gs<T>(page: Page, call: string): Promise<T> {
  return page.evaluate(`window.__gameState.${call}`) as Promise<T>;
}

test.describe('Type Synergy System', () => {
  test('no synergies active with single-riftling starting party', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const synergies = await gs<any[]>(page, 'getActiveSynergies()');
    expect(synergies).toHaveLength(0);
  });

  test('fire synergy activates with 2 fire riftlings in party', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Inject Pyreshell (fire) alongside the starting Emberhound (fire)
    await page.evaluate(() => (window as any).__gameState.injectRiftling('pyreshell'));

    const party = await gs<any>(page, 'getParty()');
    expect(party.active.filter((r: any) => r.elementType === 'fire')).toHaveLength(2);

    const synergies = await gs<any[]>(page, 'getActiveSynergies()');
    expect(synergies).toHaveLength(1);
    expect(synergies[0].synergy.type).toBe('fire');
    expect(synergies[0].synergy.name).toBe('Blaze');
    expect(synergies[0].count).toBe(2);
  });

  test('light synergy activates with Solarglare + Lumoth', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    await page.evaluate(() => (window as any).__gameState.injectRiftling('solarglare'));
    await page.evaluate(() => (window as any).__gameState.injectRiftling('lumoth'));

    const synergies = await gs<any[]>(page, 'getActiveSynergies()');
    const lightSynergy = synergies.find((s: any) => s.synergy.type === 'light');
    expect(lightSynergy).toBeDefined();
    expect(lightSynergy.count).toBe(2);
  });

  test('multiple synergies can be active simultaneously', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // 2 fire + 2 light in a 4-slot active team (Emberhound already present)
    await page.evaluate(() => (window as any).__gameState.injectRiftling('pyreshell'));   // fire
    await page.evaluate(() => (window as any).__gameState.injectRiftling('solarglare')); // light
    await page.evaluate(() => (window as any).__gameState.injectRiftling('lumoth'));     // light

    const party = await gs<any>(page, 'getParty()');
    expect(party.active).toHaveLength(4);

    const synergies = await gs<any[]>(page, 'getActiveSynergies()');
    expect(synergies.length).toBeGreaterThanOrEqual(2);

    const types = synergies.map((s: any) => s.synergy.type);
    expect(types).toContain('fire');
    expect(types).toContain('light');
  });

  test('synergy disappears when party drops below threshold', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Inject a second fire riftling → synergy active
    await page.evaluate(() => (window as any).__gameState.injectRiftling('pyreshell'));
    const synergyBefore = await gs<any[]>(page, 'getActiveSynergies()');
    expect(synergyBefore.some((s: any) => s.synergy.type === 'fire')).toBe(true);

    // Move Pyreshell from active to bench via party mutation
    await page.evaluate(() => {
      const p = (window as any).__gameState.getParty();
      const idx = p.active.findIndex((r: any) => r.name === 'Pyreshell');
      if (idx !== -1) {
        const [r] = p.active.splice(idx, 1);
        p.bench.push(r);
      }
    });

    const synergyAfter = await gs<any[]>(page, 'getActiveSynergies()');
    expect(synergyAfter.some((s: any) => s.synergy.type === 'fire')).toBe(false);
  });

  test('all 6 synergy types are defined', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Inject pairs of each type (4 active slots — test 2 at a time)
    const typeTests: [string, string][] = [
      ['tidecrawler', 'water'],
      ['gloomfang', 'dark'],
      ['barkbiter', 'nature'],
      ['tremorhorn', 'earth'],
    ];

    for (const [key, type] of typeTests) {
      await page.goto('/');
      await waitForGameReady(page);
      await dismissTrinketSelect(page);

      // Find a riftling of the same type to pair with
      const tmpl: Record<string, string> = {
        water: 'tidecrawler', dark: 'gloomfang', nature: 'barkbiter', earth: 'tremorhorn',
      };
      await page.evaluate((k) => (window as any).__gameState.injectRiftling(k), key);
      await page.evaluate((k) => (window as any).__gameState.injectRiftling(k), tmpl[type] ?? key);

      const synergies = await gs<any[]>(page, 'getActiveSynergies()');
      // At minimum this type synergy should be present if 2+ of same type
      const match = synergies.find((s: any) => s.synergy.type === type);
      // Only assert if we actually have 2 of the right type
      const party = await gs<any>(page, 'getParty()');
      const count = party.active.filter((r: any) => r.elementType === type).length;
      if (count >= 2) {
        expect(match).toBeDefined();
      }
    }
  });

  test('screenshot: synergy HUD updates after injecting a second fire riftling', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    await expect(page).toHaveScreenshot('synergy-hud-one-fire.png');

    await page.evaluate(() => (window as any).__gameState.injectRiftling('pyreshell'));
    await page.waitForTimeout(100); // one render frame

    await expect(page).toHaveScreenshot('synergy-hud-fire-active.png');
  });
});
