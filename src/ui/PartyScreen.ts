import Phaser from 'phaser';
import { Party, PartyRiftling, Move, MoveKind, MAX_ACTIVE, MAX_BENCH, xpForLevel, MAX_LEVEL, StatKey, speciesScale, TYPE_SYNERGIES, ROLE_SYNERGIES, Role } from '../data/party';
import { TrinketDef, MAX_EQUIPPED, equipFromBag, unequipTrinket, swapTrinket } from '../data/trinkets';

const W = 480;
const H = 320;

const TYPE_COLORS: Record<string, number> = {
  fire: 0xe85d30,
  water: 0x3092e8,
  nature: 0x4caf50,
  earth: 0x8d6e3f,
  light: 0xf0e060,
  dark: 0xb060e0,
};

const TYPE_COLORS_HEX: Record<string, string> = {
  fire: '#e85d30',
  water: '#3092e8',
  nature: '#4caf50',
  earth: '#8d6e3f',
  light: '#f0e060',
  dark: '#b060e0',
};

const ROLE_COLORS: Record<string, string> = {
  vanguard: '#6688cc',
  skirmisher: '#44cc88',
  striker: '#ff6644',
  caster: '#cc66ff',
  hunter: '#ffaa33',
  support: '#88ddaa',
  hexer: '#aa44cc',
};

const FONT = 'monospace';

/**
 * Full-screen party management overlay.
 *
 * Left panel: clickable riftling slots (active + bench).
 * Right panel: selected riftling's detail (stats, moves, type, role).
 * Supports click-to-select, move-to-bench/active, and move equip toggling.
 */
export class PartyScreen {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private party: Party;
  private active = false;
  private selectedSlot = 0; // index into combined list: 0..active.length-1 = active, then bench
  private onPartyChanged: () => void;
  private keyHandler?: (e: KeyboardEvent) => void;

  // Drag-and-drop drop zones for active/bench tab regions (axis-aligned rects,
  // container-local coords). Populated in buildTabBar, consulted in handleDrop.
  private activeZone: { x1: number; y1: number; x2: number; y2: number } | null = null;
  private benchZone: { x1: number; y1: number; x2: number; y2: number } | null = null;

  constructor(scene: Phaser.Scene, party: Party, onPartyChanged: () => void) {
    this.scene = scene;
    this.party = party;
    this.onPartyChanged = onPartyChanged;
    this.container = scene.add.container(0, 0).setDepth(600).setScrollFactor(0);
    this.container.setVisible(false);
  }

  show(): void {
    this.active = true;
    this.selectedSlot = 0;
    // A few pixels of slop before a click counts as a drag — prevents accidental
    // drags when the user meant to click-to-select.
    this.scene.input.dragDistanceThreshold = 6;
    this.rebuild();
    this.container.setVisible(true);

    this.keyHandler = (e: KeyboardEvent) => {
      if (!this.active) return;
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        this.hide();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  hide(): void {
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

  // ---- Build UI ----

  private rebuild(): void {
    this.container.removeAll(true);

    // Dim background
    const bg = this.scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.88);
    this.container.add(bg);

    // Title bar
    this.addText(W / 2, 6, 'PARTY', 12, '#ffffff', 0.5);
    this.addText(W - 8, 6, '[TAB] Close', 7, '#555555', 1);

    this.buildTabBar();
    this.buildDetailPanel();
    this.buildTrinketStrip();
  }

  // ---- Top nav: clickable riftling tabs ----

  private buildTabBar(): void {
    const tabY = 22;
    const tabH = 28;
    const gap = 2;

    // Calculate tab widths to fill the available space
    const totalSlots = MAX_ACTIVE + MAX_BENCH;
    const margin = 8;
    const labelW = 42; // space for "ACTIVE" / "BENCH" labels
    const activeTabsW = (W - margin * 2 - labelW * 2 - gap * (totalSlots - 1) - 8) / totalSlots;
    const tabW = Math.min(Math.floor(activeTabsW), 48);

    let x = margin;

    // Active label
    this.addText(x, tabY + tabH / 2 - 4, 'ACTIVE', 7, '#44ff88');
    x += labelW;

    // Active team tabs
    const activeStart = x;
    for (let i = 0; i < MAX_ACTIVE; i++) {
      const riftling = this.party.active[i] ?? null;
      this.buildTab(x, tabY, tabW, tabH, i, riftling);
      x += tabW + gap;
    }
    this.activeZone = { x1: activeStart, y1: tabY, x2: x - gap, y2: tabY + tabH };

    // Bench separator
    x += 4;
    this.addText(x, tabY + tabH / 2 - 4, 'BENCH', 7, '#777777');
    x += labelW;

    // Bench tabs
    const benchStart = x;
    for (let i = 0; i < MAX_BENCH; i++) {
      const riftling = this.party.bench[i] ?? null;
      const slotIndex = MAX_ACTIVE + i;
      this.buildTab(x, tabY, tabW, tabH, slotIndex, riftling);
      x += tabW + gap;
    }
    this.benchZone = { x1: benchStart, y1: tabY, x2: x - gap, y2: tabY + tabH };
  }

  private buildTab(
    x: number,
    y: number,
    w: number,
    h: number,
    slotIndex: number,
    riftling: PartyRiftling | null,
  ): void {
    const isSelected = slotIndex === this.selectedSlot;
    const bgColor = isSelected ? 0x334466 : 0x15152a;
    const rect = this.scene.add.rectangle(x + w / 2, y + h / 2, w, h, bgColor, 0.95);
    this.container.add(rect);

    if (isSelected) {
      const border = this.scene.add.rectangle(x + w / 2, y + h / 2, w, h);
      border.setStrokeStyle(1, 0x66aaff);
      border.setFillStyle(0x000000, 0);
      this.container.add(border);
      // Bottom highlight to connect tab to detail panel
      const highlight = this.scene.add.rectangle(x + w / 2, y + h, w - 2, 2, 0x66aaff);
      this.container.add(highlight);
    }

    if (!riftling) {
      this.addText(x + w / 2, y + h / 2 - 3, '-', 8, '#333333', 0.5);
    } else {
      // Sprite icon
      const spriteKey = `${riftling.texturePrefix}_south`;
      if (this.scene.textures.exists(spriteKey)) {
        const icon = this.scene.add.image(x + w / 2, y + h / 2 - 2, spriteKey).setScale(0.38 * speciesScale(riftling.texturePrefix));
        this.container.add(icon);
      }

      // HP pip under the sprite
      const hpRatio = riftling.hp / riftling.maxHp;
      const pipW = w - 6;
      const pipH = 3;
      const pipGfx = this.scene.add.graphics();
      pipGfx.fillStyle(0x000000, 0.6);
      pipGfx.fillRect(x + 3, y + h - 6, pipW, pipH);
      const pipColor = hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xccaa22 : 0xcc3333;
      pipGfx.fillStyle(pipColor);
      pipGfx.fillRect(x + 3, y + h - 6, pipW * hpRatio, pipH);
      this.container.add(pipGfx);
    }

    // Clickable + draggable (drag only on occupied slots — empty slots are
    // click-to-select only).
    rect.setInteractive({ useHandCursor: true });

    if (riftling) {
      this.scene.input.setDraggable(rect);
      let dragging = false;
      const origX = x + w / 2;
      const origY = y + h / 2;
      rect.on('pointerdown', () => { dragging = false; });
      rect.on('dragstart', () => { dragging = true; rect.setAlpha(0.7); });
      rect.on('drag', (_p: Phaser.Input.Pointer, dx: number, dy: number) => {
        rect.x = dx;
        rect.y = dy;
      });
      rect.on('dragend', (p: Phaser.Input.Pointer) => {
        rect.setAlpha(1);
        rect.x = origX;
        rect.y = origY;
        this.handleDrop(slotIndex, p.x, p.y);
      });
      rect.on('pointerup', () => {
        if (dragging) return;
        this.selectedSlot = slotIndex;
        this.rebuild();
      });
    } else {
      rect.on('pointerdown', () => {
        this.selectedSlot = slotIndex;
        this.rebuild();
      });
    }
  }

  // ---- Drag-drop handler ----

  private handleDrop(fromSlot: number, px: number, py: number): void {
    const inActive = this.pointInZone(px, py, this.activeZone);
    const inBench = this.pointInZone(px, py, this.benchZone);
    const fromActive = fromSlot < MAX_ACTIVE;

    if (fromActive && inBench && !inActive) {
      // Active → Bench: reuse the same guards as the button path.
      this.selectedSlot = fromSlot;
      this.moveToBench();
      return;
    }
    if (!fromActive && inActive && !inBench) {
      this.selectedSlot = fromSlot;
      this.moveToActive();
      return;
    }
    // Dropped outside any zone (or same zone) → rebuild to reset the dragged
    // tab's visual state.
    this.rebuild();
  }

  private pointInZone(
    x: number,
    y: number,
    zone: { x1: number; y1: number; x2: number; y2: number } | null,
  ): boolean {
    if (!zone) return false;
    return x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2;
  }

  // ---- Full-width detail panel ----

  private buildDetailPanel(): void {
    const px = 10;
    const pw = W - 20;
    const panelTop = 54;

    const riftling = this.getSelectedRiftling();
    if (!riftling) {
      this.addText(W / 2, panelTop + 60, 'Select a riftling', 10, '#444444', 0.5);
      return;
    }

    let y = panelTop;

    // --- Header row: Sprite + Name/Type/Role + Stats ---
    const spriteKey = `${riftling.texturePrefix}_south`;
    let spriteBottom = panelTop;
    if (this.scene.textures.exists(spriteKey)) {
      const sprite = this.scene.add.image(px + 24, y + 32, spriteKey).setScale(1.5 * speciesScale(riftling.texturePrefix));
      this.container.add(sprite);
      spriteBottom = sprite.y + sprite.displayHeight / 2;
    }

    // Name + Level
    const nameX = px + 56;
    this.addText(nameX, y, riftling.name, 13, '#ffffff');
    this.addText(nameX + 160, y + 2, `Lv.${riftling.level}`, 10, '#ffdd44');
    y += 16;

    // Type + Role + Temperament
    const typeColor = TYPE_COLORS_HEX[riftling.elementType] ?? '#ffffff';
    const roleColor = ROLE_COLORS[riftling.role] ?? '#aaaaaa';
    this.addText(nameX, y, riftling.elementType.toUpperCase(), 8, typeColor);
    this.addText(nameX + 50, y, riftling.role.toUpperCase(), 8, roleColor);
    const tempColor = riftling.temperament.boosted ? '#cc88ff' : '#888888';
    this.addText(nameX + 110, y, riftling.temperament.name, 8, tempColor);
    y += 12;

    // XP bar (wider now)
    if (riftling.level < MAX_LEVEL) {
      const needed = xpForLevel(riftling.level);
      const xpRatio = riftling.xp / needed;
      this.addText(nameX, y, `XP  ${riftling.xp}/${needed}`, 7, '#aaccff');
      const xpBarX = nameX + 70;
      const xpBarW = 140;
      const xpBarH = 5;
      const xpGfx = this.scene.add.graphics();
      xpGfx.fillStyle(0x000000, 0.6);
      xpGfx.fillRect(xpBarX, y + 2, xpBarW, xpBarH);
      xpGfx.fillStyle(0x4488ff);
      xpGfx.fillRect(xpBarX, y + 2, xpBarW * xpRatio, xpBarH);
      this.container.add(xpGfx);
    } else {
      this.addText(nameX, y, 'MAX LEVEL', 8, '#ffdd44');
    }
    y += 12;

    // --- Stats block on the right side of the header ---
    const boosted = riftling.temperament.boosted;
    const reduced = riftling.temperament.reduced;
    const sc = (key: StatKey, fallback: string) =>
      boosted === key ? '#44ee66' : reduced === key ? '#ee4444' : fallback;

    const statX = px + pw - 170;
    let statY = panelTop;

    const hpColor = riftling.hp / riftling.maxHp > 0.5 ? '#44cc44' : riftling.hp / riftling.maxHp > 0.25 ? '#ccaa22' : '#cc3333';
    // HP bar (wider)
    this.addText(statX, statY, `HP`, 8, sc('hp', hpColor));
    const hpBarX = statX + 22;
    const hpBarW = 70;
    const hpBarH = 6;
    const hpRatio = riftling.hp / riftling.maxHp;
    const hpGfx = this.scene.add.graphics();
    hpGfx.fillStyle(0x000000, 0.6);
    hpGfx.fillRect(hpBarX, statY + 2, hpBarW, hpBarH);
    const hpBarColor = hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xccaa22 : 0xcc3333;
    hpGfx.fillStyle(hpBarColor);
    hpGfx.fillRect(hpBarX, statY + 2, hpBarW * hpRatio, hpBarH);
    this.container.add(hpGfx);
    this.addText(statX + 96, statY, `${riftling.hp}/${riftling.maxHp}`, 7, sc('hp', hpColor));
    statY += 12;

    // Two-column stats
    const sCol1 = statX;
    const sCol2 = statX + 82;
    this.addText(sCol1, statY, `ATK  ${riftling.attack}`, 8, sc('attack', '#dddddd'));
    this.addText(sCol2, statY, `DEF  ${riftling.defense}`, 8, sc('defense', '#dddddd'));
    statY += 11;
    this.addText(sCol1, statY, `SPD  ${riftling.speed}`, 8, sc('speed', '#dddddd'));
    this.addText(sCol2, statY, `A.SPD ${Math.round(riftling.attackSpeed / 100) / 10}s`, 8, sc('attackSpeed', '#dddddd'));
    statY += 11;
    this.addText(sCol1, statY, `CRIT ${riftling.critRate}%`, 8, sc('critRate', '#ff8844'));
    this.addText(sCol2, statY, `EVA  ${riftling.evasion}%`, 8, sc('evasion', '#44ccaa'));
    statY += 11;
    this.addText(sCol1, statY, `RNG  ${riftling.attackRange > 40 ? 'Ranged' : 'Melee'}`, 8, '#aaaacc');
    statY += 10; // account for RNG text height

    // --- Divider: placed below the tallest header element (left text column,
    // right stats column, or sprite), whichever is lowest. Prevents overlap. ---
    y = Math.max(y, statY, spriteBottom) + 2;
    const divGfx = this.scene.add.graphics();
    divGfx.lineStyle(1, 0x333355);
    divGfx.lineBetween(px, y, px + pw, y);
    this.container.add(divGfx);
    y += 4;

    // --- Moves: horizontal layout, 3 moves side by side ---
    this.addText(px, y, 'MOVES', 8, '#88aacc');

    // Action button (right-aligned next to moves header)
    const isInActive = this.selectedSlot < MAX_ACTIVE && this.selectedSlot < this.party.active.length;
    const isInBench = this.selectedSlot >= MAX_ACTIVE;
    if (isInActive && this.party.active.length > 1) {
      this.buildButton(px + pw - 60, y + 1, 'Move to Bench', () => this.moveToBench());
    } else if (isInBench) {
      this.buildButton(px + pw - 60, y + 1, 'Move to Active', () => this.moveToActive());
    }

    y += 12;

    const moveTypeColor = TYPE_COLORS[riftling.elementType] ?? 0x334466;
    const moveCount = riftling.moves.length;
    const moveGap = 6;
    const moveW = Math.floor((pw - moveGap * (moveCount - 1)) / moveCount);

    for (let i = 0; i < moveCount; i++) {
      const move = riftling.moves[i];
      const isEquipped = riftling.equipped.includes(i);
      const mx = px + i * (moveW + moveGap);

      // Move card background
      const moveGfx = this.scene.add.graphics();
      if (isEquipped) {
        moveGfx.fillStyle(moveTypeColor, 0.18);
        moveGfx.fillRoundedRect(mx, y, moveW, 44, 3);
        // Accent stripe
        moveGfx.fillStyle(moveTypeColor, 0.7);
        moveGfx.fillRect(mx, y + 2, 2, 40);
      } else {
        moveGfx.fillStyle(0x1a1a2e, 0.6);
        moveGfx.fillRoundedRect(mx, y, moveW, 44, 3);
      }
      this.container.add(moveGfx);

      // Move name
      const prefix = move.isSignature ? '\u2605 ' : isEquipped ? '\u25CF ' : '\u25CB ';
      const color = isEquipped ? '#ffffff' : '#666666';
      const nameText = this.addText(mx + 6, y + 2, `${prefix}${move.name}`, 8, color);

      // Kind + Power + cooldown
      const kindColor = this.getMoveKindColor(move.kind);
      this.addText(mx + 6, y + 12, `[${move.kind}]`, 6, kindColor);
      this.addText(mx + moveW - 4, y + 12, `P${move.power} / ${move.cooldown}s`, 6, '#777777', 1);

      // Description (word-wrapped in card)
      const desc = this.scene.add.text(mx + 6, y + 22, move.description, {
        fontFamily: FONT,
        fontSize: '6px',
        color: '#555555',
        stroke: '#000000',
        strokeThickness: 1,
        wordWrap: { width: moveW - 12 },
      }).setOrigin(0, 0);
      this.container.add(desc);

      // Clickable to toggle equip
      nameText.setInteractive({ useHandCursor: true });
      nameText.on('pointerdown', () => this.toggleEquip(riftling, i));

      // Also make the card background clickable
      const hitZone = this.scene.add.rectangle(mx + moveW / 2, y + 22, moveW, 44, 0x000000, 0);
      hitZone.setInteractive({ useHandCursor: true });
      hitZone.on('pointerdown', () => this.toggleEquip(riftling, i));
      this.container.add(hitZone);
    }

    // --- Game Info Guide ---
    y += 50;
    const divGfx2 = this.scene.add.graphics();
    divGfx2.lineStyle(1, 0x333355);
    divGfx2.lineBetween(px, y, px + pw, y);
    this.container.add(divGfx2);
    y += 4;

    // Subtle background panel behind the guide
    const guideBg = this.scene.add.graphics();
    guideBg.fillStyle(0x111122, 0.5);
    guideBg.fillRoundedRect(px - 2, y - 2, pw + 4, H - y - 24, 4);
    this.container.add(guideBg);

    this.addText(px, y, 'GUIDE', 7, '#aabbdd');
    y += 10;

    const colW = Math.floor(pw / 2) - 4;
    const bodyColor = '#bbbbbb';
    const synDescColor = '#aaaaaa';

    // Left column: Controls & Party Management
    let ly = y;
    this.addText(px, ly, 'CONTROLS', 7, '#ffdd44'); ly += 9;
    this.addText(px, ly, 'WASD to move', 6, bodyColor); ly += 7;
    this.addText(px, ly, 'TAB to open/close bag', 6, bodyColor); ly += 7;
    this.addText(px, ly, 'Click riftling in combat to focus target', 6, bodyColor); ly += 10;

    this.addText(px, ly, 'PARTY MANAGEMENT', 7, '#ffdd44'); ly += 9;
    this.addText(px, ly, 'Click a tab above to select a riftling', 6, bodyColor); ly += 7;
    this.addText(px, ly, 'Drag a tab to ACTIVE/BENCH to swap', 6, bodyColor); ly += 7;
    this.addText(px, ly, 'Click a move card to change equipped move', 6, bodyColor); ly += 7;
    this.addText(px, ly, '★ = signature move (always equipped)', 6, bodyColor); ly += 10;

    this.addText(px, ly, 'TYPE SYNERGIES  (2+ same type)', 7, '#ffdd44'); ly += 9;
    for (const [type, syn] of Object.entries(TYPE_SYNERGIES)) {
      const color = TYPE_COLORS_HEX[type] ?? '#cccccc';
      this.addText(px, ly, `${type.toUpperCase()}`, 6, color);
      this.addText(px + 44, ly, `${syn.name}: ${syn.description}`, 6, synDescColor);
      ly += 7;
    }

    // Right column: Class synergies
    let ry = y;
    const rx = px + colW + 8;
    this.addText(rx, ry, 'CLASS SYNERGIES  (2+ same class)', 7, '#ffdd44'); ry += 9;
    const roles: Role[] = ['vanguard', 'skirmisher', 'striker', 'caster', 'hunter', 'support', 'hexer'];
    for (const role of roles) {
      const syn = ROLE_SYNERGIES[role];
      const color = ROLE_COLORS[role] ?? '#cccccc';
      this.addText(rx, ry, `${role.toUpperCase()}`, 6, color);
      this.addText(rx + 62, ry, `${syn.name}: ${syn.description}`, 6, synDescColor);
      ry += 7;
    }
    ry += 3;

    this.addText(rx, ry, 'TIPS', 7, '#ffdd44'); ry += 9;
    this.addText(rx, ry, 'Mix types and classes for synergy bonuses', 6, bodyColor); ry += 7;
    this.addText(rx, ry, 'Synergies activate at the start of combat', 6, bodyColor); ry += 7;
    this.addText(rx, ry, 'Check the left HUD icons for active synergies', 6, bodyColor); ry += 7;
    this.addText(rx, ry, 'Benched riftlings don\'t count for synergies', 6, bodyColor);
  }

  // ---- Bottom trinket strip ----

  private buildTrinketStrip(): void {
    const trinkets = this.party.trinkets;
    const hasAny = trinkets.equipped.some(Boolean) || trinkets.bag.length > 0;
    if (!hasAny) return;

    const y = H - 22;
    const margin = 10;

    // Subtle separator
    const sepGfx = this.scene.add.graphics();
    sepGfx.lineStyle(1, 0x222244);
    sepGfx.lineBetween(margin, y - 4, W - margin, y - 4);
    this.container.add(sepGfx);

    let x = margin;
    this.addText(x, y, 'TRINKETS', 7, '#775599');
    x += 52;

    for (let i = 0; i < MAX_EQUIPPED; i++) {
      const t = trinkets.equipped[i];
      if (t) {
        // Diamond icon
        const ic = this.scene.add.graphics();
        ic.fillStyle(this.trinketDisplayColor(t), 0.8);
        ic.fillTriangle(x + 5, y - 1, x + 1, y + 5, x + 9, y + 5);
        ic.fillTriangle(x + 5, y + 11, x + 1, y + 5, x + 9, y + 5);
        this.container.add(ic);
        this.addText(x + 14, y, t.name, 7, '#cccccc');
        x += 14 + t.name.length * 4.5 + 10;
      } else {
        this.addText(x, y, '[ - ]', 7, '#333333');
        x += 30;
      }
    }

    // Bag count
    if (trinkets.bag.length > 0) {
      this.addText(x + 4, y, `+${trinkets.bag.length} in bag`, 6, '#555555');
    }
  }

  // ---- Actions ----

  private moveToBench(): void {
    const idx = this.selectedSlot;
    if (idx >= this.party.active.length) return;
    if (this.party.active.length <= 1) return; // must keep at least 1
    if (this.party.bench.length >= MAX_BENCH) return;

    const [riftling] = this.party.active.splice(idx, 1);
    this.party.bench.push(riftling);
    this.selectedSlot = Math.min(this.selectedSlot, this.party.active.length - 1);
    this.onPartyChanged();
    this.rebuild();
  }

  private moveToActive(): void {
    const benchIdx = this.selectedSlot - MAX_ACTIVE;
    if (benchIdx < 0 || benchIdx >= this.party.bench.length) return;
    if (this.party.active.length >= MAX_ACTIVE) return;

    const [riftling] = this.party.bench.splice(benchIdx, 1);
    this.party.active.push(riftling);
    this.onPartyChanged();
    this.rebuild();
  }

  private toggleEquip(riftling: PartyRiftling, moveIndex: number): void {
    const eqIdx = riftling.equipped.indexOf(moveIndex);
    if (eqIdx !== -1) {
      // Already equipped — un-equip is disabled, so just ignore.
      return;
    }

    // Equip: replace the older slot (slot 0 first, then 1)
    // Prefer replacing the non-signature slot
    if (!riftling.moves[riftling.equipped[0]]?.isSignature) {
      riftling.equipped[0] = moveIndex;
    } else {
      riftling.equipped[1] = moveIndex;
    }
    this.rebuild();
  }

  // ---- Helpers ----

  private getSelectedRiftling(): PartyRiftling | null {
    if (this.selectedSlot < MAX_ACTIVE) {
      return this.party.active[this.selectedSlot] ?? null;
    }
    const benchIdx = this.selectedSlot - MAX_ACTIVE;
    return this.party.bench[benchIdx] ?? null;
  }

  private trinketDisplayColor(trinket: TrinketDef): number {
    if (trinket.buffs?.attack) return 0xe85d30;
    if (trinket.buffs?.defense) return 0x6688cc;
    if (trinket.buffs?.speed) return 0x44ccaa;
    if (trinket.buffs?.hp) return 0xcc4444;
    if (trinket.buffs?.critRate) return 0xff8844;
    if (trinket.buffs?.evasion) return 0x9966cc;
    if (trinket.special === 'xp_bonus') return 0x4488ff;
    return 0x888888;
  }

  private getMoveKindColor(kind: MoveKind): string {
    switch (kind) {
      case 'heal': case 'shield': case 'rally_buff': return '#44cc88'; // green for support
      case 'slow': case 'taunt': case 'drain': return '#44cccc'; // cyan for utility
      default: return '#cc8844'; // orange for damage
    }
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
        strokeThickness: size > 10 ? 2 : 1,
      })
      .setOrigin(originX, 0);
    this.container.add(t);
    return t;
  }

  private buildButton(x: number, y: number, label: string, onClick: () => void): void {
    const btnW = 120;
    const btnH = 18;
    const bg = this.scene.add.rectangle(x, y, btnW, btnH, 0x335577, 0.9);
    bg.setStrokeStyle(1, 0x5588aa);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', onClick);
    bg.on('pointerover', () => bg.setFillStyle(0x446688));
    bg.on('pointerout', () => bg.setFillStyle(0x335577));
    this.container.add(bg);

    const txt = this.scene.add
      .text(x, y, label, {
        fontFamily: FONT,
        fontSize: '9px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.container.add(txt);
  }
}
