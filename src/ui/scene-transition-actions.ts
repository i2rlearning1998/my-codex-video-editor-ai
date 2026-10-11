// V7 (Clipchamp clone spec 10.5): adding, changing and removing the
// transition into a scene, as one undo step of marker commands on the
// incoming scene (D-199; schema unchanged).
import {
  DEFAULT_TRANSITION,
  maxSceneTransition,
  sceneTransitionLabel,
  sceneTransitionMarker,
  sceneTransitionOf,
  type Command,
  type EditorEngine,
  type Transition,
} from '../core';
import { t } from '../i18n';
import { iconSvg } from './icons';
import {
  DEFAULT_TRANSITION_TYPE,
  transitionLabel,
} from './right-panel/transition-tiles';
import { SCENE_TRANSITION_EVENT, transitionFocus } from './transition-focus';

/** The scene before `sceneId`, or null for the first scene. */
export function previousScene(engine: EditorEngine, sceneId: string) {
  const scenes = engine.state.compositions;
  const index = scenes.findIndex((scene) => scene.id === sceneId);
  return index > 0 ? scenes[index - 1]! : null;
}

/** The longest transition into `sceneId` (each scene gives its half). */
export function sceneTransitionLimit(engine: EditorEngine, sceneId: string) {
  const scene = engine.state.compositions.find((item) => item.id === sceneId);
  const before = previousScene(engine, sceneId);
  return scene && before ? maxSceneTransition(before, scene) : 0;
}

export function setSceneTransition(
  engine: EditorEngine,
  sceneId: string,
  transition: Transition | null,
  label: string,
): void {
  const scene = engine.state.compositions.find((item) => item.id === sceneId);
  if (!scene || !previousScene(engine, sceneId)) return;
  const marker = sceneTransitionMarker(scene);
  const commands: Command[] = [];
  if (!transition) {
    if (marker)
      commands.push({
        type: 'DELETE_MARKER',
        compositionId: sceneId,
        markerId: marker.id,
      });
  } else {
    const next = {
      id: marker?.id ?? crypto.randomUUID(),
      time: 0,
      label: sceneTransitionLabel(transition),
    };
    commands.push({
      type: marker ? 'UPDATE_MARKER' : 'ADD_MARKER',
      compositionId: sceneId,
      marker: next,
    } as Command);
  }
  if (commands.length) engine.commands.transaction(label, commands);
}

/** "+" between two scenes: Fade through black, then its panel opens. */
export function addSceneTransition(engine: EditorEngine, sceneId: string) {
  setSceneTransition(
    engine,
    sceneId,
    {
      type: DEFAULT_TRANSITION_TYPE,
      duration: Math.min(
        DEFAULT_TRANSITION,
        sceneTransitionLimit(engine, sceneId),
      ),
    },
    'Add transition',
  );
  focusSceneTransition(sceneId);
}

/** Opens the right Transition panel for the transition into `sceneId`. */
export function focusSceneTransition(sceneId: string) {
  transitionFocus.sceneId = sceneId;
  transitionFocus.clipId = null;
  document.dispatchEvent(
    new CustomEvent(SCENE_TRANSITION_EVENT, { detail: sceneId }),
  );
}

/**
 * V7 (spec 10.5): what sits between two scene cards: "+" (Add transition),
 * or the transition's marker, which opens its panel. Pressed while open.
 */
export function sceneTransitionButton(
  engine: EditorEngine,
  sceneId: string,
): HTMLButtonElement {
  const scene = engine.state.compositions.find((item) => item.id === sceneId);
  const transition = scene ? sceneTransitionOf(scene) : null;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.sceneId = sceneId;
  if (transition) {
    button.className = 'scene-transition scene-transition-marker';
    button.dataset.action = 'scene-transition';
    button.innerHTML = iconSvg('transitions', 18);
    button.title = t('transition.sceneMarker', {
      name: transitionLabel(transition.type),
    });
    button.setAttribute(
      'aria-pressed',
      String(transitionFocus.sceneId === sceneId),
    );
    button.onclick = (event) => {
      event.stopPropagation();
      focusSceneTransition(sceneId);
    };
  } else {
    button.className = 'scene-transition scene-transition-add';
    button.dataset.action = 'scene-transition-add';
    button.innerHTML = iconSvg('plus', 16);
    button.title = t('transition.addBetween');
    button.onclick = (event) => {
      event.stopPropagation();
      try {
        addSceneTransition(engine, sceneId);
      } catch (error) {
        reportError(error);
      }
    };
  }
  button.setAttribute('aria-label', button.title);
  return button;
}
