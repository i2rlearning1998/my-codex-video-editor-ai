# Free code progress

Branch: codex/free-code-runtime. Base: origin/main at task start.

- Setup: contract imported from origin/docs/code-tiers-spec and published.
- F0: types, literal metadata extraction, TypeScript AST deny scan and unit tests implemented.
- F1: sandbox lifecycle, opaque iframe/CSP, transferable capture, frame order, fake clock/PRNG, cooperative loop checks and deadlines implemented. 25 unit tests and strict typecheck pass. Browser proof pending.
- F2–F6: pending.

D-240: Owner's explicit isolated task overrides generic wave bookkeeping. Only requested paths plus explicitly required spec, progress, report and gallery npm script. No editor or schema edits.
D-241: Terminal push has no GitHub credentials; publish each part with GitHub Git Data API, then fast-forward local checkout. No force push.
D-242: AST scan is diagnostic defense in depth, not a proof against obfuscated JavaScript. Same-process iframe resource exhaustion is an honest security gap requiring production isolation.
