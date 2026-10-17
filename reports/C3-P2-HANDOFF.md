# C3 P2 handoff
Branch codex/c3-media-probe from codex/c2-engines. One draft PR targeting codex/c2-engines; never merge.

## H implemented; browser/device behavior unverified
- Media details with existing lazy Mediabunny, typed errors, abort/disposal, import metadata.
- Shared source-time seek helper; VFR detection/mapping without changing audio time.
- Export orientation-aware sample draw fixes rotation/flip and temporary-frame lifetime.
- Pure missing-byte detection, candidate ranking, relink/batch proposals and prepared-byte helper.
- 14 unit tests passed (tests/media-probe); typecheck passed both TS configurations.
Initial test omitted REPLACE_ASSET.assetId and new imports displaced worker lib directive;
both corrected and checks rerun. No live network/devices/e2e/full suite/CI polling.

## Not done / next
UI load checks, Details/relink dialogs and decoder/cache refresh must be wired as
specified in MEDIA-PROBE-API.md. Real codecs, phone orientation, VFR A/V drift,
Safari/mobile and memory performance remain unverified. No further task assigned.
Do not start tasks owned by parallel branches. No schema bump/migration/shared report edits.
