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
  private readonly clearance: boolean[][];
  private readonly W: number;
  private readonly H: number;
  private readonly T: number;
  private readonly inflate: number;

  /**
   * @param tiles  Resolved tile grid (0=void, 1=floor, 2=wall, 3=door, 4=water)
   * @param tileSize  Pixel size of one tile
   * @param extraBlocked  Optional set of tile indices (`ty * W + tx`) to mark
   *   unwalkable in addition to wall/void tiles. Used to route paths around
   *   decoration collision bodies (trees, logs, etc.) that aren't part of
   *   the base tile grid.
   * @param clearanceRadius  Pixel radius of the moving unit. Obstacles are
   *   dilated by `ceil(radius / tileSize)` tiles so the pathfinder won't plan
   *   routes where the unit's body would clip walls or decorations. Pass 0 to
   *   disable dilation.
   */
  constructor(
    tiles: number[][],
    tileSize: number,
    extraBlocked?: Set<number>,
    clearanceRadius = 0,
  ) {
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
    this.inflate = clearanceRadius > 0 ? Math.ceil(clearanceRadius / tileSize) : 0;
    this.clearance = this.buildClearance();
  }

  private buildClearance(): boolean[][] {
    if (this.inflate <= 0) return this.walkable.map(row => row.slice());
    const out: boolean[][] = [];
    for (let y = 0; y < this.H; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < this.W; x++) {
        let clear = this.walkable[y][x];
        if (clear) {
          outer: for (let dy = -this.inflate; dy <= this.inflate; dy++) {
            for (let dx = -this.inflate; dx <= this.inflate; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= this.W || ny >= this.H || !this.walkable[ny][nx]) {
                clear = false;
                break outer;
              }
            }
          }
        }
        row.push(clear);
      }
      out.push(row);
    }
    return out;
  }

  /**
   * Mark a single tile as unwalkable post-construction. Useful when
   * decorations or other obstacles are spawned after nav is built.
   */
  blockTile(tx: number, ty: number): void {
    if (tx >= 0 && ty >= 0 && tx < this.W && ty < this.H) {
      this.walkable[ty][tx] = false;
      const r = this.inflate;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = tx + dx;
          const ny = ty + dy;
          if (nx >= 0 && ny >= 0 && nx < this.W && ny < this.H) {
            this.clearance[ny][nx] = false;
          }
        }
      }
    }
  }

  /** Public LOS check between two world-space points. */
  hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    return this.los(x0, y0, x1, y1);
  }

  /**
   * Resolve a world-space point to the nearest clearance-walkable tile center.
   * Used to sanitize spawn and leap-landing positions so nothing ends up inside
   * a wall or behind a decoration collider. Returns the input point if it is
   * already walkable, or the original point unchanged if no clear tile exists.
   */
  snapToWalkable(wx: number, wy: number): NavPoint {
    const tx = Math.floor(wx / this.T);
    const ty = Math.floor(wy / this.T);
    if (this.ok(tx, ty)) return { x: wx, y: wy };
    const near = this.nearestClear(tx, ty);
    if (!near) return { x: wx, y: wy };
    return this.center(near.tx, near.ty);
  }

  /** Public walkability check at a world-space point. Returns false for
   *  out-of-bounds coords (unlike tileOf, which clamps to the border).
   *  Uses the raw walkable grid (not the clearance-dilated one) — this is a
   *  "can a unit occupy this tile at all" check, not "can a path route here". */
  isWalkableAt(wx: number, wy: number): boolean {
    const tx = Math.floor(wx / this.T);
    const ty = Math.floor(wy / this.T);
    return tx >= 0 && ty >= 0 && tx < this.W && ty < this.H && this.walkable[ty][tx];
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Find a smoothed path from world pos (sx,sy) to (gx,gy).
   * Returns world-space waypoints excluding the start position.
   * Falls back to a single direct waypoint if no tile path exists.
   */
  findPath(sx: number, sy: number, gx: number, gy: number): NavPoint[] {
    const s0 = this.tileOf(sx, sy);
    const g0 = this.tileOf(gx, gy);

    // If start or goal sits inside a dilated-obstacle cell, escape to the
    // nearest clearance-walkable tile. Without this, a unit touching a wall
    // or a target standing beside a tree would fail to find any path even
    // though a valid route exists a tile away.
    const s = this.ok(s0.tx, s0.ty) ? s0 : (this.nearestClear(s0.tx, s0.ty) ?? s0);
    const g = this.ok(g0.tx, g0.ty) ? g0 : (this.nearestClear(g0.tx, g0.ty) ?? g0);

    if (s.tx === g.tx && s.ty === g.ty) return [{ x: gx, y: gy }];

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
    return tx >= 0 && ty >= 0 && tx < this.W && ty < this.H && this.clearance[ty][tx];
  }

  /** BFS on the clearance grid to find the nearest walkable tile. */
  private nearestClear(tx: number, ty: number): { tx: number; ty: number } | null {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return null;
    const W = this.W;
    const seen = new Set<number>([ty * W + tx]);
    const q: Array<{ tx: number; ty: number }> = [{ tx, ty }];
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      if (this.ok(cur.tx, cur.ty)) return cur;
      for (const { dx, dy } of DIRS_8) {
        const nx = cur.tx + dx;
        const ny = cur.ty + dy;
        if (nx < 0 || ny < 0 || nx >= this.W || ny >= this.H) continue;
        const k = ny * W + nx;
        if (seen.has(k)) continue;
        seen.add(k);
        q.push({ tx: nx, ty: ny });
      }
    }
    return null;
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
      const stepX = e2 > -ady;
      const stepY = e2 < adx;
      if (stepX && stepY) {
        // Diagonal step — block if either orthogonal neighbor is blocked,
        // mirroring the BFS corner-cut rule so smoothing can't squeeze a
        // path through a wall corner.
        if (!this.ok(tx + sx, ty) || !this.ok(tx, ty + sy)) return false;
      }
      if (stepX) { err -= ady; tx += sx; }
      if (stepY) { err += adx; ty += sy; }
    }
    return false;
  }
}
