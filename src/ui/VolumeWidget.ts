import Phaser from 'phaser';

const STORAGE_KEY = 'intotherift:volume:v2';
const TRACK_W = 50;
const TRACK_H = 3;
const HANDLE_W = 4;
const HANDLE_H = 9;

export function getStoredVolume(): number {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (raw === null) return 0.5;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? Phaser.Math.Clamp(n, 0, 1) : 0.5;
}

export function applyStoredVolume(scene: Phaser.Scene): void {
  scene.sound.volume = getStoredVolume();
}

function saveVolume(v: number): void {
  try { localStorage.setItem(STORAGE_KEY, String(v)); } catch { /* ignore */ }
}

export function createVolumeWidget(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  container.setDepth(900);
  container.setScrollFactor(0);

  const icon = scene.add.text(0, 0, '♪', {
    fontFamily: 'monospace',
    fontSize: '10px',
    color: '#c8b8e0',
  }).setOrigin(0, 0.5);

  const trackX = 10;
  const trackBg = scene.add.rectangle(trackX, 0, TRACK_W, TRACK_H, 0x2a1a4a)
    .setStrokeStyle(1, 0x5544aa)
    .setOrigin(0, 0.5);

  const fill = scene.add.rectangle(trackX, 0, TRACK_W * scene.sound.volume, TRACK_H, 0x8866dd)
    .setOrigin(0, 0.5);

  const handle = scene.add.rectangle(trackX + TRACK_W * scene.sound.volume, 0, HANDLE_W, HANDLE_H, 0xe8d8f0)
    .setStrokeStyle(1, 0x5544aa)
    .setOrigin(0.5, 0.5);

  const hit = scene.add.rectangle(trackX, 0, TRACK_W, 14, 0x000000, 0.001)
    .setOrigin(0, 0.5)
    .setInteractive({ useHandCursor: true, draggable: true });

  const refresh = (v: number) => {
    const c = Phaser.Math.Clamp(v, 0, 1);
    fill.width = TRACK_W * c;
    handle.x = trackX + TRACK_W * c;
    scene.sound.volume = c;
    saveVolume(c);
  };

  const setFromPointer = (pointerX: number) => {
    const worldX = pointerX - container.x;
    const rel = (worldX - trackX) / TRACK_W;
    refresh(rel);
  };

  hit.on('pointerdown', (p: Phaser.Input.Pointer) => setFromPointer(p.x));
  hit.on('drag', (p: Phaser.Input.Pointer) => setFromPointer(p.x));

  container.add([icon, trackBg, fill, handle, hit]);
  return container;
}
