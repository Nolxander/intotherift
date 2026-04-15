import Phaser from 'phaser';
import { DefeatedRiftling } from '../combat/CombatManager';
import { createRiftlingAtLevel, PartyRiftling, speciesScale } from '../data/party';

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

    // If only one unique species was offered, duplicate it so the player still
    // gets a choice between two rolls of the same riftling with different stats.
    if (this.options.length === 1) {
      this.options = [this.options[0], this.options[0]];
    }

    this.onChoice = onChoice;
    this.active = true;
    this.container.removeAll(true);

    // Pre-roll riftlings so temperaments are determined before display
    this.prerolled = this.options.map((opt) => createRiftlingAtLevel(opt.riftlingKey, targetLevel));

    const W = 480;
    const H = 320;

    // Dim background
    const bg = this.scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.78);
    this.container.add(bg);

    // Title
    const title = this.scene.add
      .text(W / 2, 14, 'A riftling wants to join your team!', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#44ff88',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5);
    this.container.add(title);

    // Card sizing: fit up to 3 cards across the 480px viewport
    const count = this.options.length;
    const cardW = count >= 3 ? 146 : count === 2 ? 180 : 200;
    const cardH = 258;
    const gap = count >= 3 ? 10 : 16;
    const totalW = count * cardW + (count - 1) * gap;
    const firstX = (W - totalW) / 2 + cardW / 2;
    const cardTop = 28;

    for (let i = 0; i < count; i++) {
      const opt = this.options[i];
      const rolled = this.prerolled[i];
      const x = firstX + i * (cardW + gap);
      const cy = cardTop + cardH / 2;
      const typeColor = this.getTypeColor(rolled.elementType);
      const typeColorNum = Phaser.Display.Color.HexStringToColor(typeColor).color;

      // Card panel
      const panel = this.scene.add.rectangle(x, cy, cardW, cardH, 0x0e1220, 0.95);
      panel.setStrokeStyle(2, typeColorNum, 1);
      this.container.add(panel);

      // Sprite area
      const spriteY = cardTop + 44;
      const sprite = this.scene.add.image(x, spriteY, `${opt.texturePrefix}_south`);
      const baseScale = 1.6 * speciesScale(opt.texturePrefix);
      sprite.setScale(baseScale);
      this.container.add(sprite);

      // Name
      const name = this.scene.add
        .text(x, cardTop + 86, opt.name, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5);
      this.container.add(name);

      // Type + Role badges
      const badgeY = cardTop + 102;
      const typeBadge = this.scene.add
        .text(x - 2, badgeY, rolled.elementType.toUpperCase(), {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: typeColor,
          backgroundColor: '#000000',
          padding: { left: 3, right: 3, top: 1, bottom: 1 },
        })
        .setOrigin(1, 0.5);
      this.container.add(typeBadge);

      const roleBadge = this.scene.add
        .text(x + 2, badgeY, rolled.role.toUpperCase(), {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: '#ffffff',
          backgroundColor: '#2a2f42',
          padding: { left: 3, right: 3, top: 1, bottom: 1 },
        })
        .setOrigin(0, 0.5);
      this.container.add(roleBadge);

      // Divider
      const divider = this.scene.add.rectangle(x, cardTop + 116, cardW - 18, 1, typeColorNum, 0.6);
      this.container.add(divider);

      // Stats — two columns
      const statsLeftX = x - cardW / 2 + 10;
      const statsRightX = x + 4;
      const statsTopY = cardTop + 124;
      const lineH = 11;
      const statStyle = {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#cfd4e0',
      } as const;

      const boosted = rolled.temperament.boosted;
      const reduced = rolled.temperament.reduced;
      const statColor = (key: string): string => {
        if (boosted === key) return '#88ffaa';
        if (reduced === key) return '#ff8888';
        return '#cfd4e0';
      };

      const arrow = (key: string): string => {
        if (boosted === key) return '▲';
        if (reduced === key) return '▼';
        return '';
      };

      const leftStats: Array<[string, string, string, string]> = [
        ['HP',  String(rolled.maxHp),   statColor('hp'),      arrow('hp')],
        ['ATK', String(rolled.attack),  statColor('attack'),  arrow('attack')],
        ['DEF', String(rolled.defense), statColor('defense'), arrow('defense')],
        ['SPD', String(rolled.speed),   statColor('speed'),   arrow('speed')],
      ];
      const rightStats: Array<[string, string, string, string]> = [
        ['A.SPD', `${(rolled.attackSpeed / 1000).toFixed(2)}s`, statColor('attackSpeed'), arrow('attackSpeed')],
        ['CRIT',  `${rolled.critRate}%`,                        statColor('critRate'),    arrow('critRate')],
        ['EVA',   `${rolled.evasion}%`,                         statColor('evasion'),     arrow('evasion')],
        ['RNG',   String(rolled.attackRange),                   '#cfd4e0',                ''],
      ];

      const renderStat = (
        baseX: number,
        row: number,
        label: string,
        value: string,
        color: string,
        mark: string,
      ) => {
        const y = statsTopY + row * lineH;
        this.container.add(
          this.scene.add
            .text(baseX, y, label, { ...statStyle, color: '#7a8094' })
            .setOrigin(0, 0),
        );
        this.container.add(
          this.scene.add.text(baseX + 32, y, value, { ...statStyle, color }).setOrigin(0, 0),
        );
        if (mark) {
          const markColor = mark === '▲' ? '#88ffaa' : '#ff8888';
          this.container.add(
            this.scene.add
              .text(baseX + 54, y, mark, { ...statStyle, fontSize: '7px', color: markColor })
              .setOrigin(0, 0),
          );
        }
      };

      for (let s = 0; s < leftStats.length; s++) {
        const [label, value, color, mark] = leftStats[s];
        renderStat(statsLeftX, s, label, value, color, mark);
      }
      for (let s = 0; s < rightStats.length; s++) {
        const [label, value, color, mark] = rightStats[s];
        renderStat(statsRightX, s, label, value, color, mark);
      }

      // Temperament name
      const tempLabel = this.scene.add
        .text(x, cardTop + 178, rolled.temperament.name, {
          fontFamily: 'monospace',
          fontSize: '8px',
          color: '#cc88ff',
        })
        .setOrigin(0.5);
      this.container.add(tempLabel);

      // Moves — equipped two
      const movesHeader = this.scene.add
        .text(x, cardTop + 194, 'MOVES', {
          fontFamily: 'monospace',
          fontSize: '7px',
          color: '#7a8094',
        })
        .setOrigin(0.5);
      this.container.add(movesHeader);

      const eq0 = rolled.moves[rolled.equipped[0]];
      const eq1 = rolled.moves[rolled.equipped[1]];
      const moveLine = (m: typeof eq0, yOff: number) => {
        if (!m) return;
        const prefix = m.isSignature ? '★ ' : '  ';
        const label = this.scene.add
          .text(x, cardTop + yOff, `${prefix}${m.name}`, {
            fontFamily: 'monospace',
            fontSize: '8px',
            color: m.isSignature ? '#ffdd44' : '#ffffff',
          })
          .setOrigin(0.5);
        this.container.add(label);
      };
      moveLine(eq0, 206);
      moveLine(eq1, 218);

      // Key hint
      const keyHint = this.scene.add
        .text(x, cardTop + 240, `[${i + 1}]`, {
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
        .rectangle(x, cy, cardW, cardH, 0x000000, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => {
        sprite.setScale(baseScale * 1.1);
        panel.setStrokeStyle(2, 0xffdd44, 1);
      });
      hit.on('pointerout', () => {
        sprite.setScale(baseScale);
        panel.setStrokeStyle(2, typeColorNum, 1);
      });
      hit.on('pointerdown', () => this.selectOption(cardIndex));
      this.container.add(hit);
    }

    // Skip hint — clickable
    const skip = this.scene.add
      .text(W / 2, H - 12, '[ESC] Skip', {
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
