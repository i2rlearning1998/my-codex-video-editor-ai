# Report: Composition Spec v1 and AI authoring groundwork

## 1. Summary

Built an isolated offline JSON validator and deterministic build-plan resolver.
Six complete worked specs have exact expected-plan fixtures and editable params.
The prompt pack includes native/code/image routing, the reused PR21 block prompt,
and a cost-aware caching/repair design. No model calls, keys or runtime network.
Main remains schema 5. Code layers, FX, camera and transitions are preserved as
blocked plan intents; missing/uploaded assets require later host verification.
No editor commands are dispatched and no video is rendered by this work.

## 2. Scope and results

| Scope | Result | Evidence |
| --- | --- | --- |
| Versioned spec, safe JSON, limits and Zod errors | Built; unit-tested | tests/ai-spec/spec.test.ts: limits, timing, references, params, unsafe input and complete public Zod schema |
| Existing compileBlock validation | Built; unit-tested | Actual PR21 static compiler snapshot; hostile source checks and SHA-256 provenance tests |
| Pure deterministic plan and command mapping | Built; unit-tested | Six complete plan fixtures; order, nonmutation, clock/random/network prohibition, readiness and vocabulary tests |
| Prompt pack and examples | Built; document/fixture checked | Six JSON blocks match fixtures; code prompt copied from PR21 guide |
| Cost-aware router/caching/repair design | Documented; not a model service | docs/AI-SPEC.md design section; canonical cache identity is implemented, persistent caching/model routing is not |

No ledger IDs were added or promoted. “Unit-tested” here does not mean the editor's
full browser-based Verified definition. No requested groundwork item is omitted;
actual application/rendering/AI service integration is intentionally not built.

## 3. Checks

`npm run ai-spec:check` (exit 0):

```text
 Test Files  2 passed (2)
      Tests  43 passed (43)
```

`npm run check` (exit 0): formatting, both TypeScript checks, all unit/jsdom tests
and production app build passed.

```text
All matched files use Prettier code style!
 Test Files  37 passed (37)
      Tests  431 passed (431)
✓ 132 modules transformed.
dist/index.html                   1.38 kB │ gzip:   0.68 kB
dist/assets/worker-DBV1Hnly.js  542.69 kB
dist/assets/index-D5-9WwkK.css   89.42 kB │ gzip:  15.27 kB
```

The app JS bundle remains about 585.73 kB / 179.79 kB gzip and retains its existing
large-chunk warning. No ai-spec module is imported into the app. Existing installed
dependencies were reused locally after offline npm ci reported a missing cached
Zod archive; no package or lockfile was changed and no dependency was fetched for
this work. Only the authorized ai-spec:check script line was added.

`npm run verify`, browser tests, ledger validation and live model experiments were
not run: this task explicitly requests `npm run check` for isolated new-folder
logic, with no browser/app wiring. No screenshots or browser claims. CI for the
new PR is not claimed as observed proof; the PR's automated workflow may run later.

## 4. Owner try-it script

| # | Do this | Expect | Scope | Ran locally | Screenshot |
| --- | --- | --- | --- | --- | --- |
| 1 | Check out codex/composition-spec; install the repository's existing dependencies if needed | Same package/lockfile versions as main; no new runtime dependency | Setup | Existing installed dependencies reused | Not applicable |
| 2 | Run npm run ai-spec:check | 43 passing focused tests, including all six worked examples | Spec/plan | Yes | Not applicable |
| 3 | Read lower-third.spec.json beside lower-third.plan.json under tests/ai-spec/fixtures | Editable speaker value resolves into native CREATE_LAYER/SET_PROPERTY/CREATE_CLIP candidates | Native plan | Yes, inspected and tested | Not applicable |
| 4 | Read product-ad.plan.json and outro.plan.json | Uploaded asset requirement, blocked camera/FX, and a preserved image request; executable remains false | Honest limitations | Yes, inspected and tested | Not applicable |
| 5 | Read the Composition Spec/router and reused code prompts in docs/AI-SPEC.md | Complete prompts plus six validated examples; no API configuration needed | Authoring | Yes, documentation read | Not applicable |
| 6 | Run npm run check and review the PR before accepting | 431 passing tests and app build; no editor behavior changes | Repository gate | Yes | Not applicable |

For programmatic use, import validateSpec/resolveSpec from src/ai-spec/index.ts in
a TypeScript host and follow the API example in the guide. ai-spec:check is the
fixture/unit gate, not a CLI that reads arbitrary filenames. Keep authored JSON
as editable source; resolve again after an override instead of editing the plan.

## 5. Deviations from the brief

Main has neither PR21 nor the FX library. To remain on main and touch only allowed
paths, this branch pins four unchanged static compiler/type/param/policy files
under src/ai-spec/vendor/blocks, plus metadata catalogs. It imports no editor code.
The seven plan names all appear in current code or docs, but ADD_EFFECT and
CREATE_TRANSITION are only future documented vocabulary. Those entries and
code/camera layer records are explicitly blocked, never claimed executable.
No new command names or schema integration were invented to hide that mismatch.

## 6. Decisions made

D-240–244 in docs/AI-SPEC.md cover owner scope precedence, pinned validator reuse,
pinned catalogs, blocked operations and deterministic/versioned authoring.
Decisions were not appended to docs/DECISIONS.md because that file is outside the
owner's allowlist. Native plans also remain executable:false until a reviewed
host adapter validates them against a real target project and transaction rules.

## 7. Not tested, known gaps, risks

- No model quality, token price, routing performance or repair success rate measured.
- No UI, actual command application, media decoding, camera activation, sandbox
  execution, renderer pixels or preview/export parity tested by this module.
- Existing uploaded asset IDs need a trusted host to verify type, source duration,
  local bytes and permissions. IDs alone are not proof the asset exists.
- PR21 source validation is a restricted-language static check, not production
  isolation. It does not run the worker watchdog or prove a frame finishes. Future
  execution must retain that sandbox and its documented security limitations.
- Pinned metadata/compiler files must be reviewed when upstream changes. The
  provenance test detects local drift; it does not check GitHub at runtime.
- Generated IDs use spec id and indices; reordering changes IDs. Repeated import
  and collisions need a host reconciliation policy, not blind command dispatch.
- Spec v1 deliberately limits duration, canvas, fps, primitive shapes and simple
  transitions. It does not add editor schema v7 or pretend future commands exist.
- Cache identity is implemented; persistent cache, budget meter, API integration,
  model orchestration and image generation are design-only.

## 8. Architecture and contract impact

Editor schema unchanged at 5. Spec format independently versioned at 1. No new
dependencies, no lockfile change, no renderer/UI/export/timeline/editor imports.
New source only under src/ai-spec; tests and twelve fixtures under tests/ai-spec;
three allowed documents; one package script. No existing tests were weakened or
edited. No web service, API key or runtime network request was introduced.

## 9. Ledger and backlog

No status changes, ledger change requests or backlog edits: those files are
outside the allowlist. Future integration requirements are preserved in plans,
the guide and this report instead of silently dropping them.

## 10. Git

Branch `codex/composition-spec`, based on main `9362645`. One PR to main; do not
merge. No tag/review-patch artifacts because they are outside the requested scope.
Last implementation commit: `git log -1 -- briefs/AI-SPEC.md`. The brief is the
resumable checkpoint. No changes to PR #21, PR #14 or Claude's branches.

## Owner tick-list

| Scope | OK / BUG / MISSING / CHANGE | One sentence |
| --- | --- | --- |
| Spec validation and examples | | |
| Build-plan mapping and explicit blocks | | |
| Prompt pack and cost-aware design | | |
