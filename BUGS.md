# Into the Rift — Bug Tracker

**Last updated:** 2026-04-18 | QA Session 5 (post-dev Session 9)

---

## Critical

_No open critical bugs._

---

## Moderate

### BUG-004 — Physics colliders accumulate across room transitions
**Status:** Fixed (Session 9)  
**File:** `src/scenes/DungeonScene.ts` (`transitionToRoom`, `syncCompanions`, `spawnTrainer`)

`transitionToRoom()` adds a new `trainer → walls` collider on every transition without removing the previous one. `syncCompanions()` does the same per companion — called on transition, on room clear, and from PartyScreen callbacks. After N transitions with a 4-member party, 5N+ redundant colliders are active. Full run through 9 rooms = 40+ colliders.

**Fix applied:** Store collider refs in `trainerWallCollider` / `companionWallColliders[]`; call `physics.world.removeCollider(ref)` before adding new ones in all three sites (spawnTrainer, syncCompanions, transitionToRoom). Refs reset in `create()` for scene restarts.

---

### BUG-005 — All companions KO leaves room in ambiguous state
**Status:** Fixed (Session 9)  
**File:** `src/scenes/DungeonScene.ts`, `src/scenes/GameOverScene.ts`

When all allies die, `this.active = false` (the `TODO` branch). Doors unblock but `onRoomCleared` is never called — `room.cleared` stays false, minimap doesn't update, no recruit prompt, combatHud is not hidden. Player can leave but the room shows locked on the minimap forever.

**Fix applied:** `onPartyWiped` now sets `gameEnding = true` (freezes the entire update loop), fades to black, and transitions to a dedicated `GameOverScene` with Play Again / Title Screen options. Timer expiry (`onTimerExpired`) follows the same path. Both paths are guarded against double-triggers.

---

### BUG-006 — `PartyScreen.toggleEquip` silently corrupts `equipped[]`
**Status:** Fixed (Session 9)  
**File:** `src/ui/PartyScreen.ts` (`toggleEquip`)

Clicking an already-equipped move sets `equipped[slot] = -1` then returns before `rebuild()` — data mutates but UI doesn't refresh. In the next combat, `startEncounter` filters `moves[-1]` (undefined) out silently, leaving the riftling with only 1 move equipped.

**Repro:** PartyScreen → riftling with both slots filled → click move in slot 0.  
**Fix applied:** Removed the dead `= -1` mutation from the early-return branch. Clicking an already-equipped move now returns immediately without touching `equipped[]`.

---

### BUG-008 — `isTrinketSelectOpen()` missed the starter riftling selection phase
**Status:** Fixed (Session 4)

`isTrinketSelectOpen()` checked only `!!riftShardUI`, which is set by `showTrinketSelection()`. The prior `showStarterSelect()` (riftling pick) stored its container in a local variable, so `isTrinketSelectOpen()` returned `false` during that phase. `dismissTrinketSelect()` also only fired when `riftShardUI` was set, meaning all test helpers that called `dismissTrinketSelect()` silently did nothing while the riftling selection was open, leaving the blocking overlay up for the rest of the test.

**Fix applied:** Added `private starterSelectActive` field, set it in `showStarterSelect` / cleared in `onStarterPicked`. Updated `isTrinketSelectOpen: () => starterSelectActive || !!riftShardUI`. Updated `dismissTrinketSelect` to handle both phases atomically: dispatches '1' for riftling phase (which synchronously opens the trinket phase via `showStarterTrinketSelect`), then dispatches '1' again to dismiss the trinket phase.

---

## Design / Balance Gaps

### GAP-001 — Timer expires with no consequence
**Status:** Fixed (Session 9)

`timerSeconds` counts to 0, text turns red, timer event self-destructs — game keeps running. No game-over screen or run-end state.

**Fix applied:** Timer callback now calls `onTimerExpired()`, which freezes gameplay and transitions to GameOverScene with `reason: 'timeout'`.

---

### GAP-007 — Temperament is invisible to the player
**Status:** Fixed (prior session, confirmed Session 9)  
**File:** `src/ui/PartyScreen.ts`, `src/ui/RecruitPrompt.ts`

Temperament drives level-up stat growth but is never shown in the UI — not on the party screen detail panel, not on recruit cards. Players can't see it or factor it into decisions.

**Fix applied:** PartyScreen shows temperament name in the header row and colors boosted stats green / reduced stats red. RecruitPrompt shows temperament name on each card, with ▲/▼ arrows and colored stats. Already implemented by the time of this audit.

---

### GAP-008 — `smoke.spec.ts` "initial party" test checks pre-selection state
**Status:** Open (test quality gap)  
**File:** `tests/smoke.spec.ts`

The "initial party is Emberhound" test reads `getParty()` immediately after `waitForGameReady`, before calling `dismissTrinketSelect`. At that point the party holds the temporary default (`createStartingParty('emberhound')`), not the player's actual chosen starter. The test passes by coincidence (default = Emberhound, dismiss picks Emberhound via '1') but silently fails to verify the real post-selection state.

**Fix:** Add `await dismissTrinketSelect(page)` before the party assertion, and explicitly verify the party was set by the selection flow.

---

## Fixed

### QA Session 5

| ID | Description | Fix |
|---|---|---|
| BUG-NEW-001 | `?testRoom=` direct-load never exposed `__gameState` | `BootScene.create()` now routes to `Dungeon` when `testRoom` is present |
| BUG-NEW-002 | Timer frozen for entire intro zone after riftling selection | `onStarterPicked()` unpauses `timerEvent` after setting `starterTrinketPending` |
| BUG-NEW-003 | `warpToRoom()` crashed with TypeError during active combat | Guarded `warpToRoom` against `combatManager.isActive`; aborts combat cleanly before transitioning |
| BUG-NEW-004 | Progressive text corruption in starter selection after Play Again | Phaser glyph cache cleared on Dungeon scene restart |
| BUG-NEW-005 | Game Over screen text rendering corruption | Same fix as BUG-NEW-004 (glyph atlas reset) |

---

### Session 4

| ID | Description | Fix |
|---|---|---|
| BUG-008 | `isTrinketSelectOpen()` missed the riftling selection phase | Added `starterSelectActive` tracking; `dismissTrinketSelect` now handles both phases atomically |

### Session 3

| ID | Description | Fix |
|---|---|---|
| GAP-003 | Pyreshell stats contradicted tank design | Pyreshell now HP 110, DEF 5 — tankiest anchor in the roster |

### Session 2

| ID | Description | Fix |
|---|---|---|
| BUG-001 | `partyHud` destroyed on room transition | `loadRoom` persistent Set now covers all HUD containers |
| BUG-002 | `RecruitPrompt` container destroyed on transition | Same fix as BUG-001 |
| BUG-003 | Boss room never triggered combat | `'boss'` added to `isCombatRoom` check |
| GAP-002 | Healing room did nothing | `spawnHealingSpring()` with zone trigger and full-party heal |
| GAP-004 | Companion visual hardcoded to Emberhound | `syncCompanions()` sets texture from `texturePrefix` for all active riftlings |
| GAP-005 | Multi-companion combat not implemented | `CombatManager` registers all party members as `allies[]` |

---

## Testability

| Item | Status |
|---|---|
| `window.__gameState` | `getParty`, `getRoom`, `isCombatActive`, `isRecruitActive`, `getDungeon`, `isPartyScreenActive`, `getTimerSeconds`, `warpToRoom`, `injectRiftling`, `getActiveSynergies`, `grantXP`, `getTrinkets`, `isTrinketSelectOpen`, `dismissTrinketSelect`, `isRiftShardSelecting` |
| Playwright test files | `smoke`, `recruit`, `party_screen`, `party-screen`, `companions`, `healing`, `synergy`, `xp_leveling`, `trinkets` |
| State injection | `warpToRoom(id)`, `injectRiftling(key)`, `grantXP(index, amount)`, `dismissTrinketSelect()` |
| `testing.loadState()` | Not yet implemented |
