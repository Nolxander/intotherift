import Phaser from 'phaser';
import { DECORATION_CATALOG } from '../data/decorations';
import { registerWalkAnims, registerAttackAnims } from '../data/anims';

/**
 * BootScene — loads real tile assets and generates placeholder sprites.
 * Tile art comes from PixelLab; character/riftling sprites are still placeholders.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
    // Real tile assets (PixelLab-generated)
    this.load.image('floor', 'assets/tiles/floor.png');
    this.load.image('wall', 'assets/tiles/wall.png');
    this.load.image('void', 'assets/tiles/void.png');

    // Biome tilesets (Wang tiles)
    for (let i = 0; i < 16; i++) {
      this.load.image(`grass_cliff_${i}`, `assets/tiles/grass_cliff/wang_${i}.png`);
    }

    // Biome tilesets (Wang tiles) — dark_grass_cliff
    for (let i = 0; i < 16; i++) {
      this.load.image(`dark_grass_cliff_${i}`, `assets/tiles/dark_grass_cliff/wang_${i}.png`);
    }

    // Biome tilesets (Wang tiles) — dark_grass_water
    for (let i = 0; i < 16; i++) {
      this.load.image(`dark_grass_water_${i}`, `assets/tiles/dark_grass_water/wang_${i}.png`);
    }

    // Biome tilesets (Wang tiles) — dark_forest
    for (let i = 0; i < 16; i++) {
      this.load.image(`dark_forest_${i}`, `assets/tiles/dark_forest/wang_${i}.png`);
    }

    // Biome tilesets (Wang tiles) — dark_plains_bluff
    for (let i = 0; i < 16; i++) {
      this.load.image(`dark_plains_bluff_${i}`, `assets/tiles/dark_plains_bluff/wang_${i}.png`);
    }

    // Biome tilesets (Wang tiles) — dark_lava
    for (let i = 0; i < 16; i++) {
      this.load.image(`dark_lava_${i}`, `assets/tiles/dark_lava/wang_${i}.png`);
    }

    // Biome tilesets (Wang tiles) — dark_badlands
    for (let i = 0; i < 16; i++) {
      this.load.image(`dark_badlands_${i}`, `assets/tiles/dark_badlands/wang_${i}.png`);
    }

    // Biome tilesets (Wang tiles) — dark_jungle
    for (let i = 0; i < 16; i++) {
      this.load.image(`dark_jungle_${i}`, `assets/tiles/dark_jungle/wang_${i}.png`);
    }

    // Biome tilesets (Wang tiles) — dark_void
    for (let i = 0; i < 16; i++) {
      this.load.image(`dark_void_${i}`, `assets/tiles/dark_void/wang_${i}.png`);
    }

    // Hub dirt-path overlay — layered on top of dark_forest in the hub room.
    for (let i = 0; i < 16; i++) {
      this.load.image(`hub_dirt_path_${i}`, `assets/tiles/hub_dirt_path/wang_${i}.png`);
    }

    // Decoration props (imported map_objects). Texture key = catalog key.
    for (const def of Object.values(DECORATION_CATALOG)) {
      this.load.image(def.key, def.path);
    }

    // Biome tilesets (Wang tiles) — grass_water
    for (let i = 0; i < 16; i++) {
      this.load.image(`grass_water_${i}`, `assets/tiles/grass_water/wang_${i}.png`);
    }

    // Player character — static idle frames (8 directions)
    const playerDirs = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'];
    for (const dir of playerDirs) {
      this.load.image(`player_${dir}`, `assets/sprites/player/${dir}.png`);
    }

    // Player walk animation frames (8 dirs × 6 frames)
    for (const dir of playerDirs) {
      for (let f = 0; f < 6; f++) {
        this.load.image(
          `player_walk_${dir}_${f}`,
          `assets/sprites/player/animations/walk/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Riftling sprites (8 directions each)
    const riftlings = ['emberhound', 'solarglare', 'pyreshell', 'lumoth', 'tidecrawler', 'gloomfang', 'barkbiter', 'tremorhorn', 'hollowcrow', 'rivelet', 'grindscale', 'thistlebound'];
    for (const name of riftlings) {
      for (const dir of playerDirs) {
        this.load.image(`${name}_${dir}`, `assets/sprites/${name}/${dir}.png`);
      }
    }

    // Rivelet walk animation frames (4 dirs × 9 frames)
    const riveletWalkDirs = ['south', 'north', 'east', 'west'];
    for (const dir of riveletWalkDirs) {
      for (let f = 0; f < 9; f++) {
        this.load.image(
          `rivelet_walk_${dir}_${f}`,
          `assets/sprites/rivelet/animations/walk/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Lumoth wing-beat animation frames (8 dirs × 6 frames)
    for (const dir of playerDirs) {
      for (let f = 0; f < 6; f++) {
        this.load.image(
          `lumoth_walk_${dir}_${f}`,
          `assets/sprites/lumoth/animations/walk/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Barkbiter walk animation frames (4 dirs × 8 frames)
    const barkbiterWalkDirs = ['south', 'north', 'east', 'west'];
    for (const dir of barkbiterWalkDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `barkbiter_walk_${dir}_${f}`,
          `assets/sprites/barkbiter/animations/walk/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Tremorhorn walk animation frames (4 dirs × 8 frames)
    const tremornhornWalkDirs = ['south', 'north', 'east', 'west'];
    for (const dir of tremornhornWalkDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `tremorhorn_walk_${dir}_${f}`,
          `assets/sprites/tremorhorn/animations/walk/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Gloomfang walk animation frames (4 dirs × 8 frames)
    const gloomfangWalkDirs = ['south', 'north', 'east', 'west'];
    for (const dir of gloomfangWalkDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `gloomfang_walk_${dir}_${f}`,
          `assets/sprites/gloomfang/animations/walk/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Emberhound walk animation frames (4 dirs × 8 frames)
    const emberhoundWalkDirs = ['south', 'north', 'east', 'west'];
    for (const dir of emberhoundWalkDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `emberhound_walk_${dir}_${f}`,
          `assets/sprites/emberhound/animations/walk/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Pyreshell walk + attack animation frames (4 dirs × 8 frames)
    const pyreshellWalkDirs = ['south', 'north', 'east', 'west'];
    for (const dir of pyreshellWalkDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `pyreshell_walk_${dir}_${f}`,
          `assets/sprites/pyreshell/animations/walk/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Pyreshell attack animation frames (4 dirs × 8 frames)
    for (const dir of pyreshellWalkDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `pyreshell_atk_attack_${dir}_${f}`,
          `assets/sprites/pyreshell/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Grindscale walk animation frames (4 dirs × 8 frames)
    const grindscaleWalkDirs = ['south', 'north', 'east', 'west'];
    for (const dir of grindscaleWalkDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `grindscale_walk_${dir}_${f}`,
          `assets/sprites/grindscale/animations/walk/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Solarglare walk + attack animation frames (4 dirs × 8 frames)
    const solarglareWalkDirs = ['south', 'north', 'east', 'west'];
    for (const dir of solarglareWalkDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `solarglare_walk_${dir}_${f}`,
          `assets/sprites/solarglare/animations/walk/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Solarglare attack animation frames (4 dirs × 8 frames)
    for (const dir of solarglareWalkDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `solarglare_atk_attack_${dir}_${f}`,
          `assets/sprites/solarglare/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Tidecrawler walk animation frames (4 dirs × 8 frames)
    const tidecrawlerWalkDirs = ['south', 'north', 'east', 'west'];
    for (const dir of tidecrawlerWalkDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `tidecrawler_walk_${dir}_${f}`,
          `assets/sprites/tidecrawler/animations/walk/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Tidecrawler spin attack — frames are the 8 idle rotations cycled from each starting dir
    for (const dir of tidecrawlerWalkDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `tidecrawler_atk_spin_${dir}_${f}`,
          `assets/sprites/tidecrawler/animations/atk_spin/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Thistlebound hop animation frames (4 dirs × 8 frames, skip frame_000 which is idle)
    const thistleboundWalkDirs = ['south', 'north', 'east', 'west'];
    for (const dir of thistleboundWalkDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `thistlebound_walk_${dir}_${f}`,
          `assets/sprites/thistlebound/animations/walk/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Hollowcrow flight animation frames (4 dirs × 8 frames, skip frame_000 which is idle)
    const hollowcrowWalkDirs = ['south', 'north', 'east', 'west'];
    for (const dir of hollowcrowWalkDirs) {
      for (let f = 1; f < 9; f++) {
        this.load.image(
          `hollowcrow_walk_${dir}_${f - 1}`,
          `assets/sprites/hollowcrow/animations/walk/${dir}/frame_00${f}.png`,
        );
      }
    }
  }

  create(): void {
    // --- Riftling placeholder (24x24 colored circles per type) ---
    const typeColors: Record<string, number> = {
      fire: 0xe85d30,
      water: 0x3092e8,
      nature: 0x4caf50,
      earth: 0x8d6e3f,
      light: 0xf0e060,
      dark: 0x7b3fa0,
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

    // --- Enemy placeholder (16x16 red diamond) ---
    const enemyGfx = this.add.graphics().setVisible(false);
    enemyGfx.fillStyle(0xcc3333);
    enemyGfx.fillTriangle(8, 0, 16, 8, 8, 16);
    enemyGfx.fillTriangle(8, 0, 0, 8, 8, 16);
    enemyGfx.generateTexture('enemy', 16, 16);
    enemyGfx.destroy();

    // --- Shadow circle (used under all units) ---
    const shadowGfx = this.add.graphics().setVisible(false);
    shadowGfx.fillStyle(0x000000, 0.3);
    shadowGfx.fillEllipse(8, 4, 16, 8);
    shadowGfx.generateTexture('shadow', 16, 8);
    shadowGfx.destroy();

    // Register walk animations for the player
    registerWalkAnims(this, 'player', 6);

    // Register walk animations for riftlings that have frames.
    // Per-prefix framerate — tune so the animation cadence visually matches
    // the riftling's movement speed. Faster species (chasers) need higher
    // framerates than slow anchors so the legs don't appear to drag.
    registerWalkAnims(this, 'rivelet', 9, 16);
    registerWalkAnims(this, 'lumoth', 6, 12);
    registerWalkAnims(this, 'barkbiter', 8, 14);
    registerWalkAnims(this, 'tremorhorn', 8, 10);
    registerWalkAnims(this, 'gloomfang', 8, 16);
    registerWalkAnims(this, 'emberhound', 8, 14);
    registerWalkAnims(this, 'pyreshell', 8, 12);
    registerAttackAnims(this, 'pyreshell', 'attack', 8);
    registerWalkAnims(this, 'grindscale', 8, 12);
    registerWalkAnims(this, 'solarglare', 8, 14);
    registerAttackAnims(this, 'solarglare', 'attack', 8);
    registerWalkAnims(this, 'tidecrawler', 8, 12);
    registerAttackAnims(this, 'tidecrawler', 'spin', 8);
    registerWalkAnims(this, 'thistlebound', 8, 14);
    registerWalkAnims(this, 'hollowcrow', 8, 14);

    this.scene.start('Dungeon');
  }
}
