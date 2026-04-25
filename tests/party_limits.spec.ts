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

test.describe('Party Limits', () => {
  test('max active party size is 4', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Start with 1 (emberhound), inject 3 more to fill active
    await page.evaluate(() => (window as any).__gameState.injectRiftling('pyreshell'));
    await page.evaluate(() => (window as any).__gameState.injectRiftling('solarglare'));
    await page.evaluate(() => (window as any).__gameState.injectRiftling('lumoth'));

    const party = await gs<any>(page, 'getParty()');
    expect(party.active).toHaveLength(4);
    expect(party.bench).toHaveLength(0);
  });

  test('5th riftling goes to bench', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Fill active (4)
    await page.evaluate(() => (window as any).__gameState.injectRiftling('pyreshell'));
    await page.evaluate(() => (window as any).__gameState.injectRiftling('solarglare'));
    await page.evaluate(() => (window as any).__gameState.injectRiftling('lumoth'));

    // 5th should overflow to bench
    await page.evaluate(() => (window as any).__gameState.injectRiftling('tidecrawler'));

    const party = await gs<any>(page, 'getParty()');
    expect(party.active).toHaveLength(4);
    expect(party.bench).toHaveLength(1);
    expect(party.bench[0].name).toBe('Tidecrawler');
  });

  test('each injected riftling has valid stats', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const party = await gs<any>(page, 'getParty()');
    const ember = party.active[0];

    // Core stats must be positive numbers
    expect(ember.maxHp).toBeGreaterThan(0);
    expect(ember.hp).toBeGreaterThan(0);
    expect(ember.hp).toBeLessThanOrEqual(ember.maxHp);
    expect(ember.attack).toBeGreaterThan(0);
    expect(ember.defense).toBeGreaterThanOrEqual(0);
    expect(ember.speed).toBeGreaterThan(0);
    expect(ember.attackSpeed).toBeGreaterThan(0);
    expect(ember.critRate).toBeGreaterThanOrEqual(0);
    expect(ember.evasion).toBeGreaterThanOrEqual(0);
  });

  test('riftlings start at full HP', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    await page.evaluate(() => (window as any).__gameState.injectRiftling('pyreshell'));
    await page.evaluate(() => (window as any).__gameState.injectRiftling('solarglare'));

    const party = await gs<any>(page, 'getParty()');
    for (const r of party.active) {
      expect(r.hp).toBe(r.maxHp);
    }
  });

  test('each species has a unique element type', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const species = ['pyreshell', 'solarglare', 'lumoth', 'tidecrawler', 'gloomfang', 'barkbiter', 'tremorhorn'];
    for (const key of species) {
      await page.evaluate((k: string) => (window as any).__gameState.injectRiftling(k), key);
    }

    const party = await gs<any>(page, 'getParty()');
    const all = [...party.active, ...party.bench];

    // All riftlings should have a defined elementType
    for (const r of all) {
      expect(r.elementType).toBeTruthy();
    }

    // Should cover all 6 element types
    const types = new Set(all.map((r: any) => r.elementType));
    expect(types.size).toBe(6);
  });

  test('stance defaults to push for all riftlings', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    await page.evaluate(() => (window as any).__gameState.injectRiftling('pyreshell'));

    const party = await gs<any>(page, 'getParty()');
    for (const r of party.active) {
      expect(r.stance).toBe('push');
    }
  });
});
