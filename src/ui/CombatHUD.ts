import Phaser from 'phaser';
import { CombatManager } from '../combat/CombatManager';
import { PartyRiftling, TYPE_COLORS } from '../data/party';

const FONT = 'monospace';

const PANEL_X = 160;
const PANEL_Y = 293;
const PANEL_W = 160;
const PANEL_H = 24;

/**
 * Move HUD — always-visible panel showing the selected riftling's equipped moves.
 *
 * Positioned to the right of the party HUD at the bottom of the screen.
 * During combat: shows cooldown progress from CombatManager.
 * Outside combat: shows moves statically.
 */
export class CombatHUD {
  private scene: Phaser.Scene;
  private combat: CombatManager | null;
  private container: Phaser.GameObjects.Container;
  private gfx: Phaser.GameObjects.Graphics;
  private moveTexts: Phaser.GameObjects.Text[] = [];

  /** External party data reference for out-of-combat display. */
  private partyRef: () => { active: PartyRiftling[]; selectedIndex: number };

  constructor(
    scene: Phaser.Scene,
    combat: CombatManager | null,
    partyRef: () => { active: PartyRiftling[]; selectedIndex: number },
  ) {
    this.scene = scene;
    this.combat = combat;
    this.partyRef = partyRef;

    this.container = scene.add.container(0, 0).setDepth(400).setScrollFactor(0);
    this.gfx = scene.add.graphics().setScrollFactor(0);
    this.container.add(this.gfx);

    // Two move slot labels
    for (let i = 0; i < 2; i++) {
      const t = this.addText(0, 0, '', 7, '#cccccc');
      this.moveTexts.push(t);
    }

    this.container.setVisible(true);
  }

  /** Swap in a new CombatManager (e.g. after room transition). */
  setCombatManager(combat: CombatManager): void {
    this.combat = combat;
  }

  update(time: number): void {
    this.gfx.clear();

    const { active, selectedIndex } = this.partyRef();
    const riftling = active[selectedIndex];
    const inCombat = this.combat?.isActive ?? false;

    if (!riftling) {
      for (const t of this.moveTexts) t.setText('');
      return;
    }

    // Panel background
    this.gfx.fillStyle(0x0a0a1a, 0.85);
    this.gfx.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 3);
    this.gfx.lineStyle(1, 0x334466);
    this.gfx.strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 3);

    // Element type color for this riftling
    const typeColor = TYPE_COLORS[riftling.elementType] ?? 0x334466;

    // Draw the 2 equipped move slots
    for (let i = 0; i < 2; i++) {
      const slotX = PANEL_X + 4 + i * 78;
      const slotY = PANEL_Y + 3;
      const slotW = 74;
      const slotH = 17;

      const moveIdx = riftling.equipped[i];
      const move = moveIdx >= 0 ? riftling.moves[moveIdx] : null;

      if (!move) {
        this.moveTexts[i].setText('');
        continue;
      }

      // Cooldown state (only meaningful during combat)
      let cdRatio = 0;
      let isActive = false;
      if (inCombat && this.combat) {
        cdRatio = this.combat.getMoveCooldownRatio(selectedIndex, i, time);
        const ally = this.combat.getAlly(selectedIndex);
        isActive = ally !== null && ally.lastMoveIndex === i && cdRatio > 0.7;
      }

      const isReady = cdRatio === 0;

      // Move slot background — tinted with element type color
      if (inCombat && isActive) {
        this.gfx.fillStyle(typeColor, 0.5);
      } else if (!inCombat || isReady) {
        this.gfx.fillStyle(typeColor, 0.2);
      } else {
        this.gfx.fillStyle(0x111122, 0.8);
      }
      this.gfx.fillRoundedRect(slotX, slotY, slotW, slotH, 2);

      // Type accent stripe on left edge
      this.gfx.fillStyle(typeColor, 0.7);
      this.gfx.fillRect(slotX, slotY + 2, 2, slotH - 4);

      // Move name
      const prefix = move.isSignature ? '\u2605 ' : '';
      const nameColor = (!inCombat || isReady) ? '#ffffff' : '#666666';
      this.moveTexts[i].setText(`${prefix}${move.name}`);
      this.moveTexts[i].setColor(nameColor);
      this.moveTexts[i].setPosition(slotX + 5, slotY + 1);

      // Cooldown bar under the move name (only during combat)
      if (inCombat) {
        const cdBarX = slotX + 1;
        const cdBarY = slotY + slotH - 4;
        const cdBarW = slotW - 2;
        const cdBarH = 2;

        this.gfx.fillStyle(0x000000, 0.5);
        this.gfx.fillRect(cdBarX, cdBarY, cdBarW, cdBarH);

        if (isReady) {
          this.gfx.fillStyle(0x44cc88);
          this.gfx.fillRect(cdBarX, cdBarY, cdBarW, cdBarH);
        } else {
          this.gfx.fillStyle(typeColor, 0.6);
          this.gfx.fillRect(cdBarX, cdBarY, cdBarW * (1 - cdRatio), cdBarH);
        }
      }
    }
  }

  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  destroy(): void {
    this.container.destroy();
  }

  private addText(
    x: number,
    y: number,
    text: string,
    size: number,
    color: string,
    originX = 0,
  ): Phaser.GameObjects.Text {
    const t = this.scene.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color,
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setOrigin(originX, 0);
    this.container.add(t);
    return t;
  }
}
