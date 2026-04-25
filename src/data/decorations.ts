/**
 * Decoration catalog — map_object props that can be placed inside room
 * templates via the `decorations` field. Each entry defines the sprite
 * texture, target pixel size at which it will render in the game, and
 * whether the player collides with it.
 *
 * ─── Auto-discovery ────────────────────────────────────────────────────
 *
 * The catalog is built at dev/build time by scanning `assets/objects/` for
 * any `<slug>/object.png`. Any asset dropped into that folder (e.g. via
 * `python -m assetmanager catalog import <id> --as <key>`) automatically
 * becomes:
 *   1. Placeable in the F4 in-browser room builder
 *   2. Preloaded by BootScene (which iterates DECORATION_CATALOG)
 *   3. Renderable in saved rooms that reference the new sprite
 *
 * No code edit needed for new imports unless you want a non-default render
 * size or collision box — see `DECORATION_OVERRIDES` below.
 *
 * ─── Overrides ─────────────────────────────────────────────────────────
 *
 * Auto-discovered entries use sensible defaults (32px display, no
 * collision). Add an entry to `DECORATION_OVERRIDES` when you need a
 * specific display size or a custom collision body — e.g. trees render
 * larger and collide, grass stays small and walkable.
 *
 * Registry key convention: directory name with dashes → underscores.
 * e.g. `assets/objects/dark-pine-tree/` → key `dark_pine_tree`.
 *
 * Collision bodies are centered at the prop's visual base (the bottom-
 * middle of the sprite) and sized smaller than the sprite so the player
 * can walk visually close without snagging.
 */

export interface DecorationDef {
  /** Registry key — matches the directory slug (dashes→underscores) and Phaser texture key. */
  key: string;
  /** Path relative to the `assets/` directory, served by Vite from project root. */
  path: string;
  /** Target render size in game pixels (the longer sprite dimension). */
  displaySize: number;
  /** True if the player and riftlings should collide with this prop. */
  collides: boolean;
  /** Collision body width in game pixels (only used when collides=true). */
  collisionWidth?: number;
  /** Collision body height in game pixels (only used when collides=true). */
  collisionHeight?: number;
  /**
   * Where on the sprite to anchor the collision body vertically:
   *   'base'   — bottom of the sprite (good for trees: body at trunk)
   *   'center' — visual center of the sprite (good for rocks, crystals,
   *              logs — things whose visible body fills the whole sprite)
   * Defaults to 'base' to preserve existing tree behavior.
   */
  collisionAnchor?: 'base' | 'center';
  /**
   * Optional vertical shift in game pixels applied to the sprite's render
   * position (positive = down). Used for "immersive" props like tall grass
   * so their bottom aligns with a character's visual feet rather than the
   * tile bottom, producing the classic "standing in grass" overlap.
   */
  yOffset?: number;
}

/**
 * Explicit per-asset tuning. Any slug discovered in `assets/objects/` that
 * does NOT appear here falls back to DEFAULT_DEF. Add an entry here when
 * a specific asset needs a custom render size or collision body.
 */
const DECORATION_OVERRIDES: Record<string, Omit<DecorationDef, 'key' | 'path'>> = {
  dark_pine_tree: {
    displaySize: 48,
    collides: true,
    collisionWidth: 8,
    collisionHeight: 6,
  },
  twisted_dark_tree: {
    displaySize: 48,
    collides: true,
    collisionWidth: 8,
    collisionHeight: 6,
  },
  corrupted_tree: {
    displaySize: 64,
    collides: true,
    collisionWidth: 10,
    collisionHeight: 6,
  },
  hollow_log: {
    displaySize: 48,
    collides: true,
    collisionWidth: 28,
    collisionHeight: 10,
    collisionAnchor: 'center',
  },
  glowing_mushroom: {
    displaySize: 32,
    collides: false,
  },
  rift_corruption_node: {
    displaySize: 24,
    collides: false,
  },
  stepping_stone: {
    displaySize: 16,
    collides: false,
  },
  rift_stairs_down: {
    displaySize: 48,
    collides: false,
  },
  tall_grass_dark: {
    displaySize: 20,
    collides: false,
    yOffset: 6,
  },
  tall_grass_wild: {
    displaySize: 20,
    collides: false,
    yOffset: 6,
  },
  badlands_small_rock: {
    displaySize: 16,
    collides: false,
  },
  badlands_rock_cluster: {
    displaySize: 28,
    collides: true,
    collisionWidth: 14,
    collisionHeight: 6,
    collisionAnchor: 'center',
  },
  badlands_cracked_boulder: {
    displaySize: 40,
    collides: true,
    collisionWidth: 20,
    collisionHeight: 8,
    collisionAnchor: 'center',
  },
  giant_fern: {
    displaySize: 36,
    collides: false,
  },
  rift_crystal_cluster: {
    displaySize: 24,
    collides: true,
    collisionWidth: 12,
    collisionHeight: 5,
    collisionAnchor: 'center',
  },
  rift_crystal_shard: {
    displaySize: 28,
    collides: true,
    collisionWidth: 12,
    collisionHeight: 5,
    collisionAnchor: 'center',
  },
  rift_crystal_formation: {
    displaySize: 40,
    collides: true,
    collisionWidth: 16,
    collisionHeight: 6,
    collisionAnchor: 'center',
  },
  rift_crystal_outcrop: {
    displaySize: 32,
    collides: true,
    collisionWidth: 14,
    collisionHeight: 6,
    collisionAnchor: 'center',
  },
  // Boss arena: a single 16x16 lava tile rendered as a flat ground decal.
  // Walkable (combat units must be able to traverse the arena), but the
  // glow paints the floor with the Elite's signature corruption.
  lava_pool: {
    displaySize: 18,
    collides: false,
  },
};

/** Default render config for discovered assets with no explicit override. */
const DEFAULT_DEF: Omit<DecorationDef, 'key' | 'path'> = {
  displaySize: 32,
  collides: false,
};

// Auto-discover every `assets/objects/<slug>/object.png` at dev/build time.
// Vite resolves import.meta.glob statically — the key list reflects the
// filesystem at build time (dev mode re-evaluates on HMR, so new files
// show up after a page reload).
const objectSprites = import.meta.glob('../../assets/objects/*/object.png');

/**
 * Build the decoration catalog by merging auto-discovered slugs with
 * explicit overrides. Called once at module init.
 */
function buildCatalog(): Record<string, DecorationDef> {
  const catalog: Record<string, DecorationDef> = {};
  for (const globPath of Object.keys(objectSprites)) {
    // globPath looks like '/assets/objects/dark-pine-tree/object.png' or a
    // relative variant — match on the /objects/<slug>/object.png suffix.
    const match = globPath.match(/[/\\]objects[/\\]([^/\\]+)[/\\]object\.png$/);
    if (!match) continue;
    const slug = match[1];
    const key = slug.replace(/-/g, '_');
    const relPath = `assets/objects/${slug}/object.png`;
    const override = DECORATION_OVERRIDES[key];
    catalog[key] = {
      key,
      path: relPath,
      ...(override ?? DEFAULT_DEF),
    };
  }
  return catalog;
}

export const DECORATION_CATALOG: Record<string, DecorationDef> = buildCatalog();

export const ALL_DECORATION_KEYS = Object.keys(DECORATION_CATALOG);
