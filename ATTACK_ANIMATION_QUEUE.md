# Attack Animation Queue — Intotherift

Tracks riftlings without attack animations and the move slotted for animation. Pulls from `src/data/party.ts`.

**Workflow:** generate 4-dir via `/animate-with-text-v3`, mirror east→west, install into `assets/sprites/{riftling}/animations/atk_attack/{dir}/`, wire in `BootScene.ts`, attach to move in `party.ts` with `attackAnim: 'attack'` + `attackAnimDelay`.

**Anchoring principle** (from 2026-04-17 cindertail + 2026-04-18 tremorhorn lessons): prefer **body-core origins** (mouth, chest, feet, paws, tail-base) over small peripheral features. Radial AoE effects read best from south/north camera-facing views.

---

## Completed

- [x] **barkbiter** — Thornburst
- [x] **cindertail** — Fireball
- [x] **pyreshell** — Magma Slam (+ Eruption)
- [x] **bogweft** — Mud Sling *(2026-04-18)*
- [x] **crestshrike** — Stone Fang *(2026-04-18)*
- [x] **curseclaw** — Hex Bolt *(2026-04-18)*
- [x] **rivelet** — Crystal Claw *(2026-04-18)*
- [x] **solarglare** — Light Lance (+ Prism Shot)
- [x] **tidecrawler** — Tidal Spin *(anim key: `spin`)*
- [x] **tremorhorn** — Earthquake
- [x] **emberhound** — Ember Strike *(2026-04-18)*
- [x] **gloomfang** — Shadow Bite *(2026-04-18)*
- [x] **rootlash** — Vine Whip *(2026-04-18)*
- [x] **smolderpaw** — Ember Fang *(2026-04-18)*
- [x] **grindscale** — Scale Slam *(2026-04-18)*
- [x] **lumoth** — Moonbolt *(2026-04-18)* — south reads weak (wing flutter dominates, orb doesn't form cleanly from camera-facing view); east/north read well. Candidate for future retry.
- [x] **thistlebound** — Briar Bolt *(2026-04-18)* — south reads more as pink briar-burst than clean projectile, but pose is stable. Pink/magenta chosen over green to match creature's existing briar coloring (leaning into identity avoided model drift).
- [x] **wavecaller** — Tidebolt *(2026-04-18)*
- [x] **dawnstrike** — Flash Claw *(2026-04-18)* — melee light swipe; radial gold arc reads cleanly on all 4 directions
- [x] **hollowcrow** — Hex Screech *(2026-04-18)* — violet shadow ring self-AoE. South accepted 1st try; east required retry (v1 produced blue-white shapes, v2 with explicit violet lock worked).
- [x] **nettlehide** — Barb Spin *(2026-04-18)* — green briar self-AoE. South v1 produced violet tendril off-concept; v2 with explicit "green briar" color cue + "quills extend outward" worked. Green color cue matches nature type and prevents default dark/violet drift.
- [x] **sunfleece** — Sunburst *(2026-04-18)* — gold radial burst self-AoE. South required 3 attempts — symmetric front-facing sheep silhouette drifts/tilts without aggressive "body pixels unchanged every frame, only light changes" lock. North and east accepted 1st try with the same locked prompt. South marginal (diagonal streak effect instead of clean concentric rings) but body stable.
- [x] **veilseer** — Soul Siphon *(2026-04-18)* — violet body-core drain charge. East accepted 1st try; south and north both required retry. South drifted from front-facing to side-profile (same symmetric-silhouette issue as sunfleece) — fixed with explicit "both eyes symmetric visible throughout" + body lock. North v1 produced chaotic pink/magenta scatter — v2 fixed by simplifying to "solid not scattered" and banning "pink or magenta" explicitly.

---

## Pending (1)

| Riftling | Element/Role | Move | Concept | Anchor Risk |
|---|---|---|---|---|
| dewspine | water striker | **Ice Spike** | Ice shard launched from body-core | **FLAGGED** — 3 attempts across 2 directions, body silhouette morphs into shard at 32px. Revisit with self-AoE concept (water burst/spin) or different move entirely |

### Not applicable
- **fernleap** — not in `RIFTLING_TEMPLATES`; sprite-only wild form
- **rift_tyrant** — boss, not available as party member
- **player** — human sprite, separate animation track

---

## Batch Strategy

- Run 4 directions in parallel (concurrency cap is 4 per guide). Each takes ~45-105s.
- East first → review → south/north in parallel → mirror east→west.
- First-attempt accept rate is ~67% for body-core origins; budget 1 retry per species.
- For AoE signature moves (Hex Screech, Barb Spin, Sunburst) — prioritize south/north views; east/west will likely read weaker.

## Notes

- Update this doc when a riftling's atk_attack is installed (move to Completed, date-stamp).
- If a move concept fails 3× on east, revisit the choice — some concepts (tail-origin small features, projectile travel at 32px) resist anchoring regardless of prompt tuning.
