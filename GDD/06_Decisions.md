# Design Decisions

Tracked decisions with rationale. Referenced by D-XX ID.

---

### D-01: Jam Scope Tiers
**Status:** Locked
**Section:** Master Index
**Decision:** Structure development in three tiers: Tier 1 (shippable jam build), Tier 2 (expanded if time allows), Tier 3 (post-jam full game). Always have something shippable.
**Rationale:** 20-day jam timeline. The full GDD is a multi-month game. Tiered scope ensures a submission exists regardless of how far we get. Expanding is always easier than cutting.
**Alternatives considered:** Building the full game for jam (too risky), building only the bare minimum (wastes potential if things go well).

---

### D-02: Phaser 3 + TypeScript + Vite
**Status:** Locked
**Section:** Tech Stack
**Decision:** Use Phaser 3 as the game framework with TypeScript and Vite.
**Rationale:** Web-native (jam requirement), handles 2D game plumbing out of the box, extensive AI training data for code generation, TypeScript for type safety. User plans to let AI agents code most of the game — Phaser's popularity means better AI output quality.
**Alternatives considered:** Vanilla Canvas + TypeScript (known from Riftling but more boilerplate), Three.js (jam-recommended but 3D-biased, wrong fit for 2D pixel art), Godot web export (heavier, export friction).

---

### D-03: No Meta-Progression for Jam
**Status:** Locked
**Section:** Progression
**Decision:** All progression is run-scoped for the jam build. No persistent saves, no collection, no mastery. Everything unlocked from the start.
**Rationale:** Meta-progression requires save persistence (unreliable for jam judges who play once), adds massive scope, and isn't what makes the core loop fun. The run itself must carry the experience. Judges will play one run.
**Alternatives considered:** Light meta-progression with localStorage (fragile, scope risk, judges won't see it).

---

### D-04: Soft Typing with 6 Types
**Status:** Locked
**Section:** Core Mechanics
**Decision:** Launch with all 6 types: Fire, Water, Earth, Nature, Light, Dark. Fire/Water/Earth/Nature form a four-way loop; Light and Dark are mirrors. Effective = ~1.5x, resisted = ~0.7x, no immunities.
**Rationale:** The roster is borrowed from the Riftling game which already has creatures across all 6 types. Forcing them into 3 types would lose their identity. The chart is simple (one loop + one mirror pair) and the soft multipliers keep it forgiving.
**Alternatives considered:** Starting with 3 types and expanding (would require remapping existing creatures or deferring half the roster).

---

### D-05: 3 Core Roles (Chaser / Anchor / Skirmisher)
**Status:** Locked
**Section:** Core Mechanics
**Decision:** Tier 1 ships with 3 roles. Support and Bomber added in Tier 2.
**Rationale:** 3 roles cover the essential melee-DPS / tank / ranged triangle. Each feels visually and mechanically distinct in auto-battle. More roles require more riftlings to fill them, more AI behaviors to tune, and more synergy balancing.
**Alternatives considered:** Starting with all 5 roles (too many behaviors to polish in 20 days), starting with 2 roles (too little team-building depth).

---

### D-06: Run Length ~5-7 Minutes Per Level
**Status:** Exploring
**Section:** Core Mechanics / Timer
**Decision:** Target 5-7 minute timer per level for Tier 1. Full play session (with pauses, management, boss) likely ~10-15 minutes actual time.
**Rationale:** User's gut for the full game is 10 min/level, ~1 hour total. Jam version should be tighter — judges won't play 30+ minutes. A single level with a 10-15 minute actual play experience is ideal for jam evaluation.
**Alternatives considered:** 10 min timer (too long for single-level jam build), 3 min timer (too rushed to feel the composition layer).

---

### D-07: Roster — 12 Riftlings from Riftling Compendium
**Status:** Locked
**Section:** Core Mechanics
**Decision:** 12 riftlings, 2 per type, borrowed from the Riftling game's existing compendium: Emberhound, Pyreshell, Tidecrawler, Riptide, Barkbiter, Briarwood, Lumoth, Solarglare, Gloomfang, Voidweaver, Tremorhorn, Pebblet.
**Rationale:** Reusing established creatures saves design and potentially art time. 2 per type ensures every element has a synergy pair. Each type pair has natural contrast (fast vs tanky, melee vs ranged). Roles TBD.
**Alternatives considered:** 6 riftlings (too few for 6 types to have synergy pairs), designing new creatures from scratch (unnecessary when a tested roster exists).

---

### D-08: Dungeon Layout — Hub-and-Spoke with Key Path
**Status:** Locked
**Section:** World & Levels
**Decision:** Replace the earlier "branching graph of 5-6 rooms" layout with a hub-and-spoke structure. Each level is a central hub hall with 5-6 regular branches on its side walls plus a locked key-path branch and locked boss branch on its north wall. Branches are short forward-only chains (3-5 rooms) ending in a terminal reward room. No backtracking inside a branch; terminal rooms teleport the player back to the hub. Run progression: clear `level` regular branches → key path unlocks → clear key path to get the orb → boss unlocks → beat boss to advance. 3 levels total; L3 boss clear = victory.
**Rationale:** Hub-and-spoke makes *choice* the core verb of traversal instead of navigation. Every decision happens in one readable room — the player sees every branch door at once and commits to one at a time. This solves the "which way do I go and why" confusion of a sprawling branching graph, and the forward-only + teleport-home rule means each branch feels like a committed mini-delve rather than a detour. The key-path gate forces the player to clear at least one regular branch before the run can be finished, which prevents "rush-the-boss" degenerate strategies while still letting greedy players push through extra branches for richer rewards.
**Alternatives considered:**
- **Branching graph** (original plan): rejected because map navigation dominated the experience and choice became less meaningful the larger the graph got.
- **Pure linear** (act-based roguelite): rejected because it removes the branch-choice decision entirely, which is a core pillar of the intended pacing.
- **Unlock all branches by default, no key path**: rejected because it let players rush the boss after a single easy branch clear, trivializing the "how many branches do I push?" decision.
- **Key path as one of the regular slots** (not separate): rejected because mixing a mandatory-but-locked branch into the player-choice pool muddied the meaning of each door.
