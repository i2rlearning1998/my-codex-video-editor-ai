// J6: Show element timing. A popover with the selected element's start time
// and duration (shared NumberFields); the clip is highlighted and revealed
// on the timeline while it is open, and every change is one undo step
// through the Command Bus.
import {
  effectiveLayerTiming,
  findClipByLayer,
  frameToTime,
  type Command,
  type EditorEngine,
} from '../core';
import { t } from '../i18n';
import { locateLayer, type RenderSource } from '../render/adapter';
import { createNumberField } from './components/number-field';
import { openPopover } from './components/popover';
import type { EditorSession } from './session';

/** The command that gives a layer (its clip, if any) a new start or duration. */
export function timingCommand(
  source: RenderSource,
  layerId: string,
  field: 'start' | 'duration',
  value: number,
): Command | null {
  const layer = locateLayer(source.composition.layers, layerId)?.layer;
  if (!layer || !Number.isFinite(value)) return null;
  const timing = effectiveLayerTiming(source.composition, layer);
  const startTime = field === 'start' ? value : timing.startTime;
  const duration = field === 'duration' ? value : timing.duration;
  if (startTime === timing.startTime && duration === timing.duration)
    return null;
  const clip = findClipByLayer(source.composition, layer.id);
  return clip
    ? ({
        type: 'SET_CLIP_TIMING',
        compositionId: source.composition.id,
        clipId: clip.clip.id,
        startTime,
        duration,
        sourceIn: clip.clip.sourceIn,
        sourceOut:
          field === 'duration'
            ? clip.clip.sourceIn + duration * clip.clip.speed
            : clip.clip.sourceOut,
      } as Command)
    : ({
        type: 'SET_LAYER_TIMING',
        compositionId: source.composition.id,
        layerId: layer.id,
        startTime,
        duration,
      } as Command);
}

export function openElementTiming(
  anchor: HTMLElement,
  engine: EditorEngine,
  session: EditorSession,
  report: (error: unknown) => void,
  highlight: (layerId: string | null) => void,
  /** J14: the clip menu's Edit duration shows the duration only. */
  only?: 'duration',
): void {
  const id = session.selectedId;
  const layer = id
    ? locateLayer(session.source.composition.layers, id)?.layer
    : null;
  if (!id || !layer) return;
  const timing = effectiveLayerTiming(session.source.composition, layer);
  const frame = frameToTime(1, session.source.composition.fps);
  const commit = (field: 'start' | 'duration', value: number) => {
    try {
      const command = timingCommand(session.source, id, field, value);
      if (command) engine.commands.transaction('Edit timing', [command]);
    } catch (error) {
      report(error);
    }
  };
  const body = document.createElement('div');
  body.className = 'element-timing';
  const title = document.createElement('h4');
  title.textContent = layer.name;
  const start = createNumberField({
    id: 'element-timing-start',
    label: t('timing.start'),
    value: Math.round(timing.startTime * 1000) / 1000,
    unit: 's',
    min: 0,
    step: frame,
    decimals: 3,
    onCommit: (value) => commit('start', value),
  });
  const duration = createNumberField({
    id: 'element-timing-duration',
    label: t('timing.duration'),
    value: Math.round(timing.duration * 1000) / 1000,
    unit: 's',
    min: frame,
    step: frame,
    decimals: 3,
    onCommit: (value) => commit('duration', value),
  });
  body.append(title, ...(only === 'duration' ? [] : [start]), duration);
  highlight(id);
  openPopover(anchor, body, {
    label: t(
      only === 'duration' ? 'command.editDuration' : 'command.showTiming',
    ),
    className: 'element-timing-popover',
    onClose: () => highlight(null),
  });
}
