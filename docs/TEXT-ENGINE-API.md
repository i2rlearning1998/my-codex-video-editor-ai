# Text engine — Task D

## Current state and compatibility

Before this task, `render/text-layout.ts` wrapped plain text with code-point splits;
`render/rich-text.ts` handled styled ranges and simple lists. Canvas preview and
export shared the render adapter. Inter, Poppins and Noto Sans Devanagari were
bundled with weight-specific WOFF2 files; the export worker registered used faces.

That path remains unchanged for existing properties. New structured text is opt-in:
`properties.textEngine` is a string property containing validated JSON. No schema
version change is needed: extensible string properties already exist. Tables are
an extension of a text layer, keeping transforms, timing, effects and export on the
existing layer path. There is no second scene graph or new editable store.

## Public exports (`src/text-engine/index.ts`)

- `FONT_CATALOG`, `isCatalogFont(family)`, `fallbackChain(family)`: 62 curated families,
  category tags and script hints. Arabic/Hebrew Noto fallbacks supplement Hindi.
- `loadFont(family, weights=[400], subsets=['latin'], request?)`: Promise of binary
  `FontAsset` records. Request supports `offline`, `signal`, `onState`.
- `createFontLoader({store, fetcher?, register?, online?})`: injectable loader with
  the same `loadFont` and `state(family, weights?, subsets?)` methods.
- `createFontStore()`: IndexedDB binary-face cache, shared by page and export worker.
- `FontLoadError`: `OFFLINE_MISS`, `FONT_UNAVAILABLE`, `STORAGE`, `ABORTED`.
  Network/platform exceptions may also propagate; UI must catch all failures.
- `resolveDirection(text, direction='auto')`: first strong Arabic/Hebrew letter
  selects RTL; another letter selects LTR. Explicit direction wins.
- `graphemes(text)`, `breakLines(text,width,measure)`: Intl.Segmenter clusters,
  whole-line Canvas shaping; a cluster wider than the box remains intact.
- `glyphCoverage(text, hasGlyph)`: unique missing characters from an injected
  font-glyph lookup, including matras. It does **not** infer coverage from equal
  widths, from `FontFaceSet.check`, or from catalog script tags.
- `textEngineSchema`, `parseTextEngine(json)`, `textEngineProperty(options)`:
  strict validation, defensive reader, and validated string property constructor.
- `layoutStructured(text,width,lineHeight,options,measure)`: addressable boxes with
  `id`, `x/y/width/height`, lines, direction, marker and cell style.
- `drawStructuredText(context,text,width,size,fill,style,options)`: shared Canvas2D
  drawing returning those same cell boxes.

## Persistence and examples

Send `textEngineProperty(options)` through the existing `SET_PROPERTY` command,
with `target: {kind:'property', key:'textEngine'}`, compositionId and layerId.
Use the existing command bus transaction for a multi-property edit. No engine.load
or direct state mutation. Removing the property returns to legacy layout.

Hindi or mixed text: `{ "direction": "auto" }` plus a suitable `fontFamily`.

Nested list:
```json
{"direction":"auto","list":{"kind":"numbered","levels":[1,2,3,1],"indent":28,"spacing":6}}
```
One paragraph per item; levels 1–3. Bullet styles: disc, circle, square. Numbered
children restart when returning to a parent level. RTL markers reserve right-side
space. Alignment left/right is interpreted as start/end in this opt-in path.

Table:
```json
{"table":{"rows":[[{"text":"Item"},{"text":"Value"}],[{"text":"हिंदी"},{"text":"42","style":{"color":"#ffffff","background":"#334155","align":"end"}}]],"columnWidths":[2,1],"header":true,"padding":8,"border":"#808080","borderWidth":1}}
```
Column widths are positive relative weights; row height fits wrapped contents.
Cells support color, background, bold and start/center/end alignment. IDs
`cell-row-column` and `paragraph-index` are stable addresses for tooling/stagger
planning. Individual cell animation tracks are not added; whole-layer animation
works through the existing model. A later cell animator can consume these boxes.
At most 100 rows × 30 columns, 10,000 chars per cell, 1 MiB property JSON.
Lists draw at most 1,000 items. Invalid dimensions throw; malformed stored JSON
falls back to the legacy path. The adapter expands the text box to structured
content height. Existing rich runs/legacy listStyle are not combined with the
opt-in structured layout; keep those layers on their existing renderer.

## Fonts and export

Uses Google Fonts CSS API v2, requests sorted weights, fetches HTTPS gstatic font
bytes, registers loaded FontFace objects (no DOM stylesheet), and commits complete
family manifests to IndexedDB. All ranges returned by CSS are cached; subsets are
request/cache labels, not a claim that Google filtered them. No text is sent to the
font API. Failed/aborted downloads never commit an incomplete family. Returned byte
arrays are copies. No font bytes are placed in project JSON/localStorage.

The existing export worker calls `loadUsedFonts`: it now loads catalog faces from
the same persistent cache and registers them in the worker before rendering.
Selected bytes are available to Canvas export; this is not a font-embedded project
archive. Offline misses fail explicitly rather than silently exporting a substitute.
Online export can fetch a missing face. The bundled-font behavior is unchanged.

UI must await font loading before measuring/rendering, invalidate measured layouts
after success, and call `loadUsedFonts(document.fonts, baseUrl, compositions)` for
structured-text fallback faces. Loading one chosen font alone does not preload all
fallback families. Loader states: idle/loading/ready/error. On startup and after
font changes, display errors, offer retry, and keep the previous font until success.
Offer weight choices supported by each family: CSS API rejects nonexistent weights;
the catalog is not a promise that every family has every weight or italic face.

## Licensing and limits

No new runtime dependency or model. Font bytes vary by family, range and browser;
no universal byte-size claim. Google Fonts uses open-source licences; OFL 1.1 is
usual, with some Apache-2.0 families. Do not relicense redistributed font binaries:
retain each family's upstream licence and notices, including the existing bundled
OFL files. This change downloads fonts rather than vendoring new font distributions.
Sources: https://developers.google.com/fonts/docs/css2 and
https://github.com/google/fonts/blob/main/README.md (family metadata/licences).

Canvas performs script shaping and bidi within whole lines; this module never
reverses code points or splits a Devanagari cluster. Intl.Segmenter support is
required. Font coverage still needs real glyph metadata or browser inspection:
fake measurement/glyph tests prove algorithms, not absence of tofu on a device.
System fallbacks and rendering differ across OS/browser versions. No cross-browser
pixel-parity claim. CSS/network/CORS/CSP, IndexedDB quota, Safari worker font support,
real Hindi/RTL appearance and mobile memory have not been browser-tested here.

UI must wire: font/category/script picker, font loading/error/offline status,
direction selector, list kind/level/indent/spacing controls, table grid/cell styling,
box handles from layoutStructured, and existing semantic commands/undo. Fonts and
structured layout tests use fixtures/fake FontFace, never live network.

Decisions: C3-D1 opt-in existing string property (no schema change); C3-D2 table is a
text extension; C3-D3 complete binary manifests for worker/offline reuse; C3-D4
cluster-safe wrapping + native Canvas shaping, with explicit coverage limitations.
