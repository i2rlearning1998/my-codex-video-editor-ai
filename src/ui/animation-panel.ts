// W5-B Inspector "Animation" section (ANI-001, ANI-002, ANI-004, ANI-005):
// stopwatches, keyframe add/remove and navigation per property, and the
// selected timeline keyframes' time, easing and edit buttons.
import type { EditorEngine, Easing } from '../core';
import { formatNumber, t } from '../i18n';
import { locateLayer } from '../render/adapter';
import { iconSvg } from './icons';
import {
  adjacentKeyframe,
  hasCopiedKeyframes,
  jumpToKeyframe,
  moveSelectedKeyframes,
  runKeyframeAction,
  setSelectedEasing,
} from './keyframe-edit';
import {
  animatableProperties,
  isAnimated,
  propertyOf,
  setPropertyCommand,
  stopwatchOff,
  stopwatchOn,
  upsertKeyframe,
  withValueAt,
  type AnimatableProperty,
} from './keyframes';
import type { EditorSession } from './session';

export const EASING_CHOICES = [
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'hold',
  'custom',
] as const;

const button = (
  action: string,
  label: string,
  icon: string,
  onClick: () => void,
  extra: Record<string, string> = {},
) => {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'icon-button animation-button';
  item.dataset.action = action;
  for (const [key, value] of Object.entries(extra)) item.dataset[key] = value;
  item.setAttribute('aria-label', label);
  item.title = label;
  item.innerHTML = iconSvg(icon, 14);
  item.onclick = onClick;
  return item;
};

export function mountAnimationPanel(
  panel: HTMLElement,
  engine: EditorEngine,
  session: EditorSession,
  report: (error: unknown) => void,
) {
  const safely = (action: () => void) => {
    try {
      session.setPlaying(false);
      action();
    } catch (error) {
      report(error);
    }
  };
  let custom = false;
  const render = () => {
    const source = session.source;
    const layer =
      session.selectedIds.length === 1 && session.selectedId
        ? locateLayer(source.composition.layers, session.selectedId)?.layer
        : undefined;
    panel.hidden = !layer;
    if (!layer) {
      panel.replaceChildren();
      return;
    }
    const focused = document.activeElement;
    if (
      focused instanceof HTMLElement &&
      panel.contains(focused) &&
      focused.tagName === 'INPUT'
    )
      return; // Do not replace a field the user is typing in.
    const time = session.currentTime;
    const heading = document.createElement('div');
    heading.className = 'animation-heading';
    const title = document.createElement('h4');
    title.textContent = t('animation.title');
    heading.append(
      title,
      button('keyframe-previous', t('animation.previous'), 'frameBack', () =>
        safely(() => jumpToKeyframe(session, -1)),
      ),
      button('keyframe-next', t('animation.next'), 'frameForward', () =>
        safely(() => jumpToKeyframe(session, 1)),
      ),
    );
    const rows = animatableProperties(layer).map((item: AnimatableProperty) => {
      const property = propertyOf(layer, item)!;
      const animated = isAnimated(property);
      const on = property.keyframes.some((frame) => frame.time === time);
      const row = document.createElement('div');
      row.className = 'animation-row';
      row.dataset.property = item.key;
      const label = document.createElement('span');
      label.textContent = t(item.labelKey);
      const stopwatch = button(
        'stopwatch',
        t(animated ? 'animation.stopwatchOff' : 'animation.stopwatchOn', {
          name: t(item.labelKey),
        }),
        'speed',
        () =>
          safely(() =>
            engine.commands.transaction(
              animated ? 'Stop animating' : 'Start animating',
              [
                setPropertyCommand(
                  source.composition.id,
                  layer.id,
                  item,
                  animated
                    ? stopwatchOff(property, time)
                    : stopwatchOn(property, time),
                ),
              ],
            ),
          ),
      );
      stopwatch.setAttribute('aria-pressed', String(animated));
      const times = property.keyframes.map((frame) => frame.time);
      const previous = button(
        'property-previous',
        t('animation.previous'),
        'chevronLeft',
        () =>
          safely(() => {
            const target = adjacentKeyframe(times, time, -1);
            if (target !== null) session.setCurrentTime(target);
          }),
      );
      previous.disabled = adjacentKeyframe(times, time, -1) === null;
      const next = button(
        'property-next',
        t('animation.next'),
        'chevronRight',
        () =>
          safely(() => {
            const target = adjacentKeyframe(times, time, 1);
            if (target !== null) session.setCurrentTime(target);
          }),
      );
      next.disabled = adjacentKeyframe(times, time, 1) === null;
      // ANI-005: the diamond is filled exactly on a keyframe.
      const diamond = button(
        'property-keyframe',
        t(on ? 'keyframe.remove' : 'keyframe.add'),
        on ? 'diamondFilled' : 'diamondOutline',
        () =>
          safely(() => {
            const frames = property.keyframes.filter(
              (frame) => frame.time !== time,
            );
            const next = on
              ? frames.length
                ? {
                    ...withValueAt(property, property.value, undefined),
                    animated: true,
                    keyframes: structuredClone(frames),
                  }
                : stopwatchOff(property, time)
              : upsertKeyframe(property, time, property.value);
            engine.commands.transaction(
              on ? 'Remove keyframe' : 'Add keyframe',
              [
                setPropertyCommand(
                  source.composition.id,
                  layer.id,
                  item,
                  next as never,
                ),
              ],
            );
          }),
        { on: String(on) },
      );
      diamond.setAttribute('aria-pressed', String(on));
      row.append(label, stopwatch, previous, diamond, next);
      return row;
    });
    const parts: HTMLElement[] = [heading, ...rows];
    const selected = session.selectedKeyframes;
    if (selected.length)
      parts.push(selectionEditor(selected.map((item) => item.time)));
    panel.replaceChildren(...parts);
  };
  const selectionEditor = (times: number[]) => {
    const box = document.createElement('div');
    box.className = 'animation-selection';
    const summary = document.createElement('p');
    summary.textContent = t('animation.selected', {
      count: formatNumber(times.length),
    });
    const timeField = document.createElement('label');
    timeField.className = 'animation-field';
    const timeLabel = document.createElement('span');
    timeLabel.textContent = t('animation.time');
    const timeInput = document.createElement('input');
    timeInput.type = 'number';
    timeInput.step = 'any';
    timeInput.min = '0';
    timeInput.id = 'keyframe-time';
    const first = Math.min(...times);
    timeInput.value = String(Math.round(first * 1000) / 1000);
    timeInput.onchange = () =>
      safely(() => {
        const value = Number(timeInput.value);
        if (
          timeInput.value.trim() === '' ||
          !Number.isFinite(value) ||
          value < 0
        )
          throw new RangeError(t('animation.timeRange'));
        timeInput.blur();
        moveSelectedKeyframes(engine, session, value - first);
      });
    timeInput.onkeydown = (event) => {
      if (event.key === 'Enter') timeInput.blur();
    };
    timeField.append(timeLabel, timeInput);
    const easingField = document.createElement('label');
    easingField.className = 'animation-field';
    const easingLabel = document.createElement('span');
    easingLabel.textContent = t('animation.easing');
    const select = document.createElement('select');
    select.id = 'keyframe-easing';
    for (const choice of EASING_CHOICES) {
      const option = document.createElement('option');
      option.value = choice;
      option.textContent = t(`easing.${choice}`);
      select.append(option);
    }
    const current = currentEasing();
    select.value = custom
      ? 'custom'
      : typeof current === 'object'
        ? 'custom'
        : (current ?? 'linear');
    const curve = document.createElement('div');
    curve.className = 'animation-curve';
    curve.hidden = select.value !== 'custom';
    const values =
      typeof current === 'object' && current
        ? [current.x1, current.y1, current.x2, current.y2]
        : [0.25, 0.1, 0.25, 1];
    const inputs = ['x1', 'y1', 'x2', 'y2'].map((name, index) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.05';
      input.id = `keyframe-${name}`;
      input.setAttribute('aria-label', t('animation.curvePoint', { name }));
      input.value = String(values[index]);
      if (name.startsWith('x')) {
        input.min = '0';
        input.max = '1';
      }
      return input;
    });
    const applyCurve = () =>
      safely(() => {
        const [x1, y1, x2, y2] = inputs.map((input) => Number(input.value));
        if (
          ![x1, y1, x2, y2].every(Number.isFinite) ||
          x1! < 0 ||
          x1! > 1 ||
          x2! < 0 ||
          x2! > 1
        )
          throw new RangeError(t('animation.curveRange'));
        setSelectedEasing(engine, session, {
          type: 'cubic',
          x1: x1!,
          y1: y1!,
          x2: x2!,
          y2: y2!,
        });
      });
    for (const input of inputs) input.onchange = applyCurve;
    curve.append(...inputs);
    select.onchange = () => {
      custom = select.value === 'custom';
      if (custom) {
        curve.hidden = false;
        applyCurve();
      } else
        safely(() =>
          setSelectedEasing(engine, session, select.value as Easing),
        );
    };
    easingField.append(easingLabel, select);
    const actions = document.createElement('div');
    actions.className = 'animation-actions';
    for (const action of ['copy', 'paste', 'duplicate', 'delete'] as const) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'button';
      item.dataset.keyframeAction = action;
      item.textContent = t(`animation.${action}`);
      if (action === 'paste') item.disabled = !hasCopiedKeyframes();
      item.onclick = () =>
        safely(() => runKeyframeAction(engine, session, action));
      actions.append(item);
    }
    box.append(summary, timeField, easingField, curve, actions);
    return box;
  };
  /** The easing shared by the selected keyframes' first property, if any. */
  const currentEasing = (): Easing | undefined => {
    const [first] = session.selectedKeyframes;
    const layer = first
      ? locateLayer(session.source.composition.layers, first.layerId)?.layer
      : undefined;
    if (!layer || !first) return undefined;
    for (const item of animatableProperties(layer)) {
      const frame = propertyOf(layer, item)?.keyframes.find(
        (entry) => entry.time === first.time,
      );
      if (frame) return (frame.easing as Easing | undefined) ?? 'linear';
    }
    return undefined;
  };
  const unsubscribe = session.onChange(() => {
    if (!session.selectedKeyframes.length) custom = false;
  });
  render();
  return {
    render,
    dispose: unsubscribe,
  };
}
