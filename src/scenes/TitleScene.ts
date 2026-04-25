import Phaser from 'phaser';
import { applyStoredVolume, createVolumeWidget } from '../ui/VolumeWidget';
import { playWalkOrStatic } from '../data/anims';
import { areDeferredAssetsReady } from './BootScene';

const W = 480;
const H = 320;

const RIFTLING_POOL = [
  'gloomfang', 'hollowcrow', 'curseclaw', 'veilseer', 'bogweft',
  'lumoth', 'emberhound', 'tidecrawler', 'rootlash', 'cindertail',
];

const WANDER_SPEED = 18;
const SILHOUETTE_TINT = 0x181028;
const FOG_PARTICLE_COUNT = 40;
const RIFT_PARTICLE_COUNT = 24;

interface Wanderer {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  prefix: string;
  dir: string;
  vx: number;
}

export class TitleScene extends Phaser.Scene {
  private wanderers: Wanderer[] = [];
  private fogParticles: Phaser.GameObjects.Ellipse[] = [];
  private riftParticles: Phaser.GameObjects.Ellipse[] = [];

  constructor() {
    super({ key: 'Title' });
  }

  create(): void {
    this.wanderers = [];
    this.fogParticles = [];
    this.riftParticles = [];

    applyStoredVolume(this);
    this.sound.stopAll();
    if (this.cache.audio.exists('music_title')) {
      const startMusic = () => {
        if (!this.sound.get('music_title')) {
          this.sound.play('music_title', { loop: true, volume: 0.5 });
        }
      };
      if (this.sound.locked) {
        this.sound.once(Phaser.Sound.Events.UNLOCKED, startMusic);
      } else {
        startMusic();
      }
    }

    // --- Background layers ---
    this.add.rectangle(W / 2, H / 2, W, H, 0x06060e);
    // Subtle gradient bands
    this.add.rectangle(W / 2, H * 0.3, W, H * 0.35, 0x0c0a18).setAlpha(0.5);
    this.add.rectangle(W / 2, H * 0.7, W, H * 0.4, 0x0a0812).setAlpha(0.4);

    // --- Drifting fog particles (horizontal, slow) ---
    for (let i = 0; i < FOG_PARTICLE_COUNT; i++) {
      const x = Math.random() * W;
      const y = H * 0.4 + Math.random() * H * 0.55;
      const size = 20 + Math.random() * 40;
      const fog = this.add.ellipse(x, y, size, size * 0.4, 0x1a1430)
        .setAlpha(0.06 + Math.random() * 0.08)
        .setDepth(1);
      this.fogParticles.push(fog);
      this.tweens.add({
        targets: fog,
        x: fog.x + 30 + Math.random() * 40,
        alpha: { from: fog.alpha, to: fog.alpha * 0.4 },
        duration: 6000 + Math.random() * 6000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: Math.random() * 4000,
      });
    }

    // --- Rift glow particles (rising, faint purple/cyan) ---
    for (let i = 0; i < RIFT_PARTICLE_COUNT; i++) {
      const x = W * 0.2 + Math.random() * W * 0.6;
      const y = H * 0.5 + Math.random() * H * 0.5;
      const color = Math.random() > 0.6 ? 0x6644aa : 0x3388aa;
      const p = this.add.ellipse(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3, color)
        .setAlpha(0)
        .setDepth(5);
      this.riftParticles.push(p);
      this.spawnRiftParticle(p);
    }

    // --- Wandering riftling silhouettes ---
    const shuffled = Phaser.Utils.Array.Shuffle([...RIFTLING_POOL]);
    const count = 4 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const prefix = shuffled[i % shuffled.length];
      this.spawnWanderer(prefix, i, count);
    }

    // --- Rift Elite looming in the background ---
    const elite = this.add.sprite(W / 2, H * 0.42, 'rift_elite_south')
      .setDepth(3)
      .setScale(3)
      .setTint(0x2a1848)
      .setAlpha(0);

    if (this.anims.exists('rift_elite_idle_south')) {
      elite.play('rift_elite_idle_south');
    }

    this.tweens.add({
      targets: elite,
      alpha: 0.55,
      duration: 5000,
      delay: 2000,
      ease: 'Sine.easeIn',
    });

    this.tweens.add({
      targets: elite,
      alpha: { from: 0.55, to: 0.35 },
      duration: 4000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 7000,
    });

    // --- Vignette overlay ---
    const vignette = this.add.graphics().setDepth(50);
    vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.9, 0.9, 0, 0);
    vignette.fillRect(0, 0, W, H * 0.25);
    vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.85, 0.85);
    vignette.fillRect(0, H * 0.75, W, H * 0.25);
    // Side darkening
    vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.7, 0, 0, 0.7);
    vignette.fillRect(0, 0, W * 0.15, H);
    vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.7, 0.7, 0);
    vignette.fillRect(W * 0.85, 0, W * 0.15, H);

    // --- Title text ---
    const title = this.add.text(W / 2, 80, 'INTO THE RIFT', {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#c8b0e8',
      stroke: '#2a1040',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(100).setAlpha(0);

    // Fade title in
    this.tweens.add({
      targets: title,
      alpha: 1,
      duration: 2500,
      ease: 'Sine.easeIn',
    });

    // Slow eerie glow pulse
    this.tweens.add({
      targets: title,
      alpha: { from: 1, to: 0.55 },
      duration: 3500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 2500,
    });

    // Subtitle
    const subtitle = this.add.text(W / 2, 114, 'A Roguelite Creature-Collector Auto-Battler', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#7a6898',
    }).setOrigin(0.5).setDepth(100).setAlpha(0);

    this.tweens.add({
      targets: subtitle,
      alpha: 0.8,
      duration: 3000,
      ease: 'Sine.easeIn',
      delay: 800,
    });

    // --- Start button (appears after a beat) ---
    const btnY = 175;
    const btnW = 120;
    const btnH = 28;
    const btnBg = this.add.rectangle(W / 2, btnY, btnW, btnH, 0x1a0e2e, 0)
      .setStrokeStyle(1, 0x5533aa, 0)
      .setDepth(100)
      .setInteractive({ useHandCursor: true });

    const btnText = this.add.text(W / 2, btnY, 'ENTER', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#c8b0e8',
    }).setOrigin(0.5).setDepth(100).setAlpha(0);

    // Fade button in
    this.tweens.add({
      targets: btnText,
      alpha: 1,
      duration: 2000,
      delay: 1800,
      ease: 'Sine.easeIn',
    });
    this.tweens.add({
      targets: btnBg,
      fillAlpha: 0.7,
      duration: 2000,
      delay: 1800,
      ease: 'Sine.easeIn',
      onUpdate: () => {
        btnBg.setStrokeStyle(1, 0x5533aa, btnBg.fillAlpha * 0.8);
      },
    });

    // Subtle button pulse
    this.tweens.add({
      targets: btnText,
      alpha: { from: 1, to: 0.5 },
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 3800,
    });

    // Hover effects
    btnBg.on('pointerover', () => {
      btnBg.setFillStyle(0x3a1a5e, 1);
      btnText.setColor('#ffffff');
    });
    btnBg.on('pointerout', () => {
      btnBg.setFillStyle(0x1a0e2e, 0.7);
      btnText.setColor('#c8b0e8');
    });
    btnBg.on('pointerdown', () => this.startGame());

    // Keyboard start
    this.input.keyboard!.on('keydown-SPACE', () => this.startGame());
    this.input.keyboard!.on('keydown-ENTER', () => this.startGame());

    createVolumeWidget(this, W - 72, 12);

    // Jam credit
    this.add.text(W / 2, H - 18, 'Vibe Jam 2026', {
      fontFamily: 'monospace',
      fontSize: '7px',
      color: '#3a2860',
    }).setOrigin(0.5).setDepth(100);
  }

  update(): void {
    for (const w of this.wanderers) {
      w.sprite.x += w.vx * (1 / 60);
      w.shadow.x = w.sprite.x;

      // Walked off the far edge — wrap to the opposite side
      if (w.sprite.x > W + 30 || w.sprite.x < -30) {
        this.redirectWanderer(w);
      }

      // Play walk anim
      playWalkOrStatic(
        w.sprite as unknown as Phaser.Physics.Arcade.Sprite,
        w.prefix, w.dir, this.anims,
      );
    }
  }

  private spawnRiftParticle(p: Phaser.GameObjects.Ellipse): void {
    const startX = W * 0.15 + Math.random() * W * 0.7;
    const startY = H * 0.55 + Math.random() * H * 0.4;
    p.setPosition(startX, startY);
    p.setAlpha(0);

    this.tweens.add({
      targets: p,
      y: startY - 60 - Math.random() * 80,
      x: startX + (Math.random() - 0.5) * 30,
      alpha: { from: 0, to: 0.15 + Math.random() * 0.2 },
      duration: 4000 + Math.random() * 4000,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: p,
          alpha: 0,
          duration: 1500,
          onComplete: () => this.spawnRiftParticle(p),
        });
      },
    });
  }

  private spawnWanderer(prefix: string, index: number, total: number): void {
    const zoneTop = H * 0.52;
    const zoneBot = H * 0.82;
    const y = zoneTop + ((index + 0.5) / total) * (zoneBot - zoneTop);
    // Alternate directions so we always get both left-to-right and right-to-left
    const goRight = index % 2 === 0;
    const startX = goRight ? -20 - Math.random() * 40 : W + 20 + Math.random() * 40;
    const dir = goRight ? 'east' : 'west';

    const shadow = this.add.ellipse(startX, y + 10, 16, 6, 0x000000)
      .setAlpha(0.25).setDepth(9);

    const sprite = this.add.sprite(startX, y, `${prefix}_south`)
      .setDepth(10 + y / 10)
      .setTint(SILHOUETTE_TINT)
      .setAlpha(0);

    // Fade in quickly
    this.tweens.add({
      targets: [sprite, shadow],
      alpha: { from: 0, to: 0.7 },
      duration: 1500 + Math.random() * 1000,
      delay: 300 + index * 400,
      ease: 'Sine.easeIn',
    });

    this.wanderers.push({
      sprite, shadow, prefix, dir,
      vx: goRight ? WANDER_SPEED : -WANDER_SPEED,
    });
  }

  private redirectWanderer(w: Wanderer): void {
    // Wrap to the opposite edge and keep the same direction
    if (w.vx > 0) {
      w.sprite.x = -20;
    } else {
      w.sprite.x = W + 20;
    }
    w.shadow.x = w.sprite.x;
  }

  private startGame(): void {
    if (areDeferredAssetsReady()) {
      this.scene.start('Dungeon');
      return;
    }

    const loadingText = this.add.text(240, 210, 'Loading...', {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#7a6898',
    }).setOrigin(0.5).setDepth(100);

    const check = this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        if (areDeferredAssetsReady()) {
          check.destroy();
          loadingText.destroy();
          this.scene.start('Dungeon');
        }
      },
    });
  }
}
