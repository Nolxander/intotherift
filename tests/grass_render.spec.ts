// Visual debug for tall-grass split-sprite rendering.
// Loads ?testRoom=grass_test (a 6x6 dense block of tall_grass_dark with the
// player spawned just above it) and screenshots the player at several
// positions inside the patch so we can manually verify there is no popping
// and the head/upper body remain visible.
import { test, type Page } from '@playwright/test';

async function gotoGrassRoom(page: Page) {
  await page.goto('/?testRoom=grass_test&canvas=1');
  await page.waitForFunction(() => !!(window as any).__gameState, null, { timeout: 10_000 });
  await page.waitForTimeout(300);
}

async function setTrainerPos(page: Page, x: number, y: number) {
  await page.evaluate(([px, py]) => {
    (window as any).__gameState.setTrainerPos(px, py);
  }, [x, y]);
  await page.waitForTimeout(80);
}

async function shot(page: Page, name: string) {
  // Crop tightly around the grass patch — patch tiles x=12..17, y=9..14
  // → world px [192,288] x [144,240]. The game canvas is 480x320 and the
  // camera is centered on the player, so screen coords need the camera
  // scroll. Easiest: full-canvas screenshot — the patch lands near center.
  await page.screenshot({
    path: `tests/grass_render.spec.ts-debug/${name}.png`,
    fullPage: false,
  });
}

test('grass render debug screenshots', async ({ page }) => {
  await gotoGrassRoom(page);

  // Tile (col, row) center: x = col*16+8, y = row*16+8
  // Grass patch occupies rows 9..14, cols 12..17. Player spawn (12, 8).
  const positions: { name: string; x: number; y: number }[] = [
    { name: '01_above',          x: 200, y: 136 },  // just above patch (row 8)
    { name: '02_row9_top',       x: 200, y: 144 },  // top of row 9
    { name: '03_row9_center',    x: 200, y: 152 },  // tile (12,9) center
    { name: '04_row9_bottom',    x: 200, y: 160 },  // bottom of row 9
    { name: '05_row10_center',   x: 200, y: 168 },  // tile (12,10) center
    { name: '06_row11_center',   x: 200, y: 184 },  // tile (12,11) center
    { name: '07_row12_center',   x: 200, y: 200 },  // tile (12,12) center
    { name: '08_below_patch',    x: 200, y: 248 },  // row 15 (just below patch)
    { name: '09_horiz_col13',    x: 216, y: 184 },  // (13,11) center
    { name: '10_horiz_between',  x: 224, y: 184 },  // between (13,11) and (14,11)
    { name: '11_horiz_col14',    x: 232, y: 184 },  // (14,11) center
  ];

  for (const p of positions) {
    await setTrainerPos(page, p.x, p.y);
    await shot(page, p.name);
  }
});
