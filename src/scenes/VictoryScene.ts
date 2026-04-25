import Phaser from 'phaser';
import { speciesScale } from '../data/party';

const W = 480;
const H = 320;

export interface RosterEntry {
  name: string;
  texturePrefix: string;
  level: number;
  role: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
}

export interface VictoryData {
  timeRemaining: number;
  roster: RosterEntry[];
}

export class VictoryScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Victory' });
  }

  create(data: VictoryData): void {
    this.sound.stopAll();
    if (this.cache.audio.exists('music_title')) {
      this.sound.play('music_title', { loop: true, volume: 0.5 });
    }
    const roster = data?.roster ?? [];
    const timeRemaining = data?.timeRemaining ?? 0;

    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a14);

    const title = this.add.text(W / 2, 100, 'RIFT SEALED', {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#ffdd44',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);

    const mins = Math.floor(timeRemaining / 60);
    const secs = Math.floor(timeRemaining % 60);
    const sub = this.add.text(W / 2, 140, `You claimed the Rift Core with ${mins}:${secs.toString().padStart(2, '0')} to spare.`, {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#ddccaa',
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: title, alpha: 1, duration: 800, ease: 'Power2' });
    this.tweens.add({ targets: sub, alpha: 1, duration: 800, delay: 400, ease: 'Power2' });

    const titleHoldMs = 3000;
    this.tweens.add({
      targets: [title, sub],
      alpha: 0,
      duration: 600,
      delay: titleHoldMs,
      ease: 'Power2',
      onComplete: () => {
        this.startCreditsRoll(roster);
      },
    });
  }

  private startCreditsRoll(roster: RosterEntry[]): void {
    const cardDelay = 3600;
    const cardDuration = 1200;

    for (let i = 0; i < roster.length; i++) {
      this.time.delayedCall(i * cardDelay, () => {
        this.showRiftlingCard(roster[i], cardDuration);
      });
    }

    const totalWait = roster.length * cardDelay + 1500;
    this.time.delayedCall(totalWait, () => this.showThanks());
  }

  private showRiftlingCard(entry: RosterEntry, fadeInMs: number): void {
    const container = this.add.container(W / 2, H + 80);

    const textureKey = `${entry.texturePrefix}_south`;
    const scale = speciesScale(entry.texturePrefix) * 2.5;
    const sprite = this.add.image(0, -20, textureKey)
      .setScale(scale)
      .setOrigin(0.5);
    sprite.setTexture(textureKey);

    const nameText = this.add.text(0, 30, entry.name, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffdd44',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);

    const roleText = this.add.text(0, 48, `Lv ${entry.level}  ${entry.role}`, {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#ccaa88',
    }).setOrigin(0.5);

    const stats = `HP ${entry.hp}   ATK ${entry.attack}   DEF ${entry.defense}   SPD ${entry.speed}`;
    const statsText = this.add.text(0, 64, stats, {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    container.add([sprite, nameText, roleText, statsText]);

    const scrollDuration = fadeInMs + 4000;

    this.tweens.add({
      targets: container,
      y: { from: H + 80, to: -80 },
      duration: scrollDuration,
      ease: 'Linear',
    });

    this.tweens.add({
      targets: container,
      alpha: { from: 0, to: 1 },
      duration: fadeInMs,
      ease: 'Power2',
    });

    this.tweens.add({
      targets: container,
      alpha: 0,
      delay: scrollDuration - 1000,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => container.destroy(),
    });
  }

  private showThanks(): void {
    const thanks = this.add.text(W / 2, H / 2, 'Thanks for playing!', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: thanks,
      alpha: 1,
      duration: 800,
      ease: 'Power2',
    });

    this.tweens.add({
      targets: thanks,
      alpha: 0,
      delay: 3000,
      duration: 800,
      ease: 'Power2',
      onComplete: () => this.goToTitle(),
    });
  }

  private goToTitle(): void {
    this.sound.stopAll();
    this.scene.start('Title');
  }
}
