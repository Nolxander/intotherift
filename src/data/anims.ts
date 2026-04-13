/**
 * Shared animation utilities for DungeonScene and CombatManager.
 *
 * Walk animation key convention: `{prefix}_walk_{dir}`
 * e.g. `player_walk_south`, `emberhound_walk_north-east`
 *
 * Frame texture key convention: `{prefix}_walk_{dir}_{frameIndex}`
 * e.g. `player_walk_south_0` … `player_walk_south_5`
 *
 * If an animation doesn't exist for a given prefix+dir (riftlings without
 * walk assets yet), playWalkOrStatic falls back to the static directional
 * texture transparently — no changes needed when walk frames are added later.
 */

export const WALK_DIRS = [
  'south', 'south-west', 'west', 'north-west',
  'north', 'north-east', 'east', 'south-east',
] as const;

/** Default walk-animation framerate. Can be overridden per-prefix in registerWalkAnims. */
const DEFAULT_WALK_FPS = 8;

/**
 * Classify a velocity vector into one of 8 compass directions.
 *
 * Uses angle-based sectors with cardinals biased *wider* than diagonals
 * (cardinals 60°, diagonals 30°). This means a movement that is mostly
 * along an axis with a small perpendicular drift is classified as the
 * cardinal — fixing the "always diagonal" bug that came from feeding
 * `Math.sign(vx), Math.sign(vy)` into a quadrant-based classifier and
 * making 4-direction walk animations never trigger.
 *
 * Pass the *raw* velocity floats — do not Math.sign them.
 */
export function directionFromVelocity(vx: number, vy: number): string {
  if (vx === 0 && vy === 0) return 'south';
  // atan2 returns -π..π with 0 = +x (east), π/2 = +y (south, screen-down)
  const deg = (Math.atan2(vy, vx) * 180 / Math.PI + 360) % 360;
  // Cardinal sector half-width = 30° (so cardinals span 60°),
  // diagonal sector half-width = 15° (so diagonals span 30°).
  // East centered at 0°, south-east at 45°, ... north-east at 315°.
  if (deg < 30 || deg >= 330) return 'east';
  if (deg < 60)  return 'south-east';
  if (deg < 120) return 'south';
  if (deg < 150) return 'south-west';
  if (deg < 210) return 'west';
  if (deg < 240) return 'north-west';
  if (deg < 300) return 'north';
  return 'north-east';
}

/**
 * Register walk animations for `prefix` from individually-loaded frame images.
 * Silently skips any direction whose first frame texture isn't loaded yet,
 * so it's safe to call for riftlings that don't have walk assets yet.
 * Safe to call multiple times — skips already-registered keys.
 */
export function registerWalkAnims(
  scene: Phaser.Scene,
  prefix: string,
  frameCount: number,
  frameRate: number = DEFAULT_WALK_FPS,
): void {
  for (const dir of WALK_DIRS) {
    const key = `${prefix}_walk_${dir}`;
    if (scene.anims.exists(key)) continue;
    if (!scene.textures.exists(`${prefix}_walk_${dir}_0`)) continue;

    scene.anims.create({
      key,
      frames: Array.from({ length: frameCount }, (_, i) => ({
        key: `${prefix}_walk_${dir}_${i}`,
      })),
      frameRate,
      repeat: -1,
    });
  }
}

/**
 * Cardinal fallbacks for diagonal directions.
 * When a sprite only has 4-direction animations, a diagonal like "south-east"
 * will try "south" then "east" before giving up and showing the static texture.
 */
const DIAGONAL_FALLBACKS: Partial<Record<string, [string, string]>> = {
  'north-east': ['north', 'east'],
  'north-west': ['north', 'west'],
  'south-east': ['south', 'east'],
  'south-west': ['south', 'west'],
};

/**
 * Play the walk animation for (prefix, dir) if it exists, otherwise show the
 * static directional texture. Passes ignoreIfPlaying=true so switching to the
 * same direction mid-cycle doesn't restart from frame 0.
 *
 * For diagonal directions, if no animation exists the function tries the two
 * nearest cardinals before falling back to the static texture. This means
 * riftlings with only 4-direction walk animations automatically use the
 * nearest cardinal rather than going unanimated.
 */
export function playWalkOrStatic(
  sprite: Phaser.Physics.Arcade.Sprite,
  prefix: string,
  dir: string,
  animManager: Phaser.Animations.AnimationManager,
): void {
  const key = `${prefix}_walk_${dir}`;
  if (animManager.exists(key)) {
    sprite.anims.play(key, true);
    return;
  }

  // Try cardinal fallbacks for diagonal directions
  const fallbacks = DIAGONAL_FALLBACKS[dir];
  if (fallbacks) {
    for (const fallback of fallbacks) {
      const fallbackKey = `${prefix}_walk_${fallback}`;
      if (animManager.exists(fallbackKey)) {
        sprite.anims.play(fallbackKey, true);
        return;
      }
    }
  }

  // No animation available — show static texture
  if (sprite.anims.isPlaying) sprite.anims.stop();
  sprite.setTexture(`${prefix}_${dir}`);
}

/**
 * Register one-shot attack animations for `prefix` / `animKey` from individually-loaded
 * frame images. Silently skips directions whose first frame isn't loaded.
 * Safe to call multiple times — skips already-registered keys.
 */
export function registerAttackAnims(
  scene: Phaser.Scene,
  prefix: string,
  animKey: string,
  frameCount: number,
  dirs: string[] = ['south', 'north', 'east', 'west'],
  frameRate: number = 16,
): void {
  for (const dir of dirs) {
    const key = `${prefix}_atk_${animKey}_${dir}`;
    if (scene.anims.exists(key)) continue;
    if (!scene.textures.exists(`${prefix}_atk_${animKey}_${dir}_0`)) continue;
    scene.anims.create({
      key,
      frames: Array.from({ length: frameCount }, (_, i) => ({
        key: `${prefix}_atk_${animKey}_${dir}_${i}`,
      })),
      frameRate,
      repeat: 0, // one-shot
    });
  }
}

/**
 * Play a one-shot attack animation. Tries the exact direction first, then
 * cardinal fallbacks for diagonals. No-ops silently if no animation is registered.
 * Calls onComplete when the animation finishes (use to restore idle texture).
 */
export function playAttackAnim(
  sprite: Phaser.Physics.Arcade.Sprite,
  prefix: string,
  animKey: string,
  dir: string,
  animManager: Phaser.Animations.AnimationManager,
  onComplete?: () => void,
): void {
  const candidates = [dir, ...(DIAGONAL_FALLBACKS[dir] ?? [])];
  for (const d of candidates) {
    const key = `${prefix}_atk_${animKey}_${d}`;
    if (!animManager.exists(key)) continue;
    sprite.anims.play(key, true);
    if (onComplete) {
      sprite.once('animationcomplete', onComplete);
    }
    return;
  }
}

/**
 * Returns true if the sprite is currently mid-attack animation.
 * Used to prevent stopWalkAnim from interrupting an in-flight attack anim.
 */
export function isPlayingAttackAnim(sprite: Phaser.Physics.Arcade.Sprite, prefix: string): boolean {
  return sprite.anims.isPlaying && (sprite.anims.currentAnim?.key.startsWith(`${prefix}_atk_`) ?? false);
}

/**
 * Stop any playing walk animation and show the idle static texture.
 * No-op if nothing is playing.
 */
export function stopWalkAnim(
  sprite: Phaser.Physics.Arcade.Sprite,
  prefix: string,
  dir: string,
): void {
  if (sprite.anims.isPlaying) sprite.anims.stop();
  sprite.setTexture(`${prefix}_${dir}`);
}
