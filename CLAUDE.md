# Into the Rift — Claude Instructions

Roguelite creature-collector auto-battler built with Phaser 3 + TypeScript. Targeting Vibe Jam 2026 (deadline May 1, 2026). Web browser only, no login, no backend.

Read `ARCHITECTURE.md` before touching any code — it has the full codebase map, key system explanations, and depth/rendering rules.

---

## Commands

```bash
npm run dev          # dev server on :5173
npm run build        # tsc + vite build → dist/
npm test             # Playwright tests (spins up :5199 automatically)
npm run test:headed  # same, with browser visible
```

Tests use Playwright against `http://localhost:5199`. The dev server is started automatically by the test runner — don't start it manually before running tests.

---

## Project Structure

```
src/
  scenes/       BootScene.ts, DungeonScene.ts
  combat/       CombatManager.ts — all combat logic
  data/         party, dungeon, room_templates, nav, anims, decorations, trinkets
  ui/           PartyScreen, RecruitPrompt, CombatHUD, SynergyHUD
  editor/       builder_mode.ts — F4 in-browser room editor (dev only)
assets/
  sprites/      player/ + {riftling}/ — idle: {dir}.png, walk: animations/walk/{dir}/frame_00N.png
  tiles/        floor/wall/void + biome Wang tilesets (wang_0..15.png)
  objects/      decoration props: {slug}/object.png (auto-discovered by decorations.ts)
  rooms/        room template JSON files saved by the in-browser editor
GDD/            game design docs (00_Master_Index.md is the entry point)
```

---

## Key Conventions

**Renderer** — `?canvas=1` in the URL forces Canvas mode (used in tests to avoid WebGL instability in headless Chromium). The default is `Phaser.AUTO`.

**Depth sorting** — all moving sprites call `setDepth(10 + sprite.y / 10)` every frame. Static decorations set depth once at spawn using bottom-Y. Do not hardcode depths in that 10–42 range for anything that doesn't Y-sort.

**Directions** — 8-directional: `south south-west west north-west north north-east east south-east`. Used as string keys throughout sprites, animations, and AI logic. Do not abbreviate.

**Animation keys** — format is `{prefix}_walk_{dir}_{frameIndex}` for walk frames, `{prefix}_atk_{name}_{dir}_{frameIndex}` for attack frames. Registered in `BootScene.create()` via `registerWalkAnims` / `registerAttackAnims` in `src/data/anims.ts`.

**Tile grid** — rooms are defined as 2D char arrays in `src/data/room_templates.ts`. `'.'` = floor, `'#'` = wall, `' '` = void. The nav grid and physics walls are derived from this at `loadRoom()` time.

**Wang tilesets** — biome tiles are 16-tile Wang sets (`wang_0.png` … `wang_15.png`). The index encodes which of the 4 neighbors are the same biome (bitmask N/E/S/W = bits 3/2/1/0).

**agd-builder alias** — `vite.config.ts` maps `agd-builder` to `../../agd/builder` (the shared scene editor toolkit). This is a sibling repo at `C:\Users\nolxa\agd\`. Only imported dynamically in `editor/builder_mode.ts`; tree-shaken from production builds.

**Room save API** — in dev mode `vite-plugin-room-save.ts` exposes `POST /api/save-room` to write room JSON to `assets/rooms/`. The in-browser editor (F4) uses this. Do not call this endpoint from game logic.

---

## Testing

Playwright snapshot tests live in `tests/`. Snapshots are stored in `tests/*.spec.ts-snapshots/`. To update snapshots after intentional visual changes:

```bash
npm run test:update-snapshots
```

Pixel diff tolerance is 2% (`maxDiffPixelRatio: 0.02`) to account for WebGL sub-pixel variance.

---

## Scope Reminder

This is a jam build. Tier 1 scope is the target — 3 levels, 12 riftlings, core combat loop, no meta-progression. Do not add features beyond what is asked. Do not add docstrings or comments to code you didn't change.

See `GDD/00_Master_Index.md` for full scope tiers and `GDD/06_Decisions.md` for rationale behind past design choices.
