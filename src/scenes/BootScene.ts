import Phaser from 'phaser';
import { DECORATION_CATALOG } from '../data/decorations';
import { registerWalkAnims, registerAttackAnims } from '../data/anims';

const TITLE_RIFTLINGS = [
  'gloomfang', 'hollowcrow', 'curseclaw', 'veilseer', 'bogweft',
  'lumoth', 'emberhound', 'tidecrawler', 'rootlash', 'cindertail',
];

const ALL_RIFTLINGS = [
  'emberhound', 'solarglare', 'pyreshell', 'lumoth', 'tidecrawler', 'gloomfang',
  'barkbiter', 'tremorhorn', 'hollowcrow', 'rivelet', 'grindscale', 'thistlebound',
  'wavecaller', 'nettlehide', 'veilseer', 'cindertail', 'dawnstrike', 'bogweft',
  'dewspine', 'crestshrike', 'rootlash', 'smolderpaw', 'curseclaw', 'sunfleece',
  'rift_tyrant',
];

const PLAYER_DIRS = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'];
const CARDINAL_DIRS = ['south', 'north', 'east', 'west'];

let deferredAssetsReady = false;
let deferredAssetsStarted = false;

export function areDeferredAssetsReady(): boolean {
  return deferredAssetsReady;
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
    // --- Phase 1: Title screen essentials only ---

    // Idle sprites for riftlings that appear on the title screen
    for (const name of TITLE_RIFTLINGS) {
      for (const dir of PLAYER_DIRS) {
        this.load.image(`${name}_${dir}`, `assets/sprites/${name}/${dir}.png`);
      }
    }

    // Walk frames for title wanderers (they use playWalkOrStatic)
    for (const name of TITLE_RIFTLINGS) {
      const frameCount = name === 'lumoth' ? 6 : (name === 'wavecaller' ? 6 : 8);
      for (const dir of CARDINAL_DIRS) {
        for (let f = 0; f < frameCount; f++) {
          this.load.image(
            `${name}_walk_${dir}_${f}`,
            `assets/sprites/${name}/animations/walk/${dir}/frame_00${f}.png`,
          );
        }
      }
    }

    // Lumoth has 8-dir walk
    for (const dir of PLAYER_DIRS) {
      if (CARDINAL_DIRS.includes(dir)) continue;
      for (let f = 0; f < 6; f++) {
        this.load.image(
          `lumoth_walk_${dir}_${f}`,
          `assets/sprites/lumoth/animations/walk/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Rift Elite (title screen looming figure)
    for (const dir of PLAYER_DIRS) {
      this.load.image(`rift_elite_${dir}`, `assets/creatures/rift-elite/rotations/${dir}.png`);
    }
    const riftEliteIdleDirs: Array<{ dir: string; frames: number }> = [
      { dir: 'south', frames: 8 },
      { dir: 'east', frames: 9 },
      { dir: 'west', frames: 9 },
    ];
    for (const { dir, frames } of riftEliteIdleDirs) {
      for (let f = 0; f < frames; f++) {
        this.load.image(
          `rift_elite_idle_${dir}_${f}`,
          `assets/creatures/rift-elite/animations/idle/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Title music
    this.load.audio('music_title', 'assets/audio/music/title_screen.mp3');
  }

  create(): void {
    // --- Placeholder textures (needed by both title + dungeon) ---
    const typeColors: Record<string, number> = {
      fire: 0xe85d30, water: 0x3092e8, nature: 0x4caf50,
      earth: 0x8d6e3f, light: 0xf0e060, dark: 0x7b3fa0,
    };
    for (const [type, color] of Object.entries(typeColors)) {
      const gfx = this.add.graphics().setVisible(false);
      gfx.fillStyle(color);
      gfx.fillCircle(12, 12, 11);
      gfx.lineStyle(1, 0x000000);
      gfx.strokeCircle(12, 12, 11);
      gfx.generateTexture(`riftling_${type}`, 24, 24);
      gfx.destroy();
    }

    const enemyGfx = this.add.graphics().setVisible(false);
    enemyGfx.fillStyle(0xcc3333);
    enemyGfx.fillTriangle(8, 0, 16, 8, 8, 16);
    enemyGfx.fillTriangle(8, 0, 0, 8, 8, 16);
    enemyGfx.generateTexture('enemy', 16, 16);
    enemyGfx.destroy();

    const shadowGfx = this.add.graphics().setVisible(false);
    shadowGfx.fillStyle(0x000000, 0.3);
    shadowGfx.fillEllipse(8, 4, 16, 8);
    shadowGfx.generateTexture('shadow', 16, 8);
    shadowGfx.destroy();

    // Register walk anims for title-screen wanderers
    for (const name of TITLE_RIFTLINGS) {
      const frameCount = name === 'lumoth' ? 6 : (name === 'wavecaller' ? 6 : 8);
      const fps = name === 'lumoth' ? 12 : (name === 'gloomfang' ? 16 : (name === 'emberhound' ? 14 : (name === 'tidecrawler' ? 12 : (name === 'wavecaller' ? 12 : (name === 'rootlash' ? 12 : (name === 'cindertail' ? 14 : (name === 'curseclaw' ? 14 : 14)))))));
      registerWalkAnims(this, name, frameCount, fps);
    }

    // Rift Elite idle animations
    for (const { dir, frames } of [
      { dir: 'south', frames: 8 },
      { dir: 'east', frames: 9 },
      { dir: 'west', frames: 9 },
    ]) {
      const key = `rift_elite_idle_${dir}`;
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: Array.from({ length: frames }, (_, i) => ({
          key: `rift_elite_idle_${dir}_${i}`,
        })),
        frameRate: 8,
        repeat: -1,
      });
    }

    // --- Start deferred load for everything else ---
    this.startDeferredLoad();

    // Direct-load debug path skips Title
    const params = new URLSearchParams(window.location.search);
    const directLoad = params.get('testRoom') || params.get('bossTest');
    if (directLoad) {
      this.waitForDeferredThen(() => this.scene.start('Dungeon'));
    } else {
      this.scene.start('Title');
    }
  }

  private waitForDeferredThen(callback: () => void): void {
    if (deferredAssetsReady) {
      callback();
      return;
    }
    this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        if (deferredAssetsReady) callback();
      },
    });
  }

  private startDeferredLoad(): void {
    if (deferredAssetsStarted) return;
    deferredAssetsStarted = true;

    const scene = this;
    const loader = scene.load;

    // --- Tiles ---
    loader.image('floor', 'assets/tiles/floor.png');
    loader.image('wall', 'assets/tiles/wall.png');
    loader.image('void', 'assets/tiles/void.png');

    const biomes = [
      'grass_cliff', 'dark_grass_cliff', 'dark_grass_water', 'dark_forest',
      'dark_plains_bluff', 'dark_lava', 'dark_badlands', 'dark_jungle',
      'dark_void', 'hub_dirt_path', 'grass_water',
    ];
    for (const biome of biomes) {
      for (let i = 0; i < 16; i++) {
        loader.image(`${biome}_${i}`, `assets/tiles/${biome}/wang_${i}.png`);
      }
    }

    // --- Decorations ---
    for (const def of Object.values(DECORATION_CATALOG)) {
      loader.image(def.key, def.path);
    }

    // --- Player ---
    for (const dir of PLAYER_DIRS) {
      loader.image(`player_${dir}`, `assets/sprites/player/${dir}.png`);
    }
    for (const dir of PLAYER_DIRS) {
      for (let f = 0; f < 6; f++) {
        loader.image(
          `player_walk_${dir}_${f}`,
          `assets/sprites/player/animations/walk/${dir}/frame_00${f}.png`,
        );
      }
    }

    // --- Riftling idle sprites (skip already-loaded title ones) ---
    for (const name of ALL_RIFTLINGS) {
      if (TITLE_RIFTLINGS.includes(name)) continue;
      for (const dir of PLAYER_DIRS) {
        loader.image(`${name}_${dir}`, `assets/sprites/${name}/${dir}.png`);
      }
    }

    // --- Walk animations (skip already-loaded title ones) ---
    // Rivelet: 4 dirs × 9 frames
    for (const dir of CARDINAL_DIRS) {
      for (let f = 0; f < 9; f++) {
        loader.image(`rivelet_walk_${dir}_${f}`, `assets/sprites/rivelet/animations/walk/${dir}/frame_00${f}.png`);
      }
    }

    // Barkbiter walk: 4 dirs × 8 frames
    for (const dir of CARDINAL_DIRS) {
      for (let f = 0; f < 8; f++) {
        loader.image(`barkbiter_walk_${dir}_${f}`, `assets/sprites/barkbiter/animations/walk/${dir}/frame_00${f}.png`);
      }
    }

    // Tremorhorn walk: 4 dirs × 8 frames
    for (const dir of CARDINAL_DIRS) {
      for (let f = 0; f < 8; f++) {
        loader.image(`tremorhorn_walk_${dir}_${f}`, `assets/sprites/tremorhorn/animations/walk/${dir}/frame_00${f}.png`);
      }
    }

    // Pyreshell walk: 4 dirs × 8 frames
    for (const dir of CARDINAL_DIRS) {
      for (let f = 0; f < 8; f++) {
        loader.image(`pyreshell_walk_${dir}_${f}`, `assets/sprites/pyreshell/animations/walk/${dir}/frame_00${f}.png`);
      }
    }

    // Grindscale walk: 4 dirs × 8 frames
    for (const dir of CARDINAL_DIRS) {
      for (let f = 0; f < 8; f++) {
        loader.image(`grindscale_walk_${dir}_${f}`, `assets/sprites/grindscale/animations/walk/${dir}/frame_00${f}.png`);
      }
    }

    // Solarglare walk: 4 dirs × 8 frames
    for (const dir of CARDINAL_DIRS) {
      for (let f = 0; f < 8; f++) {
        loader.image(`solarglare_walk_${dir}_${f}`, `assets/sprites/solarglare/animations/walk/${dir}/frame_00${f}.png`);
      }
    }

    // Tidecrawler walk: 4 dirs × 8 frames (already loaded walk for title, but need to skip dups)
    // Title already loaded these — loader.image silently skips already-cached keys

    // Thistlebound walk: 4 dirs × 8 frames
    for (const dir of CARDINAL_DIRS) {
      for (let f = 0; f < 8; f++) {
        loader.image(`thistlebound_walk_${dir}_${f}`, `assets/sprites/thistlebound/animations/walk/${dir}/frame_00${f}.png`);
      }
    }

    // Hollowcrow walk: 4 dirs × 8 frames (frames 1-8 mapped to 0-7)
    for (const dir of CARDINAL_DIRS) {
      for (let f = 1; f < 9; f++) {
        loader.image(`hollowcrow_walk_${dir}_${f - 1}`, `assets/sprites/hollowcrow/animations/walk/${dir}/frame_00${f}.png`);
      }
    }

    // Batch walk 8-frame: remaining riftlings not in title pool
    const walkBatch8 = ['dewspine', 'nettlehide', 'smolderpaw', 'sunfleece'];
    for (const name of walkBatch8) {
      for (const dir of CARDINAL_DIRS) {
        for (let f = 0; f < 8; f++) {
          loader.image(`${name}_walk_${dir}_${f}`, `assets/sprites/${name}/animations/walk/${dir}/frame_00${f}.png`);
        }
      }
    }

    // Veilseer walk: 4 dirs × 8 frames
    for (const dir of CARDINAL_DIRS) {
      for (let f = 0; f < 8; f++) {
        loader.image(`veilseer_walk_${dir}_${f}`, `assets/sprites/veilseer/animations/walk/${dir}/frame_00${f}.png`);
      }
    }

    // Wavecaller walk: 4 dirs × 6 frames
    for (const dir of CARDINAL_DIRS) {
      for (let f = 0; f < 6; f++) {
        loader.image(`wavecaller_walk_${dir}_${f}`, `assets/sprites/wavecaller/animations/walk/${dir}/frame_00${f}.png`);
      }
    }

    // --- Attack animations ---
    const attacks8 = [
      'barkbiter', 'tremorhorn', 'pyreshell', 'grindscale', 'solarglare',
      'rivelet', 'bogweft', 'crestshrike', 'curseclaw', 'emberhound',
      'gloomfang', 'rootlash', 'smolderpaw', 'lumoth', 'thistlebound',
      'wavecaller', 'dawnstrike', 'hollowcrow', 'nettlehide', 'sunfleece',
      'veilseer', 'cindertail',
    ];
    for (const name of attacks8) {
      for (const dir of CARDINAL_DIRS) {
        for (let f = 0; f < 8; f++) {
          loader.image(`${name}_atk_attack_${dir}_${f}`, `assets/sprites/${name}/animations/atk_attack/${dir}/frame_00${f}.png`);
        }
      }
    }

    // Tidecrawler spin attack
    for (const dir of CARDINAL_DIRS) {
      for (let f = 0; f < 8; f++) {
        loader.image(`tidecrawler_atk_spin_${dir}_${f}`, `assets/sprites/tidecrawler/animations/atk_spin/${dir}/frame_00${f}.png`);
      }
    }

    // Rift Tyrant attacks (south only — 3 anims × 9 frames)
    for (const animKey of ['atk_aoe', 'atk_bite', 'atk_drain']) {
      for (let f = 0; f < 9; f++) {
        loader.image(`rift_tyrant_${animKey}_south_${f}`, `assets/sprites/rift_tyrant/animations/${animKey}/south/frame_00${f}.png`);
      }
    }

    // --- Rift Core ---
    for (const dir of PLAYER_DIRS) {
      loader.image(`rift_core_${dir}`, `assets/characters/rift-core/rotations/${dir}.png`);
    }

    // --- Audio (dungeon + boss) ---
    loader.audio('music_dungeon', 'assets/audio/music/background.mp3');
    loader.audio('music_boss', 'assets/audio/music/boss_battle.mp3');

    // --- Start the load and register anims when done ---
    loader.once('complete', () => {
      this.registerAllAnims();
      deferredAssetsReady = true;
    });
    loader.start();
  }

  private registerAllAnims(): void {
    // Player
    registerWalkAnims(this, 'player', 6);

    // Riftling walk + attack anims
    registerWalkAnims(this, 'rivelet', 9, 16);
    registerAttackAnims(this, 'rivelet', 'attack', 8);
    registerWalkAnims(this, 'lumoth', 6, 12);
    registerAttackAnims(this, 'lumoth', 'attack', 8);
    registerWalkAnims(this, 'barkbiter', 8, 14);
    registerAttackAnims(this, 'barkbiter', 'attack', 8);
    registerWalkAnims(this, 'tremorhorn', 8, 10);
    registerAttackAnims(this, 'tremorhorn', 'attack', 8);
    registerWalkAnims(this, 'gloomfang', 8, 16);
    registerWalkAnims(this, 'emberhound', 8, 14);
    registerWalkAnims(this, 'pyreshell', 8, 12);
    registerAttackAnims(this, 'pyreshell', 'attack', 8);
    registerWalkAnims(this, 'grindscale', 8, 12);
    registerAttackAnims(this, 'grindscale', 'attack', 8);
    registerWalkAnims(this, 'solarglare', 8, 14);
    registerAttackAnims(this, 'solarglare', 'attack', 8);
    registerWalkAnims(this, 'tidecrawler', 8, 12);
    registerAttackAnims(this, 'tidecrawler', 'spin', 8);
    registerWalkAnims(this, 'thistlebound', 8, 14);
    registerAttackAnims(this, 'thistlebound', 'attack', 8);
    registerWalkAnims(this, 'hollowcrow', 8, 14);
    registerAttackAnims(this, 'hollowcrow', 'attack', 8);
    registerWalkAnims(this, 'bogweft', 8, 12);
    registerAttackAnims(this, 'bogweft', 'attack', 8);
    registerWalkAnims(this, 'cindertail', 8, 14);
    registerAttackAnims(this, 'cindertail', 'attack', 8);
    registerWalkAnims(this, 'crestshrike', 8, 14);
    registerAttackAnims(this, 'crestshrike', 'attack', 8);
    registerWalkAnims(this, 'curseclaw', 8, 14);
    registerAttackAnims(this, 'curseclaw', 'attack', 8);
    registerWalkAnims(this, 'dawnstrike', 8, 14);
    registerAttackAnims(this, 'dawnstrike', 'attack', 8);
    registerWalkAnims(this, 'dewspine', 8, 12);
    registerAttackAnims(this, 'emberhound', 'attack', 8);
    registerAttackAnims(this, 'gloomfang', 'attack', 8);
    registerWalkAnims(this, 'nettlehide', 8, 12);
    registerAttackAnims(this, 'nettlehide', 'attack', 8);
    registerWalkAnims(this, 'rootlash', 8, 12);
    registerAttackAnims(this, 'rootlash', 'attack', 8);
    registerWalkAnims(this, 'smolderpaw', 8, 14);
    registerAttackAnims(this, 'smolderpaw', 'attack', 8);
    registerWalkAnims(this, 'sunfleece', 8, 12);
    registerAttackAnims(this, 'sunfleece', 'attack', 8);
    registerWalkAnims(this, 'veilseer', 8, 12);
    registerAttackAnims(this, 'veilseer', 'attack', 8);
    registerWalkAnims(this, 'wavecaller', 6, 12);
    registerAttackAnims(this, 'wavecaller', 'attack', 8);

    // Rift Tyrant
    registerAttackAnims(this, 'rift_tyrant', 'aoe', 9, ['south']);
    registerAttackAnims(this, 'rift_tyrant', 'bite', 9, ['south']);
    registerAttackAnims(this, 'rift_tyrant', 'drain', 9, ['south']);

    // Rift Core spin
    if (!this.anims.exists('rift_core_spin')) {
      this.anims.create({
        key: 'rift_core_spin',
        frames: ['south', 'south-east', 'north-east', 'east', 'north', 'north-west', 'west', 'south-west'].map(
          (dir) => ({ key: `rift_core_${dir}` }),
        ),
        frameRate: 1.5,
        repeat: -1,
      });
    }
  }
}
