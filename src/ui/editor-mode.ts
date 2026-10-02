// H4: Editor and 2D Animation modes (D-130). Keyframes are edited in 2D
// Animation only; in Editor mode an edit that would change an animated
// property is refused with a message that offers to open 2D Animation.
import { t } from '../i18n';
import { locateLayer, type SceneLayer } from '../render/adapter';
import { isAnimated } from './keyframes';
import type { EditorSession } from './session';

/** Thrown when Editor mode would edit an animated property. */
export class AnimatedInEditorError extends Error {
  constructor() {
    super(t('mode.animatedRefused'));
    this.name = 'AnimatedInEditorError';
  }
}

type TransformKey = 'position' | 'scale' | 'rotation' | 'opacity';
/**
 * Refuses (throws) when the session is in Editor mode and one of the given
 * layers has one of `keys` animated. With no keys, any animated transform or
 * property of the layers counts.
 */
export function guardAnimated(
  session: EditorSession,
  layers: readonly (SceneLayer | string)[],
  keys?: readonly (TransformKey | string)[],
): void {
  if (session.mode !== 'editor') return;
  const all = session.source.composition.layers;
  for (const item of layers) {
    const layer =
      typeof item === 'string' ? locateLayer(all, item)?.layer : item;
    if (!layer) continue;
    const transforms = (
      ['position', 'scale', 'rotation', 'opacity'] as const
    ).filter((key) => !keys || keys.includes(key));
    if (transforms.some((key) => isAnimated(layer.transform[key])))
      throw new AnimatedInEditorError();
    for (const [key, property] of Object.entries(layer.properties))
      if ((!keys || keys.includes(key)) && property && isAnimated(property))
        throw new AnimatedInEditorError();
  }
}

/**
 * Refuses (throws) when, in Editor mode, any SET_PROPERTY command would change
 * a property that is animated now.
 */
export function guardCommands(
  session: EditorSession,
  commands: readonly unknown[],
): void {
  if (session.mode !== 'editor') return;
  const all = session.source.composition.layers;
  for (const command of commands as readonly {
    type?: string;
    layerId?: string;
    target?: { kind: string; key: string };
  }[]) {
    if (command.type !== 'SET_PROPERTY' || !command.layerId || !command.target)
      continue;
    const layer = locateLayer(all, command.layerId)?.layer;
    if (!layer) continue;
    const { kind, key } = command.target;
    const property: unknown =
      kind === 'transform'
        ? (layer.transform as Record<string, unknown>)[key]
        : (layer.properties as Record<string, unknown>)[key];
    if (property && isAnimated(property as Parameters<typeof isAnimated>[0]))
      throw new AnimatedInEditorError();
  }
}
