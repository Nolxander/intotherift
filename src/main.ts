import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { DungeonScene } from './scenes/DungeonScene';
import { GameOverScene } from './scenes/GameOverScene';
import { VictoryScene } from './scenes/VictoryScene';

// Allow forcing Canvas renderer via `?canvas=1` — useful for headless
// browsers and testing environments where WebGL context is unstable.
const forceCanvas = new URLSearchParams(window.location.search).get('canvas') === '1';

const config: Phaser.Types.Core.GameConfig = {
  type: forceCanvas ? Phaser.CANVAS : Phaser.AUTO,
  width: 480,
  height: 320,
  pixelArt: true,
  backgroundColor: '#1a1a2e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scene: [BootScene, TitleScene, DungeonScene, GameOverScene, VictoryScene],
};

const game = new Phaser.Game(config);

// Expose for dev tools / testing
if (import.meta.env.DEV) {
  (window as any).__PHASER_GAME__ = game;
}
