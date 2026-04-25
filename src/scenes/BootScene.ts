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
    const riftlings = [
      'emberhound', 'solarglare', 'pyreshell', 'lumoth', 'tidecrawler', 'gloomfang',
      'barkbiter', 'tremorhorn', 'hollowcrow', 'rivelet', 'grindscale', 'thistlebound',
      'wavecaller', 'nettlehide', 'veilseer', 'cindertail', 'dawnstrike', 'bogweft',
      'dewspine', 'crestshrike', 'rootlash', 'smolderpaw', 'curseclaw', 'sunfleece',
      'rift_tyrant',
    ];
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

    // Barkbiter attack animation frames (4 dirs × 8 frames)
    for (const dir of barkbiterWalkDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `barkbiter_atk_attack_${dir}_${f}`,
          `assets/sprites/barkbiter/animations/atk_attack/${dir}/frame_00${f}.png`,
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

    // Tremorhorn attack animation frames (4 dirs × 8 frames)
    for (const dir of tremornhornWalkDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `tremorhorn_atk_attack_${dir}_${f}`,
          `assets/sprites/tremorhorn/animations/atk_attack/${dir}/frame_00${f}.png`,
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

    // Rivelet attack animation frames (4 dirs × 8 frames)
    const riveletAttackDirs = ['south', 'north', 'east', 'west'];
    for (const dir of riveletAttackDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `rivelet_atk_attack_${dir}_${f}`,
          `assets/sprites/rivelet/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Bogweft attack animation frames (4 dirs × 8 frames)
    const bogweftAttackDirs = ['south', 'north', 'east', 'west'];
    for (const dir of bogweftAttackDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `bogweft_atk_attack_${dir}_${f}`,
          `assets/sprites/bogweft/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Crestshrike attack animation frames (4 dirs × 8 frames)
    const crestshrikeAttackDirs = ['south', 'north', 'east', 'west'];
    for (const dir of crestshrikeAttackDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `crestshrike_atk_attack_${dir}_${f}`,
          `assets/sprites/crestshrike/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Curseclaw attack animation frames (4 dirs × 8 frames)
    const curseclawAttackDirs = ['south', 'north', 'east', 'west'];
    for (const dir of curseclawAttackDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `curseclaw_atk_attack_${dir}_${f}`,
          `assets/sprites/curseclaw/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Emberhound attack animation frames (4 dirs × 8 frames)
    const emberhoundAttackDirs = ['south', 'north', 'east', 'west'];
    for (const dir of emberhoundAttackDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `emberhound_atk_attack_${dir}_${f}`,
          `assets/sprites/emberhound/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Gloomfang attack animation frames (4 dirs × 8 frames)
    const gloomfangAttackDirs = ['south', 'north', 'east', 'west'];
    for (const dir of gloomfangAttackDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `gloomfang_atk_attack_${dir}_${f}`,
          `assets/sprites/gloomfang/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Rootlash attack animation frames (4 dirs × 8 frames)
    const rootlashAttackDirs = ['south', 'north', 'east', 'west'];
    for (const dir of rootlashAttackDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `rootlash_atk_attack_${dir}_${f}`,
          `assets/sprites/rootlash/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Smolderpaw attack animation frames (4 dirs × 8 frames)
    const smolderpawAttackDirs = ['south', 'north', 'east', 'west'];
    for (const dir of smolderpawAttackDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `smolderpaw_atk_attack_${dir}_${f}`,
          `assets/sprites/smolderpaw/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Grindscale attack animation frames (4 dirs × 8 frames)
    const grindscaleAttackDirs = ['south', 'north', 'east', 'west'];
    for (const dir of grindscaleAttackDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `grindscale_atk_attack_${dir}_${f}`,
          `assets/sprites/grindscale/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Lumoth attack animation frames (4 dirs × 8 frames)
    const lumothAttackDirs = ['south', 'north', 'east', 'west'];
    for (const dir of lumothAttackDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `lumoth_atk_attack_${dir}_${f}`,
          `assets/sprites/lumoth/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Thistlebound attack animation frames (4 dirs × 8 frames)
    const thistleboundAttackDirs = ['south', 'north', 'east', 'west'];
    for (const dir of thistleboundAttackDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `thistlebound_atk_attack_${dir}_${f}`,
          `assets/sprites/thistlebound/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Wavecaller attack animation frames (4 dirs × 8 frames)
    const wavecallerAttackDirs = ['south', 'north', 'east', 'west'];
    for (const dir of wavecallerAttackDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `wavecaller_atk_attack_${dir}_${f}`,
          `assets/sprites/wavecaller/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Dawnstrike attack animation frames (4 dirs × 8 frames)
    const dawnstrikeAttackDirs = ['south', 'north', 'east', 'west'];
    for (const dir of dawnstrikeAttackDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `dawnstrike_atk_attack_${dir}_${f}`,
          `assets/sprites/dawnstrike/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Hollowcrow attack animation frames (4 dirs × 8 frames)
    const hollowcrowAttackDirs = ['south', 'north', 'east', 'west'];
    for (const dir of hollowcrowAttackDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `hollowcrow_atk_attack_${dir}_${f}`,
          `assets/sprites/hollowcrow/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Nettlehide attack animation frames (4 dirs × 8 frames)
    const nettlehideAttackDirs = ['south', 'north', 'east', 'west'];
    for (const dir of nettlehideAttackDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `nettlehide_atk_attack_${dir}_${f}`,
          `assets/sprites/nettlehide/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Sunfleece attack animation frames (4 dirs × 8 frames)
    const sunfleeceAttackDirs = ['south', 'north', 'east', 'west'];
    for (const dir of sunfleeceAttackDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `sunfleece_atk_attack_${dir}_${f}`,
          `assets/sprites/sunfleece/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Veilseer attack animation frames (4 dirs × 8 frames)
    const veilseerAttackDirs = ['south', 'north', 'east', 'west'];
    for (const dir of veilseerAttackDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `veilseer_atk_attack_${dir}_${f}`,
          `assets/sprites/veilseer/animations/atk_attack/${dir}/frame_00${f}.png`,
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

    // Cindertail attack animation frames (4 dirs × 8 frames)
    const cindertailAtkDirs = ['south', 'north', 'east', 'west'];
    for (const dir of cindertailAtkDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `cindertail_atk_attack_${dir}_${f}`,
          `assets/sprites/cindertail/animations/atk_attack/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Rift Tyrant attack animation frames (south only — 3 anims × 9 frames)
    for (const animKey of ['atk_aoe', 'atk_bite', 'atk_drain']) {
      for (let f = 0; f < 9; f++) {
        this.load.image(
          `rift_tyrant_${animKey}_south_${f}`,
          `assets/sprites/rift_tyrant/animations/${animKey}/south/frame_00${f}.png`,
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

    // Batch-load walk animations for remaining riftlings (4 dirs × 8 frames each)
    const walkBatch8 = [
      'bogweft', 'cindertail', 'crestshrike', 'curseclaw', 'dawnstrike',
      'dewspine', 'nettlehide', 'rootlash', 'smolderpaw', 'sunfleece',
    ];
    const batchWalkDirs = ['south', 'north', 'east', 'west'];
    for (const name of walkBatch8) {
      for (const dir of batchWalkDirs) {
        for (let f = 0; f < 8; f++) {
          this.load.image(
            `${name}_walk_${dir}_${f}`,
            `assets/sprites/${name}/animations/walk/${dir}/frame_00${f}.png`,
          );
        }
      }
    }

    // Veilseer hover animation frames (4 dirs × 8 frames)
    for (const dir of batchWalkDirs) {
      for (let f = 0; f < 8; f++) {
        this.load.image(
          `veilseer_walk_${dir}_${f}`,
          `assets/sprites/veilseer/animations/walk/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Wavecaller walk animation frames (4 dirs × 6 frames — south has fewer frames)
    for (const dir of batchWalkDirs) {
      for (let f = 0; f < 6; f++) {
        this.load.image(
          `wavecaller_walk_${dir}_${f}`,
          `assets/sprites/wavecaller/animations/walk/${dir}/frame_00${f}.png`,
        );
      }
    }

    // Rift Elite — non-combatant NPC that commands elite trainer squads.
    // 8 static rotations + idle animation (south 8f, east/west 9f).
    for (const dir of playerDirs) {
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

    // Rift Core — final reward object in the boss arena. Load all 8 rotations
    // for a slow spin animation.
    const riftCoreDirs = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'];
    for (const dir of riftCoreDirs) {
      this.load.image(`rift_core_${dir}`, `assets/characters/rift-core/rotations/${dir}.png`);
    }

    this.load.audio('music_title', 'assets/audio/music/title_screen.mp3');
    this.load.audio('music_dungeon', 'assets/audio/music/background.mp3');
    this.load.audio('music_boss', 'assets/audio/music/boss_battle.mp3');
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

    // Rift Tyrant attack animations (south only for now)
    registerAttackAnims(this, 'rift_tyrant', 'aoe', 9, ['south']);
    registerAttackAnims(this, 'rift_tyrant', 'bite', 9, ['south']);
    registerAttackAnims(this, 'rift_tyrant', 'drain', 9, ['south']);

    // Rift Elite idle animations — 3 cardinal dirs (south/east/west).
    // North falls back to static rotation in DungeonScene.
    const riftEliteIdleAnims: Array<{ dir: string; frames: number }> = [
      { dir: 'south', frames: 8 },
      { dir: 'east', frames: 9 },
      { dir: 'west', frames: 9 },
    ];
    for (const { dir, frames } of riftEliteIdleAnims) {
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

    // Rift Core slow spin — cycles through all 8 rotations.
    this.anims.create({
      key: 'rift_core_spin',
      frames: ['south', 'south-east', 'north-east', 'east', 'north', 'north-west', 'west', 'south-west'].map(
        (dir) => ({ key: `rift_core_${dir}` }),
      ),
      frameRate: 1.5,
      repeat: -1,
    });

    // Direct-load debug path: ?testRoom=<key> or ?bossTest=1 skips Title and
    // boots straight into the Dungeon so world builders can iterate on a biome
    // and Playwright specs can attach to __gameState. ?bossTest=1 loads the
    // boss arena with a pre-filled party for tuning boss attacks/animations.
    const params = new URLSearchParams(window.location.search);
    const directLoad = params.get('testRoom') || params.get('bossTest');
    this.scene.start(directLoad ? 'Dungeon' : 'Title');
  }
}
