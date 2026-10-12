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

Resume: inspect newest CI for this branch, fix any freecode failures within scope, update the report and the single draft PR. Do not merge.

D-240: Owner's explicit isolated task overrides generic wave bookkeeping. Only requested paths plus explicitly required spec, progress, report and gallery npm script. No editor or schema edits.
D-241: Terminal push has no GitHub credentials; publish each part with GitHub Git Data API, then fast-forward local checkout. No force push.
D-242: AST scan is diagnostic defense in depth, not a proof against obfuscated JavaScript. Same-process iframe resource exhaustion is an honest security gap requiring production isolation.
