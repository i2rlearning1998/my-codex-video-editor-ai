import type { CameraFrameOverlay } from './camera-overlay';
import type { ChromaKey } from '../chroma/types';
import { evaluateMask } from '../masks/geometry';
import type { MaskScope } from '../masks/render';
import { layoutStructured } from '../text-engine/layout';
import { pictureOf, type PictureStyle } from './picture';
import {
  clipFx,
  activeAtTime,
  clipSourceTime,
  clipTimeEffects,
  compositionAt,
  nestedAnchor,
  nestedInfo,
  nestedTimeAt,
  effectiveLayerTiming,
  findClipByLayer,
  invertMatrix,
  transformPoint,
  worldTransform,
  type AffineMatrix,
  type Asset,
  type Composition,
  type DeepReadonly,
  type Layer,
  type Point2,
  type TimedClip,
  type TransformPreview,
} from '../core';

import {
  fallbackTextMeasure,
  layoutParagraphs,
  layoutText,
  type TextLayout,
  type TextMeasurer,
} from './text-layout';
import {
  layoutRich,
  parseListStyle,
  parseRuns,
  type RichLayout,
} from './rich-text';
import { textStyleOf, type TextStyle } from './text-style';
import { textBoxOf, textHeightFixed } from './text-box';
import { applyDynamicText, type DynamicContext } from './dynamic-text';
import { isCameraLayer } from '../camera/shots';
import { textEffectsOf, type TextLook } from './text-effects';
import { shapeOf, type ShapeStyle } from './shapes';
import type { TransformCapabilities } from './transform-capabilities';
import { drawingOf, type DrawingPath } from './drawing';
import { applyPresets } from './presets';
import { applyTransitions } from './transitions';

export interface LayerPreview extends TransformPreview {
  readonly textBox?: { readonly width: number; readonly height: number };
}
export type SceneLayer = DeepReadonly<Layer>;
/** What an image or video layer shows at the current time (W4-B). */
export interface MediaFrameRequest {
  /** Stable per-layer key: each layer gets its own decoder. */
  readonly key: string;
  readonly assetId: string;
  readonly kind: 'image' | 'video' | 'code';
  /** Source-media seconds, after speed, reverse and freeze (clipSourceTime). */
  readonly sourceTime: number;
  readonly speed: number;
  readonly reversed: boolean;
  readonly frozen: boolean;
  /** X1: a code animation's baked frames (kind 'code'; assetId is unused). */
  readonly code?: CodeFrameRequest;
}
export interface CodeFrameRequest {
  readonly tier: 'B' | 'C';
  readonly bakeKey: string;
  /** The project canvas the bake fills (Full quality). */
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly frames: number;
  readonly frame: number;
}
/**
 * Injected, read-only frame lookup. The renderer asks and draws; decoding and
 * seeking live behind this interface (src/media/frames.ts), never in the renderer.
 */
export interface FrameProvider {
  frame(request: MediaFrameRequest, playing: boolean): CanvasImageSource | null;
}
export interface RenderSource {
  readonly composition: DeepReadonly<Composition>;
  readonly assets: readonly DeepReadonly<Asset>[];
  readonly background: string;
  /** FINAL3 C3: false draws the scene un-moved by its camera (editing). */
  readonly camera?: boolean;
  /** FINAL3 C3: the selected shot's editable camera frame (editor only). */
  readonly cameraFrame?: CameraFrameOverlay | null;
  /** FINAL3 C3: the viewport already looks through the camera's depth-0
   *  view (Preview camera); layers at other depths keep their parallax. */
  readonly cameraInView?: boolean;
  readonly preview?: LayerPreview;
  readonly previews?: readonly LayerPreview[];
  readonly selectedIds?: readonly string[];
  /** G3: layers a marquee in progress would select (outlined, transient). */
  readonly highlightIds?: readonly string[];
  /** Session-only Solo: when present, clips on other tracks are not drawn. */
  readonly soloTrackIds?: readonly string[];
  readonly timingPreviews?: readonly {
    readonly layerId: string;
    readonly startTime: number;
    readonly duration: number;
  }[];
  readonly currentTime?: number;
  readonly timingPreview?: {
    readonly layerId: string;
    readonly startTime: number;
    readonly duration: number;
  };
  readonly measureText?: TextMeasurer;
  readonly capabilities?: Readonly<Record<string, TransformCapabilities>>;
  readonly hoveredHandle?: string | number;
  /** SHP-018: the freehand stroke being drawn (composition space). */
  readonly drawing?: DrawingPath & { readonly opacity: number };
  /** W5-C: draw with the clips' animation presets (picking never sets this). */
  readonly animate?: boolean;
  readonly chromaQuality?: 'full' | 'fast';
  /** TXT-037: what dynamic text fields (scene number, count, time) read. */
  readonly dynamic?: DynamicContext;
  /**
   * CV-041: the multi-selection frame (four world corners) while it is being
   * resized or rotated; otherwise the frame is the selection's bounds.
   */
  readonly selectionFrame?: readonly Point2[];
  /** CV-013: transient snap guides of the active canvas gesture. */
  readonly guides?: readonly {
    readonly axis: 'x' | 'y';
    readonly value: number;
  }[];
  readonly frames?: FrameProvider;
  readonly playing?: boolean;
  /** I1.7: the label drawn on missing media (translated by the UI). */
  readonly missingLabel?: string;
  /** H3: the object (or the empty artboard) under the pointer. */
  readonly hoverId?: string;
  readonly hoverArtboard?: boolean;
  /** H3: the picture being cropped and its crop frame (canvas CSS px). */
  readonly cropLayerId?: string;
  readonly crop?: CropOverlay;
  /**
   * H3: while cropping, the layer shows its whole source (dimmed) at
   * `source` and the kept part at `frame`, both in the layer's local units.
   */
  readonly cropView?: CropView;
  /** J4: the text layer being edited on the canvas; its text is not drawn. */
  readonly editingTextId?: string;
}
export interface LocalRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface CropView {
  readonly layerId: string;
  readonly source: LocalRect;
  readonly frame: LocalRect;
}
export interface CropOverlay {
  /** The kept frame's four corners, then the whole source's. */
  readonly frame: readonly Point2[];
  readonly source: readonly Point2[];
}
export interface LayerSize {
  readonly width: number;
  readonly height: number;
  readonly source: 'properties' | 'asset' | 'placeholder' | 'mixed';
}
/** FINAL3: a text item also carries its effects, curve, gradient and reveal. */
export interface RenderItem extends TextLook {
  /** FINAL3 C4: depth (z) for the camera (0: the canvas plane). */
  readonly depth?: number;
  readonly chromaKey?: Readonly<ChromaKey>;
  readonly maskScopes?: readonly MaskScope[];
  readonly id: string;
  readonly ancestors: readonly string[];
  readonly matrix: AffineMatrix;
  readonly opacity: number;
  readonly size: LayerSize;
  readonly fill: string;
  readonly text: string;
  readonly fontSize: number;
  readonly lines?: readonly string[];
  /** W2-F5: a text layer's style and its laid-out lines. */
  readonly textStyle?: TextStyle;
  readonly textLayout?: TextLayout;
  /** J4: rich text (per-range styles or a list) replaces the plain layout. */
  readonly richLayout?: RichLayout;
  /** T6: the text needs more height than its box (a fixed-height box). */
  readonly textOverflow?: true;
  /** J4: the text is being edited on the canvas (an editor draws it). */
  readonly editing?: boolean;
  /** W5-D: a shape layer's kind, fill, stroke and corner radius. */
  readonly shape?: ShapeStyle;
  readonly kind: 'rectangle' | 'text' | 'placeholder' | 'path';
  readonly media?: MediaFrameRequest;
  /** I1.7: the layer's media was deleted (or never imported here). */
  readonly missing?: boolean;
  /** X1: a code animation; transparent until its frame is baked. */
  readonly code?: boolean;
  /** SHP-019: a freehand drawing's stroke in local coordinates. */
  readonly path?: DrawingPath;
  /** H3: a picture's crop, rounded corners and border. */
  readonly picture?: PictureStyle;
  /** H3: the crop being edited on this picture. */
  readonly cropView?: CropView;
  /** W5-C Wipe: the visible fraction of the box, from the left. */
  readonly reveal?: number;
  /** J12: the side the reveal starts from (left unless set). */
  readonly revealFrom?: 'left' | 'right';
  /** T-ALL P6: the clip's FX library stack, with its clip-local time. */
  readonly fx?: RenderFx;
  /** T-ALL P6: a pixel transition from the item `from` into this one. */
  readonly fxTransition?: {
    readonly id: string;
    readonly params: Readonly<Record<string, number | boolean | string>>;
    readonly progress: number;
    readonly from: string;
  };
  /** T-ALL P6: drawn by the incoming item's pixel transition, not alone. */
  readonly fxFrom?: true;
}
export interface RenderFx {
  readonly stack: readonly {
    readonly id: string;
    readonly params: Readonly<Record<string, number | boolean | string>>;
  }[];
  readonly blendMode?: string;
  readonly time: number;
  readonly duration: number;
  readonly seed: number;
}
/** A stable integer seed from a clip id (FNV-1a over UTF-16 code units). */
export function fxSeed(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++)
    hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}
const defaults = {
  image: [320, 180],
  video: [320, 180],
  audio: [240, 64],
  text: [360, 100],
  shape: [180, 120],
  group: [0, 0],
} as const;
const colors = {
  image: '#556579',
  video: '#655a83',
  audio: '#3b7068',
  text: '#edece8',
  shape: '#b1a0ed',
  group: '#000000',
} as const;

export function numericProperty(
  layer: SceneLayer,
  name: string,
): number | undefined {
  const property = layer.properties[name];
  return property?.type === 'number' &&
    Number.isFinite(property.value) &&
    property.value > 0
    ? property.value
    : undefined;
}
export function layerSize(
  layer: SceneLayer,
  assets: RenderSource['assets'],
  preview?: LayerPreview,
): LayerSize | null {
  if (layer.type === 'group') return null;
  // FINAL3 T1: a text box is as big as its text (tables keep their box).
  if (layer.type === 'text' && !textStyleOf(layer).engine?.table) {
    const drag = preview?.layerId === layer.id ? preview.textBox : undefined;
    const box = textBoxOf(layer, drag ? { width: drag.width } : {});
    return Object.freeze({
      width: box.width,
      height: box.height,
      source: 'properties' as const,
    });
  }
  const asset = assets.find((item) => item.id === layer.assetId);
  const box = preview?.layerId === layer.id ? preview.textBox : undefined;
  const width = box?.width ?? numericProperty(layer, 'width'),
    height = box?.height ?? numericProperty(layer, 'height');
  const widthSource =
    width !== undefined
      ? 'properties'
      : asset?.width !== undefined
        ? 'asset'
        : 'placeholder';
  const heightSource =
    height !== undefined
      ? 'properties'
      : asset?.height !== undefined
        ? 'asset'
        : 'placeholder';
  return Object.freeze({
    width: width ?? asset?.width ?? defaults[layer.type][0],
    height: height ?? asset?.height ?? defaults[layer.type][1],
    source: widthSource === heightSource ? widthSource : 'mixed',
  });
}

export function locateLayer(
  layers: readonly SceneLayer[],
  id: string,
  parent: SceneLayer | null = null,
): { layer: SceneLayer; parent: SceneLayer | null } | null {
  for (const layer of layers) {
    if (layer.id === id) return { layer, parent };
    const found = locateLayer(layer.children, id, layer);
    if (found) return found;
  }
  return null;
}

/** A disposable projection per render/hit-test, never an editable canvas model or cache. */
export function deriveRenderItems(input: RenderSource): {
  items: readonly RenderItem[];
  warnings: readonly string[];
} {
  // W5-C: drawing (not picking) applies the clips' animation presets.
  // NEST: `source` and `scope` switch while a nested clip's children are
  // visited (their own time frame); without nesting they never change.
  let scope: ReadonlyMap<string, NestedChildClip> = NO_SCOPE;
  let source: RenderSource = input.animate
    ? {
        ...input,
        animate: false,
        // J12: then the transitions in play across cuts.
        composition: applyDynamicText(
          applyTransitions(
            applyPresets(
              input.composition,
              input.assets,
              input.currentTime ?? 0,
            ),
            input.currentTime ?? 0,
          ),
          {
            time: (input.currentTime ?? 0) - (input.dynamic?.sceneStart ?? 0),
            sceneNumber: input.dynamic?.sceneNumber ?? 1,
            sceneCount: input.dynamic?.sceneCount ?? 1,
            ...(input.dynamic?.now !== undefined
              ? { now: input.dynamic.now }
              : {}),
          },
        ),
      }
    : input;
  const items: RenderItem[] = [],
    warnings: string[] = [];
  // T-ALL P6: each top-level layer's clip effects (drawing only).
  const fxByLayer = new Map<string, RenderFx>();
  if (input.animate)
    for (const track of source.composition.tracks as unknown as readonly {
      readonly clips: readonly {
        readonly id: string;
        readonly layerId: string;
        readonly startTime: number;
        readonly duration: number;
        readonly metadata: Readonly<Record<string, unknown>>;
      }[];
    }[])
      for (const clip of track.clips) {
        const fx = clipFx(clip);
        if (!fx) continue;
        fxByLayer.set(clip.layerId, {
          stack: fx.stack,
          ...(fx.blendMode ? { blendMode: fx.blendMode } : {}),
          time: Math.min(
            clip.duration,
            Math.max(0, (input.currentTime ?? 0) - clip.startTime),
          ),
          duration: clip.duration,
          seed: fxSeed(clip.id),
        });
      }
  const stringProperty = (layer: SceneLayer, key: string) => {
    const value = (layer.properties as Record<string, unknown>)[key] as
      { type?: string; value?: unknown } | undefined;
    return value?.type === 'string' && typeof value.value === 'string'
      ? value.value
      : undefined;
  };
  // FINAL3 C4: a top-level layer's depth (z) property, 0 when unset.
  const depths = new Map<string, number>();
  for (const layer of source.composition.layers) {
    const value = layer.properties.depth;
    if (value?.type === 'number' && Number.isFinite(value.value) && value.value)
      depths.set(layer.id, value.value);
  }
  const depthOf = (id: string) => depths.get(id) ?? 0;
  const hasBlend = (layers: readonly SceneLayer[]): boolean =>
    layers.some(
      (layer) => layer.blendMode !== undefined || hasBlend(layer.children),
    );
  const visit = (
    layers: readonly SceneLayer[],
    ancestors: readonly string[],
    maskScopes: readonly MaskScope[] = [],
  ) => {
    for (const layer of layers) {
      const scoped = scope.get(layer.id);
      const canonicalTiming = scoped
        ? {
            startTime: scoped.startTime,
            duration: scoped.duration,
            enabled: scoped.enabled,
          }
        : effectiveLayerTiming(source.composition, layer);
      const timing =
        source.timingPreviews?.find((item) => item.layerId === layer.id) ??
        (source.timingPreview?.layerId === layer.id
          ? source.timingPreview
          : canonicalTiming);
      const soloed =
        !source.soloTrackIds?.length ||
        !findClipByLayer(source.composition, layer.id) ||
        source.soloTrackIds.includes(
          findClipByLayer(source.composition, layer.id)!.track.id,
        );
      if (
        !soloed ||
        !canonicalTiming.enabled ||
        (source.currentTime !== undefined &&
          !activeAtTime(timing, source.currentTime))
      )
        continue;
      const scopes =
        layer.masks?.length ||
        layer.matte ||
        layer.blendMode !== undefined ||
        (layer.type === 'group' && hasBlend(layer.children))
          ? [
              ...maskScopes,
              {
                id: layer.id,
                blendMode: layer.blendMode,
                matrix: worldTransform(
                  source.composition,
                  layer.id,
                  source.previews ?? source.preview,
                ).matrix,
                masks: (layer.masks ?? []).map((mask) =>
                  evaluateMask(
                    mask,
                    (source.currentTime ?? 0) - timing.startTime,
                  ),
                ),
                ...(layer.matte ? { matte: layer.matte } : {}),
              },
            ]
          : maskScopes;
      if (layer.type === 'group') {
        // NEST (D-271): a nested clip's children play in its own time
        // frame, through the outer clip's trim and speed.
        const nested = nestedFrame(source, scope, layer);
        if (nested) {
          const outer = { source, scope };
          source = nested.source;
          scope = nested.scope;
          try {
            visit(nested.children, [...ancestors, layer.id], scopes);
          } finally {
            ({ source, scope } = outer);
          }
        } else visit(layer.children, [...ancestors, layer.id], scopes);
        continue;
      }
      // H1.3: sound has no picture. Audio layers are never drawn, picked,
      // outlined or snapped to; they live as clips on audio tracks.
      if (layer.type === 'audio') continue;
      // FINAL3 C1: a camera shot is a clip on the Camera track, not a picture.
      if (isCameraLayer(layer)) continue;
      try {
        const world = worldTransform(
          source.composition,
          layer.id,
          source.previews ?? source.preview,
        );
        const size = layerSize(layer, source.assets, source.preview)!;
        // Catch finite local values whose transformed corners overflow before Canvas sees them.
        for (const point of [
          [0, 0],
          [size.width, 0],
          [size.width, size.height],
          [0, size.height],
        ] as const)
          transformPoint(world.matrix, point);
        const fill = layer.properties.fill;
        const text = layer.properties.text;
        // FINAL3 T1: every text (but a table) is laid out once, as rich
        // text, by its box (render/text-box.ts); the drawing uses it.
        const table =
          layer.type === 'text' && !!textStyleOf(layer).engine?.table;
        const drag =
          source.preview?.layerId === layer.id
            ? source.preview.textBox
            : undefined;
        const textBox =
          layer.type === 'text' && !table
            ? textBoxOf(layer, {
                ...(drag ? { width: drag.width } : {}),
                ...(source.measureText ? { measure: source.measureText } : {}),
              })
            : undefined;
        const wrapped = undefined as TextLayout | undefined;
        const textLayout = table
          ? layoutParagraphs(
              text?.type === 'string' ? text.value : layer.name,
              Math.min(numericProperty(layer, 'fontSize') ?? 32, 4096),
              textStyleOf(layer),
            )
          : undefined;
        const richLayout = textBox?.layout;
        // The stored height is a static field the user (or a drag) set; wrapped
        // text can need more lines than that at the current width/font size, so
        // never clip content the layout itself says it needs.
        let needed: number | undefined = undefined;
        const structuredStyle =
          layer.type === 'text' ? textStyleOf(layer) : undefined;
        if (structuredStyle?.engine) {
          try {
            const fontSize = Math.min(
              numericProperty(layer, 'fontSize') ?? 32,
              4096,
            );
            const cells = layoutStructured(
              text?.type === 'string' ? text.value : layer.name,
              size.width,
              fontSize * structuredStyle.lineHeight,
              structuredStyle.engine,
              (value, bold) =>
                (source.measureText ?? fallbackTextMeasure)(
                  value,
                  fontSize,
                  bold ? { ...structuredStyle, weight: 700 } : structuredStyle,
                ),
            );
            needed = Math.max(0, ...cells.map((cell) => cell.y + cell.height));
          } catch {
            /* Invalid structured layout stays clipped to the stored box. */
          }
        }
        // T6: a fixed-height box never grows; text past it is clipped and
        // the editor marks the overflow.
        const fixedHeight = layer.type === 'text' && textHeightFixed(layer);
        const effectiveSize = textBox
          ? { ...size, width: textBox.width, height: textBox.height }
          : table && needed !== undefined && !fixedHeight
            ? { ...size, height: Math.max(size.height, needed) }
            : size;
        const textOverflow =
          fixedHeight &&
          (richLayout?.height ?? textLayout?.height ?? 0) >
            effectiveSize.height + 0.5;
        const drawing = drawingOf(layer);
        if (drawing === 'invalid') {
          warnings.push(
            `Cannot draw ${layer.name}: its drawing data is invalid.`,
          );
          continue;
        }
        const missing =
          (layer.type === 'image' || layer.type === 'video') &&
          !!layer.assetId &&
          isMissingAsset(
            source.assets as unknown as readonly {
              readonly id: string;
              readonly metadata: unknown;
            }[],
            layer.assetId,
          );
        const media =
          (layer.type === 'image' || layer.type === 'video') &&
          layer.assetId &&
          !missing
            ? mediaRequest(source, layer, layer.type, layer.assetId, scoped)
            : layer.code
              ? codeRequest(source, layer, scoped)
              : undefined;
        items.push(
          Object.freeze({
            ...(wrapped ? { lines: wrapped.lines } : {}),
            ...(textLayout
              ? { textStyle: textStyleOf(layer), textLayout }
              : {}),
            ...(richLayout && textBox
              ? {
                  richLayout,
                  textStyle: textBox.style,
                  ...textEffectsOf(layer, textBox),
                }
              : {}),
            ...(source.editingTextId === layer.id ? { editing: true } : {}),
            ...(textOverflow ? { textOverflow: true } : {}),
            ...(layer.type === 'shape' && !drawing
              ? { shape: shapeOf(layer)! }
              : {}),
            ...(media ? { media } : {}),
            ...(layer.code ? { code: true } : {}),
            ...(missing ? { missing: true } : {}),
            ...(pictureOf(layer) ? { picture: pictureOf(layer)! } : {}),
            ...(source.cropView?.layerId === layer.id
              ? { cropView: source.cropView }
              : {}),
            ...(drawing ? { path: drawing } : {}),
            ...(numericProperty(layer, 'presetReveal') !== undefined
              ? {
                  reveal: Math.min(
                    1,
                    Math.max(0, numericProperty(layer, 'presetReveal')!),
                  ),
                  // J12: a wipe to the left reveals from the right edge.
                  ...(layer.properties.presetRevealFrom?.type === 'string' &&
                  layer.properties.presetRevealFrom.value === 'right'
                    ? { revealFrom: 'right' as const }
                    : {}),
                }
              : {}),
            ...(fxByLayer.has(ancestors[0] ?? layer.id)
              ? { fx: fxByLayer.get(ancestors[0] ?? layer.id)! }
              : {}),
            ...(stringProperty(layer, 'presetFxTransition')
              ? {
                  fxTransition: JSON.parse(
                    stringProperty(layer, 'presetFxTransition')!,
                  ) as NonNullable<RenderItem['fxTransition']>,
                }
              : {}),
            ...(stringProperty(layer, 'presetFxFrom') ? { fxFrom: true } : {}),
            id: layer.id,
            ancestors: Object.freeze([...ancestors]),
            // FINAL3 C4: the depth (z) of the top-level layer: the camera's
            // parallax, clipping and depth of field.
            ...(depthOf(ancestors[0] ?? layer.id) !== 0
              ? { depth: depthOf(ancestors[0] ?? layer.id) }
              : {}),
            ...(layer.chromaKey ? { chromaKey: layer.chromaKey } : {}),
            ...(scopes.length ? { maskScopes: scopes } : {}),
            matrix: world.matrix,
            opacity: world.opacity,
            size: effectiveSize,
            fill: fill?.type === 'color' ? fill.value : colors[layer.type],
            text:
              layer.type === 'text'
                ? text?.type === 'string'
                  ? text.value
                  : layer.name
                : `${layer.type.toUpperCase()} / ${layer.name}`,
            fontSize: Math.min(numericProperty(layer, 'fontSize') ?? 32, 4096),
            kind: drawing
              ? 'path'
              : layer.type === 'shape'
                ? 'rectangle'
                : layer.type === 'text'
                  ? 'text'
                  : 'placeholder',
          }),
        );
      } catch {
        warnings.push(
          `Cannot preview ${layer.name}: transform exceeds the supported numerical range.`,
        );
      }
    }
  };
  visit(source.composition.layers, []);
  return { items: Object.freeze(items), warnings: Object.freeze(warnings) };
}

/** NEST: a child clip kept inside a nested clip, at its absolute time. */
type NestedChildClip = TimedClip & { readonly enabled: boolean };
const NO_SCOPE: ReadonlyMap<string, NestedChildClip> = new Map();
/**
 * NEST (D-271): when `group` is a nested clip and a time is drawn, the
 * source its children are drawn with (their keyframes evaluated at the inner
 * time) and their kept clips; otherwise null, so a project without nesting
 * takes the old path unchanged.
 */
function nestedFrame(
  source: RenderSource,
  scope: ReadonlyMap<string, NestedChildClip>,
  group: SceneLayer,
): {
  source: RenderSource;
  scope: ReadonlyMap<string, NestedChildClip>;
  children: readonly SceneLayer[];
} | null {
  if (source.currentTime === undefined) return null;
  const clip: (TimedClip & { readonly metadata: object }) | undefined =
    scope.get(group.id) ?? findClipByLayer(source.composition, group.id)?.clip;
  const info = clip ? nestedInfo(clip) : null;
  if (!clip || !info) return null;
  const time = nestedTimeAt(clip, source.currentTime);
  const anchor = nestedAnchor(clip);
  const inner = new Map<string, NestedChildClip>();
  for (const record of info.clips)
    inner.set(record.clip.layerId, {
      ...record.clip,
      startTime: anchor + record.clip.startTime,
    });
  const children = compositionAt({ layers: group.children }, time).layers;
  const replace = (layers: readonly SceneLayer[]): readonly SceneLayer[] =>
    layers.map((layer) =>
      layer.id === group.id
        ? ({ ...layer, children } as SceneLayer)
        : layer.children.length
          ? ({ ...layer, children: replace(layer.children) } as SceneLayer)
          : layer,
    );
  return {
    source: {
      ...source,
      composition: {
        ...source.composition,
        layers: replace(source.composition.layers),
      } as RenderSource['composition'],
      currentTime: time,
    },
    scope: inner,
    children,
  };
}
/** I1.7: an asset that is gone, or deleted from the library (soft). */
export function isMissingAsset(
  assets: readonly { readonly id: string; readonly metadata: unknown }[],
  id: string,
): boolean {
  const asset = assets.find((item) => item.id === id);
  return !asset || (asset.metadata as Record<string, unknown>).removed === true;
}
/** X1: the baked frame a code layer shows now (after speed and reverse). */
function codeRequest(
  source: RenderSource,
  layer: SceneLayer,
  scoped?: NestedChildClip,
): MediaFrameRequest {
  const code = layer.code as unknown as {
    readonly tier: 'B' | 'C';
    readonly bakeKey: string;
    readonly meta: Readonly<Record<string, unknown>>;
  };
  const meta = code.meta;
  const duration = Math.min(
    120,
    Math.max(
      0.1,
      typeof meta.duration === 'number' && Number.isFinite(meta.duration)
        ? meta.duration
        : 5,
    ),
  );
  const fps =
    typeof meta.fps === 'number' && meta.fps > 0
      ? meta.fps
      : source.composition.fps;
  const frames = Math.max(1, Math.ceil(duration * fps - 1e-6));
  const timed = mediaRequest(source, layer, 'video', layer.id, scoped);
  return Object.freeze({
    ...timed,
    kind: 'code' as const,
    code: Object.freeze({
      tier: code.tier,
      bakeKey: code.bakeKey,
      width: source.composition.width,
      height: source.composition.height,
      fps,
      frames,
      frame: Math.min(
        frames - 1,
        Math.max(0, Math.floor(Math.max(0, timed.sourceTime) * fps + 1e-6)),
      ),
    }),
  });
}
function mediaRequest(
  source: RenderSource,
  layer: SceneLayer,
  kind: 'image' | 'video',
  assetId: string,
  scoped?: NestedChildClip,
): MediaFrameRequest {
  const time = source.currentTime ?? 0;
  const found = scoped
    ? { clip: scoped }
    : findClipByLayer(source.composition, layer.id);
  if (!found)
    return Object.freeze({
      key: layer.id,
      assetId,
      kind,
      sourceTime: Math.max(0, time - layer.startTime),
      speed: 1,
      reversed: false,
      frozen: false,
    });
  const effects = clipTimeEffects(found.clip);
  return Object.freeze({
    key: layer.id,
    assetId,
    kind,
    sourceTime: clipSourceTime(found.clip, time),
    speed: effects.speed,
    reversed: effects.reversed,
    frozen: effects.freezeFrame !== null,
  });
}

export function hitTest(source: RenderSource, point: Point2): string | null {
  // G3: parts outside the composition are shown faintly and stay pickable.
  if (!point.every(Number.isFinite)) return null;
  const { items } = deriveRenderItems(source);
  for (const item of [...items].reverse()) {
    if (item.opacity === 0) continue;
    try {
      const inverse = invertMatrix(item.matrix);
      if (!inverse) continue;
      const [x, y] = transformPoint(inverse, point);
      if (x >= 0 && y >= 0 && x <= item.size.width && y <= item.size.height)
        return item.id;
    } catch {
      /* An unstable inverse is not a selectable rectangle. */
    }
  }
  return null;
}

/** J4: a text layer's rich layout, or undefined when it is plain text. */
export function richTextLayout(
  layer: SceneLayer,
  size: { readonly width: number },
  source: Pick<RenderSource, 'measureText'>,
): RichLayout | undefined {
  const value = (key: string) => {
    const property = layer.properties[key];
    return property?.type === 'string' ? property.value : undefined;
  };
  const text = value('text') ?? layer.name;
  const runs = parseRuns(value('textRuns'), text.length);
  const list = parseListStyle(value('listStyle'));
  if (!runs.length && list === 'none') return undefined;
  const fill = layer.properties.fill;
  const wrap =
    layer.properties.textWrap?.type === 'boolean' &&
    layer.properties.textWrap.value;
  try {
    return layoutRich(
      text,
      runs,
      list,
      {
        style: textStyleOf(layer),
        size: Math.min(numericProperty(layer, 'fontSize') ?? 32, 4096),
        color: fill?.type === 'color' ? fill.value.slice(0, 7) : colors.text,
      },
      wrap ? size.width : null,
      source.measureText ?? fallbackTextMeasure,
    );
  } catch {
    return undefined;
  }
}

export function textLayoutForWidth(
  layer: SceneLayer,
  width: number,
  measure?: TextMeasurer,
) {
  const text = layer.properties.text;
  return layoutText(
    text?.type === 'string' ? text.value : layer.name,
    width,
    Math.min(numericProperty(layer, 'fontSize') ?? 32, 4096),
    measure,
    textStyleOf(layer),
  );
}
