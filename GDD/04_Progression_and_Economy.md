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

## 6. Combat Balancing

Enemy stats are derived from the **same per-species templates and level-up curves** the player's riftlings use, then scaled by a per-archetype multiplier. There is no separate "enemy stat formula" — nerf/buff levers are all multiplicative on top of shared base stats.

### Enemy Level Scaling

Enemy level per room = `clamp(round(difficulty), partyFloor, partyFloor + 2)`, where:
- `partyFloor` = floor of the party's average level (enemies never fall behind)
- `difficulty` = `depthScale × typeBonus`
  - `depthScale` = `1 + roomsCleared × 0.4` (rooms cleared so far in the run, excluding start)
  - `typeBonus` = `{ combat: 1.0, recruit: 1.2, elite: 1.6, boss: 3.0 }`
- Cap of `partyFloor + 2` prevents early terminals from overshooting the player by 4+ levels.
- Individual elite/boss roster members can add a per-unit `levelBonus` (e.g. the final boss has `+2`).

### Stat Multipliers (by enemy archetype)

Configured at the top of `CombatManager.ts`:

| Archetype | HP | Attack | Defense | Speed |
|---|---|---|---|---|
| Wild (swarm combat) | ×1.2 | ×0.3 | ×0.3 | ×0.7 |
| Elite (trainer squads) | ×0.85 | ×0.85 | ×0.85 | ×1.0 |
| Boss | ×0.85 | ×0.85 | ×0.85 | ×1.0 |

Wild enemies are a swarm — many, fragile, low-damage. Elites/bosses are few and use a lighter, near-parity nerf so they remain meaningful without being spikes in a fresh run. Crit and evasion also get nerfs for wild enemies (×0.5 and ×0.3 respectively); elites keep full values.

### Enemy Count Scaling

Wild combat rooms use the template's authored `enemySpawns` plus `floor(roomsCleared × 0.8)` extra random-floor spawns — swarms grow as the run progresses. Elite/boss rooms ignore this and use their authored `eliteTeam` roster exactly.

The **Level 1 intro zone** overrides with `introSpawnCount` to protect new players:
- First intro combat: **1 enemy**
- Second intro combat: **4 enemies**

### Damage Formula

Damage per hit = `max(1, floor(attacker.attack × 1.5) + variance)`, variance ∈ `[-2, +2]`. Ranged attacks (target > 40 px away) fire a projectile that applies the same damage on arrival. Role passives, status effects, and move-specific modifiers layer on top.

### Tuning Workflow

1. Playtest the first intro combat and first elite — those are the two onboarding pressure points.
2. If the feel is off, prefer adjusting the multiplier constants (`WILD_*`, `ELITE_*`) over rewriting species base stats. Base stats are shared with the player's roster; changing them affects both sides.
3. For targeted difficulty adjustments, tune `introSpawnCount`, per-unit `levelBonus`, or the `typeBonus` table rather than the global multipliers.

## 7. Post-Jam Meta-Progression (Tier 3 — Deferred)

The full meta-progression system is documented in the original [GDD.MD](../GDD.MD). Summary of deferred layers:

- **Layer 1: Collection** — Permanent riftling roster across runs
- **Layer 2: Mastery** — Lateral unlocks per creature through repeated use
- **Layer 3: Trainer Progression** — Trinket loadout and knowledge unlocks
- **Layer 4: Bond Tree** — Small capped stat progression for stuck players
- **Layer 5: Descension** — Post-game difficulty ratchet
- **Layer 6: Cosmetics** — Titles, outfits, skins, music

These layers are explicitly deferred until after the jam.
