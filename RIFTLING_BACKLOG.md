# Riftling Concept Backlog

Ideas for future riftlings. Each entry notes the gap it fills, the creature concept, and rough move directions. Not designed or implemented — review before committing.

---

## Priority: High (fills critical structural gaps)

### Rootwall — Nature / Anchor
**Gap filled:** Nature has no anchor. Overgrowth regen synergy is currently wasted without a frontline tank.

**Concept:** Ancient moss-covered tree-spirit fused with stone. Massive, immovable, covered in bark armor. Doesn't taunt — becomes naturally threatening through passive presence.

**Move directions:**
- Permanent **thorn aura** — always-on briar on itself (everything that hits it takes counter-damage). No move needed; passive identity.
- **Bark Brace** — dramatically boosts own defense for a few seconds while rooting itself in place. Peak defense window.
- **Lifebloom** — healing move that scales off recent damage taken. The more hurt it is, the more it heals. Rewards tanking.

**What makes it distinct from other anchors:** No taunt. Rewards enemies hitting it instead of punishing them for not. Passive presence vs active control.

---

### Gritclaw — Earth / Chaser
**Gap filled:** Earth has two anchors and no mobile units. A full earth team currently has zero damage pressure.

**Concept:** Small, fast sand-burrowing lizard. Surprising for an earth type — low HP, high speed, aggressive. The "runt" of the earth family.

**Move directions:**
- **Sand Surge** (signature) — burrows underground (phase), emerges behind a target for a heavy ambush strike. Earth-flavored shadow step.
- **Seismic Snap** — deals bonus damage to stunned or rooted targets. Natural combo with Earthquake (stun the pack, send Gritclaw in).
- **Sandblast** — ranged throw that applies a brief blind. Gives earth a utility debuff it currently lacks.

**What makes it distinct:** Only earth unit that wants to get behind enemies. Rewards Tremorhorn's Earthquake as a setup tool.

---

## Priority: Medium (improves type variety)

### Driftmaw — Water / Hunter
**Gap filled:** Water has no hunter or skirmisher. Water team identity (waterlogged) has no dedicated finisher.

**Concept:** Fast aquatic predator, sleek eel-like body. Rewards targeting already-waterlogged enemies — the water team's closer.

**Move directions:**
- **Hydro Strike** — deals bonus damage to waterlogged targets (×1.5 multiplier if debuff is active). Mirrors Flame Charge + ignite combo.
- **Soaking Surge** (signature) — long dash that applies waterlogged to all enemies it passes through on exit, not entry.
- **Hunter's Lunge** — hunter leap variant that specifically targets the most waterlogged enemy rather than highest-range target.

**What makes it distinct:** Water team finisher role. Tidecrawler/Rivelet soak and shred armor, Driftmaw exploits it. Clear team identity: soak → shred → finish.

---

### Prismshard — Light / Anchor
**Gap filled:** Light has two skirmishers and no frontline. Light teams always need off-type anchors.

**Concept:** Crystalline golem. Its body refracts attacks as light beams — hitting it is dangerous.

**Move directions:**
- **Refract** (passive) — when hit by a direct attack, fires a retaliatory light beam back at the attacker automatically. Passive counter distinct from thorns/briar.
- **Crystal Shell** — grants the whole team a brief evasion boost. First light support move — buffs allies rather than just debuffing enemies.
- **Prism Burst** (signature) — high-power blast that only fires at full power if Prismshard hasn't moved recently. Rewards holding position.

**What makes it distinct:** Only riftling with a passive reactive mechanic. Enemies that pile onto it effectively punish themselves. Very different from active-taunt anchors.

---

## Priority: Lower (nice-to-have)

### Scaldwing — Fire / Skirmisher
**Gap filled:** Fire only has a chaser and anchor. No ranged fire option forces all fire teams into melee.

**Concept:** Small fire bat, aerial. The only fire unit that fights from range.

**Move directions:**
- **Fire Bomb** (signature) — drops an incendiary that leaves a **burning zone** on the ground. New mechanic: persistent hazard that applies ignite to enemies standing in it for a few seconds.
- **Ember Barrage** — fast multi-bolt attack, each applying 1 ignite stack. Spreads ignite across multiple targets quickly.
- **Scorch Dive** — heavy dive that applies ignite then repositions Scaldwing to maximum range (inverse of Fire Dash — commits then retreats).

**What makes it distinct:** First riftling with a **ground hazard** mechanic — area denial. Pairs with Tidecrawler Shell Guard: pull enemies onto burning ground.

---

### Wraithhound — Dark / Chaser
**Gap filled:** Dark has two ranged/hunter units. No melee dark option.

**Concept:** Shadow wolf, fast and aggressive. Bridges dark team identity — marks frontline while Gloomfang leaps to backline and Hollowcrow disrupts from range.

**Move directions:**
- **Shadow Clone** (signature) — splits Wraithhound into a clone for a brief window. Clone mimics attacks at reduced power. New mechanic; would need careful implementation.
- **Soul Steal** — drain that steals evasion from target and adds it to Wraithhound temporarily. Punishes high-evasion targets.
- **Dark Pounce** — fast charge that applies Hunter's Mark on hit. Ties into dark team's mark identity established by Gloomfang.

**What makes it distinct:** Shadow clone would be unique in the roster. Also gives dark a melee threat alongside its ranged/hunter units.

---

## Notes

- Rootwall and Gritclaw address the most impactful structural gaps (nature needs anchor, earth needs role variety).
- Driftmaw is the strongest team-synergy concept — it completes a clear water team identity.
- Scaldwing's burning zone (ground hazard) would require new infrastructure in CombatManager — factor in dev cost.
- Wraithhound's shadow clone would be visually spectacular but is the most complex to implement correctly.
- Review role distribution before committing: each new riftling should ideally not duplicate an existing type/role combo.
