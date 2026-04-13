# Progression & Economy

## Jam Scope

For the Vibe Jam build, all progression is **run-scoped**. No persistent meta-progression between runs. Everything is unlocked from the start. This keeps scope manageable and means the game works without persistent save data.

## 1. Run-Scoped Leveling

- Riftlings gain XP from room clears
- XP distributed to all active (non-KO'd) party members; benched riftlings receive reduced XP
- On level-up: stat increases (slightly randomized from base growth rates)
- On certain levels: learn a new move (player chooses whether to swap it into the loadout)
- Upgrade density is HIGH — players should feel constant forward momentum, never grinding

[TODO: Define base stats, growth rates, and XP-per-room curve]

## 2. Recruiting

- After clearing a combat room, a defeated riftling may offer to join (recruit prompt)
- Quick yes/no decision with full info visible (type, role, current stats, known moves)
- If the active team is full: swap with an active member, send to bench, or decline
- Boss defeat: guaranteed high-tier recruit
- Target: ~3-4 recruit opportunities per level, so the player sees most but not all available riftlings each run

## 3. Team Management (Between Rooms)

When the player exits a room, the timer pauses and they enter the management screen:
- View all active + benched riftlings with stats, moves, roles
- Swap active and bench freely
- Adjust move loadouts (equip 2 from known pool)
- View active synergies and bonuses
- View the dungeon map and choose the next room

## 4. Items (Minimal for Jam)

### Tier 1
- Health pickups dropped during combat (restore some HP to nearby riftlings)
- One-time-use combat items possible: damage boost potion, temporary shield

### Tier 2
- Trinkets: equippable passive bonus items found in shrines, shops, or rare drops
- Equippable on individual riftlings or the trainer
- Examples: attack speed boost, type damage bonus, HP regen between rooms

## 5. What Happens on Death

If all active riftlings are KO'd during combat:
- **Tier 1:** The run ends. Return to the main menu. Start a new run.
- **Tier 2:** [TODO: Decide if partial recovery is possible — e.g., benched riftlings auto-swap in, or a "last stand" mechanic]

## 6. Post-Jam Meta-Progression (Tier 3 — Deferred)

The full meta-progression system is documented in the original [GDD.MD](../GDD.MD). Summary of deferred layers:

- **Layer 1: Collection** — Permanent riftling roster across runs
- **Layer 2: Mastery** — Lateral unlocks per creature through repeated use
- **Layer 3: Trainer Progression** — Trinket loadout and knowledge unlocks
- **Layer 4: Bond Tree** — Small capped stat progression for stuck players
- **Layer 5: Descension** — Post-game difficulty ratchet
- **Layer 6: Cosmetics** — Titles, outfits, skins, music

These layers are explicitly deferred until after the jam.
