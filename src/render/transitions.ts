// J12: transitions across a cut, applied only when drawing (preview and
// export share this; picking and editing use the resting state). Over the
// window centred on the cut both clips are shown: the outgoing one held on
// its last frame after the cut, the incoming one on its first frame before
// it. Then each type changes their opacity, position or revealed part, or
// draws a black or white frame over them.
import {
  EASING_CURVES,
  clipTransition,
  createLayer,
  cubicBezier,
  number,
  previousTouching,
  type Transition,
} from '../core';
import type { RenderSource, SceneLayer } from './adapter';

type Composition = RenderSource['composition'];
/** A clip as plain data (the deep readonly snapshot type is too deep here). */
interface Clip {
  readonly id: string;
  readonly layerId: string;
  readonly startTime: number;
  readonly duration: number;
  readonly sourceIn: number;
  readonly sourceOut: number;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly transitionMetadata: Readonly<Record<string, unknown>>;
}
const lanesOf = (composition: Composition) =>
  composition.tracks as unknown as readonly {
    readonly clips: readonly Clip[];
  }[];

const ease = (p: number) => cubicBezier(...EASING_CURVES['ease-in-out'], p);

interface Active {
  readonly from: Clip;
  readonly to: Clip;
  readonly transition: Transition;
  /** Progress through the window, 0 to 1 (eased). */
  readonly p: number;
  readonly afterCut: boolean;
}

/** Transitions in play at `time`. */
export function activeTransitions(
  composition: Composition,
  time: number,
): Active[] {
  const active: Active[] = [];
  for (const track of lanesOf(composition))
    for (const clip of track.clips) {
      const transition = clipTransition(clip);
      if (!transition) continue;
      const from = previousTouching(track.clips, clip);
      if (!from) continue;
      const half = transition.duration / 2;
      const start = clip.startTime - half;
      if (time < start || time >= clip.startTime + half) continue;
      active.push({
        from,
        to: clip,
        transition,
        p: ease(Math.min(1, Math.max(0, (time - start) / transition.duration))),
        afterCut: time >= clip.startTime,
      });
    }
  return active;
}

const scaled = (layer: SceneLayer, opacity: number, dx = 0): SceneLayer => {
  const transform = layer.transform as unknown as Record<
    string,
    { value: unknown }
  >;
  const position = transform.position!.value as [number, number];
  const current = transform.opacity!.value as number;
  return Object.freeze({
    ...(layer as object),
    transform: Object.freeze({
      ...transform,
      position: Object.freeze({
        ...transform.position,
        value: [position[0] + dx, position[1]],
      }),
      opacity: Object.freeze({
        ...transform.opacity,
        value: current * opacity,
      }),
    }),
  }) as unknown as SceneLayer;
};
const revealed = (
  layer: SceneLayer,
  reveal: number,
  from: 'left' | 'right',
): SceneLayer =>
  Object.freeze({
    ...(layer as object),
    properties: {
      ...(layer.properties as object),
      presetReveal: number(reveal),
      presetRevealFrom: { type: 'string', value: from },
    },
  }) as unknown as SceneLayer;

/** The composition as drawn at `time`, with the transitions in play. */
export function applyTransitions<C extends Composition>(
  composition: C,
  time: number,
): C {
  const active = activeTransitions(composition, time);
  if (!active.length) return composition;
  const width = composition.width;
  const layers = [...composition.layers] as SceneLayer[];
  const clips = new Map<string, Clip>();
  const overlays: { after: string; layer: SceneLayer }[] = [];
  for (const { from, to, transition, p, afterCut } of active) {
    // Both stay visible over the window, each held on its edge frame.
    clips.set(from.id, {
      ...from,
      duration: from.duration + transition.duration / 2,
      ...(afterCut
        ? {
            metadata: {
              ...from.metadata,
              freezeFrame: Math.max(from.sourceIn, from.sourceOut - 1e-3),
            },
          }
        : {}),
    });
    clips.set(to.id, {
      ...to,
      startTime: to.startTime - transition.duration / 2,
      duration: to.duration + transition.duration / 2,
      ...(afterCut
        ? {}
        : { metadata: { ...to.metadata, freezeFrame: to.sourceIn } }),
    });
    const a = layers.findIndex((layer) => layer.id === from.layerId);
    let b = layers.findIndex((layer) => layer.id === to.layerId);
    if (a < 0 || b < 0) continue;
    // The incoming clip draws over the outgoing one.
    if (b < a) {
      const [moved] = layers.splice(b, 1);
      layers.splice(a, 0, moved!);
      b = a;
    }
    const ia = layers.findIndex((layer) => layer.id === from.layerId);
    const outgoing = layers[ia]!,
      incoming = layers[b]!;
    const timed = (layer: SceneLayer, clip: Clip): SceneLayer =>
      Object.freeze({
        ...(layer as object),
        startTime: clip.startTime,
        duration: clip.duration,
      }) as unknown as SceneLayer;
    let A = timed(outgoing, clips.get(from.id)!),
      B = timed(incoming, clips.get(to.id)!);
    switch (transition.type) {
      case 'crossfade':
        // The incoming clip fades in over the outgoing one, which stays
        // whole underneath: for opaque pictures, exactly (1 - p)·A + p·B.
        B = scaled(B, p);
        break;
      case 'fade-black':
      case 'fade-white': {
        A = scaled(A, p < 0.5 ? 1 : 0);
        B = scaled(B, p < 0.5 ? 0 : 1);
        const veil = createLayer(
          `transition-veil-${to.id}`,
          'shape',
          'Transition',
          transition.duration,
        );
        veil.startTime = to.startTime - transition.duration / 2;
        veil.properties = {
          width: number(composition.width),
          height: number(composition.height),
          fill: {
            type: 'color',
            value: transition.type === 'fade-black' ? '#000000' : '#ffffff',
          },
        } as never;
        veil.transform.opacity = {
          ...veil.transform.opacity,
          value: 1 - Math.abs(2 * p - 1),
        } as never;
        overlays.push({
          after: incoming.id,
          layer: veil as unknown as SceneLayer,
        });
        break;
      }
      case 'wipe-left':
        B = revealed(B, p, 'right');
        break;
      case 'wipe-right':
        B = revealed(B, p, 'left');
        break;
      case 'slide-left':
        A = scaled(A, 1, -p * width);
        B = scaled(B, 1, (1 - p) * width);
        break;
      case 'slide-right':
        A = scaled(A, 1, p * width);
        B = scaled(B, 1, -(1 - p) * width);
        break;
    }
    layers[ia] = A;
    layers[b] = B;
  }
  for (const { after, layer } of overlays)
    layers.splice(layers.findIndex((item) => item.id === after) + 1, 0, layer);
  const tracks = lanesOf(composition).map((track) =>
    track.clips.some((clip) => clips.has(clip.id))
      ? {
          ...track,
          clips: track.clips.map((clip) => clips.get(clip.id) ?? clip),
        }
      : track,
  );
  return { ...composition, layers, tracks } as C;
}
