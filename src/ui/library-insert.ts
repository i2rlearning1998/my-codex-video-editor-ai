// H5: turns library items into ordinary layers through the Command Bus, one
// undo step each. Elements are placed in fractions of the current canvas, so
// every item fits every canvas size. Shapes and text land centred at the
// playhead; a background goes to the back; a template becomes a new scene.
import {
  adoptFreeLayers,
  createComposition,
  createLayer,
  createProject,
  number,
  rotateAroundCenter,
  vector2,
  type Command,
  type Composition,
  type Layer,
  type TransformValues,
} from '../core';
import { getLanguage as currentLanguage } from '../i18n';
import type {
  LibraryItem,
  LibraryShapeElement,
  LibraryTextElement,
  Paint,
} from '../library/schema';
import type { RenderSource } from '../render/adapter';
import { formatGradient } from '../render/paint';
import { formatPolygons, type MultiPolygon } from '../render/shapes';
import { DRAWING_DURATION } from './draw-tool';
import { trackForNewClip } from './editing';
import { placeScene } from './scenes';

const plain = (
  type: 'string' | 'color' | 'boolean',
  value: string | boolean,
) => ({
  type,
  value,
  animated: false,
  keyframes: [],
  constraints: [],
});
const newId = () => crypto.randomUUID();
export const itemName = (item: { name: { en: string; hi: string } }) =>
  currentLanguage() === 'hi' ? item.name.hi : item.name.en;

/** The fill properties for a colour or a gradient. */
function paintProperties(fill: Paint) {
  return typeof fill === 'string'
    ? { fill: plain('color', fill) }
    : {
        fill: plain('color', fill.stops[0]!.color),
        fillGradient: plain('string', formatGradient(fill)),
      };
}
const scalePolygons = (
  polygons: MultiPolygon,
  width: number,
  height: number,
): MultiPolygon =>
  polygons.map((polygon) =>
    polygon.map((ring) =>
      ring.map(([x, y]) => [(x / 100) * width, (y / 100) * height]),
    ),
  );
function withTransform(
  layer: Layer,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation = 0,
  opacity = 1,
) {
  let transform: TransformValues = {
    position: { value: [x, y] },
    scale: { value: [1, 1] },
    rotation: { value: 0 },
    opacity: { value: opacity },
  };
  if (rotation)
    transform = rotateAroundCenter(
      transform,
      { x: 0, y: 0, width, height },
      rotation,
    );
  layer.transform.position = vector2(...transform.position.value);
  layer.transform.rotation = number(transform.rotation.value);
  layer.transform.opacity = number(opacity);
}
function shapeLayer(
  element: LibraryShapeElement,
  canvas: { width: number; height: number },
  name: string,
): Layer {
  const width = element.w * canvas.width,
    height = element.h * canvas.height;
  const layer = createLayer(newId(), 'shape', name, DRAWING_DURATION);
  layer.properties = {
    width: number(width),
    height: number(height),
    shapeKind: plain(
      'string',
      element.shape === 'polygon' ? 'path' : element.shape,
    ),
    ...(element.shape === 'polygon' && element.polygons
      ? {
          polygon: plain(
            'string',
            formatPolygons(
              scalePolygons(element.polygons as MultiPolygon, width, height),
            ),
          ),
        }
      : {}),
    ...(element.radius
      ? { cornerRadius: number(element.radius * Math.min(width, height)) }
      : {}),
    ...paintProperties(element.fill),
  } as never;
  withTransform(
    layer,
    element.x * canvas.width,
    element.y * canvas.height,
    width,
    height,
    element.rotation,
    element.opacity,
  );
  return layer;
}
function textLayer(
  element: LibraryTextElement,
  canvas: { width: number; height: number },
): Layer {
  const content =
    currentLanguage() === 'hi' ? element.text.hi : element.text.en;
  const width = element.w * canvas.width,
    height = element.h * canvas.height;
  const layer = createLayer(newId(), 'text', content, DRAWING_DURATION);
  layer.properties = {
    width: number(width),
    height: number(height),
    text: plain('string', content),
    fontSize: number(Math.round(element.size * canvas.height)),
    fill: plain('color', element.color),
    textWrap: plain('boolean', true),
    ...(element.font ? { fontFamily: plain('string', element.font) } : {}),
    ...(element.weight ? { fontWeight: number(element.weight) } : {}),
    ...(element.italic ? { fontStyle: plain('string', 'italic') } : {}),
    ...(element.align ? { textAlign: plain('string', element.align) } : {}),
    ...(element.letterSpacing
      ? { letterSpacing: number(element.letterSpacing) }
      : {}),
    ...(element.lineHeight ? { lineHeight: number(element.lineHeight) } : {}),
    ...(element.textCase
      ? { textCase: plain('string', element.textCase) }
      : {}),
    ...(element.decoration
      ? { textDecoration: plain('string', element.decoration) }
      : {}),
  } as never;
  withTransform(
    layer,
    element.x * canvas.width,
    element.y * canvas.height,
    width,
    height,
    element.rotation,
    element.opacity,
  );
  return layer;
}

/** The commands that add one top-level layer and its clip at `time`. */
export function addTopLevel(
  composition: RenderSource['composition'],
  layer: Layer,
  time: number,
  index?: number,
): Command[] {
  layer.startTime = time;
  layer.duration = DRAWING_DURATION;
  const target = trackForNewClip(
    composition,
    layer.type,
    time,
    time + DRAWING_DURATION,
  );
  return [
    ...target.commands,
    {
      type: 'CREATE_LAYER',
      compositionId: composition.id,
      parentId: null,
      ...(index !== undefined ? { index } : {}),
      layer,
    } as Command,
    {
      type: 'CREATE_CLIP',
      compositionId: composition.id,
      trackId: target.trackId,
      clip: {
        id: newId(),
        name: layer.name,
        layerId: layer.id,
        assetId: layer.assetId ?? null,
        startTime: time,
        duration: DRAWING_DURATION,
        sourceIn: 0,
        sourceOut: DRAWING_DURATION,
        enabled: true,
        speed: 1,
        transitionMetadata: {},
        effectMetadata: {},
        metadata: {},
      },
    } as Command,
  ];
}
/** Several layers as one group (so they move together and take one clip). */
function grouped(layers: Layer[], name: string): Layer {
  if (layers.length === 1) return layers[0]!;
  const group = createLayer(newId(), 'group', name, DRAWING_DURATION);
  const xs = layers.map((layer) => layer.transform.position.value[0]),
    ys = layers.map((layer) => layer.transform.position.value[1]);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  group.transform.position = vector2(x, y);
  for (const layer of layers) {
    const [lx, ly] = layer.transform.position.value;
    layer.transform.position = vector2(lx - x, ly - y);
  }
  group.children = layers;
  return group;
}

export interface LibraryInsert {
  readonly label: string;
  readonly commands: Command[];
  /** The layer to select, or the scene to open (templates). */
  readonly layerId?: string;
  readonly sceneId?: string;
  /** I1.4: a template was scaled to fit a canvas of another size. */
  readonly scaled?: boolean;
}
/** I1.4: where a template goes. */
export type TemplateMode = 'replace' | 'add' | 'new';
export const TEMPLATE_MODES: readonly TemplateMode[] = ['replace', 'add', 'new'];
export interface LibraryInsertOptions {
  /** I1.3: centre the item on this composition point (a drop). */
  readonly at?: readonly [number, number];
  /** I1.4: templates only; 'new' when absent. */
  readonly mode?: TemplateMode;
}
/**
 * I1.4: a template's layers on a canvas. A template made for another size
 * is scaled to fit and centred; its background colour still covers the
 * whole canvas, so no bare border shows.
 */
function templateLayers(
  item: Extract<LibraryItem, { type: 'template' }>,
  canvas: { width: number; height: number },
  name: string,
): { layers: Layer[]; scaled: boolean } {
  const tw = item.data.width ?? canvas.width,
    th = item.data.height ?? canvas.height;
  const scale = Math.min(canvas.width / tw, canvas.height / th);
  const scaled = Math.abs(tw / th - canvas.width / canvas.height) > 1e-3;
  const box = { width: tw * scale, height: th * scale };
  const ox = (canvas.width - box.width) / 2,
    oy = (canvas.height - box.height) / 2;
  const background = shapeLayer(
    {
      kind: 'shape',
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      shape: 'rectangle',
      fill: item.data.background,
    },
    canvas,
    name,
  );
  const layers = item.data.elements.map((element) => {
    const layer =
      element.kind === 'text'
        ? textLayer(element, box)
        : shapeLayer(element, box, name);
    const [x, y] = layer.transform.position.value;
    layer.transform.position = vector2(x + ox, y + oy);
    return layer;
  });
  return { layers: [background, ...layers], scaled };
}
/** Moves a centred top-level layer so its centre lands on `at`. */
function centreOn(
  layer: Layer,
  canvas: { width: number; height: number },
  at: readonly [number, number] | undefined,
) {
  if (!at) return;
  const [x, y] = layer.transform.position.value;
  layer.transform.position = vector2(
    x + at[0] - canvas.width / 2,
    y + at[1] - canvas.height / 2,
  );
}
/** The commands that add a library item to the open scene (or a new one). */
export function libraryCommands(
  project: { readonly compositions: readonly object[] },
  source: RenderSource,
  item: LibraryItem,
  time: number,
  options: LibraryInsertOptions = {},
): LibraryInsert {
  const composition = source.composition;
  const canvas = { width: composition.width, height: composition.height };
  const name = itemName(item);
  switch (item.type) {
    case 'shape': {
      // Sized for a 1080 px tall canvas, scaled to this one, centred.
      const scale = Math.min(canvas.width, canvas.height) / 1080;
      const width = item.data.width * scale,
        height = item.data.height * scale;
      const layer = shapeLayer(
        {
          kind: 'shape',
          x: (canvas.width - width) / 2 / canvas.width,
          y: (canvas.height - height) / 2 / canvas.height,
          w: width / canvas.width,
          h: height / canvas.height,
          shape: 'polygon',
          polygons: item.data.polygons,
          fill: item.data.fill,
        },
        canvas,
        name,
      );
      centreOn(layer, canvas, options.at);
      return {
        label: 'Add element',
        commands: addTopLevel(composition, layer, time),
        layerId: layer.id,
      };
    }
    case 'background': {
      const layers = item.data.elements.map((element) =>
        shapeLayer(element, canvas, name),
      );
      const layer = grouped(layers, name);
      layer.name = name;
      return {
        label: 'Add background',
        commands: addTopLevel(composition, layer, time, 0),
        layerId: layer.id,
      };
    }
    case 'text': {
      const layers = item.data.elements.map((element) =>
        textLayer(element, canvas),
      );
      // Centre the block on the canvas.
      const width = Math.max(...item.data.elements.map((e) => e.w)),
        height = Math.max(...item.data.elements.map((e) => e.y + e.h));
      const dx = ((1 - width) / 2) * canvas.width,
        dy = ((1 - height) / 2) * canvas.height;
      for (const layer of layers) {
        const [x, y] = layer.transform.position.value;
        layer.transform.position = vector2(x + dx, y + dy);
      }
      const layer = grouped(layers, name);
      centreOn(layer, canvas, options.at);
      return {
        label: 'Add text',
        commands: addTopLevel(composition, layer, time),
        layerId: layer.id,
      };
    }
    case 'template': {
      const mode = options.mode ?? 'new';
      const { layers, scaled } = templateLayers(item, canvas, name);
      if (mode !== 'new') {
        // Replace removes this scene's top-level layers (their clips go too)
        // first; both add the template's layers on top, each with a clip.
        const commands: Command[] =
          mode === 'replace'
            ? composition.layers.map(
                (layer) =>
                  ({
                    type: 'DELETE_LAYER',
                    compositionId: composition.id,
                    layerId: layer.id,
                  }) as Command,
              )
            : [];
        // Clips are placed against the scene as it will be after removals.
        let target = (
          mode === 'replace'
            ? {
                ...composition,
                layers: [],
                // Every top-level layer goes, so every clip goes; the
                // emptied tracks are reused.
                tracks: composition.tracks.map((track) => ({
                  ...track,
                  clips: [],
                })),
              }
            : composition
        ) as RenderSource['composition'];
        for (const layer of layers) {
          const added = addTopLevel(target, layer, time);
          commands.push(...added);
          // Later layers see the tracks the earlier ones created or used.
          target = applyTracks(target, added);
        }
        return {
          label: mode === 'replace' ? 'Replace with template' : 'Add template',
          commands,
          layerId: layers[layers.length - 1]!.id,
          scaled,
        };
      }
      const scene = createComposition({
        id: newId(),
        name,
        width: canvas.width,
        height: canvas.height,
        fps: composition.fps,
      }) as Composition;
      scene.layers = layers;
      // Every top-level layer gets its clip (D-039).
      const adopted = adoptFreeLayers({
        ...createProject(name),
        compositions: [scene],
      }).project.compositions[0]!;
      const placed = placeScene(
        project as never,
        composition.id,
        adopted as Composition,
      );
      return {
        label: 'Add template',
        commands: placed.commands,
        sceneId: placed.id,
        scaled,
      };
    }
  }
}

/**
 * The composition after some CREATE_TRACK and CREATE_CLIP commands, enough
 * for the next `trackForNewClip` to see occupied tracks and times.
 */
function applyTracks(
  composition: RenderSource['composition'],
  commands: readonly Command[],
): RenderSource['composition'] {
  const tracks = composition.tracks.map((track) => ({
    ...track,
    clips: [...track.clips],
  })) as { id: string; clips: unknown[] }[];
  for (const command of commands as readonly {
    type: string;
    track?: { id: string; clips: unknown[] };
    trackId?: string;
    clip?: unknown;
  }[]) {
    if (command.type === 'CREATE_TRACK' && command.track)
      tracks.push({ ...command.track, clips: [...command.track.clips] });
    if (command.type === 'CREATE_CLIP' && command.clip)
      tracks.find((track) => track.id === command.trackId)?.clips.push(
        command.clip,
      );
  }
  return { ...composition, tracks } as unknown as RenderSource['composition'];
}
