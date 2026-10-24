# PHASE0 handoff (safety net)
Branch claude/fix-5 (PR #48). Codex's fix-5-engine merged (decisions D-303..D-310 mine; D-302 Codex).
- E1 DONE: build loader (src/ui/components/build-loader.ts), composition dialog uses it with Cancel + Check again, AI importer check cancellable, offline preview (core/project-build.ts buildOffline), engine validates every 48 commands for big transactions, compactNewScenes for Tier A new-scenes insert. Measured: 14-scene spec check 39 s -> 0.9 s; 28-scene add >120 s -> 7.7 s, longest task 334 ms. Tests FX5-011 (x2), FX5-012 in e2e/phase0.spec.ts.
- E2..E8: not done yet.
