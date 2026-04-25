import Phaser from 'phaser';
import {
  PartyRiftling,
  Role,
  ROLE_SYNERGIES,
  ROLE_COLORS_HEX,
  RoleSynergy,
  getRoleCounts,
} from '../data/party';

const FONT = 'monospace';

const PANEL_X = 4;
const PANEL_Y = 100;
const ROW_H = 18;
const ICON_SIZE = 12;
const PANEL_W = 22;

const ALL_ROLES: Role[] = ['vanguard', 'skirmisher', 'striker', 'caster', 'hunter', 'support', 'hexer'];

function roleGlyph(role: Role): string {
  return role.charAt(0).toUpperCase();
}

/**
 * RoleHUD — vertical strip below the SynergyHUD, same TFT-style idea but for
 * class/role synergies. Shows a row per role present in the active party.
 * Rows with count >= 2 are "active" and apply the role synergy buff at combat start.
 */
export class RoleHUD {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private gfx: Phaser.GameObjects.Graphics;
  private rows: {
    role: Role;
    synergy: RoleSynergy;
    iconText: Phaser.GameObjects.Text;
    countText: Phaser.GameObjects.Text;
  }[] = [];

  private visibleRows: { row: (typeof RoleHUD.prototype.rows)[0]; y: number }[] = [];

  private tooltip: Phaser.GameObjects.Container;
  private tooltipBg: Phaser.GameObjects.Graphics;
  private tooltipTitle: Phaser.GameObjects.Text;
  private tooltipBody: Phaser.GameObjects.Text;

  private partyRef: () => PartyRiftling[];

  constructor(scene: Phaser.Scene, partyRef: () => PartyRiftling[]) {
    this.scene = scene;
    this.partyRef = partyRef;

    this.container = scene.add.container(0, 0).setDepth(100).setScrollFactor(0);
    this.gfx = scene.add.graphics().setScrollFactor(0);
    this.container.add(this.gfx);

    for (let i = 0; i < ALL_ROLES.length; i++) {
      const role = ALL_ROLES[i];
      const synergy = ROLE_SYNERGIES[role];
      const y = PANEL_Y + i * ROW_H;

      const iconText = this.addText(
        PANEL_X + ICON_SIZE / 2,
        y + ROW_H / 2,
        roleGlyph(role),
        8,
        '#ffffff',
        0.5,
        0.5,
      );

      const countText = this.addText(
        PANEL_X + ICON_SIZE + 3,
        y + ROW_H / 2,
        '0',
        7,
        '#888888',
        0,
        0.5,
      );

      this.rows.push({ role, synergy, iconText, countText });
    }

    this.tooltip = scene.add.container(0, 0).setDepth(500).setScrollFactor(0).setVisible(false);
    this.tooltipBg = scene.add.graphics().setScrollFactor(0);
    this.tooltip.add(this.tooltipBg);

    this.tooltipTitle = this.addTooltipText(0, 0, '', 8, '#ffffff');
    this.tooltipBody = this.addTooltipText(0, 0, '', 7, '#aaaaaa');

    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.handleHover(pointer.x, pointer.y);
    });
  }

  refresh(): void {
    const active = this.partyRef();
    const counts = getRoleCounts(active);

    this.gfx.clear();
    this.visibleRows = [];

    let slot = 0;
    for (const row of this.rows) {
      const count = counts.get(row.role) ?? 0;

      if (count === 0) {
        row.iconText.setVisible(false);
        row.countText.setVisible(false);
        continue;
      }

      const isActive = count >= 2;
      const y = PANEL_Y + slot * ROW_H;
      const color = ROLE_COLORS_HEX[row.role] ?? 0xaaaaaa;

      this.visibleRows.push({ row, y });

      if (isActive) {
        this.gfx.fillStyle(color, 0.7);
        this.gfx.fillRoundedRect(PANEL_X - 2, y + 1, PANEL_W, ROW_H - 2, 3);
        this.gfx.lineStyle(1, 0xffffff, 0.5);
        this.gfx.strokeRoundedRect(PANEL_X - 2, y + 1, PANEL_W, ROW_H - 2, 3);
      } else {
        this.gfx.fillStyle(color, 0.3);
        this.gfx.fillRoundedRect(PANEL_X - 2, y + 1, PANEL_W, ROW_H - 2, 3);
        this.gfx.lineStyle(1, color, 0.4);
        this.gfx.strokeRoundedRect(PANEL_X - 2, y + 1, PANEL_W, ROW_H - 2, 3);
      }

      row.iconText.setVisible(true);
      row.iconText.setPosition(PANEL_X + ICON_SIZE / 2, y + ROW_H / 2);
      row.iconText.setColor(isActive ? '#ffffff' : '#cccccc');
      row.iconText.setAlpha(isActive ? 1 : 0.8);

      row.countText.setVisible(true);
      row.countText.setPosition(PANEL_X + ICON_SIZE + 3, y + ROW_H / 2);
      row.countText.setText(`${count}`);
      row.countText.setColor(isActive ? '#ffffff' : '#cccccc');
      row.countText.setAlpha(isActive ? 1 : 0.8);

      slot++;
    }
  }

  private handleHover(px: number, py: number): void {
    for (const { row, y } of this.visibleRows) {
      if (
        px >= PANEL_X - 2 &&
        px <= PANEL_X + PANEL_W + 2 &&
        py >= y &&
        py <= y + ROW_H
      ) {
        this.showTooltip(row, PANEL_X + PANEL_W + 4, y);
        return;
      }
    }
    this.tooltip.setVisible(false);
  }

  private showTooltip(
    row: (typeof this.rows)[0],
    x: number,
    y: number,
  ): void {
    const active = this.partyRef();
    const counts = getRoleCounts(active);
    const count = counts.get(row.role) ?? 0;
    const isActive = count >= 2;

    const title = `${row.synergy.name} (${row.role})`;
    const status = isActive
      ? `Active (${count}/${count})`
      : count === 1
        ? `1 more to activate`
        : `Need 2 to activate`;
    const body = `${row.synergy.description}\n${status}`;

    this.tooltipTitle.setText(title);
    this.tooltipTitle.setPosition(x + 6, y + 4);
    this.tooltipTitle.setColor(
      isActive ? '#' + (ROLE_COLORS_HEX[row.role] ?? 0xffffff).toString(16).padStart(6, '0') : '#aaaaaa',
    );

    this.tooltipBody.setText(body);
    this.tooltipBody.setPosition(x + 6, y + 15);

    const w = Math.max(this.tooltipTitle.width, this.tooltipBody.width) + 12;
    const h = 14 + this.tooltipBody.height + 6;

    this.tooltipBg.clear();
    this.tooltipBg.fillStyle(0x0a0a1a, 0.92);
    this.tooltipBg.fillRoundedRect(x, y, w, h, 4);
    this.tooltipBg.lineStyle(1, ROLE_COLORS_HEX[row.role] ?? 0x444466, 0.6);
    this.tooltipBg.strokeRoundedRect(x, y, w, h, 4);

    this.tooltip.setVisible(true);
  }

  getContainer(): Phaser.GameObjects.Container {
    return this.container;
  }

  getTooltipContainer(): Phaser.GameObjects.Container {
    return this.tooltip;
  }

  destroy(): void {
    this.tooltip.destroy();
    this.container.destroy();
  }

  private addText(
    x: number,
    y: number,
    text: string,
    size: number,
    color: string,
    originX = 0,
    originY = 0,
  ): Phaser.GameObjects.Text {
    const t = this.scene.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color,
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setOrigin(originX, originY);
    this.container.add(t);
    return t;
  }

  private addTooltipText(
    x: number,
    y: number,
    text: string,
    size: number,
    color: string,
  ): Phaser.GameObjects.Text {
    const t = this.scene.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color,
        stroke: '#000000',
        strokeThickness: 1,
      })
      .setOrigin(0, 0);
    this.tooltip.add(t);
    return t;
  }
}
