# W7-CODEX — audio engine, one resumable branch

Owner scope (2026-09-28): W7-A → W7-B → W7-C, one PR to main; never merge.
Base: `9598be8227286ce2f4f381a67d896d744e7397f5` (main through PR #12).
Branch: `codex/w7-audio`.

## Progress checkpoint

| Part   | Status                                                                    | Last commit                                                 |
| ------ | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| W7-A   | Implemented; local typecheck/unit proof; browser measurements awaiting CI | `d0adf15641fac9e85c4ac0b87912a791929aafdb` (PR #14)         |
| W7-B   | Implemented; typecheck and 362 unit tests passed; e2e awaits CI           | `8b757a16f6a2ffe6ab7d7206fb30ee3cda79f79b`                  |
| W7-C   | Ducking implemented; 364 unit tests passed; AUD-010 deferred D-208        | This checkpoint commit (`git log -1 -- briefs/W7-CODEX.md`) |
| Finish | Pending: full verification, report, mark same PR ready                    | —                                                           |

## In scope

- A: AUD-002 (clip dB, mute, volume keys; master volume deferred), AUD-003 (fade data/playback, no handles), AUD-009, AUD-017, AUD-015.
- B: AUD-011: EQ, compressor, target LUFS normalization.
- C: AUD-012 ducking; AUD-010 only if quality/complexity is reasonable without dependencies.
- Isolated Sound panel, plain inputs; minimal shell mount only.

## Constraints / resume

- Schema 5; no dependencies. Audio settings use `clip.metadata.audio`.
- All UI work in new files, except six-line shell integration. Do not touch Claude's other UI/transform files.
- FEATURES, STATUS, CHANGELOG append-only. Existing ledger rows cannot change status in place; checkpoint prose records scoped claims, avoiding duplicate IDs.
- Decisions start D-200. Partial or unmeasured behavior stays Claimed. No new feature IDs needed yet.
- Read this file, current branch/status, rules and report on resume; continue the next pending part.
- Run typecheck, unit suite and new e2e after each part. The local browser is unavailable; installation returned a truncated ZIP. GitHub CI is the browser gate; inspect the pushed branch run once at finish.
- Only one draft PR after A. Keep using it. Mark ready at finish, never merge.
