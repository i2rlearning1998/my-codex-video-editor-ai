# Free-code third-party notices

D-243 (2026-10-12): GSAP is **not bundled**. Read the current official
[Standard No Charge licence](https://gsap.com/community/standard-license/) on
2026-10-12 (effective April 30, 2025; last modified May 30, 2025). Its definitions
and restriction III.1 cover visual animation building tools competing with
Webflow. Permission for this video/motion editor is not clear. Per the brief,
omit it unless written permission resolves that uncertainty. Own easing/spring
helpers are used. No GSAP package or code was downloaded.

## Pinned local bundles

| Package    | Exact version | npm publication UTC | Licence | Purpose                             | Alternative considered |
| ---------- | ------------- | ------------------- | ------- | ----------------------------------- | ---------------------- |
| three      | 0.170.0       | 2024-10-31 07:08:27 | MIT     | Procedural 3D                       | Raw WebGL              |
| pixi.js    | 7.4.3         | 2025-03-06 15:00:18 | MIT     | 2D scene/particles                  | Native Canvas          |
| lottie-web | 5.12.2        | 2023-06-13 12:10:02 | MIT     | Inline JSON animation, Canvas build | Hand-written timeline  |

Dates verified with npm registry `npm view <package> time --json`; all exceed
the requested two-week age. These are deliberately pinned builds, not a claim
that they are current releases. All three are explicitly approved by the owner.
Full upstream licence text is retained in `src/freecode/vendor/*-LICENSE.txt`.
Upstream sources: https://github.com/mrdoob/three,
https://github.com/pixijs/pixijs, https://github.com/airbnb/lottie-web.

The package tarballs include the distributed code and its embedded notices.
The PIXI distribution includes its bundled dependencies' notices. Source and gzip
sizes plus SHA-256 of the exact decoded code are in `vendor/manifest.json`.
Base64 gzip text is committed to avoid root dependency/lockfile edits; these are
runtime dependencies despite not being added to package.json. The trusted host
lazy-imports only meta.libs entries, decompresses locally, then inlines them in
srcdoc. The sandbox makes no CDN or package-registry requests.

Reproduce (temporary external directory; do not modify the root lockfile):

```sh
npm pack three@0.170.0 pixi.js@7.4.3 lottie-web@5.12.2 --pack-destination /tmp/freecode-vendor
# Extract each tarball into /tmp/freecode-vendor/<package-name>/package/.
node src/freecode/build-vendor.mjs /tmp/freecode-vendor
```

Build uses the repository's existing esbuild dependency through Vite. TypeScript
5.7.x (existing, Apache-2.0) parses/instruments source; no new parser is installed.
The helper bundle reuses src/blocks/helpers.ts, with original vector/noise/emitter,
text/path/colour helpers. No third-party simplex implementation is copied.
