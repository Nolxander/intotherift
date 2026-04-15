import Phaser from 'phaser';
import {
  Move,
  PartyRiftling,
  StatCard,
  StatKey,
  speciesScale,
} from '../data/party';

/**
 * Level-up card prompt — shown after a riftling gains a level.
 *
 * Two modes:
 *   - `showStatCards` presents 3 stat-bump cards; player picks one (1-3 / click).
 *   - `showMoveUpgrade` presents a new move plus the current movelist, and the
 *     player picks which slot to replace (or fills a free slot) — or skips.
 *
 * Modelled on RecruitPrompt: single overlay container on depth 500,
 * event-based DOM keydown handler, and a simple hide()/onChoice pattern.
 */
export class LevelUpCardPrompt {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private active = false;
  private keyHandler?: (event: KeyboardEvent) => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(500).setScrollFactor(0);
    this.container.setVisible(false);
  }

  get isActive(): boolean {
    return this.active;
  }

  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  // ---- Stat card mode ----

  /**
   * Show 3 stat cards for the given riftling's level-up.
   * The callback is invoked with the chosen card, or null if the player skipped.
   */
  showStatCards(
    riftling: PartyRiftling,
    cards: StatCard[],
    onChoice: (card: StatCard | null) => void,
  ): void {
    if (cards.length === 0) {
      onChoice(null);
      return;
    }

    this.prepareOverlay();

    const W = 480;
    const H = 320;

    this.drawBackdrop(W, H);
    this.drawHeader(W, riftling, `Level ${riftling.level}!`, '#ffdd44');

    // Current stats row so the player can see what they already have
    const highlightStats = new Set<StatKey>(cards.map((c) => c.stat));
    this.drawStatsRow(W, 82, riftling, highlightStats);

    // Card layout: 3 cards side-by-side, centered
    const cardW = 120;
    const cardH = 136;
    const gap = 12;
    const totalW = cards.length * cardW + (cards.length - 1) * gap;
    const startX = W / 2 - totalW / 2;
    const cardY = 140;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const x = startX + i * (cardW + gap);
      this.buildStatCard(x, cardY, cardW, cardH, card, i, () => {
        this.hide();
        onChoice(card);
      });
    }

    this.drawSkipHint(W, H, 'Skip', () => {
      this.hide();
      onChoice(null);
    });

    this.container.setVisible(true);

    this.keyHandler = (event: KeyboardEvent) => {
      if (!this.active) return;
      if (event.key === 'Escape') {
        this.hide();
        onChoice(null);
        return;
      }
      const num = parseInt(event.key, 10);
      if (num >= 1 && num <= cards.length) {
        const picked = cards[num - 1];
        this.hide();
        onChoice(picked);
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  // ---- Move upgrade mode ----

  /**
   * Show a new-move unlock prompt.
   * The player picks which current move slot to replace — pressing a number
   * matching an existing slot replaces it, or if `moves.length < 3`, pressing
   * a number past the last slot fills the empty slot with the new move.
   *
   * Callback gets the slot index to replace, or null to skip.
   */
  showMoveUpgrade(
    riftling: PartyRiftling,
    newMove: Move,
    onChoice: (replaceIdx: number | null) => void,
  ): void {
    this.prepareOverlay();

    const W = 480;
    const H = 320;
    const currentCount = riftling.moves.length;
    const hasFreeSlot = currentCount < 3;
    const slotCount = hasFreeSlot ? currentCount + 1 : currentCount;

    this.drawBackdrop(W, H);
    this.drawHeader(W, riftling, `New Move: ${newMove.name}`, '#44ffcc');

    // New move preview at top
    this.drawMoveCard(W / 2 - 120, 74, 240, 40, newMove, '#44ffcc', true);

    // Prompt instruction
    const instr = this.scene.add
      .text(
        W / 2,
        126,
        hasFreeSlot ? 'Pick a slot to fill:' : 'Pick a move to replace:',
        {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#aaaaaa',
        },
      )
      .setOrigin(0.5);
    this.container.add(instr);

    // Existing move list + empty slot (if any)
    const slotW = 130;
    const slotH = 42;
    const slotGap = 8;
    const slotsTotalW = slotCount * slotW + (slotCount - 1) * slotGap;
    const slotStartX = W / 2 - slotsTotalW / 2;
    const slotY = 148;

    for (let i = 0; i < slotCount; i++) {
      const x = slotStartX + i * (slotW + slotGap);
      const slotIndex = i;
      if (i < currentCount) {
        // Existing move — clicking replaces it
        this.drawMoveCard(x, slotY, slotW, slotH, riftling.moves[i], '#ff6666', false, slotIndex + 1);
        this.addClickZone(x + slotW / 2, slotY + slotH / 2, slotW, slotH, () => {
          this.hide();
          onChoice(slotIndex);
        });
      } else {
        // Empty slot — clicking fills it
        this.drawEmptySlot(x, slotY, slotW, slotH, slotIndex + 1);
        this.addClickZone(x + slotW / 2, slotY + slotH / 2, slotW, slotH, () => {
          this.hide();
          onChoice(slotIndex);
        });
      }
    }

    this.drawSkipHint(W, H, 'Skip (keep current moves)', () => {
      this.hide();
      onChoice(null);
    });

    this.container.setVisible(true);

    this.keyHandler = (event: KeyboardEvent) => {
      if (!this.active) return;
      if (event.key === 'Escape') {
        this.hide();
        onChoice(null);
        return;
      }
      const num = parseInt(event.key, 10);
      if (num >= 1 && num <= slotCount) {
        this.hide();
        onChoice(num - 1);
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  // ---- Drawing helpers ----

  private prepareOverlay(): void {
    this.active = true;
    this.container.removeAll(true);
  }

  private drawBackdrop(W: number, H: number): void {
    const bg = this.scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7);
    this.container.add(bg);
  }

  private drawHeader(W: number, riftling: PartyRiftling, title: string, color: string): void {
    // Sprite portrait (tiny, left of title)
    const portrait = this.scene.add.image(W / 2 - 84, 36, `${riftling.texturePrefix}_south`);
    portrait.setScale(1.1 * speciesScale(riftling.texturePrefix));
    this.container.add(portrait);

    const name = this.scene.add
      .text(W / 2 - 60, 28, riftling.name, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffffff',
      })
      .setOrigin(0, 0.5);
    this.container.add(name);

    const titleText = this.scene.add
      .text(W / 2 - 60, 44, title, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color,
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0, 0.5);
    this.container.add(titleText);
  }

  /**
   * Compact one-line stats readout shown on the stat-card screen so the player
   * can see what they already have. Any stat listed in `highlight` (the stats
   * each card affects) is rendered in the card's accent color.
   */
  private drawStatsRow(W: number, y: number, r: PartyRiftling, highlight: Set<StatKey>): void {
    const HIGHLIGHT = '#ffdd66';
    const NEUTRAL = '#aabbcc';
    const LABEL = '#556677';

    const entries: { key: StatKey; label: string; value: string }[] = [
      { key: 'hp',          label: 'HP',    value: `${r.hp}/${r.maxHp}` },
      { key: 'attack',      label: 'ATK',   value: `${r.attack}` },
      { key: 'defense',     label: 'DEF',   value: `${r.defense}` },
      { key: 'speed',       label: 'SPD',   value: `${r.speed}` },
      { key: 'attackSpeed', label: 'A.SPD', value: `${r.attackSpeed}ms` },
      { key: 'critRate',    label: 'CRIT',  value: `${r.critRate}%` },
      { key: 'evasion',     label: 'EVA',   value: `${r.evasion}%` },
    ];

    // Build text objects first (unpositioned) so we can measure.
    const parts: { label: Phaser.GameObjects.Text; value: Phaser.GameObjects.Text }[] = [];
    let contentWidth = 0;
    const entrySpacing = 10;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const isHi = highlight.has(e.key);
      const labelText = this.scene.add.text(0, 0, `${e.label} `, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: LABEL,
      });
      const valueText = this.scene.add.text(0, 0, e.value, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: isHi ? HIGHLIGHT : NEUTRAL,
      });
      parts.push({ label: labelText, value: valueText });
      contentWidth += labelText.width + valueText.width;
      if (i < entries.length - 1) contentWidth += entrySpacing;
    }

    // Card background: padded rect centered horizontally.
    const padX = 12;
    const padY = 6;
    const cardW = Math.min(W - 32, contentWidth + padX * 2);
    const cardH = 20;
    const cardX = Math.floor(W / 2 - cardW / 2);
    const cardY = y - padY;

    const gfx = this.scene.add.graphics();
    gfx.fillStyle(0x10182a, 0.92);
    gfx.fillRoundedRect(cardX, cardY, cardW, cardH, 4);
    gfx.lineStyle(1, 0x334466, 1);
    gfx.strokeRoundedRect(cardX, cardY, cardW, cardH, 4);
    this.container.add(gfx);

    // Position the text items inside the card.
    const textY = cardY + padY - 1;
    let x = Math.floor(W / 2 - contentWidth / 2);
    for (let i = 0; i < parts.length; i++) {
      const { label, value } = parts[i];
      label.setPosition(x, textY);
      this.container.add(label);
      x += label.width;
      value.setPosition(x, textY);
      this.container.add(value);
      x += value.width;
      if (i < parts.length - 1) x += entrySpacing;
    }
  }

  private buildStatCard(
    x: number, y: number, w: number, h: number,
    card: StatCard, index: number, onPick: () => void,
  ): void {
    // Card background
    const gfx = this.scene.add.graphics();
    gfx.fillStyle(0x1a1a2e, 0.9);
    gfx.fillRoundedRect(x, y, w, h, 6);
    gfx.lineStyle(2, 0x4488cc, 1);
    gfx.strokeRoundedRect(x, y, w, h, 6);
    this.container.add(gfx);

    // Big stat label
    const label = this.scene.add
      .text(x + w / 2, y + 28, card.label, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.container.add(label);

    // Divider
    const div = this.scene.add.graphics();
    div.lineStyle(1, 0x334466, 1);
    div.lineBetween(x + 12, y + 48, x + w - 12, y + 48);
    this.container.add(div);

    // Description (wrapped)
    const desc = this.scene.add
      .text(x + w / 2, y + 72, card.description, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#aaccee',
        align: 'center',
        wordWrap: { width: w - 16 },
      })
      .setOrigin(0.5, 0);
    this.container.add(desc);

    // Key hint
    const hint = this.scene.add
      .text(x + w / 2, y + h - 16, `[${index + 1}]`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffdd44',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5);
    this.container.add(hint);

    this.addClickZone(x + w / 2, y + h / 2, w, h, onPick);
  }

  private drawMoveCard(
    x: number, y: number, w: number, h: number,
    move: Move, borderColor: string, highlight: boolean,
    keyHint?: number,
  ): void {
    const gfx = this.scene.add.graphics();
    gfx.fillStyle(highlight ? 0x203040 : 0x1a1a2e, 0.9);
    gfx.fillRoundedRect(x, y, w, h, 4);
    gfx.lineStyle(highlight ? 2 : 1, Phaser.Display.Color.HexStringToColor(borderColor).color, 1);
    gfx.strokeRoundedRect(x, y, w, h, 4);
    this.container.add(gfx);

    const name = this.scene.add
      .text(x + 6, y + 4, move.name, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#ffffff',
      })
      .setOrigin(0, 0);
    this.container.add(name);

    const statsText = `P${move.power} / ${move.cooldown}s  [${move.kind}]`;
    const stats = this.scene.add
      .text(x + 6, y + 16, statsText, {
        fontFamily: 'monospace',
        fontSize: '7px',
        color: '#88aabb',
      })
      .setOrigin(0, 0);
    this.container.add(stats);

    const desc = this.scene.add
      .text(x + 6, y + 26, move.description, {
        fontFamily: 'monospace',
        fontSize: '6px',
        color: '#667788',
        wordWrap: { width: w - 14 },
      })
      .setOrigin(0, 0);
    this.container.add(desc);

    if (keyHint !== undefined) {
      const hint = this.scene.add
        .text(x + w - 4, y + 4, `[${keyHint}]`, {
          fontFamily: 'monospace',
          fontSize: '9px',
          color: '#ffdd44',
        })
        .setOrigin(1, 0);
      this.container.add(hint);
    }
  }

  private drawEmptySlot(
    x: number, y: number, w: number, h: number, keyHint: number,
  ): void {
    const gfx = this.scene.add.graphics();
    gfx.fillStyle(0x101020, 0.7);
    gfx.fillRoundedRect(x, y, w, h, 4);
    gfx.lineStyle(1, 0x44ffcc, 0.6);
    gfx.strokeRoundedRect(x, y, w, h, 4);
    this.container.add(gfx);

    const label = this.scene.add
      .text(x + w / 2, y + h / 2, '+ Empty Slot', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#44ffcc',
      })
      .setOrigin(0.5);
    this.container.add(label);

    const hint = this.scene.add
      .text(x + w - 4, y + 4, `[${keyHint}]`, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#ffdd44',
      })
      .setOrigin(1, 0);
    this.container.add(hint);
  }

  private drawSkipHint(W: number, H: number, label: string, onSkip: () => void): void {
    const skip = this.scene.add
      .text(W / 2, H - 28, `[ESC] ${label}`, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#888888',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    skip.on('pointerover', () => skip.setColor('#ffffff'));
    skip.on('pointerout', () => skip.setColor('#888888'));
    skip.on('pointerdown', onSkip);
    this.container.add(skip);
  }

  private addClickZone(
    cx: number, cy: number, w: number, h: number, onClick: () => void,
  ): void {
    const hit = this.scene.add
      .rectangle(cx, cy, w, h, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', onClick);
    this.container.add(hit);
  }

  private hide(): void {
    this.active = false;
    this.container.setVisible(false);
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = undefined;
    }
  }
}

