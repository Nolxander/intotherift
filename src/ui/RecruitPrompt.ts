import Phaser from 'phaser';
import { DefeatedRiftling } from '../combat/CombatManager';
import { createRiftlingAtLevel, PartyRiftling, RIFTLING_TEMPLATES, speciesScale } from '../data/party';

/**
 * Recruit prompt — shown after clearing a combat room.
 * Displays the defeated riftlings and lets the player pick one to recruit.
 * Press 1-N to pick, or Escape to skip.
 *
 * Uses event-based keyboard input (not polling) for reliability.
 */
export class RecruitPrompt {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private options: DefeatedRiftling[] = [];
  /** Pre-rolled riftlings with temperaments assigned, ready to recruit. */
  private prerolled: PartyRiftling[] = [];
  private onChoice: (riftling: PartyRiftling | null) => void = () => {};
  private active = false;
  private keyHandler?: (event: KeyboardEvent) => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(500).setScrollFactor(0);
    this.container.setVisible(false);
  }

  show(defeated: DefeatedRiftling[], onChoice: (riftling: PartyRiftling | null) => void, targetLevel: number = 1): void {
    // Deduplicate by key
    const seen = new Set<string>();
    this.options = defeated.filter((d) => {
      if (seen.has(d.riftlingKey)) return false;
      seen.add(d.riftlingKey);
      return true;
    });

    if (this.options.length === 0) {
      onChoice(null);
      return;
    }

    this.onChoice = onChoice;
    this.active = true;
    this.container.removeAll(true);

    // Pre-roll riftlings so temperaments are determined before display
    this.prerolled = this.options.map((opt) => createRiftlingAtLevel(opt.riftlingKey, targetLevel));

    const W = 480;
    const H = 320;

    // Dim background
    const bg = this.scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65);
    this.container.add(bg);

    // Title
    const title = this.scene.add
      .text(W / 2, 40, 'A riftling wants to join your team!', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#44ff88',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5);
    this.container.add(title);

    // Show each option
    const startX = W / 2 - ((this.options.length - 1) * 100) / 2;

    for (let i = 0; i < this.options.length; i++) {
      const opt = this.options[i];
      const rolled = this.prerolled[i];
      const x = startX + i * 100;
      const y = 120;

      // Sprite preview
      const sprite = this.scene.add.image(x, y, `${opt.texturePrefix}_south`);
      const baseScale = 1.5 * speciesScale(opt.texturePrefix);
      sprite.setScale(baseScale);
      this.container.add(sprite);

      // Name
      const name = this.scene.add
        .text(x, y + 40, opt.name, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      this.container.add(name);

      // Type + Role
      const tmpl = RIFTLING_TEMPLATES[opt.riftlingKey];
      if (tmpl) {
        const typeLabel = this.scene.add
          .text(x, y + 53, `${tmpl.elementType.toUpperCase()}  ${tmpl.role.toUpperCase()}`, {
            fontFamily: 'monospace',
            fontSize: '7px',
            color: this.getTypeColor(tmpl.elementType),
          })
          .setOrigin(0.5);
        this.container.add(typeLabel);

        // Stats preview
        const stats = this.scene.add
          .text(x, y + 64, `HP:${tmpl.maxHp} ATK:${tmpl.attack} DEF:${tmpl.defense}`, {
            fontFamily: 'monospace',
            fontSize: '7px',
            color: '#aaaaaa',
          })
          .setOrigin(0.5);
        this.container.add(stats);
      }

      // Temperament
      const tempColor = rolled.temperament.boosted ? '#cc88ff' : '#888888';
      const tempLabel = this.scene.add
        .text(x, y + 76, rolled.temperament.name, {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: tempColor,
        })
        .setOrigin(0.5);
      this.container.add(tempLabel);

      // Key hint
      const keyHint = this.scene.add
        .text(x, y + 92, `[${i + 1}]`, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#ffdd44',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5);
      this.container.add(keyHint);

      // Click hit area covering the whole card
      const cardIndex = i;
      const hit = this.scene.add
        .rectangle(x, y + 38, 92, 124, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => sprite.setScale(baseScale * 1.13));
      hit.on('pointerout', () => sprite.setScale(baseScale));
      hit.on('pointerdown', () => this.selectOption(cardIndex));
      this.container.add(hit);
    }

    // Skip hint — clickable
    const skip = this.scene.add
      .text(W / 2, H - 40, '[ESC] Skip', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#888888',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    skip.on('pointerover', () => skip.setColor('#ffffff'));
    skip.on('pointerout', () => skip.setColor('#888888'));
    skip.on('pointerdown', () => {
      this.hide();
      this.onChoice(null);
    });
    this.container.add(skip);

    this.container.setVisible(true);

    // Use native DOM keydown event — more reliable than Phaser's addKey + JustDown
    this.keyHandler = (event: KeyboardEvent) => {
      if (!this.active) return;

      if (event.key === 'Escape') {
        this.hide();
        this.onChoice(null);
        return;
      }

      const num = parseInt(event.key, 10);
      if (num >= 1 && num <= this.options.length) {
        this.selectOption(num - 1);
      }
    };

    window.addEventListener('keydown', this.keyHandler);
  }

  /** Called from the scene update loop — no-op now since we use event-based input */
  update(): void {
    // Input handled by keydown event listener
  }

  private selectOption(index: number): void {
    const riftling = this.prerolled[index];
    if (!riftling) return;

    this.hide();
    this.onChoice(riftling);
  }

  private hide(): void {
    this.active = false;
    this.container.setVisible(false);

    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = undefined;
    }
  }

  get isActive(): boolean {
    return this.active;
  }

  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  private getTypeColor(type: string): string {
    switch (type) {
      case 'fire': return '#e85d30';
      case 'water': return '#3092e8';
      case 'nature': return '#4caf50';
      case 'earth': return '#8d6e3f';
      case 'light': return '#f0e060';
      case 'dark': return '#b060e0';
      default: return '#ffffff';
    }
  }
}
