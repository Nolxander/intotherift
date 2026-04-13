/**
 * SimpleNav — lightweight tile-based pathfinder for riftling movement.
 *
 * Uses BFS (guaranteed shortest path on uniform-cost grids) with 8-directional
 * movement and corner-cut prevention. Path smoothing removes redundant
 * waypoints by skipping any node that has direct line-of-sight to a later one,
 * so units take natural arcing paths rather than stair-stepping along tile edges.
 *
 * Usage:
 *   const nav = new SimpleNav(resolvedTileGrid, TILE_SIZE);
 *   const waypoints = nav.findPath(unit.x, unit.y, target.x, target.y);
 *   // Follow waypoints[0], pop it when within ARRIVAL_RADIUS, repeat.
 */

export interface NavPoint { x: number; y: number }

/** Pixel distance to a waypoint at which the unit considers it "arrived". */
export const NAV_ARRIVAL_RADIUS = 8;

/** Squared distance beyond which the cached path goal is considered stale. */
const GOAL_STALE_DIST_SQ = 32 * 32;

/** How long (ms) a unit must be nearly-stationary before being considered stuck. */
export const STUCK_WINDOW_MS = 600;

/** Pixel movement below which a unit is considered "not progressing". */
export const STUCK_THRESHOLD_PX = 4;

const DIRS_8 = [
  { dx:  0, dy: -1 }, { dx:  0, dy:  1 },
  { dx: -1, dy:  0 }, { dx:  1, dy:  0 },
  { dx: -1, dy: -1 }, { dx:  1, dy: -1 },
  { dx: -1, dy:  1 }, { dx:  1, dy:  1 },
];

export class SimpleNav {
  private readonly walkable: boolean[][];
  private readonly W: number;
  private readonly H: number;
  private readonly T: number;

  /**
   * @param tiles  Resolved tile grid (0=void, 1=floor, 2=wall, 3=door, 4=water)
   * @param tileSize  Pixel size of one tile
   * @param extraBlocked  Optional set of tile indices (`ty * W + tx`) to mark
   *   unwalkable in addition to wall/void tiles. Used to route paths around
   *   decoration collision bodies (trees, logs, etc.) that aren't part of
   *   the base tile grid.
   */
  constructor(tiles: number[][], tileSize: number, extraBlocked?: Set<number>) {
    this.T = tileSize;
    this.H = tiles.length;
    this.W = tiles[0]?.length ?? 0;
    this.walkable = tiles.map(row => row.map(t => t === 1 || t === 3));
    if (extraBlocked) {
      for (const idx of extraBlocked) {
        const tx = idx % this.W;
        const ty = (idx / this.W) | 0;
        if (ty >= 0 && ty < this.H && tx >= 0 && tx < this.W) {
          this.walkable[ty][tx] = false;
        }
      }
    }
  }

  /**
   * Mark a single tile as unwalkable post-construction. Useful when
   * decorations or other obstacles are spawned after nav is built.
   */
  blockTile(tx: number, ty: number): void {
    if (tx >= 0 && ty >= 0 && tx < this.W && ty < this.H) {
      this.walkable[ty][tx] = false;
    }
  }

  /** Public LOS check between two world-space points. */
  hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    return this.los(x0, y0, x1, y1);
  }

  /** Public walkability check at a world-space point. Returns false for
   *  out-of-bounds coords (unlike tileOf, which clamps to the border). */
  isWalkableAt(wx: number, wy: number): boolean {
    const tx = Math.floor(wx / this.T);
    const ty = Math.floor(wy / this.T);
    return this.ok(tx, ty);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Find a smoothed path from world pos (sx,sy) to (gx,gy).
   * Returns world-space waypoints excluding the start position.
   * Falls back to a single direct waypoint if no tile path exists.
   */
  findPath(sx: number, sy: number, gx: number, gy: number): NavPoint[] {
    const s = this.tileOf(sx, sy);
    const g = this.tileOf(gx, gy);

    if (s.tx === g.tx && s.ty === g.ty) return [];

    const W = this.W;
    const key = (tx: number, ty: number) => ty * W + tx;
    const prev = new Map<number, number | null>();
    const queue: number[] = [key(s.tx, s.ty)];
    prev.set(key(s.tx, s.ty), null);
    const goalKey = key(g.tx, g.ty);

    let found = false;
    bfs: while (queue.length > 0) {
      const cur = queue.shift()!;
      const ctx = cur % W;
      const cty = (cur / W) | 0;

      for (const { dx, dy } of DIRS_8) {
        const nx = ctx + dx;
        const ny = cty + dy;
        if (!this.ok(nx, ny)) continue;
        // Prevent diagonal corner-cutting through walls
        if (dx !== 0 && dy !== 0 && (!this.ok(ctx + dx, cty) || !this.ok(ctx, cty + dy))) continue;

        const nk = key(nx, ny);
        if (prev.has(nk)) continue;
        prev.set(nk, cur);
        if (nk === goalKey) { found = true; break bfs; }
        queue.push(nk);
      }
    }

    if (!found) return [{ x: gx, y: gy }]; // no path — go direct

    // Reconstruct tile path
    const tilePath: NavPoint[] = [];
    let cur: number | null = goalKey;
    const startKey = key(s.tx, s.ty);
    while (cur !== null && cur !== startKey) {
      tilePath.unshift(this.center(cur % W, (cur / W) | 0));
      cur = prev.get(cur) ?? null;
    }

    // Replace last point with exact goal coords, then smooth
    if (tilePath.length > 0) tilePath[tilePath.length - 1] = { x: gx, y: gy };
    return this.smooth(sx, sy, tilePath);
  }

  /**
   * Check whether a cached path is still usable.
   * Returns false if the goal has moved significantly (stale) or the path is empty.
   */
  static isPathStale(
    waypoints: NavPoint[],
    cachedGoal: NavPoint | null,
    currentGoalX: number,
    currentGoalY: number,
  ): boolean {
    if (!waypoints.length || !cachedGoal) return true;
    const dx = currentGoalX - cachedGoal.x;
    const dy = currentGoalY - cachedGoal.y;
    return dx * dx + dy * dy > GOAL_STALE_DIST_SQ;
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private tileOf(wx: number, wy: number): { tx: number; ty: number } {
    return {
      tx: Math.max(0, Math.min(this.W - 1, Math.floor(wx / this.T))),
      ty: Math.max(0, Math.min(this.H - 1, Math.floor(wy / this.T))),
    };
  }

  private center(tx: number, ty: number): NavPoint {
    return { x: tx * this.T + this.T / 2, y: ty * this.T + this.T / 2 };
  }

  private ok(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.W && ty < this.H && this.walkable[ty][tx];
  }

  /** Remove redundant waypoints that are in direct LOS from the previous position. */
  private smooth(sx: number, sy: number, path: NavPoint[]): NavPoint[] {
    if (path.length <= 1) return path;
    const result: NavPoint[] = [];
    let fx = sx;
    let fy = sy;
    let i = 0;
    while (i < path.length) {
      let furthest = i;
      for (let j = path.length - 1; j > i; j--) {
        if (this.los(fx, fy, path[j].x, path[j].y)) { furthest = j; break; }
      }
      result.push(path[furthest]);
      fx = path[furthest].x;
      fy = path[furthest].y;
      i = furthest + 1;
    }
    return result;
  }

  /** Tile-space line-of-sight check via Bresenham's line algorithm. */
  private los(x0: number, y0: number, x1: number, y1: number): boolean {
    let tx = Math.floor(x0 / this.T);
    let ty = Math.floor(y0 / this.T);
    const ex = Math.floor(x1 / this.T);
    const ey = Math.floor(y1 / this.T);
    const adx = Math.abs(ex - tx);
    const ady = Math.abs(ey - ty);
    const sx = tx < ex ? 1 : -1;
    const sy = ty < ey ? 1 : -1;
    let err = adx - ady;
    for (let steps = 0; steps < 300; steps++) {
      if (!this.ok(tx, ty)) return false;
      if (tx === ex && ty === ey) return true;
      const e2 = err * 2;
      if (e2 > -ady) { err -= ady; tx += sx; }
      if (e2 < adx)  { err += adx; ty += sy; }
    }
    return false;
  }
}
