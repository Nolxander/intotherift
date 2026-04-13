# Into the Rift — Bug Tracker

**Last updated:** 2026-04-12 | QA Session 4 (post-dev Session 4)

---

## Critical

_No open critical bugs._

---

## Moderate

### BUG-004 — Physics colliders accumulate across room transitions
**Status:** Open  
**File:** `src/scenes/DungeonScene.ts` (`transitionToRoom`, `syncCompanions`, `spawnTrainer`)

`transitionToRoom()` adds a new `trainer → walls` collider on every transition without removing the previous one. `syncCompanions()` does the same per companion — called on transition, on room clear, and from PartyScreen callbacks. After N transitions with a 4-member party, 5N+ redundant colliders are active. Full run through 9 rooms = 40+ colliders.

**Fix:** Store collider references from `physics.add.collider()`; call `physics.world.removeCollider(ref)` before adding new ones.

---

### BUG-005 — All companions KO leaves room in ambiguous state
**Status:** Open  
**File:** `src/combat/CombatManager.ts` (`checkCombatEnd`)

When all allies die, `this.active = false` (the `TODO` branch). Doors unblock but `onRoomCleared` is never called — `room.cleared` stays false, minimap doesn't update, no recruit prompt, combatHud is not hidden. Player can leave but the room shows locked on the minimap forever.

---

### BUG-006 — `PartyScreen.toggleEquip` silently corrupts `equipped[]`
**Status:** Open  
**File:** `src/ui/PartyScreen.ts` (`toggleEquip`)

Clicking an already-equipped move sets `equipped[slot] = -1` then returns before `rebuild()` — data mutates but UI doesn't refresh. In the next combat, `startEncounter` filters `moves[-1]` (undefined) out silently, leaving the riftling with only 1 move equipped.

**Repro:** PartyScreen → riftling with both slots filled → click move in slot 0.  
**Fix:** Remove the `= -1` mutation from the early-return (un-equip-is-disabled) branch.

---

### BUG-008 — `isTrinketSelectOpen()` missed the starter riftling selection phase
**Status:** Fixed (Session 4)

`isTrinketSelectOpen()` checked only `!!riftShardUI`, which is set by `showTrinketSelection()`. The prior `showStarterSelect()` (riftling pick) stored its container in a local variable, so `isTrinketSelectOpen()` returned `false` during that phase. `dismissTrinketSelect()` also only fired when `riftShardUI` was set, meaning all test helpers that called `dismissTrinketSelect()` silently did nothing while the riftling selection was open, leaving the blocking overlay up for the rest of the test.

**Fix applied:** Added `private starterSelectActive` field, set it in `showStarterSelect` / cleared in `onStarterPicked`. Updated `isTrinketSelectOpen: () => starterSelectActive || !!riftShardUI`. Updated `dismissTrinketSelect` to handle both phases atomically: dispatches '1' for riftling phase (which synchronously opens the trinket phase via `showStarterTrinketSelect`), then dispatches '1' again to dismiss the trinket phase.

---

## Design / Balance Gaps

### GAP-001 — Timer expires with no consequence
**Status:** Open

`timerSeconds` counts to 0, text turns red, timer event self-destructs — game keeps running. No game-over screen or run-end state.

---

### GAP-007 — Temperament is invisible to the player
**Status:** Open  
**File:** `src/ui/PartyScreen.ts`, `src/ui/RecruitPrompt.ts`

Temperament drives level-up stat growth but is never shown in the UI — not on the party screen detail panel, not on recruit cards. Players can't see it or factor it into decisions.

**Fix:** Show temperament name + boosted/reduced stat label on the party screen and recruit prompt.

---

### GAP-008 — `smoke.spec.ts` "initial party" test checks pre-selection state
**Status:** Open (test quality gap)  
**File:** `tests/smoke.spec.ts`

The "initial party is Emberhound" test reads `getParty()` immediately after `waitForGameReady`, before calling `dismissTrinketSelect`. At that point the party holds the temporary default (`createStartingParty('emberhound')`), not the player's actual chosen starter. The test passes by coincidence (default = Emberhound, dismiss picks Emberhound via '1') but silently fails to verify the real post-selection state.

**Fix:** Add `await dismissTrinketSelect(page)` before the party assertion, and explicitly verify the party was set by the selection flow.

---

## Fixed

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
