# FIX1 handoff (safety net)

Branch `claude/fix-1` from `claude/final-2`. Draft PR targets `claude/final-2`.

| Part | State |
| ---- | ----- |
| F9 test infrastructure | Done: viewport 1920 × 940, `laptop-1366` smoke project, real-shaped Pexels / Pixabay fixtures |
| F1 panels | Done: shared scroll rule, sticky shelf top, cluster avoids toolbar (FX1-001, FX1-002) |
| F2 stock | Done: Pexels /videos/search + tolerant mapper, Pixabay sizes, quality in Details, progress/Cancel/Retry, truthful errors, icon tile, size and colour, sticker seeds, licence chip (FX1-003 to 007) |
| F3 voice | Done: one TTS tool (voiceover.ts), cloud engines only, flags in feature-flags.ts, Add pause, real errors (FX1-008, FX1-009) |
| F4 diagnostics + Whisper | Done: root cause = the captions dialog cleared its own error message; whisper.ts error classes, windows + progress, self-test (FX1-010, FX1-011) |
| F5 audio | Done: libraries left, Project audio right (rail Audio with nothing selected), shared slider row CSS (FX1-012, FX1-013) |
| F6 nesting | Done: SET_NESTED_CONTENT core command, src/nesting/view.ts unpack/pack, src/ui/nest-engine.ts (whole UI edits the inside), new breadcrumb + block map (FX1-014). Not done: Effects/Speed tabs for a nest in the right rail (capability rules) |
| F7 import / build | Done (FX1-015, FX1-016) |
| F8 text | Done: autofill off, 2 px caret in text colour, real Google weights per family, own-typeface rows, Devanagari coverage filter, Retry on font errors. e2e fix1-text, unit fonts.test. |
| Full verify | Not run |

Next: END (docs, report, full verify, PR). Note: INS-018 (j3) fails at the 1920x940 viewport, not from F5; pin LEGACY_VIEWPORT at the end if needed.
