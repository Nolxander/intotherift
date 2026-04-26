import Phaser from 'phaser';
import { DungeonScene } from './DungeonScene';
import { TitleScene } from './TitleScene';

const W = 480;
const H = 320;

export interface GameOverData {
  reason: 'wipe';
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOver' });
  }

  create(data: GameOverData): void {
    this.sound.stopAll();
    const reason = data?.reason ?? 'wipe';

    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a14);

    // Title
    const title = this.add.text(W / 2, 100, 'GAME OVER', {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#ff4444',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);

    // Reason text
    const reasonMsg = 'Your riftlings have fallen...';

    const sub = this.add.text(W / 2, 135, reasonMsg, {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#cc8888',
    }).setOrigin(0.5).setAlpha(0);

    // Fade in title and subtitle
    this.tweens.add({
      targets: title,
      alpha: 1,
      duration: 800,
      ease: 'Power2',
    });
    this.tweens.add({
      targets: sub,
      alpha: 1,
      duration: 800,
      delay: 400,
      ease: 'Power2',
    });

    // Play Again button — appears after a short delay
    const btnY = 195;
    const btnW = 140;
    const btnH = 28;
    const btnBg = this.add.rectangle(W / 2, btnY, btnW, btnH, 0x442222, 0.9)
      .setStrokeStyle(1, 0x884444)
      .setInteractive({ useHandCursor: true })
      .setAlpha(0);

    const btnText = this.add.text(W / 2, btnY, 'PLAY AGAIN', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#e8c8c8',
    }).setOrigin(0.5).setAlpha(0);

    // Title screen button
    const titleBtnY = 232;
    const titleBg = this.add.rectangle(W / 2, titleBtnY, btnW, btnH, 0x222233, 0.9)
      .setStrokeStyle(1, 0x555577)
      .setInteractive({ useHandCursor: true })
      .setAlpha(0);

    const titleText = this.add.text(W / 2, titleBtnY, 'TITLE SCREEN', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#b8b8d0',
    }).setOrigin(0.5).setAlpha(0);

    // Fade buttons in after 1s
    this.tweens.add({
      targets: [btnBg, btnText, titleBg, titleText],
      alpha: 1,
      duration: 600,
      delay: 1000,
      ease: 'Power2',
    });

    // Hover effects
    btnBg.on('pointerover', () => {
      btnBg.setFillStyle(0x663333, 1);
      btnText.setColor('#ffffff');
    });
    btnBg.on('pointerout', () => {
      btnBg.setFillStyle(0x442222, 0.9);
      btnText.setColor('#e8c8c8');
    });
    btnBg.on('pointerdown', () => this.restartRun());

    titleBg.on('pointerover', () => {
      titleBg.setFillStyle(0x333355, 1);
      titleText.setColor('#ffffff');
    });
    titleBg.on('pointerout', () => {
      titleBg.setFillStyle(0x222233, 0.9);
      titleText.setColor('#b8b8d0');
    });
    titleBg.on('pointerdown', () => this.goToTitle());

    // Keyboard shortcuts (active after buttons appear)
    this.time.delayedCall(1000, () => {
      this.input.keyboard!.on('keydown-SPACE', () => this.restartRun());
      this.input.keyboard!.on('keydown-ENTER', () => this.restartRun());
      this.input.keyboard!.on('keydown-ESC', () => this.goToTitle());
    });
  }

  private restartRun(): void {
    // Force a fresh DungeonScene instance. Reusing the stopped Dungeon via
    // scene.start accumulates Phaser rendering state across runs (text
    // canvases in the global CanvasPool, cached glyph metrics) that corrupts
    // monospace text in the starter selection on every subsequent restart.
    this.scene.remove('Dungeon');
    this.scene.add('Dungeon', DungeonScene);
    this.scene.start('Dungeon');
  }

  private goToTitle(): void {
    // Same reasoning as restartRun: rebuild Dungeon and Title from scratch
    // so a subsequent "Play" doesn't inherit glyph corruption from this run.
    this.scene.remove('Dungeon');
    this.scene.add('Dungeon', DungeonScene);
    this.scene.remove('Title');
    this.scene.add('Title', TitleScene);
    this.scene.start('Title');
  }
}
