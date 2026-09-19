import {
  activeAtTime,
  effectiveLayerTiming,
  invertMatrix,
  transformPoint,
  worldTransform,
  type AffineMatrix,
  type Asset,
  type Composition,
  type DeepReadonly,
  type Layer,
  type Point2,
  type TransformPreview,
} from '../core';

import { layoutText, type TextMeasurer } from './text-layout';
import type { TransformCapabilities } from './transform-capabilities';

export interface LayerPreview extends TransformPreview {
  readonly textBox?: { readonly width: number; readonly height: number };
}
export type SceneLayer = DeepReadonly<Layer>;
export interface RenderSource {
  readonly composition: DeepReadonly<Composition>;
  readonly assets: readonly DeepReadonly<Asset>[];
  readonly background: string;
  readonly preview?: LayerPreview;
  readonly previews?: readonly LayerPreview[];
  readonly selectedIds?: readonly string[];
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
}
export interface LayerSize {
  readonly width: number;
  readonly height: number;
  readonly source: 'properties' | 'asset' | 'placeholder' | 'mixed';
}
export interface RenderItem {
  readonly id: string;
  readonly ancestors: readonly string[];
  readonly matrix: AffineMatrix;
  readonly opacity: number;
  readonly size: LayerSize;
  readonly fill: string;
  readonly text: string;
  readonly fontSize: number;
  readonly lines?: readonly string[];
  readonly kind: 'rectangle' | 'text' | 'placeholder';
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
export function deriveRenderItems(source: RenderSource): {
  items: readonly RenderItem[];
  warnings: readonly string[];
} {
  const items: RenderItem[] = [],
    warnings: string[] = [];
  const visit = (
    layers: readonly SceneLayer[],
    ancestors: readonly string[],
  ) => {
    for (const layer of layers) {
      const canonicalTiming = effectiveLayerTiming(source.composition, layer);
      const timing =
        source.timingPreviews?.find((item) => item.layerId === layer.id) ??
        (source.timingPreview?.layerId === layer.id
          ? source.timingPreview
          : canonicalTiming);
      if (
        !canonicalTiming.enabled ||
        (source.currentTime !== undefined &&
          !activeAtTime(timing, source.currentTime))
      )
        continue;
      if (layer.type === 'group') {
        visit(layer.children, [...ancestors, layer.id]);
        continue;
      }
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
        items.push(
          Object.freeze({
            ...(layer.type === 'text' &&
            ((source.preview?.layerId === layer.id && source.preview.textBox) ||
              (layer.properties.textWrap?.type === 'boolean' &&
                layer.properties.textWrap.value))
              ? {
                  lines: textLayoutForWidth(
                    layer,
                    size.width,
                    source.measureText,
                  ).lines,
                }
              : {}),
            id: layer.id,
            ancestors: Object.freeze([...ancestors]),
            matrix: world.matrix,
            opacity: world.opacity,
            size,
            fill: fill?.type === 'color' ? fill.value : colors[layer.type],
            text:
              layer.type === 'text'
                ? text?.type === 'string'
                  ? text.value
                  : layer.name
                : `${layer.type.toUpperCase()} / ${layer.name}`,
            fontSize: Math.min(numericProperty(layer, 'fontSize') ?? 32, 4096),
            kind:
              layer.type === 'shape'
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

export function hitTest(source: RenderSource, point: Point2): string | null {
  const { width, height } = source.composition;
  if (
    !point.every(Number.isFinite) ||
    point[0] < 0 ||
    point[1] < 0 ||
    point[0] > width ||
    point[1] > height
  )
    return null;
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
  );
}
