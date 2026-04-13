# Tech Stack

## Engine & Language

- **Engine:** Phaser 3
- **Language:** TypeScript
- **Build Tool:** Vite
- **Deployment:** Static web hosting (own domain/subdomain)

## Why Phaser

- Mature 2D game framework with built-in sprite management, physics, camera, input, tilemaps
- Large ecosystem — AI coding tools have extensive training data on Phaser patterns
- TypeScript support out of the box
- Web-native — no export step, runs directly in browser
- Handles game loop, asset loading, scene management, and rendering so dev time focuses on game logic
- Active community and documentation

## Vibe Jam Requirements

- [x] Web browser only, no downloads
- [x] No login or signup
- [x] Free-to-play
- [ ] Embed Vibe Jam widget: `<script async src="https://vibej.am/2026/widget.js"></script>`
- [ ] Host on own domain or subdomain
- [x] Minimal loading time
- [x] 90% AI-generated code

## Project Structure (Proposed)

```
src/
  scenes/           # Phaser scenes (Boot, MainMenu, Dungeon, Combat, TeamManagement, BossArena)
  entities/          # Riftling, Trainer, Enemy base classes and role AI
  combat/            # Combat system, commands, damage calc, type effectiveness
  data/              # Riftling definitions, move pools, type chart, synergy bonuses, room templates
  ui/                # HUD, team management, map overlay, synergy display, recruit prompt
  dungeon/           # Level layout, room transitions, fog of war, map generation
  utils/             # Timer, math helpers, constants
assets/
  sprites/           # Trainer and riftling sprite sheets
  tiles/             # Tileset images for rooms
  ui/                # UI elements, icons, portraits
  audio/             # SFX and music files
index.html           # Entry point with Vibe Jam widget
```

## Resolution & Display

- **Target resolution:** 480x320 rendered at 2x-3x scaling (pixel-perfect)
- **Tile size:** 16px base
- **Scaling:** Responsive fit to browser window, maintain aspect ratio
- **Input:** Keyboard (WASD + hotkeys) primary, mouse for target selection

## Key Phaser Features to Use

- **Scenes:** Separate scenes for menu, dungeon exploration, combat, team management
- **Arcade Physics:** Lightweight collision for riftling movement and formation
- **Sprite/Animation:** Sprite sheet support for riftling animations
- **Tilemaps:** Room rendering via Wang tile autotiling — 16-tile sets per biome, corner-based index computed from neighbor terrain
- **Camera:** Follow player, room-scoped bounds
- **Groups:** Manage ally and enemy riftling pools
