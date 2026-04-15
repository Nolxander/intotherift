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

async function gs<T>(page: Page, call: string): Promise<T> {
  return page.evaluate(`window.__gameState.${call}`) as Promise<T>;
}

test.describe('XP & Leveling', () => {
  test('all riftlings start at level 1 with 0 XP', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const party = await gs<any>(page, 'getParty()');
    for (const r of party.active) {
      expect(r.level).toBe(1);
      expect(r.xp).toBe(0);
    }
  });

  test('riftlings have a temperament assigned', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const party = await gs<any>(page, 'getParty()');
    for (const r of party.active) {
      expect(r.temperament).toBeDefined();
      expect(r.temperament.name).toBeTruthy();
      expect(typeof r.temperament.boosted === 'string' || r.temperament.boosted === null).toBe(true);
    }
  });

  test('grantXP increases riftling XP', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const before = await gs<any>(page, 'getParty()');
    const xpBefore = before.active[0].xp;

    await page.evaluate(() => (window as any).__gameState.grantXP(0, 5));

    const after = await gs<any>(page, 'getParty()');
    expect(after.active[0].xp).toBeGreaterThan(xpBefore);
  });

  test('enough XP triggers a level-up', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // 20 XP needed for level 1→2
    const result = await page.evaluate(() => (window as any).__gameState.grantXP(0, 20));
    expect(result).not.toBeNull();
    expect(result.newLevel).toBe(2);

    const after = await gs<any>(page, 'getParty()');
    expect(after.active[0].level).toBe(2);
    // Stat and move gains are picked via the card UI, so no automatic stat
    // changes happen here — this test only verifies the level counter.
  });

  test('grantXP returns null at max level', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    // Grant a huge XP dump — should cap at MAX_LEVEL (10)
    await page.evaluate(async () => {
      for (let i = 0; i < 10; i++) {
        (window as any).__gameState.grantXP(0, 10000);
      }
    });

    const party = await gs<any>(page, 'getParty()');
    expect(party.active[0].level).toBe(10);

    // Once at max level, grantXP returns null
    const result = await page.evaluate(() => (window as any).__gameState.grantXP(0, 10000));
    expect(result).toBeNull();
  });

  // Temperament no longer auto-applies stat gains on player level-up — it
  // now biases the stat-card roll instead. Card-picking runs through the UI,
  // so direct stat assertions here aren't meaningful.

  test('all 8 riftling species have the expected new stat fields', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    const requiredFields = ['defense', 'critRate', 'evasion', 'attackSpeed', 'attackRange', 'role'];
    const species = ['emberhound', 'pyreshell', 'solarglare', 'lumoth', 'tidecrawler', 'gloomfang', 'barkbiter', 'tremorhorn'];

    for (let i = 0; i < species.length; i++) {
      if (i > 0) {
        await page.evaluate((k) => (window as any).__gameState.injectRiftling(k), species[i]);
      }
    }

    const party = await gs<any>(page, 'getParty()');
    // Check the injected riftlings (they all end up in active + bench)
    const all = [...party.active, ...party.bench];

    for (const r of all) {
      for (const field of requiredFields) {
        expect(r[field], `${r.name} missing field: ${field}`).toBeDefined();
      }
    }
  });

  test('Pyreshell is tankier than Emberhound (GAP-003 regression)', async ({ page }) => {
    await page.goto('/');
    await waitForGameReady(page);
    await dismissTrinketSelect(page);

    await page.evaluate(() => (window as any).__gameState.injectRiftling('pyreshell'));

    const party = await gs<any>(page, 'getParty()');
    const ember = party.active.find((r: any) => r.name === 'Emberhound');
    const pyreshell = party.active.find((r: any) => r.name === 'Pyreshell');

    expect(pyreshell).toBeDefined();
    // Pyreshell should be the tanky anchor: higher HP and defense than Emberhound
    expect(pyreshell.maxHp).toBeGreaterThan(ember.maxHp);
    expect(pyreshell.defense).toBeGreaterThan(ember.defense);
    expect(pyreshell.role).toBe('anchor');
  });
});
