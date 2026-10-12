# Free code progress

Branch: codex/free-code-runtime. Base: origin/main at task start.

- Setup: contract imported from origin/docs/code-tiers-spec and published.
- F0: types, literal metadata extraction, TypeScript AST deny scan and unit tests implemented.
- F1: sandbox lifecycle, opaque iframe/CSP, transferable capture, frame order, fake clock/PRNG, cooperative loop checks and deadlines implemented. 25 unit tests and strict typecheck pass. Browser proof pending.
- F2: pinned MIT bundles, retained licences and reusable helper kit implemented. GSAP omitted (D-243). 26 unit tests pass; browser loading pending.
- F3: ten original complete sample sources with editable params. Static sample validation passes. Visual/browser quality still unverified.
- F4: standalone gallery on port 5176, editable params, PNG baking, play/scrub, two-bake comparisons, 720p/1080p timing and hostile panel implemented. Gallery strict typecheck and production build pass. Browser proof pending.
- F5: 38 unit/jsdom tests pass; 19 browser tests added for all samples at both resolutions, hostile cases and PNG playback. Local Chromium launch blocked by socket policy; escalation also rejected. CI proof pending.
- F6: architecture/limits, AI authoring prompt with three complete examples, licence record and honest report written. Browser/CI proof remains pending.

Draft PR: https://github.com/i2rlearning1998/my-codex-video-editor-ai/pull/27 (not merged).

Resume: inspect newest CI for this branch, fix any freecode failures within scope, update the report and the single draft PR. Do not merge.

D-240: Owner's explicit isolated task overrides generic wave bookkeeping. Only requested paths plus explicitly required spec, progress, report and gallery npm script. No editor or schema edits.
D-241: Terminal push has no GitHub credentials; publish each part with GitHub Git Data API, then fast-forward local checkout. No force push.
D-242: AST scan is diagnostic defense in depth, not a proof against obfuscated JavaScript. Same-process iframe resource exhaustion is an honest security gap requiring production isolation.

## PR #27 CI repair

The two verify runs 38288476502 and 38288473650 failed in `Run npm run verify`:
515 unit/jsdom tests passed; 19 gallery e2e tests failed with `Unexpected token 'export'`.
Root cause: TypeScript's module emitter appended `export {};` after the default
export was rewritten for classic-script execution. Direct AST transformation and
printing fixes that mismatch. New regression tests reproduce the old failure and
compile all ten samples, then execute both supported module forms with guards.
Local checks now pass 517 unit/jsdom tests. Browser rerun pending; no measurements
claimed yet. Browser proof now explicitly attaches screenshots and hostile-case
outcomes, and records first/second bake render-and-capture totals separately.
