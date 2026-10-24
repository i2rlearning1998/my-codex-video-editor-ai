# FIX5 engine handoff
P1 partial: isolated command construction avoids history snapshots/full validation per command; yields every 24 layout commands and per scene; cancellable progress in composition dialog. Existing editor transactions unchanged. 9 targeted tests passed; legacy documentary-mini result byte-equivalent before formatting.
Not yet proved: Circumference fixture/browser long tasks, card drop responsiveness, plan dialog wiring (Claude-owned), animated loader.
Next: P2 preview processing, P3 filters, P4 bug hunt; full verify once at end.
P2 partial: preview-only 0.92 MP processing/caching for immutable image/shape passes (masks, chroma, FX), 24 MB/context LRU. Animated/video/text/backdrop blend passes bypass cache; export bypasses cache/budget. GPU chroma path reused, preview fast default. 29 targeted tests passed before budget hook; Chromium absent, no real frame/pixel measurements. Needs browser parity/budget proof.
P3 implemented: slider input/hover/focus transient engine preview; release one transaction, cancel/leave/section render clears owned preview. Regression checks actual FX pixels, canonical history, cancel/undo. 5 tests passed. Browser pointer-event proof remains unrun.
Next P4 focused bug hunt, then verify once/report/PR.
