/**
 * Into the Rift builder adapter — connects the shared AGD builder
 * (`C:\Users\nolxa\agd\builder\`) to the Phaser-based dungeon scene.
 *
 * This file is dev-only. `src/main.ts` dynamic-imports it behind
 * `import.meta.env.DEV` so Rollup tree-shakes it out of production builds,
 * along with the AGD builder module it pulls in.
 *
 * ─── How it fits together ──────────────────────────────────────────────
 *
 * The AGD builder is engine-agnostic — it works with a `MapLike` interface
 * (free-form ground/collision arrays + entity list). Into the Rift stores
 * rooms as `RoomTemplate` objects (tile code grid + decorations[] + spawns).
 * This adapter translates between the two:
 *
 *   - `getMap()` returns a cached MapLike built on top of the live
 *     RoomTemplate. The `entities[]` array holds a snapshot of decorations
 *     (plus synthetic entries for player/enemy spawns so they're visible in
 *     inspect mode). The `layers.ground` array is the flattened tile grid.
 *   - `onEntityPlaced` / `onEntityRemoved` / `onTileChanged` call into
 *     DungeonScene's live-edit hooks so the running game stays in sync
 *     with the builder's edits.
 *   - `serializeMap()` returns the RoomTemplate shape directly — the save
 *     endpoint writes one JSON file per room into `assets/rooms/`.
 *
 * ─── Overlay canvas ───────────────────────────────────────────────────
 *
 * Phaser owns a WebGL canvas we can't draw into with a 2D context. We
 * create a second HTML canvas absolutely-positioned over Phaser's canvas
 * and draw the builder overlay there. Input listeners attach to the
 * overlay; we toggle `pointer-events` so gameplay works when the builder
 * is closed.
 */

import {
  initBuilder as coreInit,
  toggleBuilder as coreToggle,
  isBuilderActive as coreIsActive,
  renderBuilderOverlay as coreRender,
  updateBuilder as coreUpdate,
} from 'agd-builder';
import type { BuilderAdapter, MapLike, EntityLike, TileType } from 'agd-builder';
import type { DungeonScene } from '../scenes/DungeonScene';
import type { RoomTemplate, Biome } from '../data/room_templates';
import { DECORATION_CATALOG } from '../data/decorations';
import { getRoomKey } from '../data/room_templates';

const TILE = 16;

const ALL_BIOMES: Biome[] = [
  'dungeon', 'grass_cliff', 'grass_water',
  'dark_grass_cliff', 'dark_grass_water', 'dark_forest',
  'dark_plains_bluff', 'dark_lava', 'dark_badlands',
  'dark_jungle', 'dark_void',
];

// ─── Overlay canvas management ────────────────────────────────────────

let overlayCanvas: HTMLCanvasElement | null = null;
let overlayCtx: CanvasRenderingContext2D | null = null;
let phaserCanvas: HTMLCanvasElement | null = null;

function ensureOverlay(): HTMLCanvasElement {
  if (overlayCanvas) return overlayCanvas;

  // Locate Phaser's canvas — it's the only <canvas> Phaser creates and it
  // lives in the document body by default (no parent container set in main.ts).
  phaserCanvas = document.querySelector('canvas');
  if (!phaserCanvas) {
    throw new Error('[builder] Phaser canvas not found in DOM');
  }

  const c = document.createElement('canvas');
  c.id = 'itr-builder-overlay';
  c.width = phaserCanvas.width;
  c.height = phaserCanvas.height;
  c.style.cssText = `
    position: fixed; pointer-events: none; image-rendering: pixelated;
    z-index: 900;
  `;
  document.body.appendChild(c);
  overlayCanvas = c;
  overlayCtx = c.getContext('2d');

  syncOverlayPosition();
  window.addEventListener('resize', syncOverlayPosition);
  // Phaser's scale manager fires resize via the canvas itself — poll
  // cheaply on rAF while visible to catch CSS size changes from FIT mode.
  return c;
}

function syncOverlayPosition(): void {
  if (!overlayCanvas || !phaserCanvas) return;
  const rect = phaserCanvas.getBoundingClientRect();
  overlayCanvas.style.left = `${rect.left}px`;
  overlayCanvas.style.top = `${rect.top}px`;
  overlayCanvas.style.width = `${rect.width}px`;
  overlayCanvas.style.height = `${rect.height}px`;
}

// ─── MapLike translation ──────────────────────────────────────────────

/**
 * Cached MapLike shim over the currently-loaded RoomTemplate. Rebuilt
 * whenever `getMap()` detects the underlying template pointer has changed.
 * The entities[] array is a live snapshot owned by this module — when the
 * builder mutates it (via placeEntity/removeEntity), we reconcile back to
 * `template.decorations` inside the live-edit hooks.
 */
let cachedMap: MapLike | null = null;
let cachedTemplate: RoomTemplate | null = null;

function buildMapLike(scene: DungeonScene, tmpl: RoomTemplate): MapLike {
  const w = tmpl.width;
  const h = tmpl.height;

  // Flatten tiles to a 1D ground array. The builder's tile brush writes
  // directly into this array; we mirror writes back to template.tiles in
  // onTileChanged (so the next `getMap()` call stays consistent).
  const ground: number[] = [];
  const collision: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tmpl.tiles[y][x];
      ground.push(t);
      // Walls (2) and void (0) are solid; floor (1), door (3), water (4) walkable.
      collision.push(t === 2 || t === 0 ? 1 : 0);
    }
  }

  // Convert decorations to entity records. Integer tile coords for the
  // builder grid; fractional positions in the source are floored for
  // hit-testing (builder tools operate on whole tiles).
  const entities: EntityLike[] = [];
  if (tmpl.decorations) {
    for (const dec of tmpl.decorations) {
      const def = DECORATION_CATALOG[dec.sprite];
      entities.push({
        id: `dec_${dec.sprite}_${dec.x}_${dec.y}`,
        type: 'decoration',
        x: Math.floor(dec.x),
        y: Math.floor(dec.y),
        properties: {
          sprite: dec.sprite,
          sprite_path: def?.path ?? '',
          category: 'decoration',
          style: dec.sprite,
          // Preserve the original fractional coords so we can round-trip
          // a decoration placed by the builder back into template.decorations.
          raw_x: dec.x,
          raw_y: dec.y,
        },
      });
    }
  }

  // Player spawn as a synthetic entity (inspect-only — removing it is a no-op).
  entities.push({
    id: 'player_spawn',
    type: 'spawn',
    x: Math.floor(tmpl.playerSpawn.x),
    y: Math.floor(tmpl.playerSpawn.y),
    properties: { style: 'player_spawn', category: 'spawn' },
  });

  // Enemy spawns as synthetic entities.
  for (let i = 0; i < tmpl.enemySpawns.length; i++) {
    const s = tmpl.enemySpawns[i];
    entities.push({
      id: `enemy_spawn_${i}`,
      type: 'spawn',
      x: Math.floor(s.x),
      y: Math.floor(s.y),
      properties: { style: 'enemy_spawn', category: 'spawn', index: i },
    });
  }

  const roomKey = getRoomKey(tmpl) ?? 'untitled';

  return {
    id: roomKey,
    name: tmpl.name,
    width: w,
    height: h,
    tileSize: TILE,
    tileset: tmpl.biome ?? 'dungeon',
    layers: {
      ground,
      collision,
      foreground: new Array(w * h).fill(0),
      wang: undefined,
    },
    entities,
    transitions: [],
    encounters: null,
    defaultSpawn: { x: tmpl.playerSpawn.x, y: tmpl.playerSpawn.y },
  };
}

// ─── Decoration catalog for the palette ───────────────────────────────

function buildAssetList(): Array<{ style: string; category: string; sprite_path: string }> {
  return Object.values(DECORATION_CATALOG).map(def => ({
    style: def.key,
    category: def.collides ? 'prop' : 'overlay',
    sprite_path: def.path,
  }));
}

/**
 * Build a data URL containing the full decoration catalog in the builder's
 * asset-list format. We feed this to the builder via `getAssetCatalogUrl()`
 * so Scene scope (the default palette view) shows every catalog item, not
 * just styles already placed in the current room. Without this, a fresh
 * room would show only the decorations baked into the template, forcing
 * the user to click "All" before seeing new props they can place.
 */
function buildCatalogDataUrl(): string {
  const items = buildAssetList();
  const json = JSON.stringify(items);
  // btoa handles ASCII; decoration keys are ASCII so this is safe.
  return `data:application/json;base64,${btoa(json)}`;
}

function buildSolidStyles(): { categories: Set<string>; styles: Set<string> } {
  const styles = new Set<string>();
  for (const def of Object.values(DECORATION_CATALOG)) {
    if (def.collides) styles.add(def.key);
  }
  return { categories: new Set<string>(['prop']), styles };
}

function buildOverlayStyles(): { categories: Set<string>; styles: Set<string> } {
  const styles = new Set<string>();
  for (const def of Object.values(DECORATION_CATALOG)) {
    if (!def.collides) styles.add(def.key);
  }
  return { categories: new Set<string>(['overlay']), styles };
}

// ─── Tile type palette (paints tile codes 0–4) ────────────────────────
//
// Paints the five tile codes the engine understands. `previewUrl` points at
// the actual biome wang sprite so the palette shows real tiles, not generic
// color swatches:
//   - floor / door → wang_0 (pure lower terrain of the current biome)
//   - wall / water / void → wang_15 (pure upper terrain)
// We rebuild these every time the palette opens so the previews track the
// current room's biome. See `getTileTypes()` below.

function buildTileTypes(biome: string): TileType[] {
  const isBiome = biome !== 'dungeon';
  const floorPreview = isBiome ? `assets/tiles/${biome}/wang_0.png` : 'assets/tiles/floor.png';
  const wallPreview  = isBiome ? `assets/tiles/${biome}/wang_15.png` : 'assets/tiles/wall.png';
  const voidPreview  = isBiome ? `assets/tiles/${biome}/wang_15.png` : 'assets/tiles/void.png';
  // Saturated contrast colors for the hover highlight — must stand out on
  // dark biome terrain. These are ONLY used when the sprite preview fails to
  // load or for the hover fill; the palette thumbnail uses previewUrl.
  return [
    { id: 1, name: 'floor', color: '#44ff88', previewUrl: floorPreview },
    { id: 2, name: 'wall',  color: '#ff8844', previewUrl: wallPreview },
    { id: 3, name: 'door',  color: '#66aaff', previewUrl: floorPreview },
    { id: 4, name: 'water', color: '#44aaff', previewUrl: wallPreview },
    { id: 0, name: 'void',  color: '#aa44ff', previewUrl: voidPreview },
  ];
}

// ─── Public API ───────────────────────────────────────────────────────

export const isBuilderActive = coreIsActive;
export const renderBuilderOverlay = coreRender;
export const updateBuilder = coreUpdate;

let sceneRef: DungeonScene | null = null;

// ─── Biome selector dropdown ─────────────────────────────────────────

let biomeSelect: HTMLSelectElement | null = null;

function ensureBiomeSelector(): HTMLSelectElement {
  if (biomeSelect) return biomeSelect;

  const sel = document.createElement('select');
  sel.id = 'itr-biome-selector';
  for (const b of ALL_BIOMES) {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b.replace(/_/g, ' ');
    sel.appendChild(opt);
  }
  sel.style.cssText = `
    position: fixed; top: 8px; right: 8px; z-index: 1000;
    padding: 4px 8px; font-family: monospace; font-size: 13px;
    background: #1a1a2e; color: #e0e0e0; border: 1px solid #444;
    border-radius: 4px; display: none;
  `;
  sel.addEventListener('change', () => {
    if (!sceneRef) return;
    const tmpl = sceneRef.getCurrentTemplate();
    tmpl.biome = sel.value as Biome;
    cachedTemplate = null;
    sceneRef.rebuildAllTiles();
  });
  document.body.appendChild(sel);
  biomeSelect = sel;
  return sel;
}

function syncBiomeSelector(): void {
  const sel = ensureBiomeSelector();
  if (!sceneRef) return;
  const tmpl = sceneRef.getCurrentTemplate();
  sel.value = tmpl.biome || 'dungeon';
}

/**
 * Initialize the builder. Must be called once the DungeonScene is running
 * (so Phaser's canvas exists and the current room is loaded).
 */
export function initBuilder(scene: DungeonScene): void {
  sceneRef = scene;
  ensureOverlay();

  const adapter: BuilderAdapter = {
    getMap() {
      if (!sceneRef) return null;
      const tmpl = sceneRef.getCurrentTemplate();
      if (tmpl !== cachedTemplate) {
        cachedTemplate = tmpl;
        cachedMap = buildMapLike(sceneRef, tmpl);
      }
      return cachedMap;
    },

    getCamera() {
      if (!sceneRef) return { x: 0, y: 0 };
      const cam = sceneRef.getCurrentCamera();
      return { x: cam.scrollX, y: cam.scrollY, zoom: cam.zoom };
    },

    getCanvas() {
      return ensureOverlay();
    },

    onEntityPlaced(entity: EntityLike) {
      if (!sceneRef || !cachedTemplate) return;
      // Decoration placements: forward to the scene's live hook. Spawns
      // placed from the builder aren't supported in this MVP.
      if (entity.type !== 'decoration') return;
      const sprite = String(entity.properties.sprite ?? entity.properties.style ?? '');
      if (!sprite) return;
      const ok = sceneRef.addDecoration(sprite, entity.x, entity.y);
      if (!ok) {
        // Roll back the builder's entity push if the sprite was unknown.
        if (cachedMap) {
          const idx = cachedMap.entities.indexOf(entity);
          if (idx >= 0) cachedMap.entities.splice(idx, 1);
        }
      }
    },

    onEntityRemoved(tileX: number, tileY: number) {
      if (!sceneRef) return;
      sceneRef.removeDecorationAt(tileX, tileY);
      // Invalidate the cached map so the next getMap() call re-reads
      // template.decorations (the builder already mutated its own
      // entities[] copy but our shim needs to stay in sync for spawn
      // entries that live alongside decorations).
      cachedTemplate = null;
    },

    onTileChanged(tileX: number, tileY: number, tileId: number) {
      if (!sceneRef || !cachedTemplate) return;
      // Write through to the authoritative template.tiles grid so saves
      // and rebuilds see the change.
      if (
        tileY >= 0 && tileY < cachedTemplate.height &&
        tileX >= 0 && tileX < cachedTemplate.width
      ) {
        cachedTemplate.tiles[tileY][tileX] = tileId;
      }
      sceneRef.rebuildTileNeighborhood(tileX, tileY);
    },

    getTileTypes() {
      if (!sceneRef) return [];
      const tmpl = sceneRef.getCurrentTemplate();
      return buildTileTypes(tmpl.biome ?? 'dungeon');
    },

    getAllAssets() {
      return buildAssetList();
    },

    /**
     * Merge the full decoration catalog into Scene scope (default palette
     * view) so every placeable prop is visible without clicking "All".
     * The builder fetches this URL once per open and merges any returned
     * items with the styles discovered from the current room's entities.
     */
    getAssetCatalogUrl() {
      return buildCatalogDataUrl();
    },

    getSolidStyles() {
      return buildSolidStyles();
    },

    getOverlayStyles() {
      return buildOverlayStyles();
    },

    getSaveEndpoint() {
      return { url: '/api/save-room', idField: 'roomId' };
    },

    /**
     * Serialize the current room as a RoomTemplate JSON blob. The save
     * endpoint writes this straight to `assets/rooms/<id>.json`. On next
     * page reload, `import.meta.glob` picks it up and applyOverride merges
     * it on top of the in-code definition.
     */
    serializeMap(_map: MapLike): Record<string, unknown> | null {
      if (!cachedTemplate) return null;
      const tmpl = cachedTemplate;
      return {
        name: tmpl.name,
        type: tmpl.type,
        width: tmpl.width,
        height: tmpl.height,
        tiles: tmpl.tiles.map(row => [...row]),
        enemySpawns: tmpl.enemySpawns.map(s => ({ ...s })),
        playerSpawn: { ...tmpl.playerSpawn },
        biome: tmpl.biome,
        decorations: (tmpl.decorations ?? []).map(d => ({ ...d })),
      };
    },
  };

  coreInit(adapter);
}

/**
 * Toggle the builder on/off. Flips overlay pointer-events so input routes
 * to the overlay when active and falls through to Phaser otherwise.
 */
export function toggleBuilder(): void {
  coreToggle();
  const active = coreIsActive();
  if (overlayCanvas) {
    overlayCanvas.style.pointerEvents = active ? 'auto' : 'none';
    if (active) syncOverlayPosition();
  }
  const sel = ensureBiomeSelector();
  sel.style.display = active ? 'block' : 'none';
  if (active) syncBiomeSelector();
}

/**
 * Per-frame overlay redraw. Call from DungeonScene.update() AFTER
 * updateBuilder(dt). Clears and redraws the overlay canvas.
 */
export function drawOverlay(): void {
  if (!overlayCanvas || !overlayCtx) return;
  if (!coreIsActive()) {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    return;
  }
  syncOverlayPosition();
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  coreRender(overlayCtx, overlayCanvas.width, overlayCanvas.height);
}

// Also exported for symmetry — the AGD builder exposes the Biome type
// import so we re-export it for consumers wiring the hotkey in main.ts.
export type { Biome };
